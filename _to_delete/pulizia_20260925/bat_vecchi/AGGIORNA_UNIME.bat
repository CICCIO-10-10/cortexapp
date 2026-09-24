@echo off
REM ============================================================
REM  AGGIORNA_UNIME.bat  -  Pipeline completa corsi UNIME
REM  Riempie i programmi, rigenera landing + sitemap, builda e deploya.
REM  Doppio click e vai. E' RESUMABLE: se lo interrompi, riprende.
REM  Creato 22/07/2026
REM ============================================================
setlocal
cd /d C:\Users\User\Desktop\PROGETTI\cortex

echo.
echo ============================================================
echo  [1/5] Estrazione programmi insegnamenti (puo' richiedere 20-40 min)
echo        Resumable: i corsi gia' fatti vengono saltati.
echo ============================================================
python importa_unime.py --programma
if errorlevel 1 (
  echo.
  echo  ATTENZIONE: estrazione programmi non riuscita ^(server UNIME non raggiungibile^).
  echo  Proseguo comunque: i dati gia' presenti ^(puliti^) verranno pubblicati lo stesso.
  echo.
)

echo.
echo ============================================================
echo  [2/5] Rigenero le 105 landing SEO per corso (con i programmi aggiornati)
echo ============================================================
python genera_landing_unime.py
if errorlevel 1 goto :err

echo.
echo ============================================================
echo  [3/5] Rigenero la sitemap
echo ============================================================
python genera_sitemap.py
if errorlevel 1 goto :err

echo.
echo ============================================================
echo  [4/5] Build del sito (Vite)
echo ============================================================
call npm run build
if errorlevel 1 goto :err

echo.
echo ============================================================
echo  [5/5] Deploy su Firebase Hosting
echo ============================================================
call firebase deploy --only hosting
if errorlevel 1 goto :err

echo.
echo ============================================================
echo  FATTO! UNIME aggiornato e online su cortexapp.it/unime
echo ============================================================
goto :end

:err
echo.
echo  !!! ERRORE in uno step. Controlla i messaggi sopra.
echo  (Puoi rilanciare il .bat: riprende da dove si e' fermato.)

:end
echo.
pause
endlocal
