@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
  py -3 -m pip install --disable-pip-version-check "telethon>=1.45,<2"
  if errorlevel 1 goto fail
  py -3 create_session.py
  goto finished
)
where python >nul 2>&1
if %errorlevel%==0 (
  python -m pip install --disable-pip-version-check "telethon>=1.45,<2"
  if errorlevel 1 goto fail
  python create_session.py
  goto finished
)
echo [ERROR] Python 3 is not installed. Install Python from https://www.python.org/downloads/windows/
goto finished
:fail
echo [ERROR] Session setup failed. Check errors above.
:finished
echo.
pause
