-- 创建数据库
CREATE DATABASE IF NOT EXISTS bitcoininvestment CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 使用数据库
USE bitcoininvestment;

-- 创建投资记录表
CREATE TABLE IF NOT EXISTS investment_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date DATETIME NOT NULL,
  amount DECIMAL(15, 8) NOT NULL,
  btc_price DECIMAL(15, 2) NOT NULL,
  note TEXT,
  currency VARCHAR(5) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (date)
);

-- 创建用户（如果需要）
-- CREATE USER 'btcuser'@'%' IDENTIFIED BY 'secure_password';
-- GRANT ALL PRIVILEGES ON bitcoininvestment.* TO 'btcuser'@'%';
-- FLUSH PRIVILEGES;

-- 添加说明注释
/*
  表结构说明:
  - id: 自增主键
  - date: 投资日期和时间（唯一索引）
  - amount: 投资金额，精度到8位小数
  - btc_price: 投资时的BTC价格，精度到2位小数
  - note: 备注信息
  - currency: 货币类型，默认USD
  - created_at: 记录创建时间
  - updated_at: 记录更新时间
  
  使用说明:
  1. 运行此SQL脚本创建数据库和表结构
  2. 如需自定义用户，取消相关注释并修改用户名和密码
  3. 在应用配置中使用对应的数据库连接信息
*/ 