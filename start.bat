@echo off
cd /d "%~dp0"

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is not installed. Downloading and installing Node.js automatically...
    echo This may take a minute or two. Please wait...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi' -OutFile 'node_installer.msi'"
    msiexec /i node_installer.msi /quiet /norestart
    del node_installer.msi
    echo.
    echo Node.js has been successfully installed!
    echo IMPORTANT: You must CLOSE this window and double-click start.bat again to continue.
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
