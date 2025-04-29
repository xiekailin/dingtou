/**
 * 主应用模块
 * 负责组织和协调所有功能模块
 */
import * as DataManager from './dataManager.js';
import * as DbManager from './dbManager.js';
import * as ChartManager from './chartManager.js';
import * as ApiService from './apiService.js';
import * as UiManager from './uiManager.js';

// DOM 元素引用
let dateInput, amountInput, btcPriceInput, noteInput;
let saveBtn, clearBtn, exportBtn, importBtn, importJsonBtn, importFile;
let refreshPriceBtn, getCurrentPriceBtn, autoRefreshCheckbox;
let currencyRadios, dataSourceToggle, testConnectionBtn, dbConfigBtn;
let syncToDbBtn, syncFromDbBtn;

/**
 * 初始化应用
 */
async function init() {
    // 获取DOM元素
    initDomElements();
    
    // 添加事件监听
    attachEventListeners();
    
    // 设置当前日期时间为默认值
    setDefaultDate();
    
    // 加载数据库配置
    const dbConfig = DbManager.loadDbConfig();
    
    // 默认启用数据库
    if (!dbConfig.useDatabase) {
        DbManager.setDatabaseEnabled(true);
    }
    
    // 更新数据源UI
    UiManager.updateDatabaseStatusUI(false, true);
    
    // 确保数据源切换按钮状态与设置一致
    if (dataSourceToggle) {
        dataSourceToggle.checked = true;
    }
    
    // 获取最新汇率
    await ApiService.fetchExchangeRate();
    
    // 更新货币标签
    UiManager.updateCurrencyLabels();
    
    // 先尝试从数据库加载数据
    let dbDataLoaded = false;
    
    // 测试数据库连接
    const connectionResult = await DbManager.testDbConnection();
    UiManager.updateDatabaseStatusUI(connectionResult.success, true);
    
    if (connectionResult.success) {
        // 如果连接成功，尝试从数据库同步记录
        UiManager.showProgressIndicator('正在从数据库获取数据...');
        const syncResult = await DbManager.syncFromDatabase();
        UiManager.hideProgressIndicator();
        
        if (syncResult.success && syncResult.records.length > 0) {
            // 先清空本地记录
            DataManager.clearAllRecords();
            
            // 从数据库加载成功
            syncResult.records.forEach(record => {
                DataManager.addRecord(record);
            });
            
            dbDataLoaded = true;
            console.log('成功从数据库加载了', syncResult.records.length, '条记录');
        }
    }
    
    // 如果无法从数据库加载，则加载本地记录
    if (!dbDataLoaded) {
        console.log('从本地存储加载记录');
        DataManager.loadRecords();
    }
    
    // 获取BTC价格
    const priceResult = await ApiService.fetchBtcPrice();
    
    // 更新价格显示
    UiManager.updateCurrentPriceDisplay();
    
    // 渲染记录表格
    UiManager.renderRecordsTable();
    
    // 更新统计信息
    UiManager.updateStatistics();
    
    // 更新图表
    const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
    ChartManager.updateAllCharts(currentBtcPrice);
}

/**
 * 初始化DOM元素引用
 */
function initDomElements() {
    // 表单元素
    dateInput = document.getElementById('date');
    amountInput = document.getElementById('amount');
    btcPriceInput = document.getElementById('btcPrice');
    noteInput = document.getElementById('note');
    
    // 按钮
    saveBtn = document.getElementById('saveBtn');
    clearBtn = document.getElementById('clearBtn');
    exportBtn = document.getElementById('exportBtn');
    importBtn = document.getElementById('importBtn');
    importJsonBtn = document.getElementById('importJsonBtn');
    importFile = document.getElementById('importFile');
    refreshPriceBtn = document.getElementById('refreshPrice');
    getCurrentPriceBtn = document.getElementById('getCurrentPrice');
    
    // 复选框和单选按钮
    autoRefreshCheckbox = document.getElementById('autoRefresh');
    currencyRadios = document.getElementsByName('currency');
    
    // 数据库相关
    dataSourceToggle = document.getElementById('dataSourceToggle');
    testConnectionBtn = document.getElementById('testConnectionBtn');
    dbConfigBtn = document.getElementById('dbConfigBtn');
    syncToDbBtn = document.getElementById('syncToDbBtn');
    syncFromDbBtn = document.getElementById('syncFromDbBtn');
}

