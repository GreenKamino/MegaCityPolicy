@echo off
setlocal
cd /d "%~dp0"
title MEGACITY Steam Uploader
echo.
echo ==========================================
echo   MEGACITY - Upload to Steam
echo ==========================================
echo.
echo A PowerShell window will handle the upload.
echo Your password and Steam Guard code will be requested by Steam.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0upload-to-steam.ps1"
if errorlevel 1 (
  echo.
  echo The uploader returned an error.
  echo If a steam-log.txt file exists, send its last 20 lines for diagnosis.
)
echo.
pause