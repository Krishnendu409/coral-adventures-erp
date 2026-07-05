@echo off
cd /d "%~dp0"

echo Checking prerequisites...
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js / npm is not installed or not in your PATH.
    echo Please download and install Node.js from https://nodejs.org/
    echo Once installed, try running this file again.
    pause
    exit /b 1
)

echo ========================================================
echo Installing dependencies for Coral Adventures BI Platform
echo ========================================================
echo.
cd system
call npm install
echo.
echo Setting up the database...
call npm run db:migrate
call npm run db:seed:synthetic
echo.
echo Building the application...
call npm run build
echo.
echo ========================================================
echo Installation Complete!
echo You can now double-click start.bat to run the platform.
echo ========================================================
pause