/**
 * 添加事件监听器
 */
function attachEventListeners() {
    // 保存按钮事件
    saveBtn.addEventListener('click', saveRecord);
    
    // 清空按钮事件
    clearBtn.addEventListener('click', clearAllRecords);
    
    // 导出按钮事件
    exportBtn.addEventListener('click', exportData);
    
    // 导入相关事件
    importBtn.addEventListener('click', () => {
        importFile.click();
    });
    importFile.addEventListener('change', handleFileImport);
    importJsonBtn.addEventListener('click', UiManager.openJsonImportModal);
    
    // 价格刷新相关事件
    refreshPriceBtn.addEventListener('click', refreshPrice);
    getCurrentPriceBtn.addEventListener('click', getAndSetCurrentPrice);
    autoRefreshCheckbox.addEventListener('change', toggleAutoRefresh);
    
    // 货币切换事件
    currencyRadios.forEach(radio => {
        radio.addEventListener('change', changeCurrency);
    });
    
    // 数据库相关事件
    dataSourceToggle.addEventListener('change', toggleDataSource);
    testConnectionBtn.addEventListener('click', testDbConnection);
    dbConfigBtn.addEventListener('click', openDbConfig);
    syncToDbBtn.addEventListener('click', syncToDatabase);
    syncFromDbBtn.addEventListener('click', syncFromDatabase);
    
    // 记录显示控制事件
    document.getElementById('toggleRecordsBtn').addEventListener('click', toggleRecordsDisplay);
    
    // 弹窗关闭按钮
    document.querySelectorAll('.modal .close, #cancelDbConfigBtn, #cancelEditBtn, #cancelJsonImportBtn').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // 添加确认同步按钮事件
    document.getElementById('confirmSyncBtn').addEventListener('click', confirmSync);
    document.getElementById('cancelSyncBtn').addEventListener('click', UiManager.closeSyncConfirmModal);
    
    // 添加JSON导入按钮事件
    document.getElementById('importAsNewBtn').addEventListener('click', () => {
        importJsonData(false);
    });
    document.getElementById('replaceAllBtn').addEventListener('click', () => {
        if (confirm('确定要替换所有现有记录吗？此操作不可恢复！')) {
            importJsonData(true);
        }
    });
    
    // 添加保存数据库配置按钮事件
    document.getElementById('saveDbConfigBtn').addEventListener('click', saveDbConfig);
    document.getElementById('testDbConnectionBtn').addEventListener('click', testDbConnectionFromModal);
    
    // 添加编辑记录保存按钮事件
    document.getElementById('saveEditBtn').addEventListener('click', saveEditedRecord);
    
    // 点击弹窗外部关闭弹窗
    window.addEventListener('click', (event) => {
        document.querySelectorAll('.modal').forEach(modal => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // 监听删除记录事件
    document.addEventListener('recordDelete', async function(e) {
        const index = e.detail.index;
        
        // 先保存记录，以便数据库删除
        const deletedRecord = DataManager.getAllRecords()[index];
        
        // 删除本地记录
        DataManager.deleteRecord(index);
        
        // 如果数据库已启用且已连接，尝试同步删除操作
        if (DbManager.isDatabaseEnabled() && DbManager.isDatabaseConnected()) {
            await DbManager.deleteRecordFromDatabase(deletedRecord.date);
        }
        
        // 更新UI
        UiManager.renderRecordsTable();
        UiManager.updateStatistics();
        
        // 更新图表
        const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
        ChartManager.updateAllCharts(currentBtcPrice);
    });
}

/**
 * 设置默认日期时间
 */
function setDefaultDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    dateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * 保存新记录
 */
async function saveRecord() {
    const date = dateInput.value;
    const amount = parseFloat(amountInput.value);
    const btcPrice = parseFloat(btcPriceInput.value);
    const note = noteInput.value;
    
    if (!date || isNaN(amount) || amount <= 0 || isNaN(btcPrice) || btcPrice <= 0) {
        alert('请填写有效的日期、金额和价格！');
        return;
    }
    
    const newRecord = {
        date: date,
        amount: amount,
        btcPrice: btcPrice,
        note: note,
        currency: DataManager.getSelectedCurrency()
    };
    
    // 添加记录
    DataManager.addRecord(newRecord);
    
    // 如果数据库已启用且已连接，尝试同步到数据库
    if (DbManager.isDatabaseEnabled() && DbManager.isDatabaseConnected()) {
        await DbManager.saveRecordToDatabase(newRecord);
    }
    
    // 清空输入
    amountInput.value = '';
    btcPriceInput.value = '';
    noteInput.value = '';
    setDefaultDate();
    
    // 更新UI
    UiManager.renderRecordsTable();
    UiManager.updateStatistics();
    
    // 更新图表
    const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
    ChartManager.updateAllCharts(currentBtcPrice);
}

/**
 * 清空所有记录
 */
async function clearAllRecords() {
    if (confirm('确定要清空所有记录吗？此操作不可恢复！')) {
        // 清空本地记录
        DataManager.clearAllRecords();
        
        // 如果数据库已启用且已连接，尝试同步清空操作
        if (DbManager.isDatabaseEnabled() && DbManager.isDatabaseConnected()) {
            await DbManager.clearDatabaseRecords();
        }
        
        // 更新UI
        UiManager.renderRecordsTable();
        UiManager.updateStatistics();
        
        // 清除图表
        ChartManager.clearAllCharts();
    }
}

/**
 * 导出数据
 */
function exportData() {
    try {
        DataManager.exportRecordsToJson();
    } catch (error) {
        alert(error.message);
    }
}

/**
 * 处理文件导入
 */
function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            // 解析JSON数据
            let jsonRecords = [];
            try {
                jsonRecords = JSON.parse(e.target.result);
                if (!Array.isArray(jsonRecords)) {
                    throw new Error('JSON数据必须是记录数组');
                }
            } catch (parseError) {
                alert('JSON解析错误: ' + parseError.message);
                return;
            }
            
            // 去重处理
            const existingRecords = DataManager.getAllRecords();
            const existingDates = new Set(existingRecords.map(r => r.date));
            
            // 过滤掉已存在日期的记录
            const uniqueRecords = jsonRecords.filter(r => !existingDates.has(r.date));
            
            if (uniqueRecords.length === 0) {
                alert('所有导入的记录都已存在，没有新记录可添加！');
                return;
            }
            
            // 导入唯一的记录
            const result = DataManager.importJsonData(uniqueRecords, false);
            
            // 更新UI
            UiManager.renderRecordsTable();
            UiManager.updateStatistics();
            
            // 更新图表
            const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
            ChartManager.updateAllCharts(currentBtcPrice);
            
            // 如果数据库已启用且已连接，自动同步到数据库
            if (DbManager.isDatabaseEnabled() && DbManager.isDatabaseConnected()) {
                UiManager.showProgressIndicator('正在同步数据到数据库...');
                const records = DataManager.getAllRecords();
                const syncResult = await DbManager.syncToDatabase(records);
                UiManager.hideProgressIndicator();
                
                if (syncResult.success) {
                    alert(`已成功导入 ${result.validRecordsCount} 条新记录并同步到数据库。\n过滤了 ${jsonRecords.length - uniqueRecords.length} 条重复记录。`);
                } else {
                    alert(`已成功导入 ${result.validRecordsCount} 条新记录到本地，但同步到数据库失败: ${syncResult.error}\n过滤了 ${jsonRecords.length - uniqueRecords.length} 条重复记录。`);
                }
            } else {
                alert(`已成功导入 ${result.validRecordsCount} 条新记录到本地。\n过滤了 ${jsonRecords.length - uniqueRecords.length} 条重复记录。`);
            }
        } catch (error) {
            alert('导入失败：' + error.message);
        }
    };
    
    reader.readAsText(file);
    event.target.value = ''; // 清空文件输入，允许再次选择相同文件
}

