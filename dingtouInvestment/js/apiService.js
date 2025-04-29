/**
 * API服务模块
 * 处理比特币价格获取和汇率更新等功能
 */
import { exchangeRates } from './config.js';

// 当前比特币价格
let currentBtcPrice = {
    USD: 0,
    CNY: 0
};

// 最后一次更新时间
let lastUpdateTime = null;

// 自动刷新定时器ID
let autoRefreshIntervalId = null;

/**
 * 获取比特币当前价格
 * @param {string} currency 货币类型，默认为 USD
 */
async function fetchBtcPrice() {
    try {
        // 使用CoinGecko API获取比特币价格
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,cny');
        
        if (response.data && response.data.bitcoin) {
            currentBtcPrice.USD = response.data.bitcoin.usd;
            currentBtcPrice.CNY = response.data.bitcoin.cny;
            
            // 记录更新时间
            lastUpdateTime = new Date();
            
            return {
                success: true,
                prices: { ...currentBtcPrice },
                time: lastUpdateTime
            };
        }
        
        throw new Error('无法获取比特币价格');
    } catch (error) {
        console.error('获取比特币价格失败:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 获取当前比特币价格
 * @param {string} currency 货币类型
 */
function getCurrentBtcPrice(currency = 'USD') {
    if (currency === 'USD') {
        return currentBtcPrice.USD;
    } else if (currency === 'CNY') {
        return currentBtcPrice.CNY;
    }
    return 0;
}

/**
 * 获取最新汇率
 */
async function fetchExchangeRate() {
    try {
        // 使用ExchangeRate-API获取最新汇率
        const response = await axios.get('https://open.er-api.com/v6/latest/USD');
        
        if (response.data && response.data.rates && response.data.rates.CNY) {
            const usdToCny = response.data.rates.CNY;
            const cnyToUsd = 1 / usdToCny;
            
            // 更新汇率
            exchangeRates.USD_TO_CNY = usdToCny;
            exchangeRates.CNY_TO_USD = cnyToUsd;
            
            console.log('汇率更新成功:', exchangeRates);
            return {
                success: true,
                rates: { ...exchangeRates }
            };
        }
        
        console.warn('获取汇率失败，使用默认值');
        return {
            success: false,
            error: '无法获取汇率数据',
            rates: { ...exchangeRates }
        };
    } catch (error) {
        console.error('获取汇率失败，使用默认值:', error);
        return {
            success: false,
            error: error.message,
            rates: { ...exchangeRates }
        };
    }
}

/**
 * 开始自动刷新价格
 * @param {number} interval 刷新间隔（毫秒）
 * @param {Function} callback 刷新后的回调函数
 */
function startAutoRefresh(interval = 60000, callback) {
    // 先停止现有的自动刷新
    stopAutoRefresh();
    
    // 立即刷新一次
    fetchBtcPrice().then(result => {
        if (callback && typeof callback === 'function') {
            callback(result);
        }
    });
    
    // 设置定时刷新
    autoRefreshIntervalId = setInterval(async () => {
        const result = await fetchBtcPrice();
        if (callback && typeof callback === 'function') {
            callback(result);
        }
    }, interval);
    
    return true;
}

/**
 * 停止自动刷新
 */
function stopAutoRefresh() {
    if (autoRefreshIntervalId) {
        clearInterval(autoRefreshIntervalId);
        autoRefreshIntervalId = null;
    }
    return true;
}

/**
 * 获取最后更新时间
 */
function getLastUpdateTime() {
    return lastUpdateTime;
}

// 导出模块接口
export {
    fetchBtcPrice,
    getCurrentBtcPrice,
    fetchExchangeRate,
    startAutoRefresh,
    stopAutoRefresh,
    getLastUpdateTime
}; 