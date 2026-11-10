@echo off
setlocal
cd /d "%~dp0"
rem Starts the PLC bridge on this PC and opens the online (GitHub Pages) copy of CapVision.
rem Type the Pairing code shown below into the Connect tab of the web page.
set "CAPVISION_URL=https://thaksaporn.github.io/capvision-simulator/"
set "CAPVISION_PY=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%CAPVISION_PY%" (
 "%CAPVISION_PY%" bridge\server.py --open-url "%CAPVISION_URL%"
) else (
 py -3 bridge\server.py --open-url "%CAPVISION_URL%"
)
pause
