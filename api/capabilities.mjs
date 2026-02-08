import { kv } from '@vercel/kv';

/**
 * AI 能力管理 API - 基于 Vercel KV 存储
 * 
 * 支持的操作:
 * GET /api/capabilities?userId=xxx - 获取用户的所有 AI 能力
 * POST /api/capabilities - 添加或更新 AI 能力
 * DELETE /api/capabilities?userId=xxx&capabilityId=xxx - 删除能力
 */
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            const { userId } = req.query;

            if (!userId) {
                return res.status(400).json({ error: '缺少 userId 参数' });
            }

            // 从 KV 读取用户的能力列表
            const capabilities = await kv.get(`capabilities:${userId}`);

            return res.status(200).json({
                capabilities: capabilities || []
            });
        }

        if (req.method === 'POST') {
            const { userId, capability } = req.body;

            if (!userId || !capability) {
                return res.status(400).json({ error: '缺少必要参数' });
            }

            // 获取现有能力列表
            let capabilities = await kv.get(`capabilities:${userId}`) || [];

            // 检查是否是更新操作
            const existingIndex = capabilities.findIndex(c => c.id === capability.id);

            if (existingIndex >= 0) {
                // 更新现有能力
                capabilities[existingIndex] = capability;
            } else {
                // 添加新能力
                capability.id = capability.id || Date.now().toString();
                capabilities.push(capability);
            }

            // 保存到 KV
            await kv.set(`capabilities:${userId}`, capabilities);

            return res.status(200).json({
                success: true,
                capability
            });
        }

        if (req.method === 'DELETE') {
            const { userId, capabilityId } = req.query;

            if (!userId || !capabilityId) {
                return res.status(400).json({ error: '缺少必要参数' });
            }

            // 获取现有能力列表
            let capabilities = await kv.get(`capabilities:${userId}`) || [];

            // 过滤掉要删除的能力
            capabilities = capabilities.filter(c => c.id !== capabilityId);

            // 保存到 KV
            await kv.set(`capabilities:${userId}`, capabilities);

            return res.status(200).json({
                success: true,
                message: '能力删除成功'
            });
        }

        return res.status(405).json({ error: '不支持的请求方法' });
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({
            error: '服务器错误',
            details: error.message
        });
    }
}
