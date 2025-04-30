/**
 * UI管理模块
 * 处理用户界面更新、模态框等功能
 */
import { getSelectedCurrency, getSortedRecords, convertCurrency } from './dataManager.js';
import { getCurrentBtcPrice } from './apiService.js';

/**
 * 更新货币标签
 */
function updateCurrencyLabels() {
    const selectedCurrency = getSelectedCurrency();
    
    const currencySymbols = document.querySelectorAll('#currency-symbol, #edit-currency-symbol, .table-currency, .stats-currency');
    const priceCurrencySymbols = document.querySelectorAll('#price-currency-symbol, #edit-price-currency-symbol, .table-price-currency');
    const valueCurrencySymbols = document.querySelectorAll('#current-price-currency, .table-value-currency, .stats-value-currency, .stats-profit-currency');
    
    currencySymbols.forEach(el => {
        el.textContent = selectedCurrency;
    });
    
    priceCurrencySymbols.forEach(el => {
        el.textContent = selectedCurrency;
    });
    
    valueCurrencySymbols.forEach(el => {
        el.textContent = selectedCurrency;
    });
}

/**
 * 更新当前BTC价格显示
 * @param {number} price BTC价格
 * @param {boolean} isCache 是否是缓存的价格
 * @param {boolean} isStale 价格是否过期
 */
function updateBtcPriceDisplay(price, isCache = false, isStale = false) {
    const selectedCurrency = getSelectedCurrency();
    const currentBtcPriceElement = document.getElementById('currentBtcPrice');
    const btcPriceInput = document.getElementById('btcPrice');
    
    if (currentBtcPriceElement) {
        currentBtcPriceElement.textContent = price.toLocaleString(
            selectedCurrency === 'USD' ? 'en-US' : 'zh-CN', 
            { maximumFractionDigits: 2 }
        );
        
        // 显示价格状态提示
        if (isStale) {
            currentBtcPriceElement.classList.add('stale-price');
            currentBtcPriceElement.title = "价格数据已过期";
        } else if (isCache) {
            currentBtcPriceElement.classList.add('cached-price');
            currentBtcPriceElement.title = "使用缓存的价格数据";
        } else {
            currentBtcPriceElement.classList.remove('stale-price', 'cached-price');
            currentBtcPriceElement.title = "实时价格数据";
        }
    }
    
    // 更新表单输入框价格
    if (btcPriceInput) {
        btcPriceInput.value = price.toFixed(2);
    }
}

/**
 * 渲染记录表格
 * @param {boolean} showAll 是否显示所有记录
 */
