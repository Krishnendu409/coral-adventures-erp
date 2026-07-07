@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion

echo.
echo  ============================================================
echo   CORAL ADVENTURES - BI Platform
echo  ============================================================
echo.

:: Ensure Node.js is in PATH
if exist "C:\Program Files\nodejs\npm.cmd" (
    set "PATH=%PATH%;C:\Program Files\nodejs"
)

call npm -v >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please run install.bat first.
    pause
    exit /b 1
)

:: Check if the application has been built
if not exist "system\.next" (
    echo [WARN] Application not yet built. Running install first...
    echo.
    call install.bat
)

echo  Starting the platform. Please wait...
echo.
echo  The dashboard will be available at:
echo    http://localhost:3000
echo.
echo  Press CTRL+C to stop the server.
echo.
cd system

echo  Checking if server is already running...
:: We will just use npm run dev as fallback if start fails, but timeout instead of pause
call npm start
if %errorlevel% neq 0 (
    echo.
    echo [WARN] Production server failed to start (port may be in use, or build missing).
    echo [INFO] Falling back to development mode...
    echo.
    call npm run dev
    if !errorlevel! neq 0 (
        echo.
        echo [ERROR] Development server also failed. 
        echo [ERROR] The port 3000 might be in use by another application.
        timeout /t 10
    )
)
