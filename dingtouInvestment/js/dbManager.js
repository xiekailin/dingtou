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

// 用户认证相关
let currentUser = null;
let authToken = null;

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
    
    // 加载用户认证信息
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('currentUser');
    
    if (savedToken) {
        authToken = savedToken;
        try {
            if (savedUser) {
                currentUser = JSON.parse(savedUser);
            }
        } catch (error) {
            console.error('解析保存的用户信息失败:', error);
        }
    }
    
    return {
        config: dbConfig,
        useDatabase: useDatabase,
        user: currentUser,
        isAuthenticated: !!authToken
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
        
        if (!authToken) {
            throw new Error('用户未登录');
        }
        
        const response = await axios.get('/api/getRecords', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            timeout: 15000 // 15秒超时，因为可能有大量记录
        });
        
        if (response.data.success) {
            return {
                success: true,
                records: response.data.records
            };
        } else {
            throw new Error(response.data.error || '未知错误');
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
        
        if (!authToken) {
            throw new Error('用户未登录');
        }
        
        // 格式化记录，确保日期格式正确
        const formattedRecords = records.map(record => {
            let formattedRecord = { ...record };
            if (typeof formattedRecord.date === 'string' && formattedRecord.date.includes('T')) {
                formattedRecord.date = formattedRecord.date.replace('T', ' ');
            }
            return formattedRecord;
        });
        
        const response = await axios.post('/api/saveRecords', {
            records: formattedRecords
        }, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            timeout: 30000 // 30秒超时，因为可能有大量记录
        });
        
        if (response.data.success) {
            return {
                success: true,
                message: `成功同步 ${formattedRecords.length} 条记录到数据库`
            };
        } else {
            throw new Error(response.data.error || '未知错误');
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
        
        if (!authToken) {
            throw new Error('用户未登录');
        }
        
        // 确保日期格式正确
        let sqlFormattedRecord = {...record};
        if (sqlFormattedRecord.date.includes('T')) {
            sqlFormattedRecord.date = sqlFormattedRecord.date.replace('T', ' ');
        }
        
        const response = await axios.post('/api/saveRecord', {
            record: sqlFormattedRecord
        }, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            timeout: 10000 // 10秒超时
        });
        
        if (response.data.success) {
            // 如果服务器生成了UUID，更新记录中的UUID
            if (response.data.uuid) {
                sqlFormattedRecord.uuid = response.data.uuid;
            }
            
            return {
                success: true,
                message: '记录已成功保存到数据库',
                record: sqlFormattedRecord
            };
        } else {
            throw new Error(response.data.error || '未知错误');
        }
    }, [record], 2);
}

/**
 * 从数据库删除记录
 * @param {string} uuid 记录UUID
 */
async function deleteRecordFromDatabase(uuid) {
    return executeWithRetry(async () => {
        if (!dbConnected) {
            throw new Error('数据库未连接');
        }
        
        if (!authToken) {
            throw new Error('用户未登录');
        }
        
        // 打印调试信息
        console.log('删除记录请求：', {
            url: `/api/deleteRecord/${uuid}`,
            authToken: authToken ? '已设置' : '未设置',
            uuid: uuid
        });
        
        try {
            const response = await axios.delete(`/api/deleteRecord/${uuid}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                },
                timeout: 10000 // 10秒超时
            });
            
            console.log('删除记录响应：', response.data);
            
            if (response.data.success) {
                return {
                    success: true,
                    message: '记录已从数据库删除'
                };
            } else {
                throw new Error(response.data.error || '未知错误');
            }
        } catch (error) {
            console.error('删除记录错误详情：', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw error;
        }
    }, [uuid], 2);
}

/**
 * 清空数据库中的所有记录
 */
async function clearDatabaseRecords() {
    return executeWithRetry(async () => {
        if (!dbConnected) {
            throw new Error('数据库未连接');
        }
        
        if (!authToken) {
            throw new Error('用户未登录');
        }
        
        // 使用空数组调用saveRecords即可清空
        const response = await axios.post('/api/saveRecords', {
            records: []
        }, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            timeout: 10000 // 10秒超时
        });
        
        if (response.data.success) {
            return {
                success: true,
                message: '所有记录已从数据库删除'
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

/**
 * 注册新用户
 * @param {string} username 用户名
 * @param {string} password 密码
 * @param {string} email 邮箱（可选）
 */
async function registerUser(username, password, email = null) {
    try {
        const response = await axios.post('/api/register', {
            username,
            password,
            email
        }, {
            timeout: 10000 // 10秒超时
        });
        
        if (response.data.success) {
            // 保存认证信息
            authToken = response.data.token;
            currentUser = response.data.user;
            
            // 存储到localStorage
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            return {
                success: true,
                message: '注册成功',
                user: currentUser
            };
        } else {
            throw new Error(response.data.error || '注册失败');
        }
    } catch (error) {
        console.error('用户注册失败:', error);
        return {
            success: false,
            error: error.response?.data?.error || error.message
        };
    }
}

/**
 * 用户登录
 * @param {string} username 用户名
 * @param {string} password 密码
 */
async function loginUser(username, password) {
    try {
        const response = await axios.post('/api/login', {
            username,
            password
        }, {
            timeout: 10000 // 10秒超时
        });
        
        if (response.data.success) {
            // 保存认证信息
            authToken = response.data.token;
            currentUser = response.data.user;
            
            // 存储到localStorage
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            return {
                success: true,
                message: '登录成功',
                user: currentUser
            };
        } else {
            throw new Error(response.data.error || '登录失败');
        }
    } catch (error) {
        console.error('用户登录失败:', error);
        return {
            success: false,
            error: error.response?.data?.error || error.message
        };
    }
}

/**
 * 用户登出
 */
function logoutUser() {
    authToken = null;
    currentUser = null;
    
    // 从localStorage移除
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    
    return {
        success: true,
        message: '已登出'
    };
}

/**
 * 获取当前登录的用户
 */
function getCurrentUser() {
    return currentUser;
}

/**
 * 检查用户是否已认证
 */
function isAuthenticated() {
    return !!authToken;
}

/**
 * 获取用户设置
 */
async function getUserSettings() {
    if (!authToken) {
        return {
            success: false,
            error: '用户未登录'
        };
    }
    
    try {
        const response = await axios.get('/api/getSettings', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            timeout: 10000
        });
        
        if (response.data.success) {
            return {
                success: true,
                settings: response.data.settings
            };
        } else {
            throw new Error(response.data.error || '获取设置失败');
        }
    } catch (error) {
        console.error('获取用户设置失败:', error);
        return {
            success: false,
            error: error.response?.data?.error || error.message
        };
    }
}

/**
 * 保存用户设置
 * @param {Object} settings 设置对象
 */
async function saveUserSettings(settings) {
    if (!authToken) {
        return {
            success: false,
            error: '用户未登录'
        };
    }
    
    try {
        const response = await axios.post('/api/saveSettings', {
            settings
        }, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            timeout: 10000
        });
        
        if (response.data.success) {
            return {
                success: true,
                message: '设置已保存'
            };
        } else {
            throw new Error(response.data.error || '保存设置失败');
        }
    } catch (error) {
        console.error('保存用户设置失败:', error);
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
    resetConnection,
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
    clearDatabaseRecords,
    // 用户认证相关接口
    registerUser,
    loginUser,
    logoutUser,
    getCurrentUser,
    isAuthenticated,
    getUserSettings,
    saveUserSettings
}; 