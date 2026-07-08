@echo off
cd /d "%~dp0"

echo.
echo  Cortex - Deploy Hosting
echo  ========================
echo.

where firebase >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [!] firebase non trovato nel PATH, provo con npx...
    call npx firebase-tools deploy --only hosting:cortex
) else (
    call firebase deploy --only hosting:cortex
)

set RESULT=%ERRORLEVEL%
echo.
if %RESULT% == 0 (
    echo  [OK] Deploy completato - cortexapp.it aggiornato
) else (
    echo  [ERRORE] Codice errore: %RESULT%
    echo  Prova: firebase login
)
echo.
echo  Premi un tasto per chiudere...
pause >nul