/**
 * 导入JSON文本
 */
async function importJsonData(shouldReplace) {
    const jsonInput = document.getElementById('jsonInput');
    const jsonText = jsonInput.value.trim();
    
    if (!jsonText) {
        alert('请输入JSON数据');
        return;
    }
    
    try {
        // 解析JSON数据以进行去重检查
        let jsonRecords = [];
        try {
            jsonRecords = JSON.parse(jsonText);
            if (!Array.isArray(jsonRecords)) {
                throw new Error('JSON数据必须是记录数组');
            }
        } catch (parseError) {
            alert('JSON解析错误: ' + parseError.message);
            return;
        }
        
        // 当替换所有记录时，直接使用导入的数据
        if (shouldReplace) {
            // 清空原有记录
            DataManager.clearAllRecords();
            
            // 导入数据
            const result = DataManager.importJsonData(jsonRecords, true);
            
            // 关闭弹窗
            UiManager.closeJsonImportModal();
            
            // 更新UI
            UiManager.renderRecordsTable();
            UiManager.updateStatistics();
            
            // 更新图表
            const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
            ChartManager.updateAllCharts(currentBtcPrice);
            
            // 如果数据库已启用且已连接，自动同步到数据库
            if (DbManager.isDatabaseEnabled() && DbManager.isDatabaseConnected()) {
                UiManager.showProgressIndicator('正在同步数据到数据库...');
                const records = DataManager.getAllRecords();
                const syncResult = await DbManager.syncToDatabase(records);
                UiManager.hideProgressIndicator();
                
                if (syncResult.success) {
                    alert(`已成功导入 ${result.validRecordsCount} 条记录并同步到数据库。`);
                } else {
                    alert(`已成功导入 ${result.validRecordsCount} 条记录到本地，但同步到数据库失败: ${syncResult.error}`);
                }
            } else {
                alert(`已成功导入 ${result.validRecordsCount} 条记录到本地。要同步到数据库，请先启用并连接数据库。`);
            }
            return;
        }
        
        // 如果是添加为新记录，执行去重处理
        const existingRecords = DataManager.getAllRecords();
        const existingDates = new Set(existingRecords.map(r => r.date));
        
        // 过滤掉已存在日期的记录
        const uniqueRecords = jsonRecords.filter(r => !existingDates.has(r.date));
        
        if (uniqueRecords.length === 0) {
            alert('所有导入的记录都已存在，没有新记录可添加！');
            UiManager.closeJsonImportModal();
            return;
        }
        
        // 导入唯一的记录
        const result = DataManager.importJsonData(uniqueRecords, false);
        
        // 关闭弹窗
        UiManager.closeJsonImportModal();
        
        // 更新UI
        UiManager.renderRecordsTable();
        UiManager.updateStatistics();
        
        // 更新图表
        const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
        ChartManager.updateAllCharts(currentBtcPrice);
        
        // 如果数据库已启用且已连接，自动同步到数据库
        if (DbManager.isDatabaseEnabled() && DbManager.isDatabaseConnected()) {
            UiManager.showProgressIndicator('正在同步数据到数据库...');
            const records = DataManager.getAllRecords();
            const syncResult = await DbManager.syncToDatabase(records);
            UiManager.hideProgressIndicator();
            
            if (syncResult.success) {
                alert(`已成功导入 ${result.validRecordsCount} 条新记录并同步到数据库。\n过滤了 ${jsonRecords.length - uniqueRecords.length} 条重复记录。`);
            } else {
                alert(`已成功导入 ${result.validRecordsCount} 条新记录到本地，但同步到数据库失败: ${syncResult.error}\n过滤了 ${jsonRecords.length - uniqueRecords.length} 条重复记录。`);
            }
        } else {
            alert(`已成功导入 ${result.validRecordsCount} 条新记录到本地。\n过滤了 ${jsonRecords.length - uniqueRecords.length} 条重复记录。`);
        }
    } catch (error) {
        alert('导入失败：' + error.message);
    }
}

