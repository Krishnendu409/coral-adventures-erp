@echo off
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
echo Build Complete!
echo You can now double-click start.bat to run the platform.
echo ========================================================
pause
