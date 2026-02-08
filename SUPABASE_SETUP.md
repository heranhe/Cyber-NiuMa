# Supabase 配置指南

## 📋 概述

本项目使用 **Supabase**（PostgreSQL 数据库）存储用户数据，包括：
- 用户 AI 能力列表
- 用户配置信息

> ⚠️ **迁移说明**：已从 Vercel KV (Redis) 迁移到 Supabase，因为 Supabase 提供 **500MB 免费存储**（vs Redis 30MB）。

## 🚀 快速配置步骤

### 1. 在 Vercel Storage 中创建 Supabase 项目

1. 访问 Vercel 项目仪表板
2. 进入 **Storage** 标签
3. 点击 **Supabase** → **Create**
4. 选择免费套餐
5. 连接到您的项目

### 2. 环境变量配置

Vercel 会自动添加以下环境变量：
```
SUPABASE_URL
SUPABASE_KEY (或 SUPABASE_ANON_KEY)
```

### 3. 创建数据库表

在 Supabase Dashboard 中执行以下 SQL：

```sql
CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE kv_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON kv_store
  FOR ALL USING (true) WITH CHECK (true);
```

### 4. 重新部署

创建完成后，触发一次重新部署即可生效。

## 📦 数据结构说明

### 键值存储模式

使用 `kv_store` 表存储 JSON 数据：

| Key | 说明 |
|-----|------|
| `abilities` | 所有用户的 AI 能力配置 |
| `profiles` | 用户配置信息（未来扩展） |

### abilities 数据结构

```json
{
  "userId1": [
    {
      "id": "ability_xxx",
      "name": "视觉美化大师",
      "icon": "🎨",
      "description": "专业处理人像光影",
      "prompt": "..."
    }
  ],
  "userId2": [...]
}
```

## 🔍 故障排查

### 问题1：保存后刷新数据丢失

**可能原因：**
- Supabase 未正确配置
- 环境变量缺失
- 数据库表未创建

**解决方案：**
1. 检查 Vercel 环境变量中是否有 `SUPABASE_URL` 和 `SUPABASE_KEY`
2. 在 Supabase SQL Editor 中执行建表语句
3. 重新部署项目

### 问题2：RLS 策略阻止访问

**解决方案：** 确保执行了以下 SQL：
```sql
ALTER TABLE kv_store ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON kv_store
  FOR ALL USING (true) WITH CHECK (true);
```

## 📝 免费额度

| 资源 | 限制 |
|------|------|
| 数据库存储 | 500 MB |
| 带宽 | 5 GB |
| API 请求 | 无限制 |
| MAU | 50K |

## 📚 相关文档

- [Supabase 官方文档](https://supabase.com/docs)
- [@supabase/supabase-js NPM 包](https://www.npmjs.com/package/@supabase/supabase-js)

---

**配置完成后，您的数据将持久化存储在 Supabase 中！** 🎉