/**
 * 刷新BTC价格
 */
async function refreshPrice() {
    const result = await ApiService.fetchBtcPrice();
    
    if (result.success) {
        // 更新价格显示
        UiManager.updateCurrentPriceDisplay();
        
        // 更新表格和统计
        UiManager.renderRecordsTable();
        UiManager.updateStatistics();
        
        // 更新图表
        const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
        ChartManager.updateAllCharts(currentBtcPrice);
    } else {
        alert('获取比特币价格失败: ' + result.error);
    }
}

/**
 * 获取当前价格并设置到输入框
 */
async function getAndSetCurrentPrice() {
    const result = await ApiService.fetchBtcPrice();
    
    if (result.success) {
        // 更新价格显示
        UiManager.updateCurrentPriceDisplay();
        
        // 设置价格到输入框
        const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
        btcPriceInput.value = currentBtcPrice;
    } else {
        alert('获取比特币价格失败: ' + result.error);
    }
}

/**
 * 切换自动刷新
 */
function toggleAutoRefresh() {
    if (autoRefreshCheckbox.checked) {
        // 开始自动刷新
        ApiService.startAutoRefresh(60000, result => {
            if (result.success) {
                // 更新价格显示
                UiManager.updateCurrentPriceDisplay();
                
                // 更新表格和统计
                UiManager.renderRecordsTable();
                UiManager.updateStatistics();
                
                // 更新图表
                const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
                ChartManager.updateAllCharts(currentBtcPrice);
            }
        });
    } else {
        // 停止自动刷新
        ApiService.stopAutoRefresh();
    }
}

