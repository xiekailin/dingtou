/**
 * 应用主脚本
 * 负责整合各个模块，管理应用整体流程
 */
import * as DataManager from './dataManager.js';
import * as ChartManager from './chartManager.js';
import * as UiManager from './uiManager.js';
import * as ApiService from './apiService.js';
import * as DbManager from './dbManager.js';
import * as Auth from './auth.js';

// DOM 元素引用
let dateInput, amountInput, btcPriceInput, noteInput;
let saveBtn, clearBtn, exportBtn, importBtn, importJsonBtn, importFile;
let refreshPriceBtn, getCurrentPriceBtn, autoRefreshCheckbox;
let currencyRadios, dataSourceToggle, testConnectionBtn, dbConfigBtn;
let syncToDbBtn, syncFromDbBtn;

/**
 * 在页面加载完成后初始化应用
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('应用初始化中...');
    
    // 初始化认证系统（会自动检查登录状态）
    Auth.initAuth();
    
    // 初始化数据库连接
    initDatabase();
    
    // 初始化UI和数据
    initUiAndData();
    
    // 初始化事件监听
    initEventListeners();
    
    console.log('应用初始化完成');
});

/**
 * 初始化数据库连接
 */
async function initDatabase() {
    console.log('初始化数据库连接...');
    
    // 加载数据库配置
    const dbSettings = DbManager.loadDbConfig();
    
    // 更新数据库状态UI
    updateDbStatusDisplay();
    
    // 如果启用数据库，测试连接
    if (dbSettings.useDatabase) {
        if (!DbManager.isDatabaseConnected()) {
            const testResult = await DbManager.testDbConnection();
            updateDbStatusDisplay(testResult.success, testResult.error);
            
            // 如果连接成功，尝试同步数据
            if (testResult.success) {
                await syncFromDatabase();
            }
        } else {
            updateDbStatusDisplay(true);
        }
    }
}

/**
 * 初始化UI和数据
 */
async function initUiAndData() {
    console.log('初始化UI和数据...');
    
    // 设置默认日期
    setDefaultDate();
    
    // 加载记录数据
    DataManager.loadRecords();
    
    // 渲染记录表格
    UiManager.renderRecordsTable();
    
    // 加载当前BTC价格
    const price = await updateCurrentBtcPrice();
    
    // 如果价格获取失败，手动设置一个默认价格
    if (!price) {
        console.warn('自动获取价格失败，设置默认价格');
        const defaultPrice = 95000; // 设置默认价格为95000美元，比历史购买价格稍高
        ApiService.manuallySetPrice(defaultPrice, '默认值');
        UiManager.updateBtcPriceDisplay(defaultPrice, false, false);
    }
    
    // 更新统计信息
    UiManager.updateStatistics();
    
    // 初始化图表
    const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
    ChartManager.initCharts(currentBtcPrice);
    
    // 设置定时刷新价格
    setInterval(async function() {
        const newPrice = await updateCurrentBtcPrice();
        if (newPrice) {
            UiManager.updateStatistics();
            ChartManager.updateAllCharts(newPrice);
        }
    }, 60000); // 每分钟更新一次
}

/**
 * 初始化事件监听
 */
