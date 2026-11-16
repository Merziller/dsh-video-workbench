@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo ======================================================================
echo 🎬 正在启动 DeepSeek Harness 双引擎视频工作台 (Profile: video)...
echo    服务就绪后将自动打开实际监听的浏览器预览地址（默认 http://127.0.0.1:4399）
echo ======================================================================
call "%~dp0pnpm.cmd" dsh video --keep-alive --open
pause