/**
 * 切换货币
 */
function changeCurrency() {
    const selectedCurrency = this.value;
    
    // 设置当前货币
    DataManager.setSelectedCurrency(selectedCurrency);
    
    // 更新货币标签
    UiManager.updateCurrencyLabels();
    
    // 刷新价格显示
    UiManager.updateCurrentPriceDisplay();
    
    // 更新表格和统计
    UiManager.renderRecordsTable();
    UiManager.updateStatistics();
    
    // 更新图表
    const currentBtcPrice = ApiService.getCurrentBtcPrice(selectedCurrency);
    ChartManager.updateAllCharts(currentBtcPrice);
}

/**
 * 切换数据源
 */
async function toggleDataSource() {
    const useDatabase = this.checked;
    
    // 设置数据库启用状态
    DbManager.setDatabaseEnabled(useDatabase);
    
    // 更新数据源UI
    UiManager.updateDatabaseStatusUI(false, useDatabase);
    
    if (useDatabase) {
        // 测试数据库连接
        const result = await DbManager.testDbConnection();
        UiManager.updateDatabaseStatusUI(result.success, useDatabase);
    }
}

/**
 * 测试数据库连接
 */
async function testDbConnection() {
    if (!DbManager.isDatabaseEnabled()) {
        alert('请先启用数据库');
        return;
    }
    
    // 显示进度指示器
    UiManager.showProgressIndicator('正在测试数据库连接...');
    
    // 测试连接
    const result = await DbManager.testDbConnection();
    
    // 隐藏进度指示器
    UiManager.hideProgressIndicator();
    
    // 更新UI
    UiManager.updateDatabaseStatusUI(result.success, DbManager.isDatabaseEnabled());
    
    if (result.success) {
        alert('数据库连接成功');
    } else {
        alert('数据库连接失败: ' + result.error);
    }
}

