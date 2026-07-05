@echo off
cd /d "%~dp0"

echo Checking prerequisites...
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is not installed. Downloading the Node.js installer...
    echo This may take a minute or two. Please wait...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi' -OutFile 'node_installer.msi'"
    echo.
    echo Please complete the Node.js setup wizard that is about to open.
    start /wait node_installer.msi
    del node_installer.msi
    echo.
    echo Node.js has been successfully installed!
    echo IMPORTANT: You must CLOSE this window and double-click install.bat again to continue.
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
