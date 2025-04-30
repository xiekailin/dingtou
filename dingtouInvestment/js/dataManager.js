/**
 * 数据管理模块
 * 负责记录的读取、保存、导入导出等功能
 */
import { exchangeRates } from './config.js';

// 记录数组
let records = [];
// 当前选择的货币
let selectedCurrency = 'USD';

/**
 * 从localStorage加载记录
 */
function loadRecords() {
    records = JSON.parse(localStorage.getItem('investmentRecords')) || [];
    return records;
}

/**
 * 保存记录到localStorage
 */
function saveRecordsToLocalStorage() {
    localStorage.setItem('investmentRecords', JSON.stringify(records));
}

/**
 * 添加新记录
 * @param {Object} record 记录对象
 */
function addRecord(record) {
    // 确保记录格式正确
    const formattedRecord = {
        uuid: record.uuid || generateUUID(),
        date: record.date,
        amount: parseFloat(record.amount),
        btcPrice: parseFloat(record.btcPrice),
        note: record.note || '',
        currency: record.currency || selectedCurrency
    };
    
    // 添加到记录数组
    records.push(formattedRecord);
    
    // 保存到localStorage
    saveRecordsToLocalStorage();
    
    return formattedRecord;
}

/**
 * 更新记录
 * @param {number} index 记录索引
 * @param {Object} record 更新的记录数据
 */
function updateRecord(index, record) {
    if (index < 0 || index >= records.length) {
        throw new Error('无效的记录索引');
    }
    
    // 确保保留原始UUID
    const originalUuid = records[index].uuid;
    
    // 更新记录
    records[index] = {
        uuid: originalUuid, // 保留原始UUID
        date: record.date,
        amount: parseFloat(record.amount),
        btcPrice: parseFloat(record.btcPrice),
        note: record.note || '',
        currency: record.currency || selectedCurrency
    };
    
    // 保存到localStorage
    saveRecordsToLocalStorage();
    
    return records[index];
}

/**
 * 删除记录
 * @param {number} index 记录索引
 */
function deleteRecord(index) {
    if (index < 0 || index >= records.length) {
        throw new Error('无效的记录索引');
    }
    
    // 获取要删除的记录以便返回
    const deletedRecord = records[index];
    
    // 从数组中删除
    records.splice(index, 1);
    
    // 保存到localStorage
    saveRecordsToLocalStorage();
    
    return deletedRecord;
}

/**
 * 清空所有记录
 */
function clearAllRecords() {
    records = [];
    localStorage.removeItem('investmentRecords');
    return true;
}

/**
 * 导出记录为JSON文件
 */
function exportRecordsToJson() {
    if (records.length === 0) {
        throw new Error('没有记录可导出！');
    }
    
    const data = JSON.stringify(records, null, 2);
    const blob = new Blob([data], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `btc_investment_records_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 0);
    
    return true;
}

/**
 * 导入JSON数据
 * @param {string|Object} jsonData JSON数据字符串或对象
 * @param {boolean} shouldReplace 是否替换现有记录
 */
function importJsonData(jsonData, shouldReplace) {
    try {
        // 如果是字符串，解析为JSON对象
        const parsedData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        
        if (!Array.isArray(parsedData)) {
            throw new Error('导入的JSON数据不是有效的数组格式');
        }
        
        // 验证和格式化记录
        const validatedRecords = [];
        const invalidRecords = [];
        
        parsedData.forEach((record, index) => {
            // 检查必要字段
            if (!record.date || record.amount === undefined || record.btcPrice === undefined) {
                console.error(`记录 #${index} 缺少必要字段:`, record);
                invalidRecords.push(index);
                return;
            }
            
            // 格式化记录
            const validRecord = {
                date: record.date,
                amount: parseFloat(record.amount),
                btcPrice: parseFloat(record.btcPrice),
                note: record.note || '',
                currency: record.currency || 'USD'
            };
            
            // 确保数字是有效的
            if (isNaN(validRecord.amount) || isNaN(validRecord.btcPrice)) {
                console.error(`记录 #${index} 包含无效数字:`, record);
                invalidRecords.push(index);
                return;
            }
            
            validatedRecords.push(validRecord);
        });
        
        if (validatedRecords.length === 0) {
            throw new Error('没有找到有效记录，请检查JSON格式');
        }
        
        // 更新记录数组
        if (shouldReplace) {
            records = [...validatedRecords];
        } else {
            records = [...records, ...validatedRecords];
        }
        
        // 保存到localStorage
        saveRecordsToLocalStorage();
        
        return {
            success: true,
            validRecordsCount: validatedRecords.length,
            invalidRecordsCount: invalidRecords.length,
            totalRecordsCount: records.length
        };
    } catch (error) {
        console.error('JSON解析错误:', error);
        throw error;
    }
}

/**
 * 根据货币类型转换金额
 * @param {number} amount 金额
 * @param {string} fromCurrency 源货币
 * @param {string} toCurrency 目标货币
 */
function convertCurrency(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
        return amount;
    }
    
    if (fromCurrency === 'USD' && toCurrency === 'CNY') {
        return amount * exchangeRates.USD_TO_CNY;
    } else if (fromCurrency === 'CNY' && toCurrency === 'USD') {
        return amount * exchangeRates.CNY_TO_USD;
    }
    
    return amount;
}

/**
 * 设置当前选择的货币
 * @param {string} currency 货币代码
 */
function setSelectedCurrency(currency) {
    if (currency !== 'USD' && currency !== 'CNY') {
        throw new Error('不支持的货币类型');
    }
    
    selectedCurrency = currency;
}

/**
 * 获取当前选择的货币
 */
function getSelectedCurrency() {
    return selectedCurrency;
}

/**
 * 获取所有记录（根据当前货币进行转换）
 */
function getAllRecords() {
    return records;
}

/**
 * 获取按日期排序的记录（从新到旧）
 */
function getSortedRecords() {
    return [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * 获取按日期排序的记录（从旧到新，用于图表）
 */
function getChronologicalRecords() {
    return [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * 生成UUID
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * 直接更新记录数组并保存
 * @param {Array} newRecords 新的记录数组
 */
function updateRecordsInStorage(newRecords) {
    if (!Array.isArray(newRecords)) {
        throw new Error('记录必须是数组');
    }
    records = [...newRecords];
    saveRecordsToLocalStorage();
    return records;
}

// 导出模块接口
export {
    loadRecords,
    addRecord,
    updateRecord,
    deleteRecord,
    clearAllRecords,
    exportRecordsToJson,
    importJsonData,
    convertCurrency,
    setSelectedCurrency,
    getSelectedCurrency,
    getAllRecords,
    getSortedRecords,
    getChronologicalRecords,
    updateRecordsInStorage
}; 