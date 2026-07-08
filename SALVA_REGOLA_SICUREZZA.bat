@echo off
chcp 65001 >nul
title CORTEX - Backup git regola sicurezza
cd /d "%~dp0"

echo.
echo  Salvo la regola firestore.rules nel git di cortex (backup).
echo  (la regola e' gia' LIVE su Firebase: questo e' solo backup)
echo.
pause

echo  Rimuovo eventuale lucchetto git bloccato...
if exist ".git\index.lock" del /f /q ".git\index.lock"

git add firestore.rules
git commit -m "security: harden firestore analytics rules (require auth)"

echo.
echo  Push su GitHub (cortexapp)...
echo  Se chiede le credenziali: utente CICCIO-10-10 + token nuovo.
echo.
git push

echo.
if %errorlevel%==0 (
  echo  [OK] Fatto, regola salvata anche nel backup git.
) else (
  echo  [ATTENZIONE] Push fallito - il commit locale e' comunque salvato.
)
echo.
pause
