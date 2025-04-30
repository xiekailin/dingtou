-- 创建数据库
CREATE DATABASE IF NOT EXISTS bitcoininvestment CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 使用数据库
USE bitcoininvestment;

-- 创建用户表
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
);

-- 创建投资记录表
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
);

-- 创建用户设置表
CREATE TABLE IF NOT EXISTS user_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  setting_key VARCHAR(50) NOT NULL,
  setting_value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (user_id, setting_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 创建用户（如果需要）
-- CREATE USER 'btcuser'@'%' IDENTIFIED BY 'secure_password';
-- GRANT ALL PRIVILEGES ON bitcoininvestment.* TO 'btcuser'@'%';
-- FLUSH PRIVILEGES;

-- 添加说明注释
/*
  表结构说明:
  - users: 用户表
    - id: 自增主键
    - username: 用户名（唯一）
    - password: 密码（加密存储）
    - email: 电子邮件（唯一，可选）
    - created_at: 用户创建时间
    - updated_at: 用户信息更新时间
    - last_login: 最后登录时间
  
  - investment_records: 投资记录表
    - id: 自增主键
    - uuid: 记录唯一标识
    - user_id: 用户ID（外键关联users表）
    - date: 投资日期和时间
    - amount: 投资金额，精度到8位小数
    - btc_price: 投资时的BTC价格，精度到2位小数
    - note: 备注信息
    - currency: 货币类型，默认USD
    - created_at: 记录创建时间
    - updated_at: 记录更新时间
    
  - user_settings: 用户设置表
    - id: 自增主键
    - user_id: 用户ID（外键关联users表）
    - setting_key: 设置项名称
    - setting_value: 设置项值
    - created_at: 设置创建时间
    - updated_at: 设置更新时间
  
  使用说明:
  1. 运行此SQL脚本创建数据库和表结构
  2. 如需自定义用户，取消相关注释并修改用户名和密码
  3. 在应用配置中使用对应的数据库连接信息
*/ 

-- 迁移数据的SQL（从旧表结构迁移到新结构）
-- 1. 创建默认管理员用户
INSERT INTO users (username, password, email) 
VALUES ('admin', '$2b$10$J5VuAIvLxSYDqHg5Vr5zEe9YVEJjSZ0zj3LW2rs4aWj0yDCY1GjYG', 'admin@example.com');

-- 2. 将旧表中的记录迁移到新表，关联到默认管理员用户
-- 此SQL适用于从旧版本升级，确保旧表存在且有数据
INSERT INTO investment_records (uuid, user_id, date, amount, btc_price, note, currency)
SELECT 
  COALESCE(uuid, UUID()), -- 使用现有UUID或生成新的
  1, -- 默认关联到ID为1的管理员用户
  date,
  amount,
  btc_price,
  note,
  currency
FROM (
  SELECT * FROM information_schema.tables 
  WHERE table_schema = DATABASE() AND table_name = 'investment_records_old'
) AS table_check
JOIN (
  SELECT uuid, date, amount, btc_price, note, currency
  FROM investment_records_old
) AS old_records
WHERE table_check.TABLE_NAME IS NOT NULL; 