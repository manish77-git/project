@echo off
title Push MediExplain AI to GitHub
echo ============================================================
echo   Pushing MediExplain AI Frontend to GitHub
echo   Repository: https://github.com/manish77-git/project
echo ============================================================
echo.
set "PATH=C:\Users\Hp\git\cmd;%PATH%"
cd /d "%~dp0"
git status
echo.
echo Pushing latest commits to origin main...
git push origin main
echo.
echo ============================================================
echo   Done! Check https://github.com/manish77-git/project
echo ============================================================
pause
