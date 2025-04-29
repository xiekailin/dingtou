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
    password: 'root'
};

// 导出模块接口
export { 
    exchangeRates, 
    defaultDbConfig 
}; 