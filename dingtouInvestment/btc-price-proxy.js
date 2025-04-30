/**
 * 比特币价格API代理服务器
 * Node.js版本
 * 
 * 使用方法:
 * 1. 安装依赖: npm install express cors node-fetch
 * 2. 运行: node btc-price-proxy.js
 * 3. 默认运行在 http://localhost:3000/api/btc-price
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// 启用CORS
app.use(cors());

// 定义API端点
const apis = [
    {
        name: 'coingecko',
        url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
        parse: (data) => {
            if (data.bitcoin && data.bitcoin.usd) {
                return parseFloat(data.bitcoin.usd);
            }
            return false;
        }
    },
    {
        name: 'coindesk',
        url: 'https://api.coindesk.com/v1/bpi/currentprice.json',
        parse: (data) => {
            if (data.bpi && data.bpi.USD && data.bpi.USD.rate_float) {
                return parseFloat(data.bpi.USD.rate_float);
            }
            return false;
        }
    },
    {
        name: 'binance',
        url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
        parse: (data) => {
            if (data.price) {
                return parseFloat(data.price);
            }
            return false;
        }
    }
];

// 获取比特币价格
async function getBtcPrice() {
    for (const api of apis) {
        try {
            console.log(`尝试从 ${api.name} 获取比特币价格`);
            
            const response = await fetch(api.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                timeout: 10000
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            const price = api.parse(data);
            
            if (price !== false) {
                console.log(`成功从 ${api.name} 获取比特币价格: $${price}`);
                
                return {
                    success: true,
                    price: price,
                    source: api.name,
                    timestamp: Date.now()
                };
            }
        } catch (error) {
            console.error(`从 ${api.name} 获取比特币价格失败:`, error.message);
        }
    }
    
    console.error('所有API都失败了');
    return {
        success: false,
        error: '无法从任何API获取比特币价格'
    };
}

// API端点
app.get('/api/btc-price', async (req, res) => {
    try {
        // 禁用缓存
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        
        const result = await getBtcPrice();
        res.json(result);
    } catch (error) {
        console.error('获取比特币价格时出错:', error);
        res.status(500).json({
            success: false,
            error: '服务器内部错误'
        });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`比特币价格代理服务器运行在 http://localhost:${PORT}/api/btc-price`);
}); 