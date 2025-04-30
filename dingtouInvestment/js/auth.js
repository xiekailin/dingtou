/**
 * 认证管理模块
 * 负责用户登录、注册、验证等功能
 */
import * as DbManager from './dbManager.js';

/**
 * 检查用户登录状态，如果未登录则跳转到登录页面
 * @returns {boolean} 是否已登录
 */
function checkAuthState() {
    // 加载配置（同时会加载认证信息）
    const config = DbManager.loadDbConfig();
    
    if (!config.isAuthenticated) {
        // 未登录，跳转到登录页
        window.location.href = 'login.html';
        return false;
    }
    
    // 用户已登录，更新用户信息显示
    updateUserDisplay(config.user);
    return true;
}

/**
 * 更新用户信息显示
 * @param {Object} user 用户对象
 */
function updateUserDisplay(user) {
    const userDisplayElement = document.getElementById('currentUsername');
    if (userDisplayElement && user) {
        userDisplayElement.textContent = user.username || '用户';
    }
}

/**
 * 处理用户登出
 */
function handleLogout() {
    DbManager.logoutUser();
    window.location.href = 'login.html';
}

/**
 * 初始化认证相关事件监听
 */
function initAuthListeners() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

/**
 * 获取当前登录用户
 * @returns {Object|null} 当前用户对象或null
 */
function getCurrentUser() {
    return DbManager.getCurrentUser();
}

/**
 * 初始化认证系统
 */
function initAuth() {
    if (checkAuthState()) {
        initAuthListeners();
    }
}

// 导出模块接口
export {
    initAuth,
    checkAuthState,
    updateUserDisplay,
    handleLogout,
    getCurrentUser
}; 