function initEventListeners() {
    console.log('初始化事件监听...');
    
    // 添加记录按钮
    const addRecordBtn = document.getElementById('saveBtn');
    if (addRecordBtn) {
        addRecordBtn.addEventListener('click', handleAddRecord);
    }
    
    // 清空记录按钮
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', handleClearRecords);
    }
    
    // 记录删除事件监听
    document.addEventListener('recordDelete', handleRecordDelete);
    
    // 货币切换
    const currencyRadios = document.querySelectorAll('input[name="currency"]');
    currencyRadios.forEach(radio => {
        radio.addEventListener('change', handleCurrencyChange);
    });
    
    // 数据库同步按钮
    const syncToDbBtn = document.getElementById('syncToDbBtn');
    if (syncToDbBtn) {
        syncToDbBtn.addEventListener('click', () => syncToDatabase());
    }
    
    const syncFromDbBtn = document.getElementById('syncFromDbBtn');
    if (syncFromDbBtn) {
        syncFromDbBtn.addEventListener('click', () => syncFromDatabase());
    }
    
    // 数据库连接开关
    const dataSourceToggle = document.getElementById('dataSourceToggle');
    if (dataSourceToggle) {
        dataSourceToggle.addEventListener('change', handleDbToggle);
    }
    
    // 测试连接按钮
    const testConnectionBtn = document.getElementById('testConnectionBtn');
    if (testConnectionBtn) {
        testConnectionBtn.addEventListener('click', handleTestConnection);
    }
    
    // 数据导出/导入按钮
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', handleExportData);
    }
    
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
        importBtn.addEventListener('click', () => document.getElementById('importFile').click());
    }
    
    const importFile = document.getElementById('importFile');
    if (importFile) {
        importFile.addEventListener('change', handleImportData);
    }
    
    // 获取当前价格按钮
    const getCurrentPriceBtn = document.getElementById('getCurrentPrice');
    if (getCurrentPriceBtn) {
        getCurrentPriceBtn.addEventListener('click', async () => {
            const price = await updateCurrentBtcPrice();
            if (price) {
                document.getElementById('btcPrice').value = price.toFixed(2);
            }
        });
    }
    
    // 刷新价格按钮
    const refreshPriceBtn = document.getElementById('refreshPrice');
    if (refreshPriceBtn) {
        refreshPriceBtn.addEventListener('click', updateCurrentBtcPrice);
    }
}

/**
 * 添加记录处理
 */
