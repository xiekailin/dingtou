const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// 尝试加载.env配置，但不要中断如果不存在
try {
  require('dotenv').config();
} catch (error) {
  console.log('没有找到.env文件，使用默认配置');
}

const app = express();
const PORT = process.env.PORT || 3000;

// JWT密钥
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST || '124.221.197.94',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_DATABASE || 'bitcoininvestment'
};

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dingtouInvestment')));

// 用户认证中间件
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    console.log('认证失败: 未提供token');
    return res.status(401).json({ success: false, error: '未提供认证Token' });
  }
  
  try {
    console.log(`尝试验证token: ${token.substring(0, 10)}...`);
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('token解码成功, userId:', decoded.userId);
    
    // 验证用户是否存在
    const connection = await pool.getConnection();
    const [users] = await connection.query('SELECT id, username, email FROM users WHERE id = ?', [decoded.userId]);
    connection.release();
    
    if (users.length === 0) {
      console.log('认证失败: 未找到用户, userId:', decoded.userId);
      return res.status(403).json({ success: false, error: '无效的用户' });
    }
    
    req.user = {
      id: users[0].id,
      username: users[0].username,
      email: users[0].email
    };
    
    console.log('认证成功, 用户:', req.user.username);
    next();
  } catch (error) {
    console.error('认证错误:', error.message);
    return res.status(403).json({ success: false, error: '无效的Token: ' + error.message });
  }
};

// 添加根路由重定向到HTML文件
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dingtouInvestment', 'index.html'));
});

// 添加诊断路由
app.get('/status', (req, res) => {
  res.json({
    status: 'running',
    config: {
      port: PORT,
      dbHost: dbConfig.host,
      staticPath: path.join(__dirname, 'dingtouInvestment')
    }
  });
});