function renderRecordsTable(showAll = false) {
    const recordList = document.getElementById('recordList');
    const recordCount = document.getElementById('recordCount');
    const recordsSummary = document.getElementById('recordsSummary');
    const toggleRecordsBtn = document.getElementById('toggleRecordsBtn');
    
    const selectedCurrency = getSelectedCurrency();
    let currentBtcPrice = getCurrentBtcPrice(selectedCurrency);
    
    // 检查并确保价格有效
    if (!currentBtcPrice || currentBtcPrice <= 0) {
        console.warn('渲染表格时BTC价格无效:', currentBtcPrice, '使用默认价格');
        currentBtcPrice = selectedCurrency === 'CNY' ? 95000 * 7.2 : 95000;
    }
    
    console.log('当前BTC价格:', currentBtcPrice, selectedCurrency);
    
    if (!recordList) return;
    
    // 清空表格
    recordList.innerHTML = '';
    
    // 获取按日期排序的记录
    const sortedRecords = getSortedRecords();
    if (sortedRecords.length === 0) return;
    
    // 设置记录数量显示
    recordCount.textContent = `(共 ${sortedRecords.length} 条记录)`;
    
    // 确定显示多少条记录
    const VISIBLE_RECORDS = 10;
    const recordsToShow = showAll ? sortedRecords.length : Math.min(VISIBLE_RECORDS, sortedRecords.length);
    
    // 更新切换按钮文本
    toggleRecordsBtn.textContent = showAll ? "只显示最近10条" : "显示全部记录";
    
    // 更新记录摘要
    if (sortedRecords.length > VISIBLE_RECORDS && !showAll) {
        recordsSummary.textContent = `仅显示最近${recordsToShow}条，共${sortedRecords.length}条记录`;
    } else {
        recordsSummary.textContent = "";
    }
    
    // 控制按钮显示/隐藏
    if (sortedRecords.length <= VISIBLE_RECORDS) {
        toggleRecordsBtn.style.display = 'none';
    } else {
        toggleRecordsBtn.style.display = 'inline-block';
    }
    
    // 遍历记录并创建表格行
    sortedRecords.forEach((record, index) => {
        const row = document.createElement('tr');
        
        // 判断是否需要隐藏此行
        if (!showAll && index >= VISIBLE_RECORDS) {
            row.classList.add('hidden-record');
        }
        
        // 格式化日期显示
        const date = new Date(record.date);
        const formattedDate = date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // 计算显示的金额（考虑货币转换）
        let displayAmount = record.amount;
        let displayBtcPrice = record.btcPrice;
        
        // 如果记录的货币与当前选择的货币不同，进行转换
        if (record.currency && record.currency !== selectedCurrency) {
            displayAmount = convertCurrency(record.amount, record.currency, selectedCurrency);
            displayBtcPrice = convertCurrency(record.btcPrice, record.currency, selectedCurrency);
        }
        
        // 计算购买的BTC数量
        const btcAmount = record.amount / record.btcPrice;
        
        // 计算当前价值和收益率
        const currentValue = btcAmount * currentBtcPrice;
        const profitRate = ((currentValue - displayAmount) / displayAmount) * 100;
        
        // 设置行内容
        row.innerHTML = `
            <td>${formattedDate}</td>
            <td>${typeof displayAmount === 'number' ? displayAmount.toFixed(2) : '0.00'}</td>
            <td>${typeof displayBtcPrice === 'number' ? displayBtcPrice.toFixed(2) : '0.00'}</td>
            <td>${typeof btcAmount === 'number' ? btcAmount.toFixed(8) : '0.00000000'}</td>
            <td>${record.note || ''}</td>
            <td>${typeof currentValue === 'number' ? currentValue.toFixed(2) : '0.00'}</td>
            <td class="${profitRate >= 0 ? 'positive' : 'negative'}">${typeof profitRate === 'number' ? profitRate.toFixed(2) : '0.00'}%</td>
            <td>
                <button class="edit-btn" data-index="${index}">编辑</button>
                <button class="delete-btn" data-index="${index}">删除</button>
            </td>
        `;
        
        recordList.appendChild(row);
    });
    
    // 添加事件监听
    attachTableEventListeners();
}

/**
 * 更新统计信息
 */
function updateStatistics() {
    const records = getSortedRecords();
    const selectedCurrency = getSelectedCurrency();
    let currentBtcPrice = getCurrentBtcPrice(selectedCurrency);
    
    // 确保价格有效
    if (!currentBtcPrice || currentBtcPrice <= 0) {
        console.warn('更新统计时BTC价格无效:', currentBtcPrice, '使用默认价格');
        currentBtcPrice = selectedCurrency === 'CNY' ? 95000 * 7.2 : 95000;
    }
    
    console.log('统计计算使用的BTC价格:', currentBtcPrice, selectedCurrency);
    
    let totalInvestment = 0;
    let totalBtcAmount = 0;
    let totalAmounts = 0;
    let totalBtcPrices = 0;
    
    // 计算统计数据
    records.forEach(record => {
        // 计算显示的金额（考虑货币转换）
        let displayAmount = record.amount;
        let displayBtcPrice = record.btcPrice;
        
        // 如果记录的货币与当前选择的货币不同，进行转换
        if (record.currency && record.currency !== selectedCurrency) {
            displayAmount = convertCurrency(record.amount, record.currency, selectedCurrency);
            displayBtcPrice = convertCurrency(record.btcPrice, record.currency, selectedCurrency);
        }
        
        const btcAmount = record.amount / record.btcPrice;
        
        totalInvestment += displayAmount;
        totalBtcAmount += btcAmount;
        totalAmounts += displayAmount;
        totalBtcPrices += displayBtcPrice;
    });
    
    // 计算当前总价值和收益
    const totalCurrentValue = totalBtcAmount * currentBtcPrice;
    const totalProfit = totalCurrentValue - totalInvestment;
    const totalProfitPercentage = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0;
    
    // 计算均价
    const averageAmount = records.length > 0 ? totalAmounts / records.length : 0;
    const averageBtcPrice = records.length > 0 ? totalBtcPrices / records.length : 0;
    
    // 计算平均收益率
    const averageReturnRate = totalProfitPercentage;
    
    // 更新DOM元素
    updateStatisticsDisplay({
        totalInvestment,
        totalBtcAmount,
        totalCurrentValue,
        totalProfit,
        totalProfitPercentage,
        averageAmount,
        averageBtcPrice,
        averageReturnRate
    });
}

/**
 * 更新统计显示
 * @param {Object} stats 统计数据对象
 */
