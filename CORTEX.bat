@echo off
chcp 65001 >nul
REM 06/10/2026: pubblicazione e strumenti di Cortex sono nel menu HQ (MENU.bat -> 1 CORTEX).
if exist "%USERPROFILE%\Desktop\MENU.bat" (
  call "%USERPROFILE%\Desktop\MENU.bat"
) else (
  echo.
  echo   Usa MENU.bat sul Desktop, voce 1 CORTEX.
  echo.
  pause
)
