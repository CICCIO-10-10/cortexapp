@echo off
title CORTEX — Deploy Functions Only
color 0B
echo.
echo  ========================================
echo   CORTEX — Deploy solo Cloud Functions
echo  ========================================
echo.
cd /d "%~dp0"
call firebase deploy --only functions
if %errorlevel% neq 0 (
    echo.
    echo  ERRORE nel deploy functions!
    pause
    exit /b 1
)
echo.
echo  ========================================
echo   FUNCTIONS DEPLOYATE!
echo  ========================================
echo.
pause