function updateStatisticsDisplay(stats) {
    // 更新DOM元素
    document.getElementById('totalInvestment').textContent = typeof stats.totalInvestment === 'number' ? stats.totalInvestment.toFixed(2) : '0.00';
    document.getElementById('totalBtc').textContent = typeof stats.totalBtcAmount === 'number' ? stats.totalBtcAmount.toFixed(8) : '0.00000000';
    document.getElementById('totalCurrentValue').textContent = typeof stats.totalCurrentValue === 'number' ? stats.totalCurrentValue.toFixed(2) : '0.00';
    document.getElementById('totalProfit').textContent = typeof stats.totalProfit === 'number' ? stats.totalProfit.toFixed(2) : '0.00';
    document.getElementById('totalProfit').className = stats.totalProfit >= 0 ? 'stat-value positive' : 'stat-value negative';
    document.getElementById('totalProfitPercentage').textContent = typeof stats.totalProfitPercentage === 'number' ? stats.totalProfitPercentage.toFixed(2) + '%' : '0.00%';
    document.getElementById('totalProfitPercentage').className = stats.totalProfitPercentage >= 0 ? 'stat-value positive' : 'stat-value negative';
    document.getElementById('averageAmount').textContent = typeof stats.averageAmount === 'number' ? stats.averageAmount.toFixed(2) : '0.00';
    document.getElementById('averageBtcPrice').textContent = typeof stats.averageBtcPrice === 'number' ? stats.averageBtcPrice.toFixed(2) : '0.00';
    document.getElementById('averageReturnRate').textContent = typeof stats.averageReturnRate === 'number' ? stats.averageReturnRate.toFixed(2) + '%' : '0.00%';
    document.getElementById('averageReturnRate').className = stats.averageReturnRate >= 0 ? 'stat-value positive' : 'stat-value negative';
}

/**
 * 给表格按钮添加事件监听
 */
function attachTableEventListeners() {
    // 编辑按钮点击事件
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            const records = getSortedRecords();
            const record = records[index];
            
            // 添加日期信息以便在编辑时使用
            openEditModal(index, record, record.date);
        });
    });
    
    // 删除按钮点击事件
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            const records = getSortedRecords();
            const record = records[index];
            
            // 格式化日期以便显示
            const date = new Date(record.date);
            const formattedDate = date.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            // 显示更详细的确认信息
            if (confirm(`确定要删除以下记录吗？\n\n日期: ${formattedDate}\n金额: ${record.amount.toFixed(2)} ${record.currency}\n比特币价格: ${record.btcPrice.toFixed(2)} ${record.currency}\n\n此操作不可恢复！`)) {
                // 发布删除事件，让app.js处理
                const event = new CustomEvent('recordDelete', { 
                    detail: { index: index, date: record.date }
                });
                document.dispatchEvent(event);
            }
        });
    });
}

/**
 * 打开编辑弹窗
 * @param {number} index 记录索引
 * @param {Object} record 记录对象
 */
function openEditModal(index, record, date) {
    const editModal = document.getElementById('editRecordModal');
    const editDateInput = document.getElementById('editDate');
    const editAmountInput = document.getElementById('editAmount');
    const editBtcPriceInput = document.getElementById('editBtcPrice');
    const editNoteInput = document.getElementById('editNote');
    const editRecordIndexInput = document.getElementById('editRecordIndex');
    
    // 设置表单值
    editDateInput.value = date;
    editAmountInput.value = record.amount;
    editBtcPriceInput.value = record.btcPrice;
    editNoteInput.value = record.note || '';
    editRecordIndexInput.value = index;
    
    // 显示弹窗
    editModal.style.display = 'block';
}

/**
 * 关闭编辑弹窗
 */
function closeEditModal() {
    const editModal = document.getElementById('editRecordModal');
    editModal.style.display = 'none';
}

/**
 * 打开JSON导入弹窗
 */
function openJsonImportModal() {
    const importJsonModal = document.getElementById('importJsonModal');
    const jsonInput = document.getElementById('jsonInput');
    const jsonError = document.getElementById('jsonError');
    
    jsonInput.value = '';
    jsonError.style.display = 'none';
    importJsonModal.style.display = 'block';
}

/**
 * 关闭JSON导入弹窗
 */
function closeJsonImportModal() {
    const importJsonModal = document.getElementById('importJsonModal');
    importJsonModal.style.display = 'none';
}

/**
 * 打开数据库配置弹窗
 * @param {Object} config 数据库配置
 */
