@echo off
title LocalLeads
cd /d "C:\Users\User\Desktop\PROGETTI\cortex"
echo.
echo  Avvio LocalLeads...
echo  Premi CTRL+C nella finestra server per chiudere.
echo.
start "LocalLeads Server" python -m http.server 8080
timeout /t 2 /nobreak >nul
start "" "http://localhost:8080/localleads.html"