/**
 * 从模态框测试数据库连接
 */
async function testDbConnectionFromModal() {
    const dbHost = document.getElementById('dbHost').value;
    const dbPort = document.getElementById('dbPort').value;
    const dbName = document.getElementById('dbName').value;
    const dbUser = document.getElementById('dbUser').value;
    const dbPassword = document.getElementById('dbPassword').value;
    
    // 先更新配置
    const config = {
        host: dbHost,
        port: parseInt(dbPort),
        database: dbName,
        user: dbUser,
        password: dbPassword
    };
    
    // 保存配置
    DbManager.saveDbConfig(config);
    
    // 显示进度指示器
    UiManager.showProgressIndicator('正在测试数据库连接...');
    
    // 测试连接
    const result = await DbManager.testDbConnection();
    
    // 隐藏进度指示器
    UiManager.hideProgressIndicator();
    
    // 显示连接结果
    UiManager.showDbConnectionResult(result.success, result.success ? '连接成功！' : '连接失败: ' + result.error);
}

/**
 * 打开数据库配置弹窗
 */
function openDbConfig() {
    const config = DbManager.getDbConfig();
    UiManager.openDbConfigModal(config);
}

/**
 * 保存数据库配置
 */
async function saveDbConfig() {
    const dbHost = document.getElementById('dbHost').value;
    const dbPort = document.getElementById('dbPort').value;
    const dbName = document.getElementById('dbName').value;
    const dbUser = document.getElementById('dbUser').value;
    const dbPassword = document.getElementById('dbPassword').value;
    
    // 验证配置
    if (!dbHost || !dbPort || !dbName || !dbUser) {
        alert('请填写所有必要的数据库配置信息');
        return;
    }
    
    // 保存配置
    const config = {
        host: dbHost,
        port: parseInt(dbPort),
        database: dbName,
        user: dbUser,
        password: dbPassword
    };
    
    DbManager.saveDbConfig(config);
    
    // 关闭弹窗
    UiManager.closeDbConfigModal();
    
    // 测试连接
    if (DbManager.isDatabaseEnabled()) {
        const result = await DbManager.testDbConnection();
        UiManager.updateDatabaseStatusUI(result.success, DbManager.isDatabaseEnabled());
    }
}

/**
 * 同步数据到数据库
 */
async function syncToDatabase() {
    if (!DbManager.isDatabaseEnabled() || !DbManager.isDatabaseConnected()) {
        alert('数据库未启用或未连接，无法同步');
        return;
    }
    
    const records = DataManager.getAllRecords();
    if (records.length === 0) {
        alert('没有记录可同步！');
        return;
    }
    
    // 显示确认弹窗
    UiManager.showSyncConfirmModal('syncToDb', `确定要将当前 ${records.length} 条记录同步到数据库吗？此操作将覆盖数据库中的记录。`);
}

/**
 * 从数据库同步数据
 */
async function syncFromDatabase() {
    if (!DbManager.isDatabaseEnabled() || !DbManager.isDatabaseConnected()) {
        alert('数据库未启用或未连接，无法同步');
        return;
    }
    
    const records = DataManager.getAllRecords();
    if (records.length > 0) {
        // 显示确认弹窗
        UiManager.showSyncConfirmModal('syncFromDb', '确定要从数据库同步记录吗？这将覆盖本地的所有记录。');
    } else {
        // 没有本地记录，直接同步
        executeSyncFromDatabase();
    }
}

/**
 * 确认同步操作
 */
