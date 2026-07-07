@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion

echo.
echo  ============================================================
echo   CORAL ADVENTURES - BI Platform Installer
echo  ============================================================
echo.

:: ---------------------------------------------------------------
:: Step 1: Ensure Node.js is available
:: ---------------------------------------------------------------
if exist "C:\Program Files\nodejs\npm.cmd" (
    set "PATH=%PATH%;C:\Program Files\nodejs"
)

call npm -v >nul 2>nul
if %errorlevel% neq 0 (
    echo [1/5] Node.js not found. Downloading Node.js v20...
    echo       This may take a few minutes. Please wait.
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi' -OutFile 'node_installer.msi' -UseBasicParsing"
    echo.
    echo       Please complete the Node.js setup wizard that opens.
    start /wait msiexec /i node_installer.msi /quiet /norestart
    del node_installer.msi 2>nul
    set "PATH=%PATH%;C:\Program Files\nodejs"
    call npm -v >nul 2>nul
    if !errorlevel! neq 0 (
        echo [ERROR] Node.js installation failed. Please install Node.js manually from https://nodejs.org
        pause
        exit /b 1
    )
    echo [1/5] Node.js installed successfully!
) else (
    echo [1/5] Node.js found. OK
)

:: ---------------------------------------------------------------
:: Step 2: Install npm dependencies
:: ---------------------------------------------------------------
echo.
echo [2/5] Installing dependencies (this may take 2-3 minutes on first run)...
cd system
call npm install --prefer-offline
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
echo [2/5] Dependencies installed!

:: ---------------------------------------------------------------
:: Step 3: Setup database
:: ---------------------------------------------------------------
echo.
echo [3/5] Setting up the database...
call npm run db:migrate
if %errorlevel% neq 0 (
    echo [ERROR] Database migration failed.
    pause
    exit /b 1
)
call npm run db:seed
if %errorlevel% neq 0 (
    echo [ERROR] Database seeding failed.
    pause
    exit /b 1
)
echo [3/5] Database ready!

:: ---------------------------------------------------------------
:: Step 4: Setup .env file for Gemini AI
:: ---------------------------------------------------------------
echo.
echo [4/5] Checking AI configuration...
if not exist ".env.local" (
    echo       Creating .env.local from template...
    copy ".env.example" ".env.local" >nul
    echo.
    echo  *** IMPORTANT: AI CHIEF OF STAFF SETUP ***
    echo.
    echo  To enable the Gemini AI chat assistant, you need a free API key:
    echo.
    echo  1. Go to: https://aistudio.google.com/app/apikey
    echo  2. Sign in with your Google account
    echo  3. Click "Create API Key"
    echo  4. Open the file:  %CD%\.env.local
    echo  5. Replace  your_gemini_api_key_here  with your key
    echo  6. Save the file and restart the platform
    echo.
    echo  (The platform works fine without Gemini - only the AI chat will be disabled)
    echo.
) else (
    echo [4/5] .env.local already exists. OK
)

:: ---------------------------------------------------------------
:: Step 5: Build the application
:: ---------------------------------------------------------------
echo.
echo [5/5] Building the application (first build may take 1-2 minutes)...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed. Please check the error above.
    pause
    exit /b 1
)
echo [5/5] Build complete!

cd ..

echo.
echo  ============================================================
echo   Installation Complete!
echo.
echo   To start the platform, double-click: start.bat
echo   Dashboard: http://localhost:3000
echo  ============================================================
echo.
timeout /t 10
