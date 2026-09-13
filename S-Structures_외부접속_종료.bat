@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Stop S-Structures External Access

set "HOST_IP=220.149.231.251"
set "APP_PORT=15173"
set "RULE_NAME=S-Structures External %HOST_IP% TCP %APP_PORT%"
set "SERVER_ENTRY=%~dp0server\main.mjs"
set "CONTROL_SCRIPT=%~dp0tools\s-structures-external-control.ps1"
set "DATA_LOCK=%LOCALAPPDATA%\S-Structures\data\server.lock"

cd /d "%~dp0"

if /I "%~1"=="--check" goto check_only
if /I "%~1"=="--elevated" goto stop_server

call :is_admin
if errorlevel 1 (
  echo [INFO] Requesting administrator permission to stop the server.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '--elevated' -WorkingDirectory '%~dp0' -Verb RunAs -WindowStyle Normal"
  if errorlevel 1 (
    echo [ERROR] Administrator permission was cancelled or failed.
    goto fail
  )
  exit /b 0
)

:stop_server
if not exist "%CONTROL_SCRIPT%" (
  echo [ERROR] Control script not found: %CONTROL_SCRIPT%
  goto fail
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CONTROL_SCRIPT%" -Action StopDataOwner -Port %APP_PORT% -HostIp "%HOST_IP%" -ServerEntry "%SERVER_ENTRY%" -FirewallRuleName "%RULE_NAME%" -DataLockPath "%DATA_LOCK%"
set "STOP_EXIT=%ERRORLEVEL%"
if not "%STOP_EXIT%"=="0" goto fail

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CONTROL_SCRIPT%" -Action Stop -Port %APP_PORT% -HostIp "%HOST_IP%" -ServerEntry "%SERVER_ENTRY%" -FirewallRuleName "%RULE_NAME%"
set "STOP_EXIT=%ERRORLEVEL%"
if not "%STOP_EXIT%"=="0" goto fail

echo [DONE] S-Structures external access is stopped.
pause
exit /b 0

:check_only
if not exist "%CONTROL_SCRIPT%" (
  echo [ERROR] Control script not found: %CONTROL_SCRIPT%
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CONTROL_SCRIPT%" -Action DataOwnerStatus -Port %APP_PORT% -HostIp "%HOST_IP%" -ServerEntry "%SERVER_ENTRY%" -FirewallRuleName "%RULE_NAME%" -DataLockPath "%DATA_LOCK%"
exit /b %ERRORLEVEL%

:is_admin
fltmc >nul 2>&1
exit /b %ERRORLEVEL%

:fail
echo.
echo Stop failed. A different program may own TCP %APP_PORT%.
pause
exit /b 1
