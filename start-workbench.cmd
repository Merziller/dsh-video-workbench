@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo ======================================================================
echo 🎬 正在启动 DeepSeek Harness 双引擎视频工作台 (Profile: video)...
echo    启动后将自动打开浏览器预览界面: http://127.0.0.1:4399
echo ======================================================================
start "" "http://127.0.0.1:4399"
call "%~dp0pnpm.cmd" dsh video --keep-alive
pause
