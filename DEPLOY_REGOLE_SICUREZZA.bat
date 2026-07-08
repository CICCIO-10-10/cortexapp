@echo off
chcp 65001 >nul
title CORTEX - Deploy REGOLE Firestore (sicurezza)
color 0E
cd /d "%~dp0"

echo.
echo  ============================================================
echo    CORTEX - Deploy SOLO regole Firestore
echo    (hardening analytics - audit 02/07/2026)
echo  ============================================================
echo.
echo  Questo NON tocca hosting ne' functions: aggiorna solo le
echo  regole di sicurezza del database. Da premere UNA volta.
echo.
pause

call firebase deploy --only firestore:rules

echo.
if %errorlevel%==0 (
  echo  [OK] Regole Firestore aggiornate.
) else (
  echo  [ERRORE] Deploy fallito.
  echo    -^> Prova prima: firebase login
)
echo.
pause
