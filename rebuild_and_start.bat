@echo off
set "PATH=%~dp0bin\node;%PATH%"
cd system
echo Building application...
call npm run build
cd ..
echo Starting application...
call .\start.bat
