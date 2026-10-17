@echo off
chcp 65001 >nul 2>&1
title 蜡笔小新桌宠 - 开发模式
cd /d "%~dp0"

REM 彻底删除干扰 Electron GUI 的环境变量
set "ELECTRON_RUN_AS_NODE="
set "NODE_OPTIONS="

echo 正在以开发模式启动蜡笔小新桌宠（带热更新）...
call npm run dev
pause
