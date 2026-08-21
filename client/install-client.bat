@echo off
setlocal
title AUTO PRINT CLIENT INSTALLER
echo ==========================================
echo        AUTO PRINT CLIENT INSTALLER
echo ==========================================
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js 18+ is required. Install Node.js, then run this file again.
 pause
 exit /b 1
)
if "%AUTO_PRINT_SERVER%"=="" (
 set /p AUTO_PRINT_SERVER=Enter Auto Print Server URL (example http://SERVER-IP:3000): 
)
setx AUTO_PRINT_SERVER "%AUTO_PRINT_SERVER%" >nul
echo Installing client...
cd /d "%~dp0"
node client.js
echo.
echo Server has generated a UNIQUE Client ID for this PC.
echo The ID and secret are stored in client-config.json.
echo Keep this file private.
pause
