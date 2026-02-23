-- Supabase 数据库表结构
-- 用于 AI 劳务市场应用

-- kv_store 表：键值存储，用于保存 JSON 数据（如 abilities、profiles 等）
CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用行级安全策略（RLS）
ALTER TABLE kv_store ENABLE ROW LEVEL SECURITY;

-- 创建策略：允许匿名用户读写（适用于服务端访问）
CREATE POLICY "Allow all access" ON kv_store
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 创建索引以加速查询
CREATE INDEX IF NOT EXISTS idx_kv_store_key ON kv_store(key);

-- ===== 交付历史表 =====
-- deliveries 表：存储 AI 交付记录
CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  ability_id TEXT,
  ability_name TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

-- 允许服务端完全访问
CREATE POLICY "Allow all access on deliveries" ON deliveries
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_deliveries_task_id ON deliveries(task_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_worker_id ON deliveries(worker_id);

