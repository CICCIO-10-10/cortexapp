@echo off
chcp 65001 >nul
title CORTEX - Strumenti
cd /d "%~dp0"
REM ============================================================
REM  CORTEX.bat (25/09/2026) - un solo file per tutti i comandi.
REM  Sostituisce: DEPLOYA_HOSTING, DEPLOY_FUNCTIONS, DEPLOYA,
REM  DEPLOY_REGOLE_SICUREZZA, AGGIORNA_UNIME, LocalLeads
REM  (i vecchi .bat sono in _to_delete\pulizia_20260925\bat_vecchi)
REM ============================================================

:menu
cls
echo.
echo   =============================================
echo     CORTEX - cosa vuoi fare?
echo   =============================================
echo.
echo     1  Pubblica il SITO / APP          (hosting)
echo     2  Pubblica le CLOUD FUNCTIONS     (email, dashboard, AI)
echo     3  Pubblica TUTTO                  (build completo + sito + functions)
echo     4  Pubblica le REGOLE di sicurezza (Firestore)
echo     5  Aggiorna i corsi UniMe          (programmi + landing + sitemap + deploy)
echo     6  Apri LocalLeads                 (server locale)
echo.
echo     0  Esci
echo.
set "SCELTA="
set /p SCELTA="   Scelta: "
if "%SCELTA%"=="1" goto :hosting
if "%SCELTA%"=="2" goto :functions
if "%SCELTA%"=="3" goto :tutto
if "%SCELTA%"=="4" goto :regole
if "%SCELTA%"=="5" goto :unime
if "%SCELTA%"=="6" goto :localleads
if "%SCELTA%"=="0" goto :eof
goto :menu

:firebase_cmd
where firebase >nul 2>&1
if %ERRORLEVEL% neq 0 (set "FB=npx firebase-tools") else (set "FB=firebase")
exit /b 0

:hosting
echo.
echo  [1/2] Build del sito...
call npm run build:fast
if %ERRORLEVEL% neq 0 goto :errore
call :firebase_cmd
echo  [2/2] Pubblicazione hosting...
call %FB% deploy --only hosting:cortex
if %ERRORLEVEL% neq 0 goto :errore
goto :ok

:functions
echo.
echo  Pubblicazione Cloud Functions...
call :firebase_cmd
call %FB% deploy --only functions
if %ERRORLEVEL% neq 0 goto :errore
goto :ok

:tutto
echo.
echo  [1/2] Build completo (con controllo traduzioni)...
call npm run build
if %ERRORLEVEL% neq 0 goto :errore
call :firebase_cmd
echo  [2/2] Pubblicazione sito + functions...
call %FB% deploy --only hosting,functions
if %ERRORLEVEL% neq 0 goto :errore
goto :ok

:regole
echo.
echo  Pubblicazione regole Firestore...
call :firebase_cmd
call %FB% deploy --only firestore:rules
if %ERRORLEVEL% neq 0 goto :errore
goto :ok

:unime
echo.
echo  [1/5] Programmi dei corsi (riprende da dove era rimasto)...
python importa_unime.py --programma
echo  [2/5] Landing UniMe...
python genera_landing_unime.py
if %ERRORLEVEL% neq 0 goto :errore
echo  [3/5] Sitemap...
python genera_sitemap.py
if %ERRORLEVEL% neq 0 goto :errore
echo  [4/5] Build...
call npm run build
if %ERRORLEVEL% neq 0 goto :errore
call :firebase_cmd
echo  [5/5] Pubblicazione hosting...
call %FB% deploy --only hosting
if %ERRORLEVEL% neq 0 goto :errore
goto :ok

:localleads
start "LocalLeads Server" python -m http.server 8080
timeout /t 2 /nobreak >nul
start "" "http://localhost:8080/localleads.html"
goto :menu

:errore
echo.
echo   [ERRORE] Qualcosa e' andato storto: niente e' stato pubblicato a meta'.
echo   Leggi il messaggio sopra.
echo.
pause
goto :menu

:ok
echo.
echo   FATTO!
echo.
pause
goto :menu