async function handleAddRecord() {
    // 获取表单数据
    const dateInput = document.getElementById('date');
    const amountInput = document.getElementById('amount');
    const btcPriceInput = document.getElementById('btcPrice');
    const noteInput = document.getElementById('note');
    
    const date = dateInput.value;
    const amount = parseFloat(amountInput.value);
    const btcPrice = parseFloat(btcPriceInput.value);
    const note = noteInput.value;
    
    // 获取当前选择的货币
    const currency = getSelectedCurrency();
    
    // 验证输入
    if (!date || isNaN(amount) || amount <= 0 || isNaN(btcPrice) || btcPrice <= 0) {
        alert('请填写有效的日期、金额和价格！');
        return;
    }
    
    // 创建记录对象
    const newRecord = {
        date: date,
        amount: amount,
        btcPrice: btcPrice,
        note: note,
        currency: currency
    };
    
    // 添加到本地存储
    const addedRecord = DataManager.addRecord(newRecord);
    console.log('本地添加记录:', addedRecord);
    
    // 如果数据库已启用且已连接，保存到数据库
    if (DbManager.isDatabaseEnabled() && DbManager.isDatabaseConnected()) {
        try {
            const result = await DbManager.saveRecordToDatabase(addedRecord);
            console.log('记录保存到数据库:', result);
            
            // 如果服务器返回了UUID，更新本地记录
            if (result.success && result.record && result.record.uuid) {
                // 找到这条记录并更新其UUID
                const records = DataManager.getAllRecords();
                const index = records.findIndex(r => 
                    r.date === addedRecord.date && 
                    r.amount === addedRecord.amount && 
                    r.btcPrice === addedRecord.btcPrice
                );
                
                if (index !== -1) {
                    // 更新记录的UUID
                    records[index].uuid = result.record.uuid;
                    // 保存回本地存储
                    DataManager.updateRecordsInStorage(records);
                    console.log('已使用服务器UUID更新本地记录:', result.record.uuid);
                }
            }
        } catch (error) {
            console.error('保存记录到数据库失败:', error);
        }
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
    const currentBtcPrice = ApiService.getCurrentBtcPrice(currency);
    ChartManager.updateAllCharts(currentBtcPrice);
}

/**
 * 清空记录处理
 */
async function handleClearRecords() {
    if (confirm('确定要清空所有记录吗？此操作不可撤销！')) {
        // 清空本地记录
        DataManager.clearAllRecords();
        
        // 如果数据库已启用且已连接，清空数据库记录
        if (DbManager.isDatabaseEnabled() && DbManager.isDatabaseConnected()) {
            try {
                const result = await DbManager.clearDatabaseRecords();
                console.log('数据库记录清空结果:', result);
            } catch (error) {
                console.error('清空数据库记录失败:', error);
            }
        }
        
        // 更新UI
        UiManager.renderRecordsTable();
        UiManager.updateStatistics();
        
        // 更新图表
        const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
        ChartManager.updateAllCharts(currentBtcPrice);
    }
}

/**
 * 处理货币变更
 */
async function handleCurrencyChange(event) {
    const newCurrency = event.target.value;
    DataManager.setSelectedCurrency(newCurrency);
    
    // 更新当前BTC价格
    await updateCurrentBtcPrice();
    
    // 更新统计信息
    UiManager.updateStatistics();
    
    // 更新图表
    const currentBtcPrice = ApiService.getCurrentBtcPrice(newCurrency);
    ChartManager.updateAllCharts(currentBtcPrice);
    
    // 更新货币符号显示
    updateCurrencyDisplay(newCurrency);
}

/**
 * 更新货币符号显示
 */
function updateCurrencyDisplay(currency) {
    document.querySelectorAll('.table-currency, .stats-currency, #currency-symbol, #price-currency-symbol').forEach(el => {
        el.textContent = currency;
    });
    
    document.querySelectorAll('.table-value-currency, .stats-value-currency, .stats-profit-currency, #current-price-currency').forEach(el => {
        el.textContent = currency;
    });
}

/**
 * 获取当前选择的货币
 */
function getSelectedCurrency() {
    const currencyRadios = document.querySelectorAll('input[name="currency"]');
    for (const radio of currencyRadios) {
        if (radio.checked) {
            return radio.value;
        }
    }
    return 'USD'; // 默认币种
}

/**
 * 处理数据库连接开关
 */
async function handleDbToggle(event) {
    const useDb = event.target.checked;
    DbManager.setDatabaseEnabled(useDb);
    
    updateDbStatusDisplay(false);
    
    // 显示/隐藏同步按钮
    const syncToDbBtn = document.getElementById('syncToDbBtn');
    const syncFromDbBtn = document.getElementById('syncFromDbBtn');
    
    if (syncToDbBtn) syncToDbBtn.style.display = useDb ? 'inline-block' : 'none';
    if (syncFromDbBtn) syncFromDbBtn.style.display = useDb ? 'inline-block' : 'none';
    
    if (useDb) {
        // 启用后立即测试连接
        const result = await DbManager.testDbConnection();
        updateDbStatusDisplay(result.success, result.error);
        
        if (result.success) {
            // 连接成功后，询问是否要同步数据
            if (confirm('数据库连接成功！是否立即从数据库同步数据？')) {
                await syncFromDatabase();
            }
        }
    }
}

/**
 * 处理测试数据库连接
 */
async function handleTestConnection() {
    const result = await DbManager.testDbConnection();
    updateDbStatusDisplay(result.success, result.error);
    
    if (result.success) {
        alert('数据库连接成功！');
    } else {
        alert('数据库连接失败: ' + (result.error || '未知错误'));
    }
}

/**
 * 从数据库同步数据
 */
async function syncFromDatabase() {
    if (!DbManager.isDatabaseEnabled()) {
        alert('请先启用数据库连接！');
        return false;
    }
    
    if (!DbManager.isDatabaseConnected()) {
        const testResult = await DbManager.testDbConnection();
        updateDbStatusDisplay(testResult.success, testResult.error);
        
        if (!testResult.success) {
            alert('数据库连接失败: ' + (testResult.error || '未知错误'));
            return false;
        }
    }
    
    try {
        const result = await DbManager.syncFromDatabase();
        
        if (result.success && result.records) {
            // 清空本地数据
            DataManager.clearAllRecords();
            
            // 添加从数据库获取的记录
            result.records.forEach(record => {
                // 格式化记录对象
                const formattedRecord = {
                    uuid: record.uuid,
                    date: formatDateForDisplay(record.date),
                    amount: parseFloat(record.amount),
                    btcPrice: parseFloat(record.btc_price),
                    note: record.note || '',
                    currency: record.currency || 'USD'
                };
                
                // 添加到本地存储
                DataManager.addRecord(formattedRecord);
            });
            
            // 更新UI
            UiManager.renderRecordsTable();
            UiManager.updateStatistics();
            
            // 更新图表
            const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
            ChartManager.updateAllCharts(currentBtcPrice);
            
            console.log(`已从数据库同步 ${result.records.length} 条记录`);
            return true;
        } else {
            console.error('从数据库同步失败:', result.error);
            return false;
        }
    } catch (error) {
        console.error('从数据库同步出错:', error);
        return false;
    }
}

/**
 * 同步数据到数据库
 */
async function syncToDatabase() {
    if (!DbManager.isDatabaseEnabled()) {
        alert('请先启用数据库连接！');
        return false;
    }
    
    if (!DbManager.isDatabaseConnected()) {
        const testResult = await DbManager.testDbConnection();
        updateDbStatusDisplay(testResult.success, testResult.error);
        
        if (!testResult.success) {
            alert('数据库连接失败: ' + (testResult.error || '未知错误'));
            return false;
        }
    }
    
    try {
        // 获取本地记录
        const records = DataManager.getAllRecords();
        
        // 同步到数据库
        const result = await DbManager.syncToDatabase(records);
        
        if (result.success) {
            alert('成功同步到数据库！');
            return true;
        } else {
            alert('同步到数据库失败: ' + (result.error || '未知错误'));
            return false;
        }
    } catch (error) {
        console.error('同步到数据库出错:', error);
        alert('同步到数据库出错: ' + error.message);
        return false;
    }
}

/**
 * 更新数据库状态显示
 */
function updateDbStatusDisplay(connected = DbManager.isDatabaseConnected(), errorMsg = null) {
    const dbStatusText = document.getElementById('dbStatusText');
    const dbStatus = document.getElementById('dbStatus');
    const dataSourceToggle = document.getElementById('dataSourceToggle');
    
    if (!dbStatusText || !dbStatus || !dataSourceToggle) return;
    
    // 更新开关状态
    dataSourceToggle.checked = DbManager.isDatabaseEnabled();
    
    if (DbManager.isDatabaseEnabled()) {
        if (connected) {
            dbStatusText.textContent = '数据库连接状态: 已连接';
            dbStatus.className = 'db-status db-connected';
        } else {
            dbStatusText.textContent = '数据库连接状态: ' + (errorMsg || '未连接');
            dbStatus.className = 'db-status db-disconnected';
        }
        
        // 显示同步按钮
        const syncToDbBtn = document.getElementById('syncToDbBtn');
        const syncFromDbBtn = document.getElementById('syncFromDbBtn');
        
        if (syncToDbBtn) syncToDbBtn.style.display = 'inline-block';
        if (syncFromDbBtn) syncFromDbBtn.style.display = 'inline-block';
    } else {
        dbStatusText.textContent = '数据库连接状态: 未启用';
        dbStatus.className = 'db-status db-disabled';
        
        // 隐藏同步按钮
        const syncToDbBtn = document.getElementById('syncToDbBtn');
        const syncFromDbBtn = document.getElementById('syncFromDbBtn');
        
        if (syncToDbBtn) syncToDbBtn.style.display = 'none';
        if (syncFromDbBtn) syncFromDbBtn.style.display = 'none';
    }
}

/**
 * 更新当前BTC价格
 */
async function updateCurrentBtcPrice() {
    try {
        const currentCurrency = DataManager.getSelectedCurrency();
        
        // 获取最新价格
        const result = await ApiService.fetchBtcPrice();
        
        if (result.success) {
            const price = result.data.price[currentCurrency];
            
            // 更新价格显示和统计信息
            UiManager.updateBtcPriceDisplay(price, result.data.isCache, result.data.isStale);
            
            return price;
        } else {
            console.error('获取BTC价格失败:', result.error);
            // 即使API请求失败，仍然使用当前设置的价格或默认价格
            const fallbackPrice = ApiService.getCurrentBtcPrice(currentCurrency);
            return fallbackPrice;
        }
    } catch (error) {
        console.error('更新BTC价格失败:', error);
        // 出错时使用备用价格
        const fallbackPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
        return fallbackPrice;
    }
}

/**
 * 设置当前日期为默认值
 */
function setDefaultDate() {
    const dateInput = document.getElementById('date');
    if (!dateInput) return;
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    dateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * 格式化日期用于显示
 */
function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (error) {
        console.error('日期格式化错误:', error);
        return dateStr;
    }
}

/**
 * 处理数据导出
 */
function handleExportData() {
    const records = DataManager.getAllRecords();
    const dataStr = JSON.stringify(records, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileName = 'bitcoin_investment_' + new Date().toISOString().slice(0, 10) + '.json';
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileName);
    linkElement.click();
}

/**
 * 处理数据导入
 */
function handleImportData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const records = JSON.parse(e.target.result);
            
            if (!Array.isArray(records)) {
                throw new Error('无效的数据格式，应为记录数组');
            }
            
            if (records.length === 0) {
                alert('文件中没有记录。');
                return;
            }
            
            if (confirm(`确定要导入 ${records.length} 条记录吗？现有数据将被覆盖！`)) {
                // 清空现有记录
                DataManager.clearAllRecords();
                
                // 导入新记录
                records.forEach(record => {
                    DataManager.addRecord(record);
                });
                
                // 更新UI
                UiManager.renderRecordsTable();
                UiManager.updateStatistics();
                
                // 更新图表
                const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
                ChartManager.updateAllCharts(currentBtcPrice);
                
                // 如果数据库已启用且已连接，同步到数据库
                if (DbManager.isDatabaseEnabled() && DbManager.isDatabaseConnected()) {
                    if (confirm('是否将导入的数据同步到数据库？')) {
                        await syncToDatabase();
                    }
                }
                
                alert('数据导入成功！');
            }
        } catch (error) {
            console.error('导入数据出错:', error);
            alert('导入出错: ' + error.message);
        }
        
        // 清空文件输入，以便再次选择同一文件
        event.target.value = '';
    };
    
    reader.readAsText(file);
}

