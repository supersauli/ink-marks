#!/usr/bin/env bash
set -e

# 切换到脚本所在目录（项目根目录），保证从任意位置执行都能运行
cd "$(dirname "$0")"

echo "============================================"
echo "  Novel Studio 启动脚本"
echo "============================================"

if ! command -v node >/dev/null 2>&1; then
    echo "[错误] 未检测到 Node.js，请先安装 Node.js 18 或更高版本。"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "[提示] 未发现依赖，正在执行 npm install ..."
    npm install
fi

if [ "${1:-}" = "dev" ]; then
    echo "[提示] 开发热更新模式：前端 http://localhost:5173  服务 http://localhost:8787"
    npm run dev:hot
else
    echo "[提示] 正在构建前端并启动服务 ..."
    echo "[提示] 启动后访问 http://localhost:8787"
    npm start
fi

echo ""
echo "[提示] 服务已停止。"
