#!/bin/bash

# 显示当前目录
echo "当前工作目录: $(pwd)"

# 显示文件结构
echo "文件结构:"
ls -la

# 安装依赖
echo "安装依赖..."
npm install

# 启动服务器
echo "启动服务器..."
node server.js 