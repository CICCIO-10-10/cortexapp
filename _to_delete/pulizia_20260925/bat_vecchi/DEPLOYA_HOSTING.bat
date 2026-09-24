@echo off
cd /d "%~dp0"

echo.
echo  Cortex - Deploy Hosting
echo  ========================
echo.
echo  [1/2] Build in corso (npm run build:fast)...
call npm run build:fast
if %ERRORLEVEL% neq 0 (
    echo.
    echo  [ERRORE] Build fallita - deploy ANNULLATO. Niente e' stato pubblicato.
    echo.
    echo  Premi un tasto per chiudere...
    pause >nul
    exit /b 1
)

echo.
echo  [2/2] Deploy su Firebase...
where firebase >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [!] firebase non nel PATH, uso npx...
    call npx firebase-tools deploy --only hosting:cortex
) else (
    call firebase deploy --only hosting:cortex
)

set RESULT=%ERRORLEVEL%
echo.
if %RESULT% == 0 (
    echo  [OK] Build + Deploy completati - cortexapp.it aggiornato
) else (
    echo  [ERRORE] Deploy fallito. Codice: %RESULT%   (prova: firebase login)
)
echo.
echo  Premi un tasto per chiudere...
pause >nul
