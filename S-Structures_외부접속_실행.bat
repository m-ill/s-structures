@echo off
setlocal EnableExtensions DisableDelayedExpansion
title S-Structures External Access

rem ============================================================================
rem S-Structures external launcher
rem - Fixed public IPv4: 220.149.231.251
rem - TCP port: 15173
rem - Registration stays disabled.
rem - The temporary Windows Firewall rule is removed when the server stops.
rem ============================================================================

set "HOST_IP=220.149.231.251"
set "APP_PORT=15173"
set "APP_URL=http://%HOST_IP%:%APP_PORT%/index.html"
set "RULE_NAME=S-Structures External %HOST_IP% TCP %APP_PORT%"
set "SERVER_ENTRY=%~dp0server\main.mjs"
set "CONTROL_SCRIPT=%~dp0tools\s-structures-external-control.ps1"
set "DATA_LOCK=%LOCALAPPDATA%\S-Structures\data\server.lock"

cd /d "%~dp0"

if /I "%~1"=="--check" goto check_only
if /I "%~1"=="--cleanup" goto cleanup_request
if /I "%~1"=="--cleanup-elevated" goto cleanup_elevated
if /I "%~1"=="--confirmed" goto prepare

echo.
echo ================================================================
echo   S-Structures External Access
echo ================================================================
echo   External URL: %APP_URL%
echo.
echo   WARNING: This exposes the app directly to the Internet over HTTP.
echo   Traffic is not encrypted. Do not sign in with a password or upload
echo   confidential projects while using this launcher.
echo ================================================================
echo.
choice /C YN /N /M "Continue? [Y/N] "
if errorlevel 2 exit /b 0

:prepare
call :validate
if errorlevel 1 goto fail

call :is_admin
if errorlevel 1 (
  if /I "%~1"=="--confirmed" (
    echo [ERROR] Administrator permission was not granted.
    goto fail
  )
  echo [INFO] Requesting administrator permission for a temporary firewall rule.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '--confirmed' -WorkingDirectory '%~dp0' -Verb RunAs -WindowStyle Normal"
  if errorlevel 1 (
    echo [ERROR] Administrator permission was cancelled or failed.
    goto fail
  )
  exit /b 0
)

goto run_server

:run_server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CONTROL_SCRIPT%" -Action StopDataOwner -Port %APP_PORT% -HostIp "%HOST_IP%" -ServerEntry "%SERVER_ENTRY%" -FirewallRuleName "%RULE_NAME%" -DataLockPath "%DATA_LOCK%"
set "CONTROL_EXIT=%ERRORLEVEL%"
if not "%CONTROL_EXIT%"=="0" (
  echo [ERROR] Could not stop the existing S-Structures data owner.
  goto fail
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CONTROL_SCRIPT%" -Action EnsureFree -Port %APP_PORT% -HostIp "%HOST_IP%" -ServerEntry "%SERVER_ENTRY%" -FirewallRuleName "%RULE_NAME%"
set "CONTROL_EXIT=%ERRORLEVEL%"
if not "%CONTROL_EXIT%"=="0" (
  if "%CONTROL_EXIT%"=="3" echo [ERROR] TCP port %APP_PORT% belongs to another program and was not stopped.
  if not "%CONTROL_EXIT%"=="3" echo [ERROR] Could not prepare TCP port %APP_PORT%.
  goto fail
)

rem Remove only this launcher's exact rule, then recreate it with the current Node path.
netsh advfirewall firewall delete rule name="%RULE_NAME%" >nul 2>&1
netsh advfirewall firewall add rule name="%RULE_NAME%" dir=in action=allow protocol=TCP localip=%HOST_IP% localport=%APP_PORT% remoteip=any profile=any program="%NODE_EXE%" enable=yes >nul
if errorlevel 1 (
  echo [ERROR] Could not create the Windows Firewall rule.
  goto fail
)

set "PORT=%APP_PORT%"
set "HOST=%HOST_IP%"
set "S_STRUCTURES_ALLOW_NETWORK_BIND=true"
set "S_STRUCTURES_ALLOW_REGISTRATION=false"

echo.
echo ================================================================
echo   Starting the server.
echo   Open from an external device: %APP_URL%
echo   Stop: press Ctrl+C in this window.
echo ================================================================
echo.

start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%APP_URL%'"
"%NODE_EXE%" "%SERVER_ENTRY%" %APP_PORT% %HOST_IP% --allow-network-bind
set "SERVER_EXIT=%ERRORLEVEL%"

call :remove_firewall_rule
echo.
echo [INFO] The server stopped and the temporary firewall rule was removed.
if not "%SERVER_EXIT%"=="0" echo [INFO] Server exit code: %SERVER_EXIT%
pause
exit /b %SERVER_EXIT%

:check_only
call :validate
if errorlevel 1 goto fail
echo.
echo [CHECK OK] The launcher is ready.
echo   Node.js: %NODE_VERSION%
echo   Server file: %SERVER_ENTRY%
echo   External URL: %APP_URL%
exit /b 0

:cleanup_request
call :is_admin
if errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '--cleanup-elevated' -WorkingDirectory '%~dp0' -Verb RunAs -WindowStyle Normal"
  exit /b %ERRORLEVEL%
)
goto cleanup_elevated

:cleanup_elevated
call :remove_firewall_rule
echo [DONE] Removed the S-Structures external-access firewall rule.
pause
exit /b 0

:validate
if not exist "%SERVER_ENTRY%" (
  echo [ERROR] Server file not found: %SERVER_ENTRY%
  exit /b 1
)

if not exist "%CONTROL_SCRIPT%" (
  echo [ERROR] Control script not found: %CONTROL_SCRIPT%
  exit /b 1
)

set "NODE_EXE="
for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
if not defined NODE_EXE (
  echo [ERROR] Node.js was not found. Install Node.js 20 or newer.
  exit /b 1
)

for /f "delims=" %%V in ('"%NODE_EXE%" --version 2^>nul') do if not defined NODE_VERSION set "NODE_VERSION=%%V"
if not defined NODE_VERSION (
  echo [ERROR] Could not determine the Node.js version.
  exit /b 1
)

ipconfig | findstr /C:"%HOST_IP%" >nul
if errorlevel 1 (
  echo [ERROR] Fixed IP %HOST_IP% was not found on this computer.
  echo         Check the network connection or HOST_IP near the top of this BAT.
  exit /b 1
)

exit /b 0

:is_admin
fltmc >nul 2>&1
exit /b %ERRORLEVEL%

:remove_firewall_rule
netsh advfirewall firewall delete rule name="%RULE_NAME%" >nul 2>&1
exit /b 0

:fail
echo.
echo Launch failed. Review the error above.
pause
exit /b 1
