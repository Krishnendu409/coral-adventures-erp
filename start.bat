@echo off
cd /d "%~dp0"

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js (npm) is not installed or not in your PATH.
    echo Please download and install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo ========================================================
echo Starting Coral Adventures BI Platform...
echo Please wait while the local server spins up.
echo The application will be available at http://localhost:3000
echo ========================================================
echo.
cd system
call npm start
pause
