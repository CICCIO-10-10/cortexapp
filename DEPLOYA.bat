@echo off
title CORTEX — Build + Deploy
color 0A
echo.
echo  ========================================
echo   CORTEX — Build e Deploy su Firebase
echo  ========================================
echo.

cd /d "%~dp0"

echo [1/3] Build Vite...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo  ERRORE nel build! Controlla i log sopra.
    pause
    exit /b 1
)

echo.
echo [2/3] Deploy su Firebase Hosting + Functions...
call firebase deploy --only hosting,functions
if %errorlevel% neq 0 (
    echo.
    echo  ERRORE nel deploy!
    echo  Assicurati di aver fatto: firebase login
    pause
    exit /b 1
)

echo.
echo  ========================================
echo   DEPLOY COMPLETATO!
echo   App live su: https://cortex-app.web.app
echo   (se hai cortexapp.it configurato, anche li')
echo  ========================================
echo.
pause
