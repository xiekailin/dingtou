/**
 * 数据库管理模块
 * 负责数据库连接、同步等功能
 */
import { defaultDbConfig } from './config.js';

// 数据库配置和状态
let dbConfig = { ...defaultDbConfig };
let dbConnected = false;
let useDatabase = false;

/**
 * 从localStorage加载数据库配置
 */
function loadDbConfig() {
    const savedConfig = localStorage.getItem('dbConfig');
    if (savedConfig) {
        try {
            dbConfig = JSON.parse(savedConfig);
            console.log('已加载数据库配置');
        } catch (error) {
            console.error('解析保存的数据库配置失败:', error);
        }
    }
    
    // 检查是否使用数据库
    const savedUseDb = localStorage.getItem('useDatabase');
    if (savedUseDb) {
        useDatabase = savedUseDb === 'true';
    }
    
    return {
        config: dbConfig,
        useDatabase: useDatabase
    };
}

/**
 * 保存数据库配置到localStorage
 * @param {Object} config 数据库配置对象
 */
function saveDbConfig(config) {
    dbConfig = {
        host: config.host || dbConfig.host,
        port: parseInt(config.port) || dbConfig.port,
        database: config.database || dbConfig.database,
        user: config.user || dbConfig.user,
        password: config.password || dbConfig.password
    };
    
    localStorage.setItem('dbConfig', JSON.stringify(dbConfig));
    console.log('数据库配置已保存');
    
    return dbConfig;
}

/**
 * 设置数据库使用状态
 * @param {boolean} useDb 是否使用数据库
 */
function setDatabaseEnabled(useDb) {
    useDatabase = useDb;
    localStorage.setItem('useDatabase', useDatabase);
    return useDatabase;
}

/**
 * 获取数据库使用状态
 */
function isDatabaseEnabled() {
    return useDatabase;
}

/**
 * 获取数据库连接状态
 */
function isDatabaseConnected() {
    return dbConnected;
}

/**
 * 获取当前数据库配置
 */
function getDbConfig() {
    return { ...dbConfig };
}

/**
 * 测试数据库连接
 */
async function testDbConnection() {
    if (!useDatabase) {
        return {
            success: false,
            error: '数据库未启用'
        };
    }
    
    try {
        const response = await axios.post('/api/testConnection', dbConfig);
        
        if (response.data && response.data.success) {
            dbConnected = true;
            return {
                success: true,
                message: '连接成功'
            };
        } else {
            throw new Error(response.data.error || '连接失败');
        }
    } catch (error) {
        console.error('数据库连接测试失败:', error);
        dbConnected = false;
        return {
            success: false,
            error: error.response?.data?.error || error.message
        };
    }
}

/**
 * 从数据库同步数据
 */
async function syncFromDatabase() {
    if (!useDatabase || !dbConnected) {
        return {
            success: false,
            error: '数据库未启用或未连接'
        };
    }
    
    try {
        const response = await axios.post('/api/getRecords', dbConfig);
        
        if (response.data.success && Array.isArray(response.data.records)) {
            return {
                success: true,
                records: response.data.records,
                message: `从数据库同步了 ${response.data.records.length} 条记录`
            };
        } else {
            throw new Error(response.data.error || '同步失败');
        }
    } catch (error) {
        console.error('从数据库同步数据失败:', error);
        return {
            success: false,
            error: error.response?.data?.error || error.message
        };
    }
}

/**
 * 同步数据到数据库
 * @param {Array} records 要同步的记录数组
 */
async function syncToDatabase(records) {
    if (!useDatabase || !dbConnected) {
        return {
            success: false,
            error: '数据库未启用或未连接'
        };
    }
    
    try {
        const response = await fetch('/api/saveRecords', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ records })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`服务器错误: ${errorData.error || '未知错误'}`);
        }

        const result = await response.json();
        
        if (result.success) {
            return {
                success: true,
                message: `成功同步 ${result.expectedCount} 条记录到数据库`,
                expectedCount: result.expectedCount,
                actualCount: result.actualCount
            };
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('同步错误:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 保存单条记录到数据库
 * @param {Object} record 记录对象
 */
async function saveRecordToDatabase(record) {
    if (!useDatabase || !dbConnected) {
        return {
            success: false,
            error: '数据库未启用或未连接'
        };
    }
    
    try {
        // 确保日期格式正确
        let sqlFormattedRecord = {...record};
        if (sqlFormattedRecord.date.includes('T')) {
            sqlFormattedRecord.date = sqlFormattedRecord.date.replace('T', ' ');
        }
        
        const response = await axios.post('/api/saveRecord', {
            ...dbConfig,
            record: sqlFormattedRecord
        });
        
        if (response.data.success) {
            return {
                success: true,
                message: '记录已成功保存到数据库'
            };
        } else {
            throw new Error(response.data.error || '未知错误');
        }
    } catch (error) {
        console.error('保存记录到数据库失败:', error);
        return {
            success: false,
            error: error.response?.data?.error || error.message
        };
    }
}

/**
 * 从数据库删除记录
 * @param {string} recordDate 记录日期
 */
async function deleteRecordFromDatabase(recordDate) {
    if (!useDatabase || !dbConnected) {
        return {
            success: false,
            error: '数据库未启用或未连接'
        };
    }
    
    try {
        // 确保日期格式正确
        let formattedDate = recordDate;
        if (formattedDate.includes('T')) {
            formattedDate = formattedDate.replace('T', ' ');
        }
        
        const response = await axios.post('/api/deleteRecord', {
            ...dbConfig,
            recordDate: formattedDate
        });
        
        if (response.data.success) {
            return {
                success: true,
                message: '记录已从数据库删除'
            };
        } else {
            throw new Error(response.data.error || '未知错误');
        }
    } catch (error) {
        console.error('从数据库删除记录失败:', error);
        return {
            success: false,
            error: error.response?.data?.error || error.message
        };
    }
}

/**
 * 清空数据库中的所有记录
 */
async function clearDatabaseRecords() {
    if (!useDatabase || !dbConnected) {
        return {
            success: false,
            error: '数据库未启用或未连接'
        };
    }
    
    try {
        const response = await axios.post('/api/clearRecords', dbConfig);
        
        if (response.data.success) {
            return {
                success: true,
                message: '数据库记录已清空'
            };
        } else {
            throw new Error(response.data.error || '未知错误');
        }
    } catch (error) {
        console.error('清空数据库记录失败:', error);
        return {
            success: false,
            error: error.response?.data?.error || error.message
        };
    }
}

// 导出模块接口
export {
    loadDbConfig,
    saveDbConfig,
    setDatabaseEnabled,
    isDatabaseEnabled,
    isDatabaseConnected,
    getDbConfig,
    testDbConnection,
    syncFromDatabase,
    syncToDatabase,
    saveRecordToDatabase,
    deleteRecordFromDatabase,
    clearDatabaseRecords
}; 