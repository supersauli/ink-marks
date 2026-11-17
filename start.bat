@echo off
chcp 65001 >nul
title Novel Studio 启动脚本

rem 切换到脚本所在目录（项目根目录），保证从任意位置双击都能运行
cd /d "%~dp0"

echo ============================================
echo   Novel Studio 启动脚本
echo ============================================

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18 或更高版本。
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [提示] 未发现依赖，正在执行 npm install ...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络后重试。
        pause
        exit /b 1
    )
)

if "%~1"=="dev" (
    echo [提示] 开发热更新模式：前端 http://localhost:5173  服务 http://localhost:8787
    call npm run dev:hot
) else (
    echo [提示] 正在构建前端并启动服务 ...
    echo [提示] 启动后访问 http://localhost:8787
    call npm start
)

echo.
echo [提示] 服务已停止。
pause
