@echo off
setlocal
cd /d "%~dp0"
set "CAPVISION_PY=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%CAPVISION_PY%" (
 "%CAPVISION_PY%" bridge\server.py --open
) else (
 py -3 bridge\server.py --open
)
pause
