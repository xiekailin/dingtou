/**
 * 数据库管理模块
 * 负责数据库连接、同步等功能
 */
import { defaultDbConfig } from './config.js';

// 数据库配置和状态
let dbConfig = { ...defaultDbConfig };
let dbConnected = false;
let useDatabase = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;
const CONNECTION_RETRY_DELAY = 3000; // 3秒
let connectionPool = null;
let lastConnectionTime = null;
let healthCheckInterval = null;
const HEALTH_CHECK_INTERVAL = 300000; // 5分钟检查一次数据库连接状态

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
        password: config.password || dbConfig.password,
        connectionLimit: config.connectionLimit || 10, // 添加连接池限制
        connectTimeout: config.connectTimeout || 10000, // 连接超时时间
        acquireTimeout: config.acquireTimeout || 10000, // 获取连接超时时间
        waitForConnections: config.waitForConnections !== undefined ? config.waitForConnections : true, // 是否等待连接
        queueLimit: config.queueLimit || 0 // 队列限制，0表示无限制
    };
    
    localStorage.setItem('dbConfig', JSON.stringify(dbConfig));
    console.log('数据库配置已保存');
    
    // 如果修改了配置，重置连接
    resetConnection();
    
    return dbConfig;
}

/**
 * 重置数据库连接状态
 */
function resetConnection() {
    dbConnected = false;
    connectionAttempts = 0;
    lastConnectionTime = null;
    
    // 清除健康检查定时器
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
    }
    
    // 释放连接池
    if (connectionPool) {
        connectionPool = null;
    }
}

/**
 * 设置数据库使用状态
 * @param {boolean} useDb 是否使用数据库
 */
function setDatabaseEnabled(useDb) {
    useDatabase = useDb;
    localStorage.setItem('useDatabase', useDatabase);
    
    // 启用数据库时，初始化健康检查
    if (useDatabase && dbConnected) {
        startHealthCheck();
    } else if (!useDatabase) {
        // 停止健康检查
        if (healthCheckInterval) {
            clearInterval(healthCheckInterval);
            healthCheckInterval = null;
        }
    }
    
    return useDatabase;
}

/**
 * 开始数据库健康检查
 */
function startHealthCheck() {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
    }
    
    healthCheckInterval = setInterval(async () => {
        if (useDatabase && dbConnected) {
            console.log('执行数据库健康检查...');
            const result = await testDbConnection(true);
            if (!result.success) {
                console.warn('健康检查失败，尝试重新连接数据库');
                await testDbConnection();
            }
        }
    }, HEALTH_CHECK_INTERVAL);
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
 * @param {boolean} silent 是否静默测试（不显示错误提示）
 */
async function testDbConnection(silent = false) {
    if (!useDatabase) {
        return {
            success: false,
            error: '数据库未启用'
        };
    }
    
    // 如果短时间内多次尝试连接，增加延迟防止过于频繁的连接请求
    if (connectionAttempts > 0 && lastConnectionTime) {
        const timeSinceLastAttempt = Date.now() - lastConnectionTime;
        if (timeSinceLastAttempt < CONNECTION_RETRY_DELAY) {
            const waitTime = CONNECTION_RETRY_DELAY - timeSinceLastAttempt;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    
    // 更新连接尝试次数和时间
    connectionAttempts++;
    lastConnectionTime = Date.now();
    
    try {
        // 添加超时处理
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await axios.post('/api/testConnection', {
            ...dbConfig,
            attempt: connectionAttempts
        }, {
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'X-Request-Timeout': '10000'
            }
        });
        
        clearTimeout(timeoutId);
        
        if (response.data && response.data.success) {
            dbConnected = true;
            connectionAttempts = 0; // 重置连接尝试次数
            
            // 连接成功后启动健康检查
            if (!healthCheckInterval) {
                startHealthCheck();
            }
            
            return {
                success: true,
                message: '连接成功'
            };
        } else {
            throw new Error(response.data.error || '连接失败');
        }
    } catch (error) {
        // 检查是否是超时或中止请求
        const isTimeout = error.name === 'AbortError' || error.code === 'ECONNABORTED';
        
        if (!silent) {
            console.error('数据库连接测试失败:', error, isTimeout ? '（连接超时）' : '');
        }
        
        dbConnected = false;
        
        // 如果连接次数达到最大值，重置计数
        if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
            connectionAttempts = 0;
        }
        
        return {
            success: false,
            error: isTimeout ? '连接超时' : (error.response?.data?.error || error.message),
            isTimeout: isTimeout
        };
    }
}

