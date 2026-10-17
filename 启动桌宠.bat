@echo off
chcp 65001 >nul 2>&1
title 蜡笔小新桌宠
cd /d "%~dp0"

REM 彻底删除干扰 Electron GUI 的环境变量
set "ELECTRON_RUN_AS_NODE="
set "NODE_OPTIONS="

echo 正在启动蜡笔小新桌宠...
call npm start
pause
