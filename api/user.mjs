import { kv } from '@vercel/kv';

/**
 * 用户数据 API - 基于 Vercel KV 存储
 * 
 * 支持的操作:
 * GET /api/user?userId=xxx - 获取用户数据
 * POST /api/user - 保存用户数据
 */
export default async function handler(req, res) {
    // CORS 设置
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            // 获取用户数据
            const { userId } = req.query;

            if (!userId) {
                return res.status(400).json({ error: '缺少 userId 参数' });
            }

            const userData = await kv.hgetall(`user:${userId}`);

            if (!userData || Object.keys(userData).length === 0) {
                // 返回默认数据
                return res.status(200).json({
                    username: '游客',
                    avatar: '',
                    capabilities: []
                });
            }

            // 解析 capabilities (KV 存储的是字符串)
            if (typeof userData.capabilities === 'string') {
                userData.capabilities = JSON.parse(userData.capabilities);
            }

            return res.status(200).json(userData);
        }

        if (req.method === 'POST') {
            // 保存用户数据
            const { userId, username, avatar, capabilities } = req.body;

            if (!userId) {
                return res.status(400).json({ error: '缺少 userId 参数' });
            }

            // 存储到 Vercel KV
            await kv.hset(`user:${userId}`, {
                username: username || '游客',
                avatar: avatar || '',
                capabilities: JSON.stringify(capabilities || [])
            });

            return res.status(200).json({
                success: true,
                message: '用户数据保存成功'
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
