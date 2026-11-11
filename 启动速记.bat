@echo off
setlocal
title 速记
cd /d "%~dp0"

rem 便携版启动器：本地服务 + 系统浏览器（不依赖 Electron 窗口）
set "NODE=%~dp0runtime\node.exe"
set "SERVER=%~dp0out\server\index.cjs"

if not exist "%NODE%" goto NO_NODE
if not exist "%SERVER%" goto NO_SERVER

rem ---- 首次运行：解除「下载文件」标记 + 建桌面快捷方式 ----
if not exist "%~dp0.first-run-done" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%~dp0' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>nul
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\make-shortcut.ps1" >nul 2>nul
  > "%~dp0.first-run-done" echo ok
)

set "PORTFILE="
del "%APPDATA%\速记\data\server-port.txt" >nul 2>nul
del "%~dp0data\server-port.txt" >nul 2>nul

start "速记服务（关闭此窗口即退出程序）" /min "%NODE%" "%SERVER%"

set /a n=0
:WAIT
timeout /t 1 /nobreak >nul
if exist "%APPDATA%\速记\data\server-port.txt" set "PORTFILE=%APPDATA%\速记\data\server-port.txt"
if not defined PORTFILE if exist "%~dp0data\server-port.txt" set "PORTFILE=%~dp0data\server-port.txt"
if defined PORTFILE goto OPEN
set /a n+=1
if %n% lss 30 goto WAIT

echo.
echo  [!] 本地服务没有启动起来。
if exist "%~dp0data\server-error.log" (
  echo     错误日志：%~dp0data\server-error.log
  type "%~dp0data\server-error.log"
) else (
  echo     请确认 runtime\node.exe 与 out\server\index.cjs 都在。
)
echo.
pause
exit /b 1

:OPEN
set "PORT="
set /p PORT=<"%PORTFILE%"
if not defined PORT (
  echo  [!] 读取端口失败：%PORTFILE%
  pause
  exit /b 1
)
set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app=http://127.0.0.1:%PORT% --window-size=1400,920
) else (
  start "" "http://127.0.0.1:%PORT%"
)
exit /b 0

:NO_NODE
echo.
echo  [!] 缺少运行时：runtime\node.exe
echo      这个文件夹不完整，请重新解压整个压缩包。
echo.
pause
exit /b 1

:NO_SERVER
echo.
echo  [!] 缺少程序文件：out\server\index.cjs
echo      这个文件夹不完整，请重新解压整个压缩包。
echo.
pause
exit /b 1