/**
 * 执行数据库操作的通用包装函数（包含重试逻辑）
 * @param {Function} operation 要执行的数据库操作函数
 * @param {Array} params 操作参数
 * @param {number} retries 最大重试次数
 */
async function executeWithRetry(operation, params, retries = 2) {
    if (!useDatabase) {
        return {
            success: false,
            error: '数据库未启用'
        };
    }
    
    // 如果当前未连接，尝试重新连接
    if (!dbConnected) {
        const connectionResult = await testDbConnection(true);
        if (!connectionResult.success) {
            return connectionResult;
        }
    }
    
    let attempts = 0;
    let lastError = null;
    
    while (attempts <= retries) {
        try {
            const result = await operation(...params);
            return result;
        } catch (error) {
            lastError = error;
            attempts++;
            
            // 如果不是最后一次尝试，等待后重试
            if (attempts <= retries) {
                console.warn(`数据库操作失败，${attempts}秒后重试 (${attempts}/${retries})...`);
                await new Promise(resolve => setTimeout(resolve, attempts * 1000));
                
                // 在重试前检查连接
                const connectionCheck = await testDbConnection(true);
                if (!connectionCheck.success) {
                    console.warn('数据库连接已断开，尝试重新连接...');
                }
            }
        }
    }
    
    console.error('数据库操作失败，已达到最大重试次数:', lastError);
    return {
        success: false,
        error: lastError?.message || '操作失败，请稍后重试'
    };
}

/**
 * 从数据库同步数据
 */
async function syncFromDatabase() {
    return executeWithRetry(async () => {
        if (!dbConnected) {
            throw new Error('数据库未连接');
        }
        
        const response = await axios.post('/api/getRecords', {
            ...dbConfig,
            timestamp: Date.now() // 添加时间戳避免缓存
        }, {
            timeout: 30000 // 30秒超时
        });
        
        if (response.data.success && Array.isArray(response.data.records)) {
            return {
                success: true,
                records: response.data.records,
                message: `从数据库同步了 ${response.data.records.length} 条记录`
            };
        } else {
            throw new Error(response.data.error || '同步失败');
        }
    }, [], 2);
}

/**
 * 同步数据到数据库
 * @param {Array} records 要同步的记录数组
 */
async function syncToDatabase(records) {
    return executeWithRetry(async () => {
        if (!dbConnected) {
            throw new Error('数据库未连接');
        }
        
        // 分批处理大量记录，避免一次性发送过多数据
        const BATCH_SIZE = 50;
        if (records.length > BATCH_SIZE) {
            console.log(`记录数量较多 (${records.length})，将分批同步到数据库...`);
            
            let successCount = 0;
            let failedCount = 0;
            
            for (let i = 0; i < records.length; i += BATCH_SIZE) {
                const batch = records.slice(i, i + BATCH_SIZE);
                console.log(`同步批次 ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(records.length/BATCH_SIZE)}，记录数: ${batch.length}`);
                
                const response = await fetch('/api/saveRecords', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        config: dbConfig,
                        records: batch,
                        timestamp: Date.now()
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    failedCount += batch.length;
                    console.error(`批次 ${Math.floor(i/BATCH_SIZE) + 1} 同步失败:`, errorData.error || '未知错误');
                } else {
                    const result = await response.json();
                    if (result.success) {
                        successCount += result.actualCount || 0;
                    } else {
                        failedCount += batch.length;
                    }
                }
                
                // 批次间等待，避免服务器负载过高
                if (i + BATCH_SIZE < records.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            
            if (failedCount > 0) {
                return {
                    success: successCount > 0,
                    message: `成功同步 ${successCount}/${records.length} 条记录到数据库，${failedCount} 条记录同步失败`,
                    expectedCount: records.length,
                    actualCount: successCount
                };
            } else {
                return {
                    success: true,
                    message: `成功同步 ${successCount} 条记录到数据库`,
                    expectedCount: records.length,
                    actualCount: successCount
                };
            }
        } else {
            // 少量记录，直接同步
            const response = await fetch('/api/saveRecords', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    config: dbConfig,
                    records,
                    timestamp: Date.now()
                }),
                timeout: 30000 // 30秒超时
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`服务器错误: ${errorData.error || '未知错误'}`);
            }

            const result = await response.json();
            
            if (result.success) {
                return {
                    success: true,
                    message: `成功同步 ${result.actualCount || 0} 条记录到数据库`,
                    expectedCount: records.length,
                    actualCount: result.actualCount
                };
            } else {
                throw new Error(result.error);
            }
        }
    }, [records], 2);
}

