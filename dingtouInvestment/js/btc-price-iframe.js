/**
 * iframe方式集成比特币价格获取
 * 可以绕过CORS限制
 */

// 价格和回调相关
let btcPrice = null;
let priceCallbacks = [];
let iframeElement = null;

/**
 * 初始化iframe
 * @param {string} containerId 容器ID（可选）
 * @param {string} iframeSrc iframe源URL（默认为本地btc-price-static.html）
 */
function initPriceFetcher(containerId = null, iframeSrc = '../btc-price-static.html') {
    // 创建iframe元素
    iframeElement = document.createElement('iframe');
    iframeElement.src = iframeSrc;
    iframeElement.style.display = 'none'; // 默认隐藏
    
    // 如果提供了容器ID，则添加到容器中；否则添加到body
    if (containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.appendChild(iframeElement);
        } else {
            console.warn(`找不到ID为${containerId}的容器，将iframe添加到body`);
            document.body.appendChild(iframeElement);
        }
    } else {
        document.body.appendChild(iframeElement);
    }
    
    // 监听来自iframe的消息
    window.addEventListener('message', handleIframeMessage);
    
    console.log('比特币价格获取iframe已初始化');
}

/**
 * 处理来自iframe的消息
 */
function handleIframeMessage(event) {
    // 确保消息来自我们的iframe
    if (event.source !== iframeElement.contentWindow) return;
    
    // 检查消息类型
    if (event.data && event.data.type === 'btcPrice') {
        btcPrice = event.data.data;
        console.log('收到比特币价格:', btcPrice);
        
        // 通知所有回调
        notifyPriceCallbacks();
    }
}

/**
 * 通知所有价格回调
 */
function notifyPriceCallbacks() {
    if (!btcPrice) return;
    
    priceCallbacks.forEach(callback => {
        try {
            callback(btcPrice);
        } catch (error) {
            console.error('价格回调执行错误:', error);
        }
    });
}

/**
 * 刷新比特币价格
 * @returns {Promise} 价格更新的Promise
 */
function refreshPrice() {
    return new Promise((resolve, reject) => {
        if (!iframeElement) {
            reject(new Error('iframe未初始化，请先调用initPriceFetcher'));
            return;
        }
        
        // 创建一次性回调
        const onceCallback = (price) => {
            resolve(price);
            // 从回调列表中移除
            const index = priceCallbacks.findIndex(cb => cb === onceCallback);
            if (index !== -1) priceCallbacks.splice(index, 1);
        };
        
        // 添加到回调列表
        priceCallbacks.push(onceCallback);
        
        // 向iframe发送刷新消息
        try {
            iframeElement.contentWindow.postMessage({ type: 'refreshPrice' }, '*');
        } catch (error) {
            reject(error);
        }
        
        // 设置超时
        setTimeout(() => {
            // 检查回调是否仍在列表中（即未被调用）
            const index = priceCallbacks.findIndex(cb => cb === onceCallback);
            if (index !== -1) {
                priceCallbacks.splice(index, 1);
                
                // 如果有缓存价格，仍返回成功
                if (btcPrice) {
                    resolve({
                        ...btcPrice,
                        isCache: true,
                        isStale: true
                    });
                } else {
                    reject(new Error('获取价格超时'));
                }
            }
        }, 15000);
    });
}

/**
 * 获取当前缓存的价格
 * @param {string} currency 货币类型（USD/CNY）
 * @returns {number|null} 价格或null
 */
function getCurrentPrice(currency = 'USD') {
    if (!btcPrice) return null;
    
    return currency.toUpperCase() === 'CNY' ? btcPrice.CNY : btcPrice.USD;
}

/**
 * 添加价格更新回调
 * @param {Function} callback 回调函数
 */
function addPriceCallback(callback) {
    if (typeof callback === 'function' && !priceCallbacks.includes(callback)) {
        priceCallbacks.push(callback);
        
        // 如果已有价格，立即调用回调
        if (btcPrice) {
            try {
                callback(btcPrice);
            } catch (error) {
                console.error('价格回调执行错误:', error);
            }
        }
    }
}

/**
 * 移除价格更新回调
 * @param {Function} callback 回调函数
 */
function removePriceCallback(callback) {
    const index = priceCallbacks.findIndex(cb => cb === callback);
    if (index !== -1) {
        priceCallbacks.splice(index, 1);
    }
}

/**
 * 显示iframe（用于调试）
 */
function showIframe() {
    if (!iframeElement) return;
    
    iframeElement.style.display = 'block';
    iframeElement.style.width = '100%';
    iframeElement.style.height = '300px';
    iframeElement.style.border = '1px solid #ccc';
    iframeElement.style.borderRadius = '4px';
}

/**
 * 隐藏iframe
 */
function hideIframe() {
    if (!iframeElement) return;
    
    iframeElement.style.display = 'none';
}

// 导出接口
export {
    initPriceFetcher,
    refreshPrice,
    getCurrentPrice,
    addPriceCallback,
    removePriceCallback,
    showIframe,
    hideIframe
}; 