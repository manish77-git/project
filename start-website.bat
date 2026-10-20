@echo off
title MediExplain AI - Full-Stack Application
echo ============================================================
echo   Starting MediExplain AI Full-Stack Website (Next.js)
echo   Local Address: http://localhost:3000/
echo ============================================================
set "PATH=C:\Users\Hp\nodejs;%PATH%"
echo Opening website in your default browser...
start http://localhost:3000/
echo.
echo Next.js server is starting on port 3000. Press Ctrl+C to stop.
echo.
npm run dev
pause
