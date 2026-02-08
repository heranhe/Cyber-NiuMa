-- 数据库迁移脚本:为 deliveries 表添加 worker_name 字段
-- 执行日期: 2026-02-08

-- 添加 worker_name 字段(如果不存在)
ALTER TABLE deliveries 
ADD COLUMN IF NOT EXISTS worker_name TEXT;

-- 说明:
-- 此字段用于存储交付者的用户名,方便在前端直接显示
-- 对于已有的交付记录,worker_name 将为 NULL,
-- 后端代码会根据 worker_id 自动查找对应的用户信息进行填充
