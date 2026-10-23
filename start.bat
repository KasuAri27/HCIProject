@echo off
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python not found in PATH.
    echo Please install Python 3.10+ and add it to PATH, then retry.
    pause
    exit /b 1
)

python launcher.py
