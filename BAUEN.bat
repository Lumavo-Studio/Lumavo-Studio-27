@echo off
setlocal
cd /d "%~dp0"
set CSC_IDENTITY_AUTO_DISCOVERY=false
echo.
echo  === Lumavo Studio 27 einrichten ===
echo.
echo  Welches System hast du?
echo    [1] Windows, 64-Bit (fast alle PCs)
echo    [2] Windows, 32-Bit (sehr alte PCs)
echo    [3] macOS
choice /c 123 /n /m "  Deine Wahl: "
if errorlevel 3 goto mac
if errorlevel 2 (set ARCH=ia32) else (set ARCH=x64)
echo.
echo  Was soll erstellt werden?
echo    [1] Installer (Setup)
echo    [2] Portable Version, laeuft ohne Installation
echo    [3] Beides
choice /c 123 /n /m "  Deine Wahl: "
if errorlevel 3 (set "TG=nsis portable") else if errorlevel 2 (set "TG=portable") else (set "TG=nsis")
echo.
echo  Baue fuer Windows %ARCH%. Beim ersten Mal dauert das einige Minuten und braucht Internet.
set npm_config_arch=%ARCH%
where node >nul 2>nul
if errorlevel 1 (
  if not exist tools\node\node.exe (
    echo Lade Node.js herunter ...
    mkdir tools 2>nul
    powershell -NoProfile -Command "Invoke-WebRequest https://nodejs.org/dist/v22.11.0/node-v22.11.0-win-x64.zip -OutFile tools\node.zip; Expand-Archive tools\node.zip tools -Force; Rename-Item tools\node-v22.11.0-win-x64 node"
  )
  set "PATH=%~dp0tools\node;%PATH%"
)
rmdir /s /q node_modules\ffmpeg-static 2>nul
call npm install || goto err
if not exist node_modules\ffmpeg-static\ffmpeg.exe call node node_modules\ffmpeg-static\install.js
call node_modules\.bin\electron-builder --win %TG% --%ARCH% --publish never || goto err
echo.
echo Fertig! Die Dateien liegen im Ordner dist.
explorer dist
pause
exit /b 0
:err
echo Etwas ist schiefgelaufen. Bitte die Meldungen oben lesen.
pause
exit /b 1
:mac
echo.
echo  Fuer macOS muss Lumavo Studio 27 auf einem Mac gebaut werden.
echo  Oeffne dort die Datei BAUEN-mac.command (Rechtsklick, Oeffnen).
pause
exit /b 0
