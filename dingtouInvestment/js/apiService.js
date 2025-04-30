/**
 * API服务模块
 * 负责从外部API获取比特币价格和汇率
 */
import { exchangeRates } from './config.js';

// 价格和刷新相关
let btcPrice = {
    USD: null,
    CNY: null,
    timestamp: null
};
let refreshInterval = null;
let refreshFailCount = 0;
const MAX_REFRESH_FAIL = 3;
let autoRefreshActive = false;
let lastRefreshAttempt = null;
let refreshCallbacks = [];

// API端点配置
const API_CONFIG = {
    endpoints: [
        {
            name: 'coingecko',
            url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
            parser: (data) => {
                if (!data.bitcoin || !data.bitcoin.usd) {
                    throw new Error('API返回数据格式错误');
                }
                return parseFloat(data.bitcoin.usd);
            }
        },
        {
            name: 'coindesk',
            url: 'https://api.coindesk.com/v1/bpi/currentprice.json',
            parser: (data) => {
                if (!data.bpi || !data.bpi.USD || !data.bpi.USD.rate_float) {
                    throw new Error('API返回数据格式错误');
                }
                return parseFloat(data.bpi.USD.rate_float);
            }
        },
        {
            name: 'binance',
            url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
            parser: (data) => {
                if (!data.price) {
                    throw new Error('API返回数据格式错误');
                }
                return parseFloat(data.price);
            }
        },
        {
            name: '本地代理',
            url: './btc-price-proxy.php',
            parser: (data) => {
                if (!data.price) {
                    throw new Error('API返回数据格式错误');
                }
                return parseFloat(data.price);
            }
        }
    ],
    currentEndpointIndex: 0
};

/**
 * 获取比特币当前价格(缓存版)
 * @param {string} currency 货币类型 (USD/CNY)
 */
function getCurrentBtcPrice(currency = 'USD') {
    // 如果还没有获取到价格，使用默认价格（最新市场价格）
    if (!btcPrice.USD) {
        console.warn('BTC价格未初始化，使用默认价格');
        // 设置默认价格 - 使用更合理的默认价格
        const defaultPrice = {
            USD: 95000, // 设置一个默认的美元价格，比历史购买价格稍高
            CNY: 95000 * 7.2, // 假设汇率
            timestamp: new Date().toISOString()
        };
        return currency === 'CNY' ? defaultPrice.CNY : defaultPrice.USD;
    }
    
    return currency === 'CNY' 
        ? btcPrice.CNY 
        : btcPrice.USD;
}

/**
 * 获取比特币价格更新时间
 */
function getPriceTimestamp() {
    return btcPrice.timestamp;
}

/**
 * 尝试下一个API端点
 */
function tryNextEndpoint() {
    API_CONFIG.currentEndpointIndex = (API_CONFIG.currentEndpointIndex + 1) % API_CONFIG.endpoints.length;
    console.log(`切换到下一个API端点: ${API_CONFIG.endpoints[API_CONFIG.currentEndpointIndex].name}`);
    return API_CONFIG.endpoints[API_CONFIG.currentEndpointIndex];
}

/**
 * 获取比特币价格
 */