async function confirmSync() {
    // 获取操作类型
    const action = document.getElementById('syncConfirmModal').getAttribute('data-action');
    
    // 关闭确认弹窗
    UiManager.closeSyncConfirmModal();
    
    if (action === 'syncToDb') {
        // 同步到数据库
        await executeSyncToDatabase();
    } else if (action === 'syncFromDb') {
        // 从数据库同步
        await executeSyncFromDatabase();
    }
}

/**
 * 执行同步到数据库操作
 */
async function executeSyncToDatabase() {
    // 显示进度指示器
    UiManager.showProgressIndicator('正在同步到数据库...');
    
    // 获取所有记录
    const records = DataManager.getAllRecords();
    
    // 执行同步
    const result = await DbManager.syncToDatabase(records);
    
    // 隐藏进度指示器
    UiManager.hideProgressIndicator();
    
    if (result.success) {
        alert(result.message);
    } else {
        alert('同步失败: ' + result.error);
    }
}

/**
 * 执行从数据库同步操作
 */
async function executeSyncFromDatabase() {
    // 显示进度指示器
    UiManager.showProgressIndicator('正在从数据库同步...');
    
    // 执行同步
    const result = await DbManager.syncFromDatabase();
    
    // 隐藏进度指示器
    UiManager.hideProgressIndicator();
    
    if (result.success) {
        // 清空本地记录
        DataManager.clearAllRecords();
        
        // 添加从数据库获取的记录
        result.records.forEach(record => {
            DataManager.addRecord(record);
        });
        
        // 更新UI
        UiManager.renderRecordsTable();
        UiManager.updateStatistics();
        
        // 更新图表
        const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
        ChartManager.updateAllCharts(currentBtcPrice);
        
        alert(result.message);
    } else {
        alert('同步失败: ' + result.error);
    }
}

/**
 * 保存编辑后的记录
 */
async function saveEditedRecord() {
    const editRecordIndexInput = document.getElementById('editRecordIndex');
    const editDateInput = document.getElementById('editDate');
    const editAmountInput = document.getElementById('editAmount');
    const editBtcPriceInput = document.getElementById('editBtcPrice');
    const editNoteInput = document.getElementById('editNote');
    
    const index = parseInt(editRecordIndexInput.value);
    const date = editDateInput.value;
    const amount = parseFloat(editAmountInput.value);
    const btcPrice = parseFloat(editBtcPriceInput.value);
    const note = editNoteInput.value;
    
    if (!date || isNaN(amount) || amount <= 0 || isNaN(btcPrice) || btcPrice <= 0) {
        alert('请填写有效的日期、金额和价格！');
        return;
    }
    
    // 获取原始记录的日期，用于数据库更新
    const originalRecord = DataManager.getAllRecords()[index];
    
    // 创建更新后的记录
    const updatedRecord = {
        date: date,
        amount: amount,
        btcPrice: btcPrice,
        note: note,
        currency: DataManager.getSelectedCurrency()
    };
    
    // 更新记录
    DataManager.updateRecord(index, updatedRecord);
    
    // 如果数据库已启用且已连接，尝试同步更新操作
    if (DbManager.isDatabaseEnabled() && DbManager.isDatabaseConnected()) {
        // 先删除原记录
        await DbManager.deleteRecordFromDatabase(originalRecord.date);
        
        // 添加更新后的记录
        await DbManager.saveRecordToDatabase(updatedRecord);
    }
    
    // 关闭弹窗
    UiManager.closeEditModal();
    
    // 更新UI
    UiManager.renderRecordsTable();
    UiManager.updateStatistics();
    
    // 更新图表
    const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
    ChartManager.updateAllCharts(currentBtcPrice);
}

/**
 * 切换记录显示模式（全部/部分）
 */
let showAllRecords = false;
function toggleRecordsDisplay() {
    showAllRecords = !showAllRecords;
    UiManager.renderRecordsTable(showAllRecords);
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', init);

// 导出模块接口
export { init }; 