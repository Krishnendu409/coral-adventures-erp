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
call npm start
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server failed to start. Trying dev mode...
    call npm run dev
)
pause
