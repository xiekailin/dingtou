const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');

// 尝试加载.env配置，但不要中断如果不存在
try {
  require('dotenv').config();
} catch (error) {
  console.log('没有找到.env文件，使用默认配置');
}

const app = express();
const PORT = process.env.PORT || 3000;

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

// 创建数据库连接池
const pool = mysql.createPool(dbConfig);

// 初始化数据库
async function initDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // 创建表（如果不存在）
    await connection.query(`
      CREATE TABLE IF NOT EXISTS investment_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uuid VARCHAR(36) NOT NULL,
        date DATETIME NOT NULL,
        amount DECIMAL(15, 8) NOT NULL,
        btc_price DECIMAL(15, 2) NOT NULL,
        note TEXT,
        currency VARCHAR(5) NOT NULL DEFAULT 'USD',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY (date),
        UNIQUE KEY (uuid)
      )
    `);
    
    connection.release();
    console.log('数据库初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error);
  }
}

// 测试数据库连接
app.post('/api/testConnection', async (req, res) => {
  const config = req.body;
  
  try {
    // 尝试创建一个临时连接
    const tempPool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database
    });
    
    const connection = await tempPool.getConnection();
    connection.release();
    
    console.log('数据库连接测试成功:', config.host);
    res.json({ success: true, message: '连接成功' });
  } catch (error) {
    console.error('数据库连接测试失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 保存单条记录
app.post('/api/saveRecord', async (req, res) => {
  const { record } = req.body;
  
  console.log('收到保存单条记录请求:', {
    date: record.date,
    amount: record.amount,
    btcPrice: record.btcPrice,
    note: record.note ? '有备注' : '无备注',
    currency: record.currency || 'USD'
  });
  
  // 验证记录
  if (!record || !record.date || isNaN(parseFloat(record.amount)) || isNaN(parseFloat(record.btcPrice))) {
    return res.status(400).json({ 
      success: false, 
      error: '无效的记录格式，缺少必要字段或格式错误' 
    });
  }
  
  try {
    const connection = await pool.getConnection();
    
    // 处理日期格式 - 确保它是MySQL兼容的格式
    let formattedDate;
    if (record.date.includes('T')) {
      // 如果是ISO格式 (2023-04-29T15:30:00)，转换为MySQL格式 (2023-04-29 15:30:00)
      formattedDate = record.date.replace('T', ' ');
    } else {
      // 已经是MySQL格式或其他格式，保持原样
      formattedDate = record.date;
    }
    
    console.log('处理后的日期格式:', formattedDate);
    
    // 生成UUID作为唯一标识
    const uuid = record.uuid || generateUUID();
    
    // 先检查是否存在同一日期的记录（避免重复）
    const [existing] = await connection.query(
      'SELECT COUNT(*) AS count FROM investment_records WHERE date = ?', 
      [formattedDate]
    );
    
    console.log('检查现有记录:', existing[0].count > 0 ? '找到相同日期记录' : '未找到相同记录');
    
    let result;
    if (existing[0].count > 0) {
      // 如果存在则更新
      console.log('找到已存在的相同日期记录，执行更新操作');
      [result] = await connection.query(
        'UPDATE investment_records SET amount = ?, btc_price = ?, note = ?, currency = ?, uuid = ? WHERE date = ?',
        [
          parseFloat(record.amount), 
          parseFloat(record.btcPrice), 
          record.note || '', 
          record.currency || 'USD',
          uuid,
          formattedDate
        ]
      );
      console.log('记录更新成功, 影响行数:', result.affectedRows);
    } else {
      // 不存在则插入
      console.log('创建新记录, SQL参数:', [
        uuid,
        formattedDate, 
        parseFloat(record.amount), 
        parseFloat(record.btcPrice), 
        record.note || '', 
        record.currency || 'USD'
      ]);
      
      [result] = await connection.query(
        'INSERT INTO investment_records (uuid, date, amount, btc_price, note, currency) VALUES (?, ?, ?, ?, ?, ?)',
        [
          uuid,
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
    const [checkResult] = await connection.query('SELECT COUNT(*) as count FROM investment_records');
    console.log('当前表中记录数量:', checkResult[0].count);
    
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

// 生成UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 保存多条记录（清空后全部替换）
app.post('/api/saveRecords', async (req, res) => {
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
      // 清空表
      await connection.query('TRUNCATE TABLE investment_records');
      console.log('表已清空');
      
      // 批量插入记录
      if (records.length > 0) {
        // 检查记录格式
        let hasFormatError = false;
        let errorDetails = [];
        
        const values = records.map((r, i) => {
          if (!r.date || isNaN(parseFloat(r.amount)) || isNaN(parseFloat(r.btcPrice))) {
            console.error(`记录 #${i} 格式无效:`, r);
            hasFormatError = true;
            errorDetails.push(`记录 #${i}: 缺少必要字段或格式不正确`);
            return null;
          }
          
          // 处理日期格式
          let formattedDate = r.date;
          if (formattedDate.includes('T')) {
            formattedDate = formattedDate.replace('T', ' ');
          }
          
          // 确保每条记录都有UUID
          const uuid = r.uuid || generateUUID();
          
          return [
            uuid,
            formattedDate, 
            parseFloat(r.amount), 
            parseFloat(r.btcPrice), 
            r.note || '', 
            r.currency || 'USD'
          ];
        }).filter(v => v !== null);
        
        if (hasFormatError) {
          throw new Error('部分记录格式无效，请检查日期、金额和价格字段\n' + errorDetails.join('\n'));
        }
        
        // 如果记录太多，分批插入
        const BATCH_SIZE = 100; // 每批插入的记录数
        let insertedCount = 0;
        
        for (let i = 0; i < values.length; i += BATCH_SIZE) {
          const batch = values.slice(i, i + BATCH_SIZE);
          console.log(`准备插入第${i/BATCH_SIZE + 1}批，共${batch.length}条记录`);
          
          const insertSql = 'INSERT INTO investment_records (uuid, date, amount, btc_price, note, currency) VALUES ?';
          const [result] = await connection.query(insertSql, [batch]);
          
          insertedCount += result.affectedRows;
          console.log(`批次${i/BATCH_SIZE + 1}插入成功，累计${insertedCount}条记录`);
        }
      }
      
      // 提交事务
      await connection.commit();
      console.log('事务已提交');
      
      // 验证插入
      const [result] = await connection.query('SELECT COUNT(*) as count FROM investment_records');
      const actualCount = result[0].count;
      console.log(`数据库中现有 ${actualCount} 条记录`);
      
      connection.release();
      return res.json({ 
        success: true, 
        message: `成功保存 ${records.length} 条记录`,
        expectedCount: records.length,
        actualCount: actualCount
      });
    } catch (error) {
      // 回滚事务
      console.error('保存记录失败，回滚事务:', error);
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('保存记录操作失败:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      details: '保存记录到数据库时发生错误'
    });
  }
});

// 获取所有记录
app.post('/api/getRecords', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    // 查询所有记录并按日期排序
    const [rows] = await connection.query(
      'SELECT uuid, date, amount, btc_price AS btcPrice, note, currency FROM investment_records ORDER BY date'
    );
    
    // 格式化日期并确保数值类型正确
    const records = rows.map(row => {
      return {
        uuid: row.uuid,
        date: formatDateTime(row.date),
        amount: parseFloat(row.amount),
        btcPrice: parseFloat(row.btcPrice),
        note: row.note || '',
        currency: row.currency || 'USD'
      };
    });
    
    console.log('已从数据库获取记录数量:', records.length);
    if (records.length > 0) {
      console.log('第一条记录示例:', records[0]);
    }
    
    connection.release();
    res.json({ success: true, records });
  } catch (error) {
    console.error('获取记录失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新记录
app.post('/api/updateRecord', async (req, res) => {
  const { originalDate, updatedRecord } = req.body;
  
  try {
    const connection = await pool.getConnection();
    
    // 更新记录
    await connection.query(
      'UPDATE investment_records SET date = ?, amount = ?, btc_price = ?, note = ?, currency = ? WHERE date = ?',
      [
        updatedRecord.date, 
        updatedRecord.amount, 
        updatedRecord.btcPrice, 
        updatedRecord.note || '', 
        updatedRecord.currency || 'USD',
        originalDate
      ]
    );
    
    connection.release();
    res.json({ success: true });
  } catch (error) {
    console.error('更新记录失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除记录
app.post('/api/deleteRecord', async (req, res) => {
  const { recordDate } = req.body;
  
  console.log('收到删除记录请求，日期:', recordDate);
  
  if (!recordDate) {
    return res.status(400).json({ success: false, error: '未提供记录日期' });
  }
  
  try {
    const connection = await pool.getConnection();
    
    // 处理日期格式 - 确保它是MySQL兼容的格式
    let formattedDate;
    if (recordDate.includes('T')) {
      // 如果是ISO格式 (2023-04-29T15:30:00)，转换为MySQL格式 (2023-04-29 15:30:00)
      formattedDate = recordDate.replace('T', ' ');
    } else {
      // 已经是MySQL格式或其他格式，保持原样
      formattedDate = recordDate;
    }
    
    console.log('处理后的日期格式用于删除:', formattedDate);
    
    // 先检查记录是否存在
    const [checkResult] = await connection.query(
      'SELECT COUNT(*) as count FROM investment_records WHERE date = ?', 
      [formattedDate]
    );
    
    console.log('检查要删除的记录:', checkResult[0].count > 0 ? '记录存在' : '记录不存在');
    
    if (checkResult[0].count === 0) {
      // 尝试使用其他格式再次检查
      const dateObj = new Date(recordDate);
      if (!isNaN(dateObj.getTime())) {
        // 有效日期，尝试不同格式
        const mysqlFormat = dateObj.toISOString().slice(0, 19).replace('T', ' ');
        console.log('尝试另一种日期格式:', mysqlFormat);
        
        const [retryCheck] = await connection.query(
          'SELECT COUNT(*) as count FROM investment_records WHERE date = ?', 
          [mysqlFormat]
        );
        
        if (retryCheck[0].count > 0) {
          console.log('使用格式化后的日期找到了记录');
          formattedDate = mysqlFormat;
        } else {
          connection.release();
          return res.status(404).json({ 
            success: false, 
            error: '未找到指定日期的记录',
            date: recordDate,
            formattedDate: formattedDate,
            mysqlFormat: mysqlFormat
          });
        }
      } else {
        connection.release();
        return res.status(404).json({ 
          success: false, 
          error: '未找到指定日期的记录',
          date: recordDate,
          formattedDate: formattedDate
        });
      }
    }
    
    // 删除记录
    const [result] = await connection.query(
      'DELETE FROM investment_records WHERE date = ?', 
      [formattedDate]
    );
    
    console.log('删除记录结果:', result);
    
    // 检查表中的记录
    const [countCheck] = await connection.query('SELECT COUNT(*) as count FROM investment_records');
    console.log('删除后表中记录数量:', countCheck[0].count);
    
    connection.release();
    return res.json({ 
      success: true, 
      message: '记录已删除',
      affectedRows: result.affectedRows,
      remainingRecords: countCheck[0].count
    });
  } catch (error) {
    console.error('删除记录失败:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    });
  }
});

// 新增 - 检查单条记录是否存在
app.post('/api/checkRecord', async (req, res) => {
  const { date } = req.body;
  
  if (!date) {
    return res.status(400).json({ success: false, error: '未提供日期' });
  }
  
  try {
    const connection = await pool.getConnection();
    
    const [result] = await connection.query(
      'SELECT * FROM investment_records WHERE date = ?', 
      [date]
    );
    
    connection.release();
    
    if (result.length > 0) {
      return res.json({ 
        success: true, 
        exists: true, 
        record: {
          date: formatDateTime(result[0].date),
          amount: parseFloat(result[0].amount),
          btcPrice: parseFloat(result[0].btc_price),
          note: result[0].note,
          currency: result[0].currency
        }
      });
    } else {
      return res.json({ success: true, exists: false });
    }
  } catch (error) {
    console.error('检查记录失败:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 清空所有记录
app.post('/api/clearRecords', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    // 清空表
    await connection.query('TRUNCATE TABLE investment_records');
    
    connection.release();
    res.json({ success: true });
  } catch (error) {
    console.error('清空记录失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 格式化日期时间为HTML datetime-local格式
function formatDateTime(dateObj) {
  const date = new Date(dateObj);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// 启动服务器
app.listen(PORT, async () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  await initDatabase();
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('未处理的Promise拒绝:', error);
}); 