function openDbConfigModal(config) {
    const dbConfigModal = document.getElementById('dbConfigModal');
    const dbHost = document.getElementById('dbHost');
    const dbPort = document.getElementById('dbPort');
    const dbName = document.getElementById('dbName');
    const dbUser = document.getElementById('dbUser');
    const dbPassword = document.getElementById('dbPassword');
    const dbConnectionResult = document.getElementById('dbConnectionResult');
    
    // 设置表单值
    dbHost.value = config.host;
    dbPort.value = config.port;
    dbName.value = config.database;
    dbUser.value = config.user;
    dbPassword.value = config.password;
    
    // 隐藏连接结果
    dbConnectionResult.style.display = 'none';
    
    // 显示弹窗
    dbConfigModal.style.display = 'block';
}

/**
 * 关闭数据库配置弹窗
 */
function closeDbConfigModal() {
    const dbConfigModal = document.getElementById('dbConfigModal');
    dbConfigModal.style.display = 'none';
}

/**
 * 显示同步确认弹窗
 * @param {string} action 同步操作
 * @param {string} message 确认信息
 */
function showSyncConfirmModal(action, message) {
    const syncConfirmModal = document.getElementById('syncConfirmModal');
    const syncConfirmMessage = document.getElementById('syncConfirmMessage');
    
    syncConfirmMessage.textContent = message;
    syncConfirmModal.setAttribute('data-action', action);
    syncConfirmModal.style.display = 'block';
}

/**
 * 关闭同步确认弹窗
 */
function closeSyncConfirmModal() {
    const syncConfirmModal = document.getElementById('syncConfirmModal');
    syncConfirmModal.style.display = 'none';
}

/**
 * 显示进度指示器
 * @param {string} message 进度消息
 */
function showProgressIndicator(message) {
    // 创建或获取进度指示器元素
    let progressIndicator = document.getElementById('progressIndicator');
    
    if (!progressIndicator) {
        progressIndicator = document.createElement('div');
        progressIndicator.id = 'progressIndicator';
        document.body.appendChild(progressIndicator);
    }
    
    progressIndicator.innerHTML = `
        <div style="text-align: center;">
            <div class="spinner"></div>
            <div>${message}</div>
        </div>
    `;
    
    progressIndicator.style.display = 'block';
}

/**
 * 隐藏进度指示器
 */
function hideProgressIndicator() {
    const progressIndicator = document.getElementById('progressIndicator');
    if (progressIndicator) {
        progressIndicator.style.display = 'none';
    }
}

/**
 * 更新数据库状态UI
 * @param {boolean} isConnected 是否连接
 * @param {boolean} isEnabled 是否启用
 */
function updateDatabaseStatusUI(isConnected, isEnabled) {
    const dbStatus = document.getElementById('dbStatus');
    const dbStatusText = document.getElementById('dbStatusText');
    const syncToDbBtn = document.getElementById('syncToDbBtn');
    const syncFromDbBtn = document.getElementById('syncFromDbBtn');
    
    if (!isEnabled) {
        // 数据库未启用
        dbStatus.className = 'db-status db-disconnected';
        dbStatusText.textContent = '数据库连接状态: 未启用';
        syncToDbBtn.style.display = 'none';
        syncFromDbBtn.style.display = 'none';
    } else if (isConnected) {
        // 数据库已连接
        dbStatus.className = 'db-status db-connected';
        dbStatusText.textContent = '数据库连接状态: 已连接';
        syncToDbBtn.style.display = 'inline-block';
        syncFromDbBtn.style.display = 'inline-block';
    } else {
        // 数据库连接失败
        dbStatus.className = 'db-status db-disconnected';
        dbStatusText.textContent = '数据库连接状态: 连接失败';
        syncToDbBtn.style.display = 'none';
        syncFromDbBtn.style.display = 'none';
    }
}

/**
 * 显示数据库连接结果
 * @param {boolean} success 是否成功
 * @param {string} message 消息
 */
function showDbConnectionResult(success, message) {
    const dbConnectionResult = document.getElementById('dbConnectionResult');
    
    dbConnectionResult.textContent = message;
    dbConnectionResult.style.backgroundColor = success ? '#e8f5e9' : '#ffebee';
    dbConnectionResult.style.color = success ? '#2e7d32' : '#c62828';
    dbConnectionResult.style.display = 'block';
}

// 导出模块接口
export {
    updateCurrencyLabels,
    updateBtcPriceDisplay,
    renderRecordsTable,
    updateStatistics,
    updateStatisticsDisplay,
    openEditModal,
    closeEditModal,
    openJsonImportModal,
    closeJsonImportModal,
    openDbConfigModal,
    closeDbConfigModal,
    showSyncConfirmModal,
    closeSyncConfirmModal,
    showProgressIndicator,
    hideProgressIndicator,
    updateDatabaseStatusUI,
    showDbConnectionResult
};