/**
 * 图表管理模块
 * 处理所有图表相关的功能
 */
import { getSelectedCurrency, getChronologicalRecords, convertCurrency } from './dataManager.js';

// 全局变量保存图表实例
let investmentValueChart;
let btcPriceChart;
let btcAmountChart;
let profitRateChart;

/**
 * 初始化所有图表
 * @param {number} currentBtcPrice 当前比特币价格
 */
function initCharts(currentBtcPrice) {
    // 如果没有记录，不需要绘制图表
    const records = getChronologicalRecords();
    if (records.length === 0) {
        return;
    }
    
    // 更新所有图表
    updateAllCharts(currentBtcPrice);
}

/**
 * 更新所有图表
 * @param {number} currentBtcPrice 当前比特币价格
 */
function updateAllCharts(currentBtcPrice) {
    // 如果没有记录，不需要绘制图表
    const records = getChronologicalRecords();
    if (records.length === 0) {
        return;
    }
    
    // 准备数据
    const chartData = prepareChartData(records, currentBtcPrice);
    
    // 更新各个图表
    updateInvestmentValueChart(chartData);
    updateBtcPriceChart(chartData);
    updateBtcAmountChart(chartData);
    updateProfitRateChart(chartData);
}

/**
 * 准备图表所需的数据
 * @param {Array} records 记录数组
 * @param {number} currentBtcPrice 当前比特币价格
 */
function prepareChartData(records, currentBtcPrice) {
    const selectedCurrency = getSelectedCurrency();
    
    // 按日期排序记录
    const sortedRecords = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // 准备时间标签（日期）
    const labels = sortedRecords.map(record => {
        const date = new Date(record.date);
        return date.toLocaleDateString('zh-CN');
    });
    
    // 准备各种数据数组
    const investmentData = []; // 累计投资金额
    const currentValueData = []; // 当前总价值
    const btcPriceData = []; // BTC价格走势
    const btcAmountData = []; // 累计BTC持有量
    const profitRateData = []; // 收益率变化
    
    let totalInvestment = 0;
    let totalBtcAmount = 0;
    
    sortedRecords.forEach(record => {
        // 计算当前记录对应的数据
        let displayAmount = record.amount;
        let displayBtcPrice = record.btcPrice;
        
        // 如果记录的货币与当前选择的货币不同，进行转换
        if (record.currency && record.currency !== selectedCurrency) {
            displayAmount = convertCurrency(record.amount, record.currency, selectedCurrency);
            displayBtcPrice = convertCurrency(record.btcPrice, record.currency, selectedCurrency);
        }
        
        // 累计投资金额
        totalInvestment += displayAmount;
        investmentData.push(totalInvestment);
        
        // BTC价格
        btcPriceData.push(displayBtcPrice);
        
        // 累计BTC持有量
        const btcAmount = record.amount / record.btcPrice;
        totalBtcAmount += btcAmount;
        btcAmountData.push(totalBtcAmount);
        
        // 当前总价值和收益率
        const currentValue = totalBtcAmount * currentBtcPrice;
        currentValueData.push(currentValue);
        
        const profitRate = ((currentValue - totalInvestment) / totalInvestment) * 100;
        profitRateData.push(profitRate);
    });
    
    return {
        labels,
        investmentData,
        currentValueData,
        btcPriceData,
        btcAmountData,
        profitRateData
    };
}

/**
 * 更新投资与价值走势图
 * @param {Object} data 图表数据
 */
function updateInvestmentValueChart(data) {
    const ctx = document.getElementById('investmentValueChart').getContext('2d');
    const selectedCurrency = getSelectedCurrency();
    
    // 如果图表已存在，销毁它
    if (investmentValueChart) {
        investmentValueChart.destroy();
    }
    
    // 创建新图表
    investmentValueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: `累计投资(${selectedCurrency})`,
                    data: data.investmentData,
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 2,
                    tension: 0.1
                },
                {
                    label: `当前价值(${selectedCurrency})`,
                    data: data.currentValueData,
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 2,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: `金额(${selectedCurrency})`
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '日期'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw.toFixed(2)}`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * 更新BTC价格走势图
 * @param {Object} data 图表数据
 */
function updateBtcPriceChart(data) {
    const ctx = document.getElementById('btcPriceChart').getContext('2d');
    const selectedCurrency = getSelectedCurrency();
    
    // 如果图表已存在，销毁它
    if (btcPriceChart) {
        btcPriceChart.destroy();
    }
    
    // 创建新图表
    btcPriceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: `BTC价格(${selectedCurrency})`,
                    data: data.btcPriceData,
                    backgroundColor: 'rgba(255, 159, 64, 0.2)',
                    borderColor: 'rgba(255, 159, 64, 1)',
                    borderWidth: 2,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: `价格(${selectedCurrency})`
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '日期'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw.toFixed(2)}`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * 更新累计BTC持有量图
 * @param {Object} data 图表数据
 */
function updateBtcAmountChart(data) {
    const ctx = document.getElementById('btcAmountChart').getContext('2d');
    
    // 如果图表已存在，销毁它
    if (btcAmountChart) {
        btcAmountChart.destroy();
    }
    
    // 创建新图表
    btcAmountChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: '累计BTC(数量)',
                    data: data.btcAmountData,
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    borderColor: 'rgba(153, 102, 255, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'BTC数量'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '日期'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw.toFixed(8)}`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * 更新收益率变化图
 * @param {Object} data 图表数据
 */
function updateProfitRateChart(data) {
    const ctx = document.getElementById('profitRateChart').getContext('2d');
    
    // 如果图表已存在，销毁它
    if (profitRateChart) {
        profitRateChart.destroy();
    }
    
    // 获取正负收益的不同颜色
    const backgroundColors = data.profitRateData.map(value => 
        value >= 0 ? 'rgba(75, 192, 192, 0.2)' : 'rgba(255, 99, 132, 0.2)'
    );
    const borderColors = data.profitRateData.map(value => 
        value >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)'
    );
    
    // 创建新图表
    profitRateChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: '收益率(%)',
                    data: data.profitRateData,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    title: {
                        display: true,
                        text: '收益率(%)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '日期'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw.toFixed(2)}%`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * 清除所有图表
 */
function clearAllCharts() {
    if (investmentValueChart) {
        investmentValueChart.destroy();
        investmentValueChart = null;
    }
    
    if (btcPriceChart) {
        btcPriceChart.destroy();
        btcPriceChart = null;
    }
    
    if (btcAmountChart) {
        btcAmountChart.destroy();
        btcAmountChart = null;
    }
    
    if (profitRateChart) {
        profitRateChart.destroy();
        profitRateChart = null;
    }
}

// 导出模块接口
export {
    initCharts,
    updateAllCharts,
    clearAllCharts
}; 