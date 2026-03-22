@echo off
:: ============================================================
:: FactoryService Auto-Restart Configuration Script
:: ============================================================
:: This script configures Windows to automatically restart
:: FactoryService if it crashes. Run once during deployment.
::
:: What it does:
::   - On 1st crash: restart after 60 seconds
::   - On 2nd crash: restart after 60 seconds
::   - On 3rd crash: restart after 60 seconds
::   - Reset failure counter after 24 hours (86400 seconds)
:: ============================================================

:: Check for admin privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ============================================================
echo  FactoryService Auto-Restart Configuration
echo ============================================================
echo.

:: Configure failure recovery actions
sc failure FactoryService reset= 86400 actions= restart/60000/restart/60000/restart/60000

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] FactoryService configured for auto-restart.
    echo.
    echo   - On crash: automatically restarts after 60 seconds
    echo   - Failure counter resets every 24 hours
    echo.
) else (
    echo.
    echo [ERROR] Failed to configure FactoryService.
    echo   Make sure FactoryService is installed as a Windows service.
    echo.
)

echo Press any key to close...
pause >nul