/**
 * 处理记录删除事件
 */
async function handleRecordDelete(event) {
    const { index } = event.detail;
    console.log('接收到删除请求，索引:', index);
    
    // 获取所有记录（未排序的原始记录）
    const allRecords = DataManager.getAllRecords();
    // 获取排序后的记录用于UI显示
    const sortedRecords = DataManager.getSortedRecords();
    
    if (index < 0 || index >= sortedRecords.length) {
        console.error('无效的记录索引:', index);
        return;
    }
    
    // 通过索引获取排序后的记录
    const sortedRecord = sortedRecords[index];
    
    // 找到对应的原始记录索引
    const originalIndex = allRecords.findIndex(r => 
        r.uuid === sortedRecord.uuid || 
        (r.date === sortedRecord.date && 
         r.amount === sortedRecord.amount && 
         r.btcPrice === sortedRecord.btcPrice)
    );
    
    if (originalIndex === -1) {
        console.error('找不到对应的原始记录:', sortedRecord);
        return;
    }
    
    console.log('找到原始记录索引:', originalIndex, '记录:', allRecords[originalIndex]);
    
    // 从本地存储中删除记录
    const deletedRecord = DataManager.deleteRecord(originalIndex);
    
    // 如果数据库已启用且已连接，从数据库中删除记录
    if (DbManager.isDatabaseEnabled() && DbManager.isDatabaseConnected()) {
        try {
            // 如果记录有UUID，则使用UUID删除
            if (deletedRecord && deletedRecord.uuid) {
                console.log('尝试从数据库删除记录，UUID:', deletedRecord.uuid);
                const result = await DbManager.deleteRecordFromDatabase(deletedRecord.uuid);
                console.log('记录从数据库删除结果:', result);
            } else {
                console.warn('记录缺少UUID，无法从数据库删除:', deletedRecord);
            }
        } catch (error) {
            console.error('从数据库删除记录失败:', error);
        }
    }
    
    // 更新UI
    UiManager.renderRecordsTable();
    UiManager.updateStatistics();
    
    // 更新图表
    const currentBtcPrice = ApiService.getCurrentBtcPrice(DataManager.getSelectedCurrency());
    ChartManager.updateAllCharts(currentBtcPrice);
} 