@echo off
chcp 65001 >nul
REM 06/10/2026: il menu di Cortex e' il file CORTEX.bat sul Desktop.
REM Questo file apre quello (stessa cartella di lavoro: questa).
if exist "%USERPROFILE%\Desktop\CORTEX.bat" (
  call "%USERPROFILE%\Desktop\CORTEX.bat"
) else (
  echo.
  echo   Usa il file CORTEX.bat sul Desktop.
  echo.
  pause
)