async function fetchBtcPrice() {
    // 如果在过去10秒内已经刷新过，直接返回缓存的价格
    if (btcPrice.timestamp && lastRefreshAttempt && (Date.now() - lastRefreshAttempt < 10000)) {
        console.log('使用缓存的价格数据，上次刷新:', new Date(lastRefreshAttempt).toLocaleTimeString());
        return {
            success: true,
            data: {
                price: btcPrice,
                isCache: true
            }
        };
    }
    
    lastRefreshAttempt = Date.now();
    
    // 获取当前API端点
    let currentEndpoint = API_CONFIG.endpoints[API_CONFIG.currentEndpointIndex];
    let attempts = 0;
    const maxAttempts = API_CONFIG.endpoints.length;
    
    while (attempts < maxAttempts) {
        try {
            console.log(`尝试从 ${currentEndpoint.name} 获取比特币价格`);
            
            // 添加超时处理
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(currentEndpoint.url, {
                signal: controller.signal,
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`API响应错误: ${response.status}`);
            }
            
            const data = await response.json();
            
            // 使用对应的解析器解析数据
            const priceUSD = currentEndpoint.parser(data);
            
            // 更新价格和时间戳
            btcPrice.USD = priceUSD;
            btcPrice.CNY = convertCurrency(btcPrice.USD, 'USD', 'CNY');
            btcPrice.timestamp = new Date().toISOString();
            btcPrice.isStale = false; // 确保标记为最新
            
            // 重置失败计数
            refreshFailCount = 0;
            
            // 通知所有回调
            notifyRefreshCallbacks({ success: true, data: { price: btcPrice } });
            
            console.log(`成功从 ${currentEndpoint.name} 获取比特币价格: $${btcPrice.USD}`);
            
            return {
                success: true,
                data: {
                    price: btcPrice,
                    isCache: false,
                    source: currentEndpoint.name
                }
            };
        } catch (error) {
            console.error(`从 ${currentEndpoint.name} 获取比特币价格失败:`, 
                error.name === 'AbortError' ? '请求超时' : error.message);
            
            // 尝试下一个API端点
            currentEndpoint = tryNextEndpoint();
            attempts++;
            
            // 如果已经尝试了所有端点，则增加失败计数
            if (attempts >= maxAttempts) {
                refreshFailCount++;
                
                // 如果失败次数超过阈值，暂停自动刷新
                if (refreshFailCount >= MAX_REFRESH_FAIL && autoRefreshActive) {
                    console.warn(`连续${MAX_REFRESH_FAIL}次获取价格失败，暂停自动刷新10分钟后重试`);
                    pauseAutoRefresh(10 * 60 * 1000); // 暂停10分钟
                }
                
                // 如果有缓存的价格，仍然返回
                if (btcPrice.USD) {
                    // 标记价格为过期
                    btcPrice.isStale = true;
                    return {
                        success: true,
                        data: {
                            price: btcPrice,
                            isCache: true,
                            isStale: true
                        },
                        warning: '使用缓存的价格数据，获取最新价格失败'
                    };
                }
                
                return {
                    success: false,
                    error: '所有API端点都无法获取比特币价格'
                };
            }
        }
    }
    
    // 不应该到达这里，但为了安全起见
    return {
        success: false,
        error: '无法获取比特币价格'
    };
}

/**
 * 通知所有刷新回调
 */
function notifyRefreshCallbacks(result) {
    refreshCallbacks.forEach(callback => {
        try {
            callback(result);
        } catch (error) {
            console.error('刷新回调执行错误:', error);
        }
    });
}

/**
 * 暂停自动刷新一段时间
 */
function pauseAutoRefresh(duration) {
    // 停止当前的刷新定时器
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    
    // 设置标志
    const wasActive = autoRefreshActive;
    autoRefreshActive = false;
    
    // 如果之前是激活状态，设置定时器恢复
    if (wasActive) {
        console.log(`自动刷新已暂停，将在${duration/1000}秒后恢复`);
        setTimeout(() => {
            console.log('恢复自动刷新');
            startAutoRefresh(60000); // 恢复默认的刷新间隔
        }, duration);
    }
}

/**
 * 获取汇率
 */
