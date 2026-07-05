@echo off
cd /d "%~dp0"

if exist "C:\Program Files\nodejs\npm.cmd" (
    set "PATH=%PATH%;C:\Program Files\nodejs"
)

call npm -v >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is not installed. Downloading the Node.js installer...
    echo This may take a minute or two. Please wait...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi' -OutFile 'node_installer.msi'"
    echo.
    echo Please complete the Node.js setup wizard that is about to open.
    start /wait msiexec /i node_installer.msi
    del node_installer.msi
    echo.
    
    if exist "C:\Program Files\nodejs\npm.cmd" (
        set "PATH=%PATH%;C:\Program Files\nodejs"
        echo Node.js has been successfully installed! Continuing...
    ) else (
        echo Node.js installation failed or was cancelled.
        pause
        exit /b 1
    )
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
