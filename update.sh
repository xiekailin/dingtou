#!/bin/bash
echo "正在更新服务器代码..."

rsync -avz --exclude 'node_modules' --exclude '.git' . root@124.221.197.94:/home/bitcoinInverstment/dingtou/

ssh root@124.221.197.94 'cd /home/bitcoinInverstment/dingtou && pm2 restart server.js --name bitcoin-investment'

echo "更新完成！"
