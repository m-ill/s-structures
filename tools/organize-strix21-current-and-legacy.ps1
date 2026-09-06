param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$caseRoot = [IO.Path]::GetFullPath('C:\Users\mill\Downloads\dcr\testreport\STRIX-21-검증')
$repoRoot = [IO.Path]::GetFullPath('C:\Users\mill\Downloads\dcr\S-Structures-main')
$legacyRoot = [IO.Path]::GetFullPath((Join-Path $caseRoot '99_레거시\보고서_이전버전'))
$plan = [System.Collections.Generic.List[object]]::new()
$dirPlan = [System.Collections.Generic.List[object]]::new()

function Assert-Within([string]$Path, [string]$Root, [string]$Label) {
    $resolved = [IO.Path]::GetFullPath($Path)
    if (-not $resolved.StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and $resolved -ne $Root) {
        throw "$Label is outside intended root: $resolved"
    }
    return $resolved
}

function Add-FileMove([string]$Source, [string]$Destination) {
    $src = Assert-Within $Source $caseRoot 'Source'
    $dst = Assert-Within $Destination $caseRoot 'Destination'
    if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { return }
    $plan.Add([pscustomobject]@{
        kind = 'file'
        source = $src
        destination = $dst
        sha256 = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash.ToLowerInvariant()
        bytes = (Get-Item -LiteralPath $src).Length
    })
}

$caseFolders = Get-ChildItem -LiteralPath $caseRoot -Directory |
    Where-Object { $_.Name -match '^(0[1-9]|1[0-9]|2[0-1])_' } |
    Sort-Object Name

foreach ($case in $caseFolders) {
    $caseId = ($case.Name -split '_')[1]
    $reportDir = Join-Path $case.FullName '05_보고서'
    if (-not (Test-Path -LiteralPath $reportDir -PathType Container)) { continue }
    $legacyCase = Join-Path $legacyRoot "$($case.Name)\05_보고서"

    $keep = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    [void]$keep.Add('README.md')
    [void]$keep.Add("${caseId}_실제모델링_자체해석엔진_검증보고서_편집본.docx")
    [void]$keep.Add('report-qa-docx.json')
    if ($caseId -eq 'SB1') {
        [void]$keep.Add('SB1_검증보고서_R3.md')
        [void]$keep.Add('SB1_검증보고서_R3.pdf')
        [void]$keep.Add('report-qa-r3.json')
    } else {
        [void]$keep.Add("${caseId}_실제모델링_자체해석엔진_검증보고서_R4.md")
        [void]$keep.Add("${caseId}_실제모델링_자체해석엔진_검증보고서_R4.pdf")
        [void]$keep.Add('report-qa-r4-actual-model.json')
    }

    foreach ($file in Get-ChildItem -LiteralPath $reportDir -File) {
        if (-not $keep.Contains($file.Name)) {
            Add-FileMove $file.FullName (Join-Path $legacyCase $file.Name)
        }
    }

    $figureDir = Join-Path $reportDir 'figures'
    if ((Test-Path -LiteralPath $figureDir -PathType Container) -and $caseId -ne 'SB1') {
        foreach ($file in Get-ChildItem -LiteralPath $figureDir -File) {
            if ($file.Name -notmatch '_R4\.(png|json)$') {
                Add-FileMove $file.FullName (Join-Path $legacyCase "figures\$($file.Name)")
            }
        }
    }
}

$r3Index = Join-Path $caseRoot '00_설득자료_모음\STRIX21_자체해석엔진_상세보고서_R3_색인.md'
Add-FileMove $r3Index (Join-Path $legacyRoot '00_설득자료_모음\STRIX21_자체해석엔진_상세보고서_R3_색인.md')

$legacyOutputRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'output\legacy\strix21-r3'))
$directoryCandidates = @(
    @{ source = (Join-Path $repoRoot 'output\pdf\STRIX21-R3'); destination = (Join-Path $legacyOutputRoot 'pdf') },
    @{ source = (Join-Path $repoRoot 'output\verification\strix21-r3'); destination = (Join-Path $legacyOutputRoot 'verification') },
    @{ source = (Join-Path $repoRoot 'tmp\pdfs\strix21-r3'); destination = (Join-Path $legacyOutputRoot 'rendered-pages') }
)
foreach ($candidate in $directoryCandidates) {
    $src = Assert-Within $candidate.source $repoRoot 'Directory source'
    $dst = Assert-Within $candidate.destination $repoRoot 'Directory destination'
    if (Test-Path -LiteralPath $src -PathType Container) {
        $files = Get-ChildItem -LiteralPath $src -Recurse -File
        $dirPlan.Add([pscustomobject]@{ kind='directory'; source=$src; destination=$dst; fileCount=$files.Count; bytes=($files | Measure-Object Length -Sum).Sum })
    }
}

$summary = [pscustomobject]@{
    mode = if ($Apply) { 'apply' } else { 'preview' }
    caseFileMoves = $plan.Count
    caseFileBytes = ($plan | Measure-Object bytes -Sum).Sum
    directoryMoves = $dirPlan.Count
    directoryFiles = ($dirPlan | Measure-Object fileCount -Sum).Sum
    files = $plan
    directories = $dirPlan
}

if (-not $Apply) {
    $summary | ConvertTo-Json -Depth 6
    exit 0
}

foreach ($item in $plan) {
    $parent = Split-Path -Parent $item.destination
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    if (Test-Path -LiteralPath $item.destination) { throw "Destination already exists: $($item.destination)" }
    Move-Item -LiteralPath $item.source -Destination $item.destination
}

foreach ($item in $dirPlan) {
    $parent = Split-Path -Parent $item.destination
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    if (Test-Path -LiteralPath $item.destination) { throw "Directory destination already exists: $($item.destination)" }
    Move-Item -LiteralPath $item.source -Destination $item.destination
}

foreach ($case in $caseFolders) {
    $caseId = ($case.Name -split '_')[1]
    $readme = Join-Path $case.FullName '05_보고서\README.md'
    if ($caseId -eq 'SB1') {
        $currentPdf = 'SB1_검증보고서_R3.pdf'
        $currentMd = 'SB1_검증보고서_R3.md'
        $currentQa = 'report-qa-r3.json'
        $revision = 'R3'
    } else {
        $currentPdf = "${caseId}_실제모델링_자체해석엔진_검증보고서_R4.pdf"
        $currentMd = "${caseId}_실제모델링_자체해석엔진_검증보고서_R4.md"
        $currentQa = 'report-qa-r4-actual-model.json'
        $revision = 'R4'
    }
    $legacyRelative = "..\..\99_레거시\보고서_이전버전\$($case.Name)\05_보고서"
    $content = @"
# $caseId 보고서

## 현재 전달본

- `${caseId}_실제모델링_자체해석엔진_검증보고서_편집본.docx`: 제목·본문·표·판정 문구를 직접 수정할 수 있는 Word 원본
- `$currentPdf`: 개념 형상·실제 S-Structures 모델링·해석모듈·계산식·결과를 수록한 최신 PDF ($revision)
- `$currentMd`: 최신 보고서의 검색·재사용용 Markdown
- `$currentQa`: 최신 PDF QA
- `report-qa-docx.json`: Microsoft Word 렌더링 8쪽 QA
- `figures/`: 현재 보고서에 사용한 개념도와 실제 S-Structures 화면

## 이전 버전

- 교체된 보고서·QA·그림은 `$legacyRelative`에 보존한다.
- 원자료·모델·기준값·실행 evidence는 이동하지 않았다.
"@
    Set-Content -LiteralPath $readme -Value $content -Encoding UTF8
}

$manifestPath = Join-Path $caseRoot '99_레거시\legacy-move-manifest.json'
$manifest = [pscustomobject]@{
    schemaVersion = 'strix21-legacy-move-manifest-r1'
    movedAt = '2026-08-31'
    policy = 'Keep current SB1 R3, remaining R4, all 21 editable DOCX, original/model/reference/execution evidence; move superseded report artifacts only.'
    caseFileMoves = $plan.Count
    directoryMoves = $dirPlan.Count
    files = $plan
    directories = $dirPlan
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

[pscustomobject]@{
    status = 'PASS'
    movedFiles = $plan.Count
    movedDirectories = $dirPlan.Count
    manifest = $manifestPath
} | ConvertTo-Json