async function fetchExchangeRate() {
    try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD');
        
        if (!response.ok) {
            throw new Error(`API响应错误: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.rates && data.rates.CNY) {
            // 更新汇率
            exchangeRates.USD_TO_CNY = data.rates.CNY;
            exchangeRates.CNY_TO_USD = 1 / data.rates.CNY;
            
            console.log('汇率已更新:', exchangeRates);
            
            // 如果已经有价格数据，更新CNY价格
            if (btcPrice.USD) {
                btcPrice.CNY = convertCurrency(btcPrice.USD, 'USD', 'CNY');
            }
            
            return {
                success: true,
                data: { rates: exchangeRates }
            };
        } else {
            throw new Error('无法获取人民币汇率');
        }
    } catch (error) {
        console.error('获取汇率失败:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 货币转换
 * @param {number} amount 金额
 * @param {string} from 源货币
 * @param {string} to 目标货币
 */
function convertCurrency(amount, from, to) {
    if (from === to) return amount;
    
    if (from === 'USD' && to === 'CNY') {
        return amount * exchangeRates.USD_TO_CNY;
    } else if (from === 'CNY' && to === 'USD') {
        return amount * exchangeRates.CNY_TO_USD;
    }
    
    return amount;
}

/**
 * 开始自动刷新价格
 * @param {number} interval 刷新间隔(毫秒)
 * @param {Function} callback 回调函数
 */
function startAutoRefresh(interval = 60000, callback = null) {
    // 如果有新的回调，添加到回调列表
    if (callback && typeof callback === 'function') {
        addRefreshCallback(callback);
    }
    
    // 如果已经有刷新定时器，先清除
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    // 重置失败计数
    refreshFailCount = 0;
    autoRefreshActive = true;
    
    // 为了避免所有用户同时请求API，添加一个随机延迟
    const randomDelay = Math.floor(Math.random() * 10000); // 0-10秒随机延迟
    
    // 启动定时器前先获取一次价格
    fetchBtcPrice().then(result => {
        console.log(`自动刷新已启用，间隔: ${interval/1000}秒，首次刷新在${randomDelay/1000}秒后开始`);
        
        // 设置定时刷新
        refreshInterval = setInterval(async () => {
            if (!autoRefreshActive) return;
            
            // 添加智能刷新策略：根据时间段调整刷新频率
            const hour = new Date().getHours();
            const minute = new Date().getMinutes();
            
            // 夜间减少刷新频率(23:00-6:00)
            if ((hour >= 23 || hour < 6) && interval < 5 * 60 * 1000) {
                console.log('夜间模式：减少刷新频率');
                clearInterval(refreshInterval);
                refreshInterval = setInterval(() => startAutoRefresh(5 * 60 * 1000), 5 * 60 * 1000);
                return;
            }
            
            // 价格波动大的时段增加刷新频率(9:00-11:00, 20:00-22:00)
            if (((hour >= 9 && hour < 11) || (hour >= 20 && hour < 22)) && interval > 60 * 1000) {
                console.log('高波动时段：增加刷新频率');
                clearInterval(refreshInterval);
                refreshInterval = setInterval(() => startAutoRefresh(60 * 1000), 60 * 1000);
                return;
            }
            
            // 正常刷新
            await fetchBtcPrice();
        }, interval);
        
    }).catch(error => {
        console.error('初始价格获取失败:', error);
    });
    
    return true;
}

/**
 * 停止自动刷新
 */
function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    
    autoRefreshActive = false;
    console.log('自动刷新已停止');
    
    return true;
}

/**
 * 添加刷新回调
 * @param {Function} callback 回调函数
 */
function addRefreshCallback(callback) {
    if (typeof callback === 'function' && !refreshCallbacks.includes(callback)) {
        refreshCallbacks.push(callback);
    }
}

/**
 * 移除刷新回调
 * @param {Function} callback 回调函数
 */
function removeRefreshCallback(callback) {
    const index = refreshCallbacks.indexOf(callback);
    if (index !== -1) {
        refreshCallbacks.splice(index, 1);
    }
}

/**
 * 检查价格是否过期
 * @param {number} expiryMinutes 过期分钟数
 */
function isPriceExpired(expiryMinutes = 15) {
    if (!btcPrice.timestamp) return true;
    
    const now = new Date();
    const priceTime = new Date(btcPrice.timestamp);
    const diffMs = now - priceTime;
    const diffMins = Math.floor(diffMs / 60000);
    
    return diffMins >= expiryMinutes;
}

/**
 * 手动设置比特币价格
 * @param {number} price 价格（USD）
 * @param {string} source 数据来源
 */
function manuallySetPrice(price, source = '手动输入') {
    if (!price || isNaN(price)) return false;
    
    btcPrice.USD = parseFloat(price);
    btcPrice.CNY = convertCurrency(btcPrice.USD, 'USD', 'CNY');
    btcPrice.timestamp = new Date().toISOString();
    btcPrice.source = source;
    btcPrice.isManual = true;
    
    // 通知所有回调
    notifyRefreshCallbacks({ 
        success: true, 
        data: { 
            price: btcPrice,
            source: source,
            isManual: true
        } 
    });
    
    return true;
}

// 导出模块接口
export {
    getCurrentBtcPrice,
    getPriceTimestamp,
    fetchBtcPrice,
    fetchExchangeRate,
    convertCurrency,
    startAutoRefresh,
    stopAutoRefresh,
    addRefreshCallback,
    removeRefreshCallback,
    isPriceExpired,
    manuallySetPrice
}; 