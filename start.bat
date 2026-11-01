@echo off
title SafeDrop Blockchain Server
cd /d "%~dp0"
echo =======================================================
echo   Starting SafeDrop Blockchain Application...
echo   EVM Network: SafeDrop Local Testnet (Chain ID 31337)
echo   Dashboard URL: http://localhost:5000
echo =======================================================
echo.
python run.py
pause
