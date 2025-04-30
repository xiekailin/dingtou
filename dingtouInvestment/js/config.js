/**
 * 配置和常量模块
 */

// 汇率转换
const exchangeRates = {
    USD_TO_CNY: 7.2, // 默认值：1美元 = 7.2人民币
    CNY_TO_USD: 1/7.2 // 默认值：1人民币 = 0.139美元
};

// 数据库默认配置
const defaultDbConfig = {
    host: '124.221.197.94',
    port: 3306,
    database: 'bitcoininvestment',
    user: 'root',
    password: 'root',
    connectionLimit: 10,      // 连接池中连接的最大数量
    connectTimeout: 10000,    // 连接超时时间(毫秒)
    acquireTimeout: 10000,    // 获取连接超时时间(毫秒)
    waitForConnections: true, // 当没有可用连接时，是否等待
    queueLimit: 0,            // 连接池请求队列限制(0表示无限)
    maxRetries: 3,            // 数据库操作最大重试次数
    retryDelay: 1000,         // 重试间隔(毫秒)
    healthCheckInterval: 300000 // 健康检查间隔(毫秒)
};

// 导出模块接口
export { 
    exchangeRates, 
    defaultDbConfig 
}; 