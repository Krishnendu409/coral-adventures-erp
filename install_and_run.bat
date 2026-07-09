@echo off
set "PATH=%~dp0bin\node;%PATH%"
echo Using Node:
node -v
cd system
echo Installing dependencies...
call npm install
echo Migrating database...
call npm run db:migrate
echo Seeding database...
call npm run db:seed
if not exist ".env.local" (
    echo Creating .env.local...
    copy ".env.example" ".env.local"
)
echo Building application...
call npm run build
cd ..
echo Starting application...
call .\start.bat
