@echo off
cd /d "%~dp0"
title Rain Aemeath KB Server

echo.
echo  Site: http://localhost:8000
echo  Upload password: see top of server.py
echo.

echo  Closing old server on port 8000...
for /f "usebackq tokens=5" %%a in (`netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"`) do (
  taskkill /f /pid %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

start "" cmd /c "timeout /t 1 /nobreak >nul && start http://localhost:8000"
echo  Starting server...
python server.py
if errorlevel 1 py server.py
echo.
echo  Server stopped. Press any key to close this window.
pause >nul
