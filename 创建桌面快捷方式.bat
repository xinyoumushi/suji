@echo off
setlocal
cd /d "%~dp0"
echo 正在创建桌面快捷方式...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\make-shortcut.ps1"
echo.
echo 如果桌面没有出现「速记」图标，请检查是不是被 OneDrive 的桌面路径接管了。
echo.
pause
