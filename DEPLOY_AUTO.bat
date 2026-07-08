@echo off
cd /d "%~dp0"
firebase deploy --only hosting > deploy_log.txt 2>&1
exit
