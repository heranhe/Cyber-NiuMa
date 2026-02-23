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
  worker_name TEXT,
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

-- ===== 对话表 =====
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_id TEXT NOT NULL,
  ref_type TEXT NOT NULL DEFAULT 'skill',
  initiator_id TEXT NOT NULL,
  initiator_name TEXT NOT NULL DEFAULT '',
  initiator_avatar TEXT NOT NULL DEFAULT '',
  receiver_id TEXT NOT NULL,
  receiver_name TEXT NOT NULL DEFAULT '',
  receiver_avatar TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  last_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access on conversations" ON conversations
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_conversations_ref ON conversations(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_conversations_initiator_id ON conversations(initiator_id);
CREATE INDEX IF NOT EXISTS idx_conversations_receiver_id ON conversations(receiver_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

-- ===== 消息表 =====
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access on messages" ON messages
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
