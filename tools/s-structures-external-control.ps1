[CmdletBinding()]
param(
  [ValidateSet("DataOwnerStatus", "EnsureFree", "Status", "Stop", "StopDataOwner")]
  [string]$Action = "Status",

  [ValidateRange(1, 65535)]
  [int]$Port = 15173,

  [string]$HostIp = "220.149.231.251",

  [Parameter(Mandatory = $true)]
  [string]$ServerEntry,

  [string]$FirewallRuleName = "",

  [string]$DataLockPath = ""
)

$ErrorActionPreference = "Stop"
$expectedServerEntry = [IO.Path]::GetFullPath($ServerEntry)

function Get-PortListeners {
  $rows = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  if ($rows.Count -gt 0) {
    return $rows
  }

  $fallbackRows = @()
  $netstatLines = @(& netstat.exe -ano -p TCP 2>$null)
  foreach ($line in $netstatLines) {
    $trimmed = ([string]$line).Trim()
    if (-not $trimmed.StartsWith("TCP", [StringComparison]::OrdinalIgnoreCase)) {
      continue
    }

    $parts = @($trimmed -split "\s+" | Where-Object { $_ -ne "" })
    if ($parts.Count -lt 5 -or $parts[3] -ine "LISTENING") {
      continue
    }

    $localEndpoint = [string]$parts[1]
    $portSeparator = $localEndpoint.LastIndexOf(":")
    if ($portSeparator -lt 0) {
      continue
    }

    $parsedPort = 0
    $parsedPid = 0
    if (-not [int]::TryParse($localEndpoint.Substring($portSeparator + 1), [ref]$parsedPort)) {
      continue
    }
    if ($parsedPort -ne $Port -or -not [int]::TryParse([string]$parts[4], [ref]$parsedPid)) {
      continue
    }

    $fallbackRows += [pscustomobject]@{
      LocalAddress = $localEndpoint.Substring(0, $portSeparator)
      LocalPort = $parsedPort
      OwningProcess = $parsedPid
    }
  }

  return $fallbackRows
}

function Remove-LauncherFirewallRule {
  if ([string]::IsNullOrWhiteSpace($FirewallRuleName)) {
    return
  }

  & netsh.exe advfirewall firewall delete rule "name=$FirewallRuleName" *> $null
}

function Test-SStructuresEndpointAt {
  param(
    [string]$Address,
    [int]$EndpointPort
  )

  $requestAddress = $Address
  if ($requestAddress -eq "0.0.0.0" -or $requestAddress -eq "::" -or $requestAddress -eq "[::]") {
    $requestAddress = "127.0.0.1"
  }
  if ($requestAddress -eq "::1") {
    $requestAddress = "[::1]"
  }

  try {
    $meta = Invoke-RestMethod -Method Get -Uri ("http://{0}:{1}/api/meta" -f $requestAddress, $EndpointPort) -TimeoutSec 2
    return $meta.ok -eq $true -and [string]$meta.data.version -eq "p3-server-api-v1"
  }
  catch {
    return $false
  }
}

function Test-SStructuresEndpoint {
  return Test-SStructuresEndpointAt -Address $HostIp -EndpointPort $Port
}

function Get-ProcessListenerEndpoints {
  param([int]$OwnerProcessId)

  $endpoints = @()
  $netstatLines = @(& netstat.exe -ano -p TCP 2>$null)
  foreach ($line in $netstatLines) {
    $trimmed = ([string]$line).Trim()
    if (-not $trimmed.StartsWith("TCP", [StringComparison]::OrdinalIgnoreCase)) {
      continue
    }

    $parts = @($trimmed -split "\s+" | Where-Object { $_ -ne "" })
    if ($parts.Count -lt 5 -or $parts[3] -ine "LISTENING") {
      continue
    }

    $parsedPid = 0
    if (-not [int]::TryParse([string]$parts[4], [ref]$parsedPid) -or $parsedPid -ne $OwnerProcessId) {
      continue
    }

    $localEndpoint = [string]$parts[1]
    $portSeparator = $localEndpoint.LastIndexOf(":")
    if ($portSeparator -lt 0) {
      continue
    }

    $parsedPort = 0
    if (-not [int]::TryParse($localEndpoint.Substring($portSeparator + 1), [ref]$parsedPort)) {
      continue
    }

    $address = $localEndpoint.Substring(0, $portSeparator).Trim("[", "]")
    $endpoints += [pscustomobject]@{
      Address = $address
      Port = $parsedPort
    }
  }

  return @($endpoints | Sort-Object Address, Port -Unique)
}