/**
 * 保存单条记录到数据库
 * @param {Object} record 记录对象
 */
async function saveRecordToDatabase(record) {
    return executeWithRetry(async () => {
        if (!dbConnected) {
            throw new Error('数据库未连接');
        }
        
        // 确保日期格式正确
        let sqlFormattedRecord = {...record};
        if (sqlFormattedRecord.date.includes('T')) {
            sqlFormattedRecord.date = sqlFormattedRecord.date.replace('T', ' ');
        }
        
        const response = await axios.post('/api/saveRecord', {
            config: dbConfig,
            record: sqlFormattedRecord,
            timestamp: Date.now()
        }, {
            timeout: 10000 // 10秒超时
        });
        
        if (response.data.success) {
            return {
                success: true,
                message: '记录已成功保存到数据库'
            };
        } else {
            throw new Error(response.data.error || '未知错误');
        }
    }, [record], 2);
}

/**
 * 从数据库删除记录
 * @param {string} recordDate 记录日期
 */
async function deleteRecordFromDatabase(recordDate) {
    return executeWithRetry(async () => {
        if (!dbConnected) {
            throw new Error('数据库未连接');
        }
        
        // 确保日期格式正确
        let formattedDate = recordDate;
        if (formattedDate && formattedDate.includes('T')) {
            formattedDate = formattedDate.replace('T', ' ');
        }
        
        // 如果recordDate为undefined，记录错误
        if (!recordDate) {
            console.error('删除记录错误: recordDate参数为undefined');
            throw new Error('记录日期不能为空');
        }
        
        const response = await axios.post('/api/deleteRecord', {
            config: dbConfig,
            recordDate: formattedDate,  // 修改为与服务器端参数名一致
            timestamp: Date.now()
        }, {
            timeout: 10000 // 10秒超时
        });
        
        if (response.data.success) {
            return {
                success: true,
                message: '记录已成功从数据库删除'
            };
        } else {
            throw new Error(response.data.error || '未知错误');
        }
    }, [recordDate], 2);
}

/**
 * 清空数据库中的所有记录
 */
async function clearDatabaseRecords() {
    return executeWithRetry(async () => {
        if (!dbConnected) {
            throw new Error('数据库未连接');
        }
        
        const response = await axios.post('/api/clearRecords', {
            config: dbConfig,
            timestamp: Date.now()
        }, {
            timeout: 10000 // 10秒超时
        });
        
        if (response.data.success) {
            return {
                success: true,
                message: '所有记录已成功从数据库清除'
            };
        } else {
            throw new Error(response.data.error || '未知错误');
        }
    }, [], 2);
}

/**
 * 在数据库中更新记录
 * @param {Object} record 更新后的记录对象
 * @param {string} originalDate 原始记录的日期
 */
async function updateRecordInDatabase(record, originalDate) {
    return executeWithRetry(async () => {
        if (!dbConnected) {
            throw new Error('数据库未连接');
        }
        
        // 确保日期格式正确
        let sqlFormattedRecord = {...record};
        if (sqlFormattedRecord.date.includes('T')) {
            sqlFormattedRecord.date = sqlFormattedRecord.date.replace('T', ' ');
        }
        
        // 格式化原始日期
        let formattedOriginalDate = originalDate;
        if (formattedOriginalDate && formattedOriginalDate.includes('T')) {
            formattedOriginalDate = formattedOriginalDate.replace('T', ' ');
        }
        
        const response = await axios.post('/api/updateRecord', {
            config: dbConfig,
            record: sqlFormattedRecord,
            originalDate: formattedOriginalDate,
            timestamp: Date.now()
        }, {
            timeout: 10000 // 10秒超时
        });
        
        if (response.data.success) {
            return {
                success: true,
                message: '记录已成功在数据库中更新'
            };
        } else {
            throw new Error(response.data.error || '未知错误');
        }
    }, [record, originalDate], 2);
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
    updateRecordInDatabase,
    clearDatabaseRecords
}; 