// 用户注册
app.post('/api/register', async (req, res) => {
  const { username, password, email } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '用户名和密码是必填项' });
  }
  
  try {
    const connection = await pool.getConnection();
    
    // 检查用户名是否已存在
    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    
    if (existingUsers.length > 0) {
      connection.release();
      return res.status(409).json({ success: false, error: '用户名已存在' });
    }
    
    // 检查邮箱是否已存在（如果提供了邮箱）
    if (email) {
      const [existingEmails] = await connection.query(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );
      
      if (existingEmails.length > 0) {
        connection.release();
        return res.status(409).json({ success: false, error: '邮箱已被使用' });
      }
    }
    
    // 哈希密码
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 创建用户
    const [result] = await connection.query(
      'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
      [username, hashedPassword, email || null]
    );
    
    connection.release();
    
    // 生成JWT
    const token = jwt.sign(
      { userId: result.insertId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    return res.status(201).json({
      success: true,
      message: '用户注册成功',
      token,
      user: {
        id: result.insertId,
        username,
        email: email || null
      }
    });
  } catch (error) {
    console.error('用户注册失败:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 用户登录
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '用户名和密码是必填项' });
  }
  
  try {
    const connection = await pool.getConnection();
    
    // 查找用户
    const [users] = await connection.query(
      'SELECT id, username, email, password FROM users WHERE username = ?',
      [username]
    );
    
    if (users.length === 0) {
      connection.release();
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }
    
    const user = users[0];
    
    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      connection.release();
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }
    
    // 更新最后登录时间
    await connection.query(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    );
    
    connection.release();
    
    // 生成JWT
    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    return res.json({
      success: true,
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('用户登录失败:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 获取当前用户信息
app.get('/api/user', authenticateToken, (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
});

// 用户设置保存
app.post('/api/saveSettings', authenticateToken, async (req, res) => {
  const { settings } = req.body;
  const userId = req.user.id;
  
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ success: false, error: '无效的设置数据' });
  }
  
  try {
    const connection = await pool.getConnection();
    
    // 开始事务
    await connection.beginTransaction();
    
    try {
      for (const [key, value] of Object.entries(settings)) {
        // 检查设置是否已存在
        const [existingSettings] = await connection.query(
          'SELECT id FROM user_settings WHERE user_id = ? AND setting_key = ?',
          [userId, key]
        );
        
        if (existingSettings.length > 0) {
          // 更新已存在的设置
          await connection.query(
            'UPDATE user_settings SET setting_value = ? WHERE user_id = ? AND setting_key = ?',
            [JSON.stringify(value), userId, key]
          );
        } else {
          // 创建新设置
          await connection.query(
            'INSERT INTO user_settings (user_id, setting_key, setting_value) VALUES (?, ?, ?)',
            [userId, key, JSON.stringify(value)]
          );
        }
      }
      
      // 提交事务
      await connection.commit();
      connection.release();
      
      return res.json({
        success: true,
        message: '设置已保存'
      });
    } catch (error) {
      // 回滚事务
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('保存设置失败:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 获取用户设置
app.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    // 查询用户设置
    const [settings] = await connection.query(
      'SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?',
      [req.user.id]
    );
    
    connection.release();
    
    // 转换为对象格式
    const settingsObj = {};
    settings.forEach(setting => {
      try {
        settingsObj[setting.setting_key] = JSON.parse(setting.setting_value);
      } catch (e) {
        settingsObj[setting.setting_key] = setting.setting_value;
      }
    });
    
    return res.json({
      success: true,
      settings: settingsObj
    });
  } catch (error) {
    console.error('获取用户设置失败:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 数据库调试路由
app.get('/api/debug/records', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    // 检查表是否存在
    const [tableCheck] = await connection.query(`
      SELECT COUNT(*) as tableExists 
      FROM information_schema.tables 
      WHERE table_schema = ? AND table_name = 'investment_records'
    `, [dbConfig.database]);
    
    if (!tableCheck[0].tableExists) {
      connection.release();
      return res.json({ success: false, error: '表不存在', tables: tableCheck });
    }
    
    // 检查记录数量
    const [countResult] = await connection.query('SELECT COUNT(*) as count FROM investment_records');
    const recordCount = countResult[0].count;
    
    // 获取前10条记录
    const [records] = await connection.query(
      'SELECT * FROM investment_records ORDER BY date LIMIT 10'
    );
    
    // 检查数据库状态
    const [dbStatus] = await connection.query('SHOW VARIABLES LIKE "%version%"');
    
    connection.release();
    
    res.json({
      success: true,
      dbStatus,
      tableExists: true,
      recordCount,
      sampleRecords: records,
      config: {
        host: dbConfig.host,
        database: dbConfig.database
      }
    });
  } catch (error) {
    console.error('调试查询失败:', error);
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
});

// 数据库修复路由
app.get('/api/debug/fix-db', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    // 检查表是否存在
    const [tableCheck] = await connection.query(`
      SELECT COUNT(*) as tableExists 
      FROM information_schema.tables 
      WHERE table_schema = ? AND table_name = 'investment_records'
    `, [dbConfig.database]);
    
    let result = {
      tableCheck: tableCheck[0],
      tableCreated: false,
      recordCount: 0,
      fieldCheck: {}
    };
    
    // 如果表不存在，创建表
    if (!tableCheck[0].tableExists) {
      await connection.query(`
        CREATE TABLE investment_records (
          id INT AUTO_INCREMENT PRIMARY KEY,
          date DATETIME NOT NULL,
          amount DECIMAL(15, 8) NOT NULL,
          btc_price DECIMAL(15, 2) NOT NULL,
          note TEXT,
          currency VARCHAR(5) NOT NULL DEFAULT 'USD',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY (date)
        )
      `);
      result.tableCreated = true;
    }
    
    // 检查表结构
    const [fields] = await connection.query(`
      SHOW COLUMNS FROM investment_records
    `);
    
    result.fieldCheck = {};
    fields.forEach(field => {
      result.fieldCheck[field.Field] = {
        type: field.Type,
        nullable: field.Null === 'YES',
        key: field.Key,
        default: field.Default
      };
    });
    
    // 检查记录数量
    const [countResult] = await connection.query('SELECT COUNT(*) as count FROM investment_records');
    result.recordCount = countResult[0].count;
    
    // 如果有记录，获取一条示例
    if (result.recordCount > 0) {
      const [sampleRecord] = await connection.query('SELECT * FROM investment_records LIMIT 1');
      result.sampleRecord = sampleRecord[0];
    }
    
    connection.release();
    
    return res.json({
      success: true,
      message: '数据库检查完成',
      result
    });
  } catch (error) {
    console.error('数据库检查/修复失败:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    });
  }
});

// 测试插入记录路由
app.get('/api/debug/test-insert', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    // 测试记录
    const testRecord = {
      date: new Date().toISOString().slice(0, 19).replace('T', ' '),
      amount: 100.00,
      btc_price: 50000.00,
      note: '测试记录',
      currency: 'USD'
    };
    
    // 直接插入测试记录
    const [result] = await connection.query(
      'INSERT INTO investment_records (date, amount, btc_price, note, currency) VALUES (?, ?, ?, ?, ?)',
      [testRecord.date, testRecord.amount, testRecord.btc_price, testRecord.note, testRecord.currency]
    );
    
    connection.release();
    
    res.json({
      success: true,
      message: '测试记录插入成功',
      insertId: result.insertId,
      testRecord
    });
  } catch (error) {
    console.error('测试插入失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 手动初始化表
app.get('/api/debug/init-table', async (req, res) => {
  try {
    await initDatabase();
    res.json({ 
      success: true, 
      message: '数据库表初始化成功' 
    });
  } catch (error) {
    console.error('初始化表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 修复数据库表结构，添加UUID列
app.get('/api/debug/add-uuid-column', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    // 检查uuid列是否存在
    const [columns] = await connection.query(`
      SHOW COLUMNS FROM investment_records LIKE 'uuid'
    `);
    
    if (columns.length === 0) {
      // 如果uuid列不存在，添加它
      await connection.query(`
        ALTER TABLE investment_records 
        ADD COLUMN uuid VARCHAR(36) NOT NULL AFTER id
      `);
      
      // 为现有记录生成UUID
      await connection.query(`
        UPDATE investment_records SET uuid = UUID()
      `);
      
      // 添加唯一索引
      await connection.query(`
        ALTER TABLE investment_records 
        ADD UNIQUE KEY (uuid)
      `);
      
      connection.release();
      return res.json({ 
        success: true, 
        message: '成功添加UUID列并为现有记录生成UUID' 
      });
    } else {
      connection.release();
      return res.json({ 
        success: true, 
        message: 'UUID列已存在，无需修改' 
      });
    }
  } catch (error) {
    console.error('修复数据库表结构失败:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    });
  }
});

// 测试数据库连接
app.post('/api/testConnection', async (req, res) => {
  const { host, port, database, user, password } = req.body;
  
  // 创建测试连接配置
  const testConfig = {
    host: host || dbConfig.host,
    port: port || dbConfig.port,
    user: user || dbConfig.user,
    password: password || dbConfig.password,
    database: database || dbConfig.database
  };
  
  try {
    // 创建临时连接进行测试
    const testConnection = await mysql.createConnection(testConfig);
    await testConnection.connect();
    
    // 尝试简单查询
    await testConnection.query('SELECT 1');
    
    // 关闭连接
    await testConnection.end();
    
    return res.json({
      success: true,
      message: '数据库连接成功'
    });
  } catch (error) {
    console.error('数据库连接测试失败:', error);
    return res.status(500).json({
      success: false, 
      error: error.message || '连接失败'
    });
  }
});

// 创建数据库连接池
const pool = mysql.createPool(dbConfig);

// 初始化数据库
async function initDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // 创建用户表（如果不存在）
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login DATETIME,
        UNIQUE KEY (username),
        UNIQUE KEY (email)
      )
    `);
    
    // 创建投资记录表（如果不存在）
    await connection.query(`
      CREATE TABLE IF NOT EXISTS investment_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uuid VARCHAR(36) NOT NULL,
        user_id INT NOT NULL,
        date DATETIME NOT NULL,
        amount DECIMAL(15, 8) NOT NULL,
        btc_price DECIMAL(15, 2) NOT NULL,
        note TEXT,
        currency VARCHAR(5) NOT NULL DEFAULT 'USD',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY (uuid),
        UNIQUE KEY (user_id, date),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // 创建用户设置表（如果不存在）
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        setting_key VARCHAR(50) NOT NULL,
        setting_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY (user_id, setting_key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    connection.release();
    console.log('数据库初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error);
  }
}

// 生成UUID
function generateUUID() {
  return uuidv4();
}

// 获取记录API
app.get('/api/getRecords', authenticateToken, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    const [records] = await connection.query(
      'SELECT * FROM investment_records WHERE user_id = ? ORDER BY date',
      [req.user.id]
    );
    
    connection.release();
    
    return res.json({
      success: true,
      records: records
    });
  } catch (error) {
    console.error('获取记录失败:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 保存单条记录
app.post('/api/saveRecord', authenticateToken, async (req, res) => {
  const { record } = req.body;

  if (!record || !record.date || isNaN(record.amount) || isNaN(record.btcPrice)) {
    return res.status(400).json({ success: false, error: '无效的记录数据' });
  }
  
  // 格式化日期
  let formattedDate;
  try {
    formattedDate = formatDateTime(new Date(record.date));
  } catch (error) {
    return res.status(400).json({ success: false, error: '无效的日期格式' });
  }
  
  // 生成UUID（如果不存在）
  const uuid = record.uuid || generateUUID();
  
  try {
    const connection = await pool.getConnection();
    
    // 检查是否存在相同日期的记录（对于同一用户）
    const [existing] = await connection.query(
      'SELECT COUNT(*) as count FROM investment_records WHERE user_id = ? AND date = ?',
      [req.user.id, formattedDate]
    );
    
    let result;
    
    if (existing[0].count > 0) {
      // 如果存在则更新
      console.log('找到已存在的相同日期记录，执行更新操作');
      [result] = await connection.query(
        'UPDATE investment_records SET amount = ?, btc_price = ?, note = ?, currency = ?, uuid = ? WHERE user_id = ? AND date = ?',
        [
          parseFloat(record.amount), 
          parseFloat(record.btcPrice), 
          record.note || '', 
          record.currency || 'USD',
          uuid,
          req.user.id,
          formattedDate
        ]
      );
      console.log('记录更新成功, 影响行数:', result.affectedRows);
    } else {
      // 不存在则插入
      console.log('创建新记录, SQL参数:', [
        uuid,
        req.user.id,
        formattedDate, 
        parseFloat(record.amount), 
        parseFloat(record.btcPrice), 
        record.note || '', 
        record.currency || 'USD'
      ]);
      
      [result] = await connection.query(
        'INSERT INTO investment_records (uuid, user_id, date, amount, btc_price, note, currency) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          uuid,
          req.user.id,
          formattedDate, 
          parseFloat(record.amount), 
          parseFloat(record.btcPrice), 
          record.note || '', 
          record.currency || 'USD'
        ]
      );
      console.log('记录插入成功, ID:', result.insertId);
    }
    
    // 检查表中的记录
    const [checkResult] = await connection.query('SELECT COUNT(*) as count FROM investment_records WHERE user_id = ?', [req.user.id]);
    console.log('当前用户表中记录数量:', checkResult[0].count);
    
    connection.release();
    return res.json({ 
      success: true, 
      message: existing[0].count > 0 ? '记录已更新' : '记录已创建',
      affectedRows: result.affectedRows || 0,
      insertId: result.insertId || null,
      uuid: uuid
    });
  } catch (error) {
    console.error('保存记录失败:', error);
    return res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
});

// 删除记录
app.delete('/api/deleteRecord/:uuid', authenticateToken, async (req, res) => {
  const { uuid } = req.params;
  
  console.log(`收到删除记录请求, UUID: ${uuid}, 用户: ${req.user.username}(ID:${req.user.id})`);
  
  if (!uuid) {
    console.log('删除记录失败: 未提供UUID');
    return res.status(400).json({ success: false, error: '记录UUID是必需的' });
  }
  
  try {
    const connection = await pool.getConnection();
    
    // 查询记录是否存在且属于当前用户
    const [records] = await connection.query(
      'SELECT id FROM investment_records WHERE uuid = ? AND user_id = ?',
      [uuid, req.user.id]
    );
    
    if (records.length === 0) {
      console.log(`删除记录失败: 未找到记录或不属于当前用户, UUID: ${uuid}, 用户ID: ${req.user.id}`);
      connection.release();
      return res.status(404).json({ success: false, error: '记录不存在或不属于当前用户' });
    }
    
    console.log(`找到要删除的记录, ID: ${records[0].id}, UUID: ${uuid}`);
    
    // 删除记录
    const [result] = await connection.query(
      'DELETE FROM investment_records WHERE uuid = ? AND user_id = ?',
      [uuid, req.user.id]
    );
    
    connection.release();
    
    console.log(`记录删除成功, UUID: ${uuid}, 影响行数: ${result.affectedRows}`);
    
    return res.json({
      success: true,
      message: '记录已成功删除',
      affectedRows: result.affectedRows
    });
  } catch (error) {
    console.error('删除记录失败:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 保存多条记录（清空后全部替换）
app.post('/api/saveRecords', authenticateToken, async (req, res) => {
  const { records } = req.body;
  
  // 添加请求体日志（但移除敏感信息）
  console.log('收到saveRecords请求，记录数量:', records ? records.length : 0);
  
  if (!records || !Array.isArray(records)) {
    return res.status(400).json({ 
      success: false, 
      error: '无效的记录格式，期望一个数组' 
    });
  }
  
  try {
    const connection = await pool.getConnection();
    console.log('数据库连接成功，开始处理记录...');
    
    // 开始事务
    await connection.beginTransaction();
    console.log('开始数据库事务');
    
    try {
      // 清空当前用户的记录
      await connection.query('DELETE FROM investment_records WHERE user_id = ?', [req.user.id]);
      console.log('用户记录已清空');
      
      // 如果没有记录要保存，直接提交事务
      if (records.length === 0) {
        await connection.commit();
        connection.release();
        return res.json({ 
          success: true, 
          message: '所有记录已删除',
          insertedCount: 0
        });
      }
      
      // 准备批量插入记录
      const values = records.map(record => [
        record.uuid || generateUUID(),
        req.user.id,
        formatDateTime(new Date(record.date)),
        parseFloat(record.amount),
        parseFloat(record.btcPrice),
        record.note || '',
        record.currency || 'USD'
      ]);
      
      // 批量插入记录
      const [result] = await connection.query(
        'INSERT INTO investment_records (uuid, user_id, date, amount, btc_price, note, currency) VALUES ?',
        [values]
      );
      
      // 提交事务
      await connection.commit();
      
      console.log('记录已保存, 影响行数:', result.affectedRows);
      
      connection.release();
      return res.json({ 
        success: true, 
        message: '所有记录已更新',
        insertedCount: result.affectedRows
      });
    } catch (error) {
      // 回滚事务
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('保存记录失败:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    });
  }
});

// 格式化日期时间为MySQL格式
function formatDateTime(dateObj) {
  if (!(dateObj instanceof Date)) {
    try {
      dateObj = new Date(dateObj);
    } catch (error) {
      console.error('无效的日期格式:', dateObj);
      throw new Error('无效的日期格式');
    }
  }
  
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务已启动在端口 ${PORT}`);
  initDatabase().catch(error => {
    console.error('初始化数据库时出错:', error);
  });
}); 