function Test-SStructuresProcess {
  param(
    [object]$ProcessRow,
    [string]$FallbackName,
    [bool]$EndpointMatches
  )

  $processName = if ($null -eq $ProcessRow) { $FallbackName } else { [string]$ProcessRow.Name }
  if ($processName -ine "node.exe" -and $processName -ine "node") {
    return $false
  }

  $commandLine = if ($null -eq $ProcessRow) { "" } else { [string]$ProcessRow.CommandLine }
  if ([string]::IsNullOrWhiteSpace($commandLine)) {
    return $EndpointMatches
  }

  $hasExactEntry = $commandLine.IndexOf(
    $expectedServerEntry,
    [StringComparison]::OrdinalIgnoreCase
  ) -ge 0

  $hasRelativeEntry = $commandLine -match "server[\\/]+main\.mjs"
  $hasPort = $commandLine -match ("(^|\s)" + [regex]::Escape([string]$Port) + "(\s|$)")
  $hasHost = $commandLine.IndexOf($HostIp, [StringComparison]::OrdinalIgnoreCase) -ge 0
  $hasNetworkFlag = $commandLine.IndexOf("--allow-network-bind", [StringComparison]::OrdinalIgnoreCase) -ge 0

  return $hasExactEntry -or ($hasRelativeEntry -and $hasPort -and $hasHost -and $hasNetworkFlag) -or $EndpointMatches
}

if ($Action -eq "DataOwnerStatus" -or $Action -eq "StopDataOwner") {
  if ([string]::IsNullOrWhiteSpace($DataLockPath) -or -not (Test-Path -LiteralPath $DataLockPath)) {
    Write-Host "[STATUS] No active S-Structures data owner was found."
    exit 0
  }

  try {
    $lockOwner = Get-Content -LiteralPath $DataLockPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $ownerProcessId = [int]$lockOwner.pid
  }
  catch {
    Write-Host "[ERROR] Could not read the S-Structures data lock: $DataLockPath"
    exit 5
  }

  $fallbackProcess = Get-Process -Id $ownerProcessId -ErrorAction SilentlyContinue
  if ($null -eq $fallbackProcess) {
    Write-Host "[STATUS] The S-Structures data lock is stale; no live owner process exists."
    exit 0
  }

  $processRow = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ownerProcessId) -ErrorAction SilentlyContinue
  $fallbackName = [string]$fallbackProcess.ProcessName
  $ownerEndpoints = @(Get-ProcessListenerEndpoints -OwnerProcessId $ownerProcessId)
  $endpointMatches = $false
  foreach ($endpoint in $ownerEndpoints) {
    if (Test-SStructuresEndpointAt -Address $endpoint.Address -EndpointPort $endpoint.Port) {
      $endpointMatches = $true
      break
    }
  }

  if (-not (Test-SStructuresProcess -ProcessRow $processRow -FallbackName $fallbackName -EndpointMatches $endpointMatches)) {
    Write-Host ("[ERROR] Data lock PID {0} could not be verified as S-Structures and was not stopped." -f $ownerProcessId)
    exit 5
  }

  $endpointText = if ($ownerEndpoints.Count -eq 0) {
    "no listening endpoint"
  }
  else {
    (($ownerEndpoints | ForEach-Object { "{0}:{1}" -f $_.Address, $_.Port }) -join ", ")
  }

  if ($Action -eq "DataOwnerStatus") {
    Write-Host ("[STATUS] Running data owner - PID {0}, {1}" -f $ownerProcessId, $endpointText)
    exit 0
  }

  Write-Host ("[INFO] Stopping existing S-Structures data owner PID {0} ({1})..." -f $ownerProcessId, $endpointText)
  Stop-Process -Id $ownerProcessId -Force -ErrorAction Stop

  $deadline = [DateTime]::UtcNow.AddSeconds(8)
  do {
    Start-Sleep -Milliseconds 200
    $remainingProcess = Get-Process -Id $ownerProcessId -ErrorAction SilentlyContinue
  } while ($null -ne $remainingProcess -and [DateTime]::UtcNow -lt $deadline)

  if ($null -ne $remainingProcess) {
    Write-Host ("[ERROR] S-Structures data owner PID {0} did not stop." -f $ownerProcessId)
    exit 6
  }

  Start-Sleep -Milliseconds 1000
  Write-Host "[INFO] The previous S-Structures data owner is stopped."
  exit 0
}

$listeners = Get-PortListeners
if ($listeners.Count -eq 0) {
  if ($Action -eq "Stop") {
    Remove-LauncherFirewallRule
    Write-Host "[INFO] No S-Structures server is listening on TCP $Port."
  }
  elseif ($Action -eq "Status") {
    Write-Host "[STATUS] Stopped - TCP $Port is free."
  }
  exit 0
}

$ownerPids = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
$ownedProcesses = @()
$foreignProcesses = @()
$endpointMatches = Test-SStructuresEndpoint

foreach ($ownerPid in $ownerPids) {
  $processRow = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ownerPid) -ErrorAction SilentlyContinue
  $fallbackProcess = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
  $fallbackName = if ($null -eq $fallbackProcess) { "unknown" } else { [string]$fallbackProcess.ProcessName }
  if (Test-SStructuresProcess -ProcessRow $processRow -FallbackName $fallbackName -EndpointMatches $endpointMatches) {
    $ownedProcesses += [pscustomobject]@{
      ProcessId = $ownerPid
      Name = if ($null -eq $processRow) { $fallbackName } else { [string]$processRow.Name }
      CommandLine = if ($null -eq $processRow) { "unavailable" } else { [string]$processRow.CommandLine }
    }
  }
  else {
    $foreignProcesses += [pscustomobject]@{
      ProcessId = $ownerPid
      Name = if ($null -eq $processRow) { $fallbackName } else { [string]$processRow.Name }
      CommandLine = if ($null -eq $processRow) { "unavailable" } else { [string]$processRow.CommandLine }
    }
  }
}

if ($foreignProcesses.Count -gt 0) {
  foreach ($foreignProcess in $foreignProcesses) {
    Write-Host ("[ERROR] TCP {0} is used by another process: PID {1}, {2}" -f $Port, $foreignProcess.ProcessId, $foreignProcess.Name)
  }
  exit 3
}

if ($Action -eq "Status") {
  foreach ($ownedProcess in $ownedProcesses) {
    Write-Host ("[STATUS] Running - PID {0}, http://{1}:{2}/index.html" -f $ownedProcess.ProcessId, $HostIp, $Port)
  }
  exit 0
}

foreach ($ownedProcess in $ownedProcesses) {
  Write-Host ("[INFO] Stopping existing S-Structures server PID {0}..." -f $ownedProcess.ProcessId)
  Stop-Process -Id $ownedProcess.ProcessId -Force -ErrorAction Stop
}

$deadline = [DateTime]::UtcNow.AddSeconds(8)
do {
  Start-Sleep -Milliseconds 200
  $remainingListeners = Get-PortListeners
} while ($remainingListeners.Count -gt 0 -and [DateTime]::UtcNow -lt $deadline)

if ($remainingListeners.Count -gt 0) {
  Write-Host "[ERROR] TCP $Port did not become free after stopping S-Structures."
  exit 4
}

Remove-LauncherFirewallRule

# Give the previous launcher time to finish its own firewall cleanup.
Start-Sleep -Milliseconds 1000
Write-Host "[INFO] TCP $Port is free."
exit 0
