import http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Supabase 客户端初始化（仅在有配置时创建）
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const WEB_DIR = path.join(__dirname, 'web');
const IS_VERCEL = Boolean(process.env.VERCEL);

// ── API 调用日志 ──────────────────────────────────────────────
function apiLog(tag, data) {
  const line = `[${new Date().toISOString()}] [${tag}] ${typeof data === 'string' ? data : JSON.stringify(data)}`;
  console.log(line);
}
// ─────────────────────────────────────────────────────────────
const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'ai-labor-market') : path.join(__dirname, 'data');
const LEGACY_UPLOADS_DIR = path.join(WEB_DIR, 'uploads');
const UPLOADS_DIR = IS_VERCEL ? path.join(DATA_DIR, 'uploads') : LEGACY_UPLOADS_DIR;
const DATA_FILE = path.join(DATA_DIR, 'tasks.json');
const PROFILE_FILE = path.join(DATA_DIR, 'profiles.json');
const ABILITIES_FILE = path.join(DATA_DIR, 'abilities.json');
const SECONDME_BASE_URL = process.env.SECONDME_BASE_URL || 'https://app.mindos.com/gate/lab';
const SECONDME_APP_ID = process.env.SECONDME_APP_ID || 'general';
const OAUTH_AUTHORIZE_URL = process.env.SECONDME_OAUTH_AUTHORIZE_URL || 'https://go.second.me/oauth/';
const OAUTH_CLIENT_ID = process.env.SECONDME_CLIENT_ID || process.env.OAUTH_CLIENT_ID || '';
const OAUTH_CLIENT_SECRET = process.env.SECONDME_CLIENT_SECRET || process.env.OAUTH_CLIENT_SECRET || '';
const OAUTH_REDIRECT_URI_RAW = process.env.SECONDME_REDIRECT_URI || process.env.OAUTH_REDIRECT_URI || '';
const OAUTH_REDIRECT_URIS = OAUTH_REDIRECT_URI_RAW.split(',').map(u => u.trim()).filter(Boolean);
const OAUTH_REDIRECT_URI = OAUTH_REDIRECT_URIS[0] || '';
const OAUTH_ACCESS_TOKEN = process.env.SECONDME_ACCESS_TOKEN || process.env.OAUTH_ACCESS_TOKEN || '';
const OAUTH_REFRESH_TOKEN = process.env.SECONDME_REFRESH_TOKEN || process.env.OAUTH_REFRESH_TOKEN || '';
const OAUTH_SCOPE_ENV = process.env.SECONDME_OAUTH_SCOPE || process.env.OAUTH_SCOPE || '';
const REQUIRED_SCOPES = ['user.info', 'chat', 'note.add'];
const EXTENDED_SCOPES = ['user.info.shades', 'user.info.softmemory', 'voice'];
const OAUTH_COOKIE_ACCESS = 'niuma_oauth_at';
const OAUTH_COOKIE_REFRESH = 'niuma_oauth_rt';
const OAUTH_COOKIE_STATE = 'niuma_oauth_state';
const COOKIE_SECURE = IS_VERCEL || process.env.NODE_ENV === 'production';
const ADMIN_ACCOUNT_NAMES = new Set([
  '小布',
  '迷途醉猫',
  ...String(process.env.ADMIN_ACCOUNT_NAMES || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
]);
const ADMIN_ACCOUNT_IDS = new Set(
  String(process.env.ADMIN_ACCOUNT_IDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);

const LABOR_TYPES = [
  {
    id: 'studio-retouch',
    name: '影楼风P图',
    description: '人像精修、肤质优化、妆造氛围、商业级细节修饰'
  },
  {
    id: 'logo-design',
    name: 'Logo设计',
    description: '品牌标识概念、图形语言、配色建议、应用场景扩展'
  },
  {
    id: 'ui-design',
    name: 'UI设计',
    description: '界面布局、视觉系统、组件规范、交互文案建议'
  },
  {
    id: 'copywriting',
    name: '文案制作',
    description: '营销文案、产品描述、活动话术、品牌表达优化'
  },
  {
    id: 'poster-design',
    name: '海报制作',
    description: '活动海报、社媒视觉、版式排版、传播物料设计'
  }
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

// 图片上传允许的类型和最大大小
const UPLOAD_ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};
const UPLOAD_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const JSON_BODY_MAX_SIZE = Number(process.env.JSON_BODY_MAX_SIZE || 1024 * 1024);

// 读取原始二进制请求体
async function readRawBody(req, maxSize = UPLOAD_MAX_SIZE) {
  const chunks = [];
  let totalSize = 0;
  for await (const chunk of req) {
    totalSize += chunk.length;
    if (totalSize > maxSize) {
      throw new AppError(`文件大小超过限制（最大 ${Math.round(maxSize / 1024 / 1024)}MB）`, 413);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// 简易 multipart/form-data 解析器
function parseMultipartFormData(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/);
  if (!boundaryMatch) {
    throw new AppError('缺少 multipart boundary', 400);
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const boundaryBuf = Buffer.from('--' + boundary);
  const endBuf = Buffer.from('--' + boundary + '--');

  const parts = [];
  let start = buffer.indexOf(boundaryBuf);
  if (start < 0) return parts;

  while (true) {
    // 移动到 boundary 之后的 CRLF
    start += boundaryBuf.length;
    // 检查是否是结束标记
    if (buffer.slice(start, start + 2).toString() === '--') break;
    // 跳过 CRLF
    if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) start += 2;

    // 查找 headers 和 body 之间的空行 (\r\n\r\n)
    const headerEnd = buffer.indexOf('\r\n\r\n', start);
    if (headerEnd < 0) break;

    const headerStr = buffer.slice(start, headerEnd).toString('utf8');
    const bodyStart = headerEnd + 4;

    // 查找下一个 boundary
    let nextBoundary = buffer.indexOf(boundaryBuf, bodyStart);
    if (nextBoundary < 0) nextBoundary = buffer.indexOf(endBuf, bodyStart);
    if (nextBoundary < 0) break;

    // body 结束于 boundary 前的 CRLF
    let bodyEnd = nextBoundary - 2;
    if (bodyEnd < bodyStart) bodyEnd = bodyStart;

    const bodyData = buffer.slice(bodyStart, bodyEnd);

    // 解析 headers
    const headers = {};
    headerStr.split('\r\n').forEach(line => {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        headers[key] = line.slice(colonIdx + 1).trim();
      }
    });

    // 提取 filename 和 name
    const disposition = headers['content-disposition'] || '';
    const nameMatch = disposition.match(/\bname="([^"]*)"/)
    const filenameMatch = disposition.match(/\bfilename="([^"]*)"/);

    parts.push({
      name: nameMatch ? nameMatch[1] : '',
      filename: filenameMatch ? filenameMatch[1] : null,
      contentType: headers['content-type'] || 'application/octet-stream',
      data: bodyData
    });

    start = nextBoundary;
  }

  return parts;
}

const runtimeAuth = {
  accessToken: OAUTH_ACCESS_TOKEN,
  refreshToken: OAUTH_REFRESH_TOKEN,
  tokenType: 'Bearer',
  expiresIn: 0,
  expireAt: null,
  scope: OAUTH_SCOPE_ENV
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean),
  source: OAUTH_ACCESS_TOKEN ? 'env' : 'none',
  updatedAt: OAUTH_ACCESS_TOKEN ? nowIso() : null
};
const requestAuthStore = new AsyncLocalStorage();

class AppError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function html(res, statusCode, content) {
  const body = String(content || '');
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function notFound(res) {
  json(res, 404, {
    code: 404,
    message: 'Not Found'
  });
}

function badRequest(res, message) {
  json(res, 400, {
    code: 400,
    message
  });
}

function internalError(res, error) {
  console.error('[server error]', error);
  json(res, 500, {
    code: 500,
    message: 'Internal Server Error'
  });
}

async function readBody(req, maxSize = JSON_BODY_MAX_SIZE) {
  const chunks = [];
  let totalSize = 0;
  for await (const chunk of req) {
    totalSize += chunk.length;
    if (totalSize > maxSize) {
      throw new AppError(`请求体过大（最大 ${Math.round(maxSize / 1024)}KB）`, 413);
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function nowIso() {
  return new Date().toISOString();
}

function parseScopeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function maskToken(value) {
  const token = String(value || '').trim();
  if (!token) {
    return '';
  }
  if (token.length <= 10) {
    return `${token.slice(0, 3)}***`;
  }
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function getRequestAuthContext() {
  return requestAuthStore.getStore() || null;
}

function parseCookieHeader(cookieHeader = '') {
  const map = {};
  String(cookieHeader || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const eqIndex = pair.indexOf('=');
      if (eqIndex <= 0) {
        return;
      }
      const key = pair.slice(0, eqIndex).trim();
      const rawValue = pair.slice(eqIndex + 1).trim();
      if (!key) {
        return;
      }
      try {
        map[key] = decodeURIComponent(rawValue);
      } catch {
        map[key] = rawValue;
      }
    });
  return map;
}

function normalizeAdminMatchValue(value) {
  return String(value || '').trim().toLowerCase();
}

function isAdminUser(user = {}) {
  if (!user || typeof user !== 'object') {
    return false;
  }

  const idCandidates = [
    user.userId,
    user.id,
    user.uid,
    user.secondUserId
  ].map((item) => String(item || '').trim()).filter(Boolean);

  if (idCandidates.some((id) => ADMIN_ACCOUNT_IDS.has(id))) {
    return true;
  }

  const normalizedNames = [
    user.name,
    user.displayName,
    user.nickname,
    user.username
  ].map(normalizeAdminMatchValue).filter(Boolean);

  if (normalizedNames.length === 0) {
    return false;
  }

  const whitelist = new Set(Array.from(ADMIN_ACCOUNT_NAMES).map(normalizeAdminMatchValue));
  return normalizedNames.some((name) => whitelist.has(name));
}

function buildSetCookie(
  name,
  value,
  { maxAge = null, httpOnly = true, sameSite = 'Lax', secure = COOKIE_SECURE, path = '/' } = {}
) {
  const parts = [`${name}=${encodeURIComponent(String(value || ''))}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) {
    parts.push('HttpOnly');
  }
  if (secure) {
    parts.push('Secure');
  }
  if (typeof maxAge === 'number') {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  }
  return parts.join('; ');
}

function clearCookie(name) {
  return buildSetCookie(name, '', {
    maxAge: 0
  });
}

function authCookiesFromToken(tokenData = {}) {
  const accessToken = String(tokenData.accessToken || '').trim();
  const refreshToken = String(tokenData.refreshToken || '').trim();
  const expiresInRaw = Number(tokenData.expiresIn || 0);
  const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? Math.floor(expiresInRaw) : 7200;

  const cookies = [];
  if (accessToken) {
    cookies.push(
      buildSetCookie(OAUTH_COOKIE_ACCESS, accessToken, {
        maxAge: expiresIn
      })
    );
  } else {
    cookies.push(clearCookie(OAUTH_COOKIE_ACCESS));
  }

  if (refreshToken) {
    cookies.push(
      buildSetCookie(OAUTH_COOKIE_REFRESH, refreshToken, {
        maxAge: 30 * 24 * 60 * 60
      })
    );
  } else {
    cookies.push(clearCookie(OAUTH_COOKIE_REFRESH));
  }

  return cookies;
}

function clearOAuthCookies() {
  return [clearCookie(OAUTH_COOKIE_ACCESS), clearCookie(OAUTH_COOKIE_REFRESH), clearCookie(OAUTH_COOKIE_STATE)];
}

function resolveSecondMeToken(overrideToken = '') {
  const explicit = String(overrideToken || '').trim();
  if (explicit) {
    return explicit;
  }
  const ctx = getRequestAuthContext();
  const scopedToken = String(ctx?.oauthAccessToken || '').trim();
  if (scopedToken) {
    return scopedToken;
  }
  return '';
}

function currentAuthMode() {
  const ctx = getRequestAuthContext();
  if (ctx?.oauthAccessToken) {
    return 'oauth-token';
  }
  return 'none';
}

function ensureSecondMeConfigured(overrideToken = '') {
  if (!resolveSecondMeToken(overrideToken)) {
    throw new AppError(
      '当前会话无 OAuth Access Token，请先登录 SecondMe',
      400,
      {
        missing: ['OAuth Access Token'],
        requiredScopes: REQUIRED_SCOPES,
        extendedScopes: EXTENDED_SCOPES
      }
    );
  }
}

function oauthClientConfigured() {
  return Boolean(OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET);
}

function redirectUriConfigured() {
  return OAUTH_REDIRECT_URIS.length > 0;
}

function oauthConfigSnapshot() {
  return {
    authorizeUrl: OAUTH_AUTHORIZE_URL,
    clientIdConfigured: Boolean(OAUTH_CLIENT_ID),
    clientSecretConfigured: Boolean(OAUTH_CLIENT_SECRET),
    redirectUriConfigured: OAUTH_REDIRECT_URIS.length > 0,
    redirectUris: OAUTH_REDIRECT_URIS,
    clientConfigured: oauthClientConfigured() && redirectUriConfigured()
  };
}

function oauthTokenSnapshot(includeRaw = false) {
  const data = {
    source: runtimeAuth.source,
    tokenType: runtimeAuth.tokenType,
    expiresIn: runtimeAuth.expiresIn,
    expireAt: runtimeAuth.expireAt,
    scope: runtimeAuth.scope,
    updatedAt: runtimeAuth.updatedAt,
    accessTokenMasked: maskToken(runtimeAuth.accessToken),
    refreshTokenMasked: maskToken(runtimeAuth.refreshToken)
  };

  if (includeRaw) {
    data.accessToken = runtimeAuth.accessToken || '';
    data.refreshToken = runtimeAuth.refreshToken || '';
  }

  return data;
}

function setRuntimeAuthTokens(tokenData, source = 'oauth') {
  const accessToken = String(tokenData?.accessToken || '').trim();
  const refreshToken = String(tokenData?.refreshToken || '').trim();
  const tokenType = String(tokenData?.tokenType || 'Bearer').trim() || 'Bearer';
  const expiresInRaw = Number(tokenData?.expiresIn || 0);
  const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? Math.floor(expiresInRaw) : 0;
  const expireAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  const scope = parseScopeList(tokenData?.scope);

  runtimeAuth.accessToken = accessToken;
  runtimeAuth.refreshToken = refreshToken || runtimeAuth.refreshToken;
  runtimeAuth.tokenType = tokenType;
  runtimeAuth.expiresIn = expiresIn;
  runtimeAuth.expireAt = expireAt;
  runtimeAuth.scope = scope;
  runtimeAuth.source = source;
  runtimeAuth.updatedAt = nowIso();
}

function clearRuntimeAuthTokens() {
  runtimeAuth.accessToken = '';
  runtimeAuth.refreshToken = '';
  runtimeAuth.tokenType = 'Bearer';
  runtimeAuth.expiresIn = 0;
  runtimeAuth.expireAt = null;
  runtimeAuth.scope = [];
  runtimeAuth.source = 'manual-clear';
  runtimeAuth.updatedAt = nowIso();
}

function oauthState() {
  return `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function absoluteBaseUrl(req) {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  return `${protocol}://${host}`;
}

function buildOAuthAuthorizeUrl({
  clientId = OAUTH_CLIENT_ID,
  redirectUri = OAUTH_REDIRECT_URI,
  state = oauthState()
} = {}) {
  const normalizedClientId = String(clientId || '').trim();
  const normalizedRedirectUri = String(redirectUri || '').trim();

  if (!normalizedClientId) {
    throw new AppError('缺少 client_id，请配置 SECONDME_CLIENT_ID / OAUTH_CLIENT_ID 或传入 clientId', 400);
  }
  if (!normalizedRedirectUri) {
    throw new AppError('缺少 redirect_uri，请配置 SECONDME_REDIRECT_URI / OAUTH_REDIRECT_URI 或传入 redirectUri', 400);
  }

  const url = new URL(OAUTH_AUTHORIZE_URL);
  url.searchParams.set('client_id', normalizedClientId);
  url.searchParams.set('redirect_uri', normalizedRedirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);

  return {
    url: url.toString(),
    state,
    clientId: normalizedClientId,
    redirectUri: normalizedRedirectUri
  };
}

function formBodyString(payload) {
  const form = new URLSearchParams();
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (typeof value === 'undefined' || value === null) {
      return;
    }
    form.set(key, String(value));
  });
  return form.toString();
}

function buildQueryString(searchParams) {
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function pickOverrideAuthToken(req, searchParams, body = null) {
  const headerToken = String(req.headers['x-secondme-token'] || '').trim();
  if (headerToken) {
    return headerToken;
  }

  const queryToken = String(searchParams?.get('authToken') || '').trim();
  if (queryToken) {
    return queryToken;
  }

  const bodyToken = String(body?.authToken || '').trim();
  if (bodyToken) {
    return bodyToken;
  }

  return '';
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeTaskSummary(task) {
  ensureTaskAbilityBindings(task);
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    laborType: task.laborType,
    laborTypeName: task.laborTypeName,
    requesterAi: task.requesterAi,
    budget: task.budget,
    deadline: task.deadline,
    status: task.status,
    coverImage: task.coverImage || null,
    participants: task.participants,
    abilityBindings: task.abilityBindings,
    updates: task.updates,
    delivery: task.delivery,
    sync: task.sync || null,
    publisherId: task.publisherId,  // 添加发布者ID用于"我的派发"过滤
    assigneeId: task.assigneeId,    // 添加接单者ID
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

function sessionActorIds(session = null) {
  return new Set(
    [
      session?.user?.userId,
      session?.user?.id,
      session?.user?.uid,
      session?.user?.secondUserId,
      session?.worker?.id,
      session?.worker?.workerId,
      session?.worker?.secondUserId
    ]
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  );
}

function taskViewerScope(task, session = null) {
  const actorIds = sessionActorIds(session);
  const publisherId = String(task?.publisherId || '').trim();
  const assigneeId = String(task?.assigneeId || '').trim();
  const participantIds = Array.isArray(task?.participants)
    ? task.participants.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const isAdmin = isAdminUser(session?.user);
  const isPublisher = Boolean(publisherId) && actorIds.has(publisherId);
  const isAssignee = Boolean(assigneeId) && actorIds.has(assigneeId);
  const isParticipant = participantIds.some((id) => actorIds.has(id));
  const isDeliveryPublic = String(task?.deliveryVisibility || 'public') !== 'private';

  return {
    actorIds,
    isAdmin,
    isPublisher,
    isAssignee,
    isParticipant,
    canViewDeliveryContent: isAdmin || isPublisher || isDeliveryPublic,
    canViewUpdates: isAdmin || isPublisher || isParticipant || isAssignee,
    canViewSync: isAdmin || isPublisher,
    canManageDeliveries: isAdmin || isPublisher || isAssignee
  };
}

function buildTaskSummaryForViewer(task, session = null, { listView = false } = {}) {
  const summary = safeTaskSummary(task);
  const scope = taskViewerScope(task, session);

  if (!scope.canViewDeliveryContent) {
    summary.delivery = null;
  }
  if (!scope.canViewUpdates || listView) {
    summary.updates = [];
  }
  if (!scope.canViewSync || listView) {
    summary.sync = null;
  }

  return { summary, scope };
}

function laborTypeById(typeId) {
  return LABOR_TYPES.find((item) => item.id === typeId);
}

function laborTypeByName(typeName) {
  return LABOR_TYPES.find((item) => item.name === typeName);
}

function customLaborTypeId(typeName) {
  return `custom:${typeName}`;
}

function resolveLaborType(input) {
  const normalized = String(input || '').trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('custom:')) {
    const customName = normalized.slice(7).trim();
    return {
      laborType: customName ? `custom:${customName}` : normalized,
      laborTypeName: customName || normalized,
      known: false
    };
  }

  const byId = laborTypeById(normalized);
  if (byId) {
    return {
      laborType: byId.id,
      laborTypeName: byId.name,
      known: true
    };
  }

  const byName = laborTypeByName(normalized);
  if (byName) {
    return {
      laborType: byName.id,
      laborTypeName: byName.name,
      known: true
    };
  }

  return {
    laborType: customLaborTypeId(normalized),
    laborTypeName: normalized,
    known: false
  };
}

function buildWorkerId(secondUserId) {
  return `sm_${String(secondUserId || '').trim()}`;
}

function normalizeSpecialties(input, useFallback = true) {
  const source = Array.isArray(input) ? input : String(input || '').split(/[,\n]/);
  const normalized = source
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => resolveLaborType(item))
    .filter(Boolean)
    .map((item) => item.laborType);

  const unique = Array.from(new Set(normalized));
  if (unique.length) {
    return unique.slice(0, 12);
  }

  if (!useFallback) {
    return [];
  }
  const fallback = LABOR_TYPES[0]?.id || 'general';
  return [fallback];
}

function profileToWorker(profile) {
  return {
    id: String(profile.workerId || profile.id || '').trim(),
    secondUserId: String(profile.secondUserId || profile.userId || '').trim(),
    name: String(profile.name || '').trim(),
    title: String(profile.title || '').trim(),
    specialties: normalizeSpecialties(profile.specialties),
    persona: String(profile.persona || '').trim(),
    avatar: String(profile.avatar || '').trim(),
    earnedPoints: normalizePointsValue(profile.earnedPoints, 100),
    completedOrders: normalizePointsValue(profile.completedOrders, 0),
    createdAt: profile.createdAt || null,
    updatedAt: profile.updatedAt || null
  };
}

function createDefaultProfile(secondUser = {}) {
  const userId = String(secondUser.userId || '').trim();
  const name = String(secondUser.name || 'SecondMe 用户').trim();
  const now = nowIso();
  return {
    secondUserId: userId,
    workerId: buildWorkerId(userId),
    name,
    title: '通用劳务体',
    specialties: [LABOR_TYPES[0]?.id || 'general'],
    persona: String(secondUser.selfIntroduction || secondUser.bio || '我会按需求交付高质量内容。').trim(),
    avatar: String(secondUser.avatar || '').trim(),
    earnedPoints: 100,
    completedOrders: 0,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeProfilePatch(payload = {}) {
  const patch = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(payload, key);

  if (has('name')) {
    patch.name = String(payload.name || '').trim();
  }
  if (has('title')) {
    patch.title = String(payload.title || '').trim();
  }
  if (has('persona')) {
    patch.persona = String(payload.persona || '').trim();
  }
  if (has('specialties')) {
    patch.specialties = normalizeSpecialties(payload.specialties);
  }
  if (has('avatar')) {
    patch.avatar = String(payload.avatar || '').trim();
  }
  return patch;
}

function hasOwn(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload || {}, key);
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enable', 'enabled'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off', 'disable', 'disabled'].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function normalizeCustomApiConfig(payload = {}, fallback = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const previous = fallback && typeof fallback === 'object' ? fallback : {};

  return {
    endpoint: String(source.endpoint ?? source.baseUrl ?? previous.endpoint ?? '').trim(),
    apiKey: String(source.apiKey ?? source.key ?? previous.apiKey ?? '').trim(),
    model: String(source.model ?? previous.model ?? '').trim()
  };
}

// 规范化单个风格对象
function normalizeStyle(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const image = String(s.image ?? s.coverImage ?? s.imageUrl ?? '').trim();
  return {
    id: String(s.id || '').trim() || uid('style'),
    name: String(s.name || '').trim(),
    image,
    prompt: String(s.prompt || '').trim()
  };
}

// 规范化风格数组
function normalizeStyles(input) {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeStyle).filter(s => s.name);
}

// 规范化图像生成配置
function normalizeImageConfig(payload = {}, fallback = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const previous = fallback && typeof fallback === 'object' ? fallback : {};
  const size = String(source.size ?? previous.size ?? '1024x1024').trim();
  const quality = String(source.quality ?? previous.quality ?? 'standard').trim();
  return {
    size: size || '1024x1024',
    n: Math.max(1, Math.min(4, Number(source.n ?? previous.n ?? 1) || 1)),
    quality: quality || 'standard'
  };
}

function normalizePointsValue(value, fallback = 0, { min = 0, max = 9_999_999 } = {}) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  const safeFallback = Number.isFinite(Number(fallback)) ? Math.trunc(Number(fallback)) : 0;
  const n = Number.isFinite(parsed) ? parsed : safeFallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeHallSortValue(value, fallback = null) {
  if (value == null || value === '') {
    return fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function timeSortValue(value, fallback = 0) {
  const ts = new Date(value || '').getTime();
  return Number.isFinite(ts) ? ts : fallback;
}

function taskHallSortValue(task = {}) {
  return normalizeHallSortValue(task.hallSort, timeSortValue(task.createdAt, 0));
}

function compareTaskHallOrder(a, b) {
  const byRank = taskHallSortValue(b) - taskHallSortValue(a);
  if (byRank !== 0) return byRank;
  const byUpdatedAt = timeSortValue(b?.updatedAt, 0) - timeSortValue(a?.updatedAt, 0);
  if (byUpdatedAt !== 0) return byUpdatedAt;
  return String(b?.id || '').localeCompare(String(a?.id || ''));
}

function abilityHallSortValue(ability = {}) {
  return normalizeHallSortValue(ability.hallSort, timeSortValue(ability.createdAt, 0));
}

function compareSkillHallOrder(a, b) {
  const byRank = abilityHallSortValue(b) - abilityHallSortValue(a);
  if (byRank !== 0) return byRank;
  const byUpdatedAt = timeSortValue(b?.updatedAt, 0) - timeSortValue(a?.updatedAt, 0);
  if (byUpdatedAt !== 0) return byUpdatedAt;
  return String(b?.id || '').localeCompare(String(a?.id || ''));
}

function moveArrayItem(list, index, direction) {
  if (!Array.isArray(list) || index < 0) {
    return false;
  }
  const targetIndex = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : -1;
  if (targetIndex < 0 || targetIndex >= list.length) {
    return false;
  }
  const [item] = list.splice(index, 1);
  list.splice(targetIndex, 0, item);
  return true;
}

function resequenceHallSort(list, applyRank) {
  const base = Date.now() + list.length + 10;
  list.forEach((item, index) => {
    applyRank(item, base - index);
  });
}

function isNoLimitValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['不限制', 'unlimited', 'none', 'auto', 'any'].includes(normalized);
}

function normalizeStoredAbility(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const abilityType = ['text', 'image'].includes(String(source.abilityType || '').trim()) ? String(source.abilityType).trim() : 'text';
  return {
    id: String(source.id || '').trim() || uid('ability'),
    name: String(source.name || '').trim(),
    icon: String(source.icon || '🔧').trim() || '🔧',
    description: String(source.description || '').trim(),
    pricePoints: normalizePointsValue(source.pricePoints ?? source.price ?? source.points, 0),
    prompt: String(source.prompt || '').trim(),
    enabled: toBoolean(source.enabled, true),
    abilityType,
    coverImage: String(source.coverImage || '').trim() || null,
    useCustomApi: toBoolean(source.useCustomApi, false),
    customApi: normalizeCustomApiConfig(
      {
        endpoint: source?.customApi?.endpoint ?? source.endpoint ?? source.apiEndpoint,
        apiKey: source?.customApi?.apiKey ?? source.apiKey,
        model: source?.customApi?.model ?? source.model
      },
      source?.customApi
    ),
    imageConfig: abilityType === 'image' ? normalizeImageConfig(source.imageConfig, source.imageConfig) : normalizeImageConfig(),
    styles: normalizeStyles(source.styles),
    hallSort: normalizeHallSortValue(source.hallSort, null),
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null
  };
}

function ensureTaskAbilityBindings(task) {
  if (!task || typeof task !== 'object') {
    return;
  }
  if (!task.abilityBindings || typeof task.abilityBindings !== 'object' || Array.isArray(task.abilityBindings)) {
    task.abilityBindings = {};
  }
}

function setTaskWorkerAbility(task, workerId, abilityId) {
  const wid = String(workerId || '').trim();
  if (!wid) {
    return;
  }
  ensureTaskAbilityBindings(task);
  const aid = String(abilityId || '').trim();
  if (aid) {
    task.abilityBindings[wid] = aid;
  } else {
    delete task.abilityBindings[wid];
  }
}

function getTaskWorkerAbilityId(task, workerId) {
  const wid = String(workerId || '').trim();
  if (!wid) {
    return '';
  }
  if (!task || typeof task !== 'object') {
    return '';
  }
  const map = task.abilityBindings && typeof task.abilityBindings === 'object' ? task.abilityBindings : {};
  return String(map[wid] || '').trim();
}

function workersMap(workers = []) {
  const map = new Map();
  for (const worker of workers) {
    const workerId = String(worker?.id || '').trim();
    const secondUserId = String(worker?.secondUserId || '').trim();
    if (workerId) {
      map.set(workerId, worker);
    }
    if (secondUserId) {
      map.set(secondUserId, worker);
    }
  }
  return map;
}

function getChatIdentityAliases(session = {}) {
  const user = session?.user || {};
  const userId = String(user.userId || '').trim();
  const aliases = [
    userId,
    String(user.id || '').trim(),
    userId ? buildWorkerId(userId) : ''
  ].filter(Boolean);
  return Array.from(new Set(aliases));
}

function conversationHasParticipant(conv, aliases = []) {
  if (!conv || !Array.isArray(aliases) || aliases.length === 0) return false;
  const set = new Set(aliases.map((id) => String(id || '').trim()).filter(Boolean));
  const initiatorId = String(conv.initiator_id || '').trim();
  const receiverId = String(conv.receiver_id || '').trim();
  return set.has(initiatorId) || set.has(receiverId);
}

async function resolveConversationUserId(inputId) {
  const raw = String(inputId || '').trim();
  if (!raw) return '';

  try {
    const profiles = await loadProfiles();
    const worker = workersMap(profiles).get(raw);
    const mapped = String(worker?.secondUserId || '').trim();
    if (mapped) return mapped;
  } catch (e) {
    console.warn('解析聊天用户ID失败（降级使用原值）', e);
  }

  // workerId 默认格式为 sm_{secondUserId}
  if (raw.startsWith('sm_') && raw.length > 3) {
    return raw.slice(3);
  }
  return raw;
}

function buildConversationAliasOrQuery(aliases = []) {
  const normalized = Array.from(new Set((aliases || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!normalized.length) return '';
  return normalized.flatMap((id) => [
    `initiator_id.eq.${id}`,
    `receiver_id.eq.${id}`
  ]).join(',');
}

function buildConversationPairOrQuery(myAliases = [], peerAliases = []) {
  const mine = Array.from(new Set((myAliases || []).map((id) => String(id || '').trim()).filter(Boolean)));
  const peers = Array.from(new Set((peerAliases || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!mine.length || !peers.length) return '';
  const clauses = [];
  for (const me of mine) {
    for (const peer of peers) {
      clauses.push(`and(initiator_id.eq.${me},receiver_id.eq.${peer})`);
      clauses.push(`and(initiator_id.eq.${peer},receiver_id.eq.${me})`);
    }
  }
  return clauses.join(',');
}

function workerById(workerId, workers = []) {
  return workers.find((worker) => worker.id === workerId);
}

function seedTasks() {
  const seed = [
    {
      id: uid('task'),
      title: '婚纱样片主视觉精修',
      description: '希望做清透韩系影楼风，保留肤质细节，适配宣传海报。',
      laborType: 'studio-retouch',
      laborTypeName: '影楼风P图',
      requesterAi: 'BrideStudio-AI',
      budget: '500 积分',
      deadline: '48小时',
      status: 'OPEN',
      participants: [],
      abilityBindings: {},
      updates: [],
      delivery: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    },
    {
      id: uid('task'),
      title: 'SaaS工具品牌 Logo 概念征集',
      description: '面向开发者市场，风格简洁、专业、可延展。',
      laborType: 'logo-design',
      laborTypeName: 'Logo设计',
      requesterAi: 'NovaBrand-AI',
      budget: '800 积分',
      deadline: '72小时',
      status: 'OPEN',
      participants: [],
      abilityBindings: {},
      updates: [],
      delivery: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  ];
  return seed;
}

async function ensureDataFiles() {
  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
  if (!existsSync(DATA_FILE)) {
    await fs.writeFile(DATA_FILE, JSON.stringify(seedTasks(), null, 2), 'utf8');
  }
  if (!existsSync(PROFILE_FILE)) {
    await fs.writeFile(PROFILE_FILE, JSON.stringify([], null, 2), 'utf8');
  }
  if (!existsSync(ABILITIES_FILE)) {
    await fs.writeFile(ABILITIES_FILE, JSON.stringify({}, null, 2), 'utf8');
  }
  // 确保图片上传目录存在
  if (!existsSync(UPLOADS_DIR)) {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }
}

// ===== 任务 CRUD =====
const TASKS_KEY = 'tasks';

async function loadTasks() {
  // Vercel 环境使用 Supabase 存储
  if (IS_VERCEL && supabase) {
    try {
      const { data, error } = await supabase
        .from('kv_store')
        .select('value')
        .eq('key', TASKS_KEY)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('[loadTasks] Supabase error:', error);
      }
      return data?.value || [];
    } catch (err) {
      console.error('[loadTasks] Error:', err);
      return [];
    }
  }

  // 本地开发使用 JSON 文件
  await ensureDataFiles();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function saveTasks(tasks) {
  // Vercel 环境使用 Supabase 存储
  if (IS_VERCEL && supabase) {
    try {
      const { error } = await supabase
        .from('kv_store')
        .upsert({ key: TASKS_KEY, value: tasks }, { onConflict: 'key' });

      if (error) {
        console.error('[saveTasks] Supabase error:', error);
      }
    } catch (err) {
      console.error('[saveTasks] Error:', err);
    }
    return;
  }

  // 本地开发使用 JSON 文件
  await fs.writeFile(DATA_FILE, JSON.stringify(tasks, null, 2), 'utf8');
}

const PROFILES_KEY = 'profiles';

async function loadProfiles() {
  // Vercel 环境使用 Supabase 存储
  if (IS_VERCEL && supabase) {
    try {
      const { data, error } = await supabase
        .from('kv_store')
        .select('value')
        .eq('key', PROFILES_KEY)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('[loadProfiles] Supabase error:', error);
      }
      const list = data?.value || [];
      return Array.isArray(list) ? list.map(profileToWorker) : [];
    } catch (err) {
      console.error('[loadProfiles] Error:', err);
      return [];
    }
  }

  // 本地开发使用 JSON 文件
  await ensureDataFiles();
  const raw = await fs.readFile(PROFILE_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : [];
  return list.map(profileToWorker);
}

async function saveProfiles(workers) {
  const normalized = (Array.isArray(workers) ? workers : []).map((worker) => ({
    secondUserId: String(worker.secondUserId || '').trim(),
    workerId: String(worker.id || worker.workerId || '').trim(),
    name: String(worker.name || '').trim(),
    title: String(worker.title || '').trim(),
    specialties: normalizeSpecialties(worker.specialties),
    persona: String(worker.persona || '').trim(),
    avatar: String(worker.avatar || '').trim(),
    earnedPoints: normalizePointsValue(worker.earnedPoints, 100),
    completedOrders: normalizePointsValue(worker.completedOrders, 0),
    createdAt: worker.createdAt || nowIso(),
    updatedAt: worker.updatedAt || nowIso()
  }));

  // Vercel 环境使用 Supabase 存储
  if (IS_VERCEL && supabase) {
    try {
      const { error } = await supabase
        .from('kv_store')
        .upsert({ key: PROFILES_KEY, value: normalized }, { onConflict: 'key' });

      if (error) {
        console.error('[saveProfiles] Supabase error:', error);
      } else {
        invalidatePublicSkillsCache();
      }
    } catch (err) {
      console.error('[saveProfiles] Error:', err);
    }
    return;
  }

  // 本地开发使用 JSON 文件
  await ensureDataFiles();
  await fs.writeFile(PROFILE_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  invalidatePublicSkillsCache();
}

// ===== 能力库 CRUD =====
// Supabase 使用 kv_store 表存储 JSON 数据（键值存储模式）
const ABILITIES_KEY = 'abilities';
const PUBLIC_SKILLS_CACHE_TTL = 30 * 1000;
let publicSkillsCache = {
  expiresAt: 0,
  data: null
};

function invalidatePublicSkillsCache() {
  publicSkillsCache = {
    expiresAt: 0,
    data: null
  };
}

async function loadAbilities() {
  // Supabase 环境使用数据库存储
  if (IS_VERCEL && supabase) {
    try {
      const { data, error } = await supabase
        .from('kv_store')
        .select('value')
        .eq('key', ABILITIES_KEY)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Supabase loadAbilities error:', error);
        return {};
      }

      return data?.value || {};
    } catch (err) {
      console.error('Supabase loadAbilities exception:', err);
      return {};
    }
  }

  // 本地环境使用文件存储
  await ensureDataFiles();
  const raw = await fs.readFile(ABILITIES_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function saveAbilities(data) {
  // Supabase 环境使用数据库存储
  if (IS_VERCEL && supabase) {
    try {
      const { error } = await supabase
        .from('kv_store')
        .upsert({ key: ABILITIES_KEY, value: data, updated_at: new Date().toISOString() }, { onConflict: 'key' });

      if (error) {
        console.error('Supabase saveAbilities error:', error);
        throw new AppError('保存能力失败，请稍后重试', 500);
      }
      invalidatePublicSkillsCache();
      return;
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error('Supabase saveAbilities exception:', err);
      throw new AppError('保存能力失败，请稍后重试', 500);
    }
  }

  // 本地环境使用文件存储
  await ensureDataFiles();
  await fs.writeFile(ABILITIES_FILE, JSON.stringify(data, null, 2), 'utf8');
  invalidatePublicSkillsCache();
}

// ===== 交付历史 CRUD =====
// Supabase 使用 deliveries 表存储交付历史

async function saveDeliveryHistory(delivery) {
  if (!IS_VERCEL || !supabase) {
    console.log('Local mode: saveDeliveryHistory skipped');
    return delivery;
  }

  try {
    const { error } = await supabase
      .from('deliveries')
      .insert({
        id: delivery.id,
        task_id: delivery.taskId,
        worker_id: delivery.workerId,
        worker_name: delivery.workerName || null,
        ability_id: delivery.abilityId || null,
        ability_name: delivery.abilityName || null,
        content: delivery.content,
        status: delivery.status || 'completed',
        created_at: delivery.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Supabase saveDeliveryHistory error:', error);
      // 不抛错，让交付继续进行
    }
    return delivery;
  } catch (err) {
    console.error('Supabase saveDeliveryHistory exception:', err);
    return delivery;
  }
}

async function getTaskDeliveries(taskId) {
  if (!IS_VERCEL || !supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('deliveries')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase getTaskDeliveries error:', error);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      taskId: row.task_id,
      workerId: row.worker_id,
      abilityId: row.ability_id,
      abilityName: row.ability_name,
      content: row.content,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } catch (err) {
    console.error('Supabase getTaskDeliveries exception:', err);
    return [];
  }
}

async function deleteDeliveryById(deliveryId) {
  if (!IS_VERCEL || !supabase) {
    return false;
  }

  try {
    const { error } = await supabase
      .from('deliveries')
      .delete()
      .eq('id', deliveryId);

    if (error) {
      console.error('Supabase deleteDeliveryById error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Supabase deleteDeliveryById exception:', err);
    return false;
  }
}

async function getUserAbilities(userId) {
  const all = await loadAbilities();
  const list = Array.isArray(all[userId]) ? all[userId] : [];
  return list.map((item) => normalizeStoredAbility(item));
}

async function addUserAbility(userId, ability) {
  const all = await loadAbilities();
  if (!Array.isArray(all[userId])) {
    all[userId] = [];
  }
  const createdAt = nowIso();
  const newAbility = normalizeStoredAbility({
    ...ability,
    id: uid('ability'),
    hallSort: Date.now(),
    createdAt,
    updatedAt: createdAt
  });
  all[userId].push(newAbility);
  await saveAbilities(all);
  return newAbility;
}

async function updateUserAbility(userId, abilityId, patch) {
  const all = await loadAbilities();
  if (!Array.isArray(all[userId])) {
    return null;
  }
  const idx = all[userId].findIndex((a) => a.id === abilityId);
  if (idx < 0) {
    return null;
  }
  const current = normalizeStoredAbility(all[userId][idx]);
  const sourceCustomApi = patch?.customApi && typeof patch.customApi === 'object' ? patch.customApi : {};
  const shouldPatchCustomApi =
    Boolean(patch?.customApi && typeof patch.customApi === 'object') ||
    hasOwn(patch, 'apiEndpoint') ||
    hasOwn(patch, 'endpoint') ||
    hasOwn(patch, 'apiKey') ||
    hasOwn(patch, 'model');
  const mergedCustomApi = shouldPatchCustomApi
    ? normalizeCustomApiConfig(
      {
        endpoint: sourceCustomApi.endpoint ?? patch.apiEndpoint ?? patch.endpoint,
        apiKey: sourceCustomApi.apiKey ?? patch.apiKey,
        model: sourceCustomApi.model ?? patch.model
      },
      current.customApi
    )
    : current.customApi;
  const mergedImageConfig = hasOwn(patch, 'imageConfig') && patch.imageConfig && typeof patch.imageConfig === 'object'
    ? normalizeImageConfig(patch.imageConfig, current.imageConfig)
    : current.imageConfig;
  const updated = normalizeStoredAbility({
    ...current,
    name: hasOwn(patch, 'name') ? String(patch.name || '').trim() : current.name,
    icon: hasOwn(patch, 'icon') ? String(patch.icon || '🔧').trim() : current.icon,
    description: hasOwn(patch, 'description') ? String(patch.description || '').trim() : current.description,
    pricePoints: hasOwn(patch, 'pricePoints') ? normalizePointsValue(patch.pricePoints, current.pricePoints || 0) : current.pricePoints,
    prompt: hasOwn(patch, 'prompt') ? String(patch.prompt || '').trim() : current.prompt,
    enabled: hasOwn(patch, 'enabled') ? toBoolean(patch.enabled, true) : current.enabled,
    abilityType: hasOwn(patch, 'abilityType') ? String(patch.abilityType || 'text').trim() : current.abilityType,
    coverImage: hasOwn(patch, 'coverImage') ? (String(patch.coverImage || '').trim() || null) : current.coverImage,
    useCustomApi: hasOwn(patch, 'useCustomApi') ? toBoolean(patch.useCustomApi, false) : current.useCustomApi,
    customApi: mergedCustomApi,
    imageConfig: mergedImageConfig,
    styles: hasOwn(patch, 'styles') ? normalizeStyles(patch.styles) : current.styles,
    createdAt: current.createdAt || nowIso(),
    updatedAt: nowIso()
  });
  all[userId][idx] = updated;
  await saveAbilities(all);
  return updated;
}

async function deleteUserAbility(userId, abilityId) {
  const all = await loadAbilities();
  if (!Array.isArray(all[userId])) {
    return false;
  }
  const idx = all[userId].findIndex((a) => a.id === abilityId);
  if (idx < 0) {
    return false;
  }
  all[userId].splice(idx, 1);
  await saveAbilities(all);
  return true;
}

async function upsertWorkerProfile(secondUser = {}, patch = {}) {
  const secondUserId = String(secondUser.userId || '').trim();
  if (!secondUserId) {
    throw new AppError('未获取到 SecondMe 用户ID，无法创建劳务体', 502);
  }

  const workers = await loadProfiles();
  const workerId = buildWorkerId(secondUserId);
  const index = workers.findIndex((item) => item.id === workerId);
  const now = nowIso();

  const base =
    index >= 0
      ? workers[index]
      : profileToWorker({
        ...createDefaultProfile(secondUser),
        workerId
      });

  const normalizedPatch = normalizeProfilePatch(patch);
  const merged = {
    ...base,
    id: workerId,
    workerId,
    secondUserId,
    name: normalizedPatch.name || base.name || String(secondUser.name || '').trim() || 'SecondMe 用户',
    title: normalizedPatch.title || base.title || '通用劳务体',
    specialties: normalizedPatch.specialties || base.specialties || normalizeSpecialties([]),
    persona:
      normalizedPatch.persona ||
      base.persona ||
      String(secondUser.selfIntroduction || secondUser.bio || '我会按需求交付高质量内容。').trim(),
    avatar: normalizedPatch.avatar || String(secondUser.avatar || '').trim() || base.avatar || '',
    // 积分系统字段（新用户注册默认赠送100积分）
    earnedPoints: base.earnedPoints || 100,
    completedOrders: base.completedOrders || 0,
    createdAt: base.createdAt || now,
    updatedAt: now
  };

  if (index >= 0) {
    workers[index] = merged;
  } else {
    workers.push(merged);
  }

  await saveProfiles(workers);
  return merged;
}

async function getCurrentSessionWorker({ createIfMissing = true } = {}) {
  const ctx = getRequestAuthContext();
  const sessionToken = String(ctx?.oauthAccessToken || '').trim();
  if (!sessionToken) {
    throw new AppError('请先使用 SecondMe 登录，再进行操作', 401);
  }

  const userInfo = await callSecondMeJson('/api/secondme/user/info', {
    authToken: sessionToken
  });
  const userData = userInfo?.data || {};

  if (!userData || !String(userData.userId || '').trim()) {
    throw new AppError('SecondMe 用户信息缺少 userId', 502, userInfo);
  }

  const worker = createIfMissing ? await upsertWorkerProfile(userData) : null;
  return {
    token: sessionToken,
    user: userData,
    worker
  };
}

async function requireAdminSession() {
  const session = await getCurrentSessionWorker({ createIfMissing: false });
  if (!session?.user) {
    throw new AppError('请先登录', 401);
  }
  if (!isAdminUser(session.user)) {
    throw new AppError('仅管理员可操作', 403);
  }
  return session;
}

async function tryGetCurrentSessionWorker({ createIfMissing = false } = {}) {
  const ctx = getRequestAuthContext();
  const token = String(ctx?.oauthAccessToken || '').trim();
  if (!token) {
    return null;
  }
  try {
    return await getCurrentSessionWorker({ createIfMissing });
  } catch (error) {
    console.warn('[auth] optional session resolve failed:', error?.message || error);
    return null;
  }
}

function buildPublicSkillsFromSources(allAbilities = {}, profiles = []) {
  const workerLookup = workersMap(profiles);
  const skills = [];

  for (const [userId, abilities] of Object.entries(allAbilities || {})) {
    if (!Array.isArray(abilities)) continue;
    const owner = workerLookup.get(userId);
    for (const raw of abilities) {
      const ability = normalizeStoredAbility(raw);
      if (ability.enabled === false) continue;
      skills.push({
        id: ability.id,
        name: ability.name,
        description: ability.description || '',
        pricePoints: normalizePointsValue(ability.pricePoints, 0),
        icon: ability.icon || '🔧',
        abilityType: ability.abilityType || 'text',
        coverImage: ability.coverImage || '',
        styles: (ability.styles || []).map(s => ({
          id: s.id,
          name: s.name,
          image: s.image || s.coverImage || '',
          coverImage: s.coverImage || s.image || ''
        })),
        ownerId: userId,
        ownerName: owner?.name || owner?.displayName || '',
        ownerAvatar: owner?.avatar || owner?.profileImageUrl || '',
        completedOrders: 0,
        rating: 0,
        hallSort: ability.hallSort ?? null,
        createdAt: ability.createdAt || ''
      });
    }
  }

  skills.sort(compareSkillHallOrder);
  return skills;
}

async function settleSkillDeliveryPoints({
  buyerWorkerId,
  providerSecondUserId,
  pricePoints,
  abilityId = '',
  abilityName = ''
} = {}) {
  const amount = normalizePointsValue(pricePoints, 0);
  if (amount <= 0) {
    return {
      charged: false,
      amount: 0,
      reason: 'free_skill'
    };
  }

  const buyerKey = String(buyerWorkerId || '').trim();
  const providerKey = String(providerSecondUserId || '').trim();
  if (!buyerKey || !providerKey) {
    throw new AppError('积分结算失败：缺少买方或卖方身份', 500, {
      buyerWorkerId: buyerKey,
      providerSecondUserId: providerKey
    });
  }

  const workers = await loadProfiles();
  const lookup = workersMap(workers);
  const buyer = lookup.get(buyerKey) || null;
  const provider = lookup.get(providerKey) || null;

  if (!buyer) {
    throw new AppError('积分结算失败：未找到购买方资料', 500, { buyerWorkerId: buyerKey });
  }
  if (!provider) {
    throw new AppError('积分结算失败：未找到技能提供方资料', 500, { providerSecondUserId: providerKey });
  }

  if (String(buyer.id || '') === String(provider.id || '')) {
    return {
      charged: false,
      amount: 0,
      reason: 'self_hire',
      buyerBalance: normalizePointsValue(buyer.earnedPoints, 100),
      providerBalance: normalizePointsValue(provider.earnedPoints, 100)
    };
  }

  const buyerBalance = normalizePointsValue(buyer.earnedPoints, 100);
  if (buyerBalance < amount) {
    throw new AppError(`积分不足，当前 ${buyerBalance}，需要 ${amount}`, 400, {
      code: 'INSUFFICIENT_POINTS',
      buyerBalance,
      requiredPoints: amount,
      abilityId: String(abilityId || ''),
      abilityName: String(abilityName || '')
    });
  }

  const providerBalance = normalizePointsValue(provider.earnedPoints, 100);
  const now = nowIso();
  buyer.earnedPoints = buyerBalance - amount;
  buyer.updatedAt = now;

  provider.earnedPoints = providerBalance + amount;
  provider.completedOrders = normalizePointsValue(provider.completedOrders, 0) + 1;
  provider.updatedAt = now;

  await saveProfiles(workers);

  return {
    charged: true,
    amount,
    reason: 'settled',
    buyerBalance: buyer.earnedPoints,
    providerBalance: provider.earnedPoints,
    providerWorkerId: provider.id,
    providerSecondUserId: provider.secondUserId
  };
}

function secondMeHeaders(extra = {}, authToken = '') {
  const token = resolveSecondMeToken(authToken);
  ensureSecondMeConfigured(token);
  return {
    Authorization: `Bearer ${token}`,
    ...extra
  };
}

function shortText(value, max = 300) {
  if (!value) {
    return '';
  }
  return String(value).slice(0, max);
}

async function parseSecondMeJsonResponse(response) {
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError('SecondMe 返回了非 JSON 响应', 502, {
      status: response.status,
      body: shortText(text, 500)
    });
  }

  if (!response.ok) {
    throw new AppError(`SecondMe HTTP ${response.status}`, 502, {
      status: response.status,
      body: data
    });
  }

  if (typeof data?.code === 'number' && data.code !== 0) {
    throw new AppError(data?.message || 'SecondMe 业务错误', 502, {
      code: data?.code,
      subCode: data?.subCode,
      body: data
    });
  }

  return data;
}

async function callSecondMeJson(endpointPath, { method = 'GET', body, headers = {}, authToken = '' } = {}) {
  const token = resolveSecondMeToken(authToken);
  ensureSecondMeConfigured(token);

  const url = `${SECONDME_BASE_URL}${endpointPath}`;
  const requestHeaders = secondMeHeaders(headers, token);

  const init = {
    method,
    headers: requestHeaders
  };

  if (typeof body !== 'undefined') {
    requestHeaders['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  return parseSecondMeJsonResponse(response);
}

async function callLabJson(endpointPath, { method = 'GET', body, headers = {}, authToken = '' } = {}) {
  const url = `${SECONDME_BASE_URL}${endpointPath}`;
  const requestHeaders = { ...headers };

  if (authToken) {
    requestHeaders.Authorization = `Bearer ${authToken}`;
  }

  const init = {
    method,
    headers: requestHeaders
  };

  if (typeof body !== 'undefined') {
    requestHeaders['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  return parseSecondMeJsonResponse(response);
}

async function callLabForm(endpointPath, { payload, authToken = '' } = {}) {
  const body = formBodyString(payload);
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${SECONDME_BASE_URL}${endpointPath}`, {
    method: 'POST',
    headers,
    body
  });

  return parseSecondMeJsonResponse(response);
}

async function exchangeCodeForToken({
  code,
  clientId = OAUTH_CLIENT_ID,
  clientSecret = OAUTH_CLIENT_SECRET,
  redirectUri = OAUTH_REDIRECT_URI
}) {
  const normalizedCode = String(code || '').trim();
  const normalizedClientId = String(clientId || '').trim();
  const normalizedClientSecret = String(clientSecret || '').trim();
  const normalizedRedirectUri = String(redirectUri || '').trim();

  if (!normalizedCode) {
    throw new AppError('缺少授权码 code', 400);
  }
  if (!normalizedClientId || !normalizedClientSecret) {
    throw new AppError('缺少 client_id 或 client_secret，请配置 SECONDME_CLIENT_ID / SECONDME_CLIENT_SECRET', 400);
  }
  if (!normalizedRedirectUri) {
    throw new AppError('缺少 redirect_uri，请配置 SECONDME_REDIRECT_URI 或在请求中传入 redirectUri', 400);
  }

  return callLabForm('/api/oauth/token/code', {
    payload: {
      grant_type: 'authorization_code',
      code: normalizedCode,
      redirect_uri: normalizedRedirectUri,
      client_id: normalizedClientId,
      client_secret: normalizedClientSecret
    }
  });
}

async function refreshAccessToken({
  refreshToken = runtimeAuth.refreshToken,
  clientId = OAUTH_CLIENT_ID,
  clientSecret = OAUTH_CLIENT_SECRET
}) {
  const normalizedRefreshToken = String(refreshToken || '').trim();
  const normalizedClientId = String(clientId || '').trim();
  const normalizedClientSecret = String(clientSecret || '').trim();

  if (!normalizedRefreshToken) {
    throw new AppError('缺少 refresh_token，请先完成 code 换 token 或手动注入 refresh token', 400);
  }
  if (!normalizedClientId || !normalizedClientSecret) {
    throw new AppError('缺少 client_id 或 client_secret，请配置 SECONDME_CLIENT_ID / SECONDME_CLIENT_SECRET', 400);
  }

  return callLabForm('/api/oauth/token/refresh', {
    payload: {
      grant_type: 'refresh_token',
      refresh_token: normalizedRefreshToken,
      client_id: normalizedClientId,
      client_secret: normalizedClientSecret
    }
  });
}

async function addSecondMeTextNote({ title, content }) {
  const response = await callSecondMeJson('/api/secondme/note/add', {
    method: 'POST',
    body: {
      title: shortText(title, 200),
      content: shortText(content, 50000),
      memoryType: 'TEXT'
    }
  });

  const noteId = response?.data?.noteId;
  if (typeof noteId === 'undefined' || noteId === null) {
    throw new AppError('SecondMe 未返回 noteId，笔记同步失败', 502, {
      endpoint: '/api/secondme/note/add',
      response
    });
  }

  return noteId;
}

function summarizeUpdates(task, workerLookup = new Map()) {
  if (!Array.isArray(task.updates) || task.updates.length === 0) {
    return '暂无协作备注。';
  }
  return task.updates
    .slice(-6)
    .map((item, idx) => {
      const worker = workerLookup.get(item.workerId);
      const workerName = worker ? worker.name : item.workerId;
      return `${idx + 1}. ${workerName}: ${item.message}`;
    })
    .join('\n');
}

function normalizeAiDiscussionReply(raw) {
  let text = String(raw || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(回复|建议|答复)[:：]\s*/i, '')
    .trim();

  if (!text) {
    return '同问，等答案。';
  }

  const sentenceParts = text.match(/[^。！？!?]+[。！？!?]?/g) || [];
  let shortReply = sentenceParts.slice(0, 2).join('').trim();
  if (!shortReply) {
    shortReply = text;
  }

  if (shortReply.length > 42) {
    shortReply = `${shortReply.slice(0, 42).trim()}…`;
  }

  return shortReply || '同问，等答案。';
}

function ensureTaskSyncState(task) {
  if (!task.sync) {
    task.sync = {
      events: [],
      secondMeSessionId: null
    };
  }
  if (!Array.isArray(task.sync.events)) {
    task.sync.events = [];
  }
}

function pushTaskSyncEvent(task, eventType, noteId, title) {
  ensureTaskSyncState(task);
  task.sync.events.push({
    eventType,
    noteId,
    title,
    at: nowIso()
  });
}

function buildTaskContextText(task, workerLookup = new Map()) {
  const participants = task.participants
    .map((id) => workerLookup.get(id)?.name || id)
    .join('、') || '暂无';

  return [
    `任务ID: ${task.id}`,
    `任务标题: ${task.title}`,
    `劳务类型: ${task.laborTypeName}`,
    `发布AI: ${task.requesterAi}`,
    `需求描述: ${task.description}`,
    `预算: ${task.budget || '未设置'}`,
    `期限: ${task.deadline || '未设置'}`,
    `参与AI: ${participants}`
  ].join('\n');
}

async function syncTaskCreated(task, workerLookup) {
  const noteId = await addSecondMeTextNote({
    title: `[AI劳务需求] ${task.title}`,
    content: `${buildTaskContextText(task, workerLookup)}\n\n事件: 任务已发布，等待 AI 报名参与。`
  });
  pushTaskSyncEvent(task, 'TASK_CREATED', noteId, `[AI劳务需求] ${task.title}`);
}

async function syncTaskJoined(task, worker, workerLookup) {
  const noteId = await addSecondMeTextNote({
    title: `[AI参与] ${task.title} · ${worker.name}`,
    content: `${buildTaskContextText(task, workerLookup)}\n\n事件: ${worker.name} 已报名参与该任务。`
  });
  pushTaskSyncEvent(task, 'TASK_JOINED', noteId, `[AI参与] ${task.title} · ${worker.name}`);
}

async function syncTaskUpdate(task, worker, message, workerLookup) {
  const noteId = await addSecondMeTextNote({
    title: `[协作备注] ${task.title}`,
    content: `${buildTaskContextText(task, workerLookup)}\n\n提交AI: ${worker.name}\n备注内容: ${message}`
  });
  pushTaskSyncEvent(task, 'TASK_UPDATE', noteId, `[协作备注] ${task.title}`);
}

async function syncTaskDelivery(task, workerLookup) {
  const noteId = await addSecondMeTextNote({
    title: `[交付完成] ${task.title}`,
    content: `${buildTaskContextText(task, workerLookup)}\n\n交付引擎: ${task.delivery?.engine || 'secondme-chat-stream'}\n交付内容:\n${task.delivery?.content || ''}`
  });
  pushTaskSyncEvent(task, 'TASK_DELIVERED', noteId, `[交付完成] ${task.title}`);
}

function deliverySystemPrompt(task) {
  if (task.laborType === 'studio-retouch') {
    return '你是影楼商业修图专家。输出可直接用于图像模型的高质量提示词，重点是肤质细节、布光、风格一致性。';
  }
  if (task.laborType === 'logo-design') {
    return '你是资深品牌设计总监。输出可直接用于品牌Logo生成与评审的提示词，强调识别性、可延展性、跨媒介适配。';
  }
  if (task.laborType === 'ui-design') {
    return '你是资深产品UI设计师。输出可直接用于界面生成和设计协作的提示词，强调信息层级、组件一致性与响应式。';
  }
  return '你是资深 AI 协作顾问。请根据任务目标输出可直接执行的方案与高质量提示词，强调可交付性、步骤清晰、结果可验收。';
}

async function readStreamAsText(stream) {
  const decoder = new TextDecoder('utf8');
  let output = '';
  for await (const chunk of stream) {
    output += decoder.decode(chunk, { stream: true });
  }
  output += decoder.decode();
  return output;
}

function extractSseContent(raw) {
  const lines = raw.split(/\r?\n/);
  let result = '';
  let sessionId = null;

  for (const line of lines) {
    if (line.startsWith('event:')) {
      continue;
    }
    if (!line.startsWith('data:')) {
      continue;
    }
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') {
      continue;
    }
    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed?.sessionId === 'string') {
        sessionId = parsed.sessionId;
      }
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string') {
        result += delta;
      }
      const messageContent = parsed?.choices?.[0]?.message?.content;
      if (!delta && typeof messageContent === 'string') {
        result += messageContent;
      }
    } catch {
      // Skip malformed event payload
    }
  }

  return {
    content: result.trim(),
    sessionId
  };
}

function parseSseEvents(raw, maxEvents = 120) {
  const chunks = raw.split(/\r?\n\r?\n/);
  const events = [];

  for (const chunk of chunks) {
    if (events.length >= maxEvents) {
      break;
    }
    const lines = chunk
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!lines.length) {
      continue;
    }

    let event = 'message';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim() || 'message';
      } else if (line.startsWith('data:')) {
        data += (data ? '\n' : '') + line.slice(5).trim();
      }
    }

    events.push({
      event,
      data: shortText(data, 1000)
    });
  }

  return events;
}

function ensureHttpUrl(rawUrl, fieldName = 'url') {
  const value = String(rawUrl || '').trim();
  if (!value) {
    throw new AppError(`${fieldName} 不能为空`, 400);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(`${fieldName} 不是合法 URL`, 400, { value });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError(`${fieldName} 仅支持 http/https`, 400, { protocol: url.protocol });
  }
  return url;
}

function normalizeCustomApiBaseUrl(endpoint) {
  const url = ensureHttpUrl(endpoint, 'API Endpoint');
  let pathname = String(url.pathname || '/').trim();
  pathname = pathname.replace(/\/+$/, '');
  if (!pathname) {
    pathname = '/v1';
  }
  if (pathname.endsWith('/chat/completions')) {
    pathname = pathname.slice(0, -'/chat/completions'.length) || '/v1';
  }
  if (pathname.endsWith('/images/generations')) {
    pathname = pathname.slice(0, -'/images/generations'.length) || '/v1';
  }
  if (pathname.endsWith('/responses')) {
    pathname = pathname.slice(0, -'/responses'.length) || '/v1';
  }
  if (pathname.endsWith('/models')) {
    pathname = pathname.slice(0, -'/models'.length) || '/v1';
  }
  // Google Gemini OpenAI 兼容端点必须包含 /openai，否则 /images/generations 与 /chat/completions 会 404
  if (url.hostname === 'generativelanguage.googleapis.com' && !/\/openai$/.test(pathname)) {
    if (/^\/v1beta(\/.*)?$/.test(pathname) || /^\/v1(\/.*)?$/.test(pathname)) {
      pathname = pathname.replace(/\/+$/, '');
      if (!pathname.endsWith('/openai')) {
        pathname = `${pathname}/openai`;
      }
    }
  }
  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  return url;
}

function joinUrlPath(basePath, appendPath) {
  const left = String(basePath || '').replace(/\/+$/, '');
  const right = String(appendPath || '').replace(/^\/+/, '');
  if (!left) {
    return `/${right}`;
  }
  return `${left}/${right}`;
}

function buildCustomApiUrl(endpoint, appendPath) {
  const base = normalizeCustomApiBaseUrl(endpoint);
  base.pathname = joinUrlPath(base.pathname, appendPath);
  return base.toString();
}

function pickModelId(item) {
  if (!item) {
    return '';
  }
  if (typeof item === 'string') {
    return item.trim();
  }
  if (typeof item === 'object') {
    const id = String(item.id ?? item.model ?? item.name ?? '').trim();
    return id;
  }
  return '';
}

function collectModelIds(payload = {}) {
  const buckets = [];
  if (Array.isArray(payload)) {
    buckets.push(payload);
  }
  if (Array.isArray(payload?.data)) {
    buckets.push(payload.data);
  }
  if (Array.isArray(payload?.models)) {
    buckets.push(payload.models);
  }
  if (Array.isArray(payload?.result)) {
    buckets.push(payload.result);
  }
  if (Array.isArray(payload?.items)) {
    buckets.push(payload.items);
  }

  const values = [];
  for (const bucket of buckets) {
    for (const item of bucket) {
      const id = pickModelId(item);
      if (id) {
        values.push(id);
      }
    }
  }
  return Array.from(new Set(values));
}

function extractChatChoiceContent(payload = {}) {
  const messageContent = payload?.choices?.[0]?.message?.content;
  if (typeof messageContent === 'string') {
    return messageContent.trim();
  }
  if (Array.isArray(messageContent)) {
    return messageContent
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item && typeof item === 'object') {
          return String(item.text ?? item.content ?? '').trim();
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  const outputText = payload?.output_text;
  if (typeof outputText === 'string') {
    return outputText.trim();
  }

  const dataContent = payload?.data?.content;
  if (typeof dataContent === 'string') {
    return dataContent.trim();
  }

  return '';
}

async function fetchCustomApiModels({ endpoint, apiKey = '' }) {
  const modelsUrl = buildCustomApiUrl(endpoint, '/models');
  const headers = {};
  const token = String(apiKey || '').trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(modelsUrl, {
    method: 'GET',
    headers
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new AppError(`模型列表拉取失败 (${response.status})`, 502, {
      endpoint: modelsUrl,
      body: shortText(text, 600)
    });
  }

  const models = collectModelIds(payload);
  if (!models.length) {
    throw new AppError('未解析到模型列表，请确认接口兼容 /models 返回结构', 502, {
      endpoint: modelsUrl,
      body: shortText(text, 600)
    });
  }

  return {
    endpoint: modelsUrl,
    models
  };
}

async function callCustomApiChatCompletions({
  endpoint,
  apiKey,
  model,
  systemPrompt,
  userPrompt
}) {
  const url = buildCustomApiUrl(endpoint, '/chat/completions');
  const token = String(apiKey || '').trim();
  if (!token) {
    throw new AppError('API Key 不能为空', 400);
  }
  const modelName = String(model || '').trim();
  if (!modelName) {
    throw new AppError('模型不能为空', 400);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7
    })
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new AppError(`自定义 API 调用失败 (${response.status})`, 502, {
      endpoint: url,
      body: shortText(text, 800)
    });
  }

  const content = extractChatChoiceContent(payload);
  if (!content) {
    throw new AppError('自定义 API 返回内容为空', 502, {
      endpoint: url,
      body: shortText(text, 800)
    });
  }

  return {
    endpoint: url,
    model: modelName,
    content
  };
}

// 调用兼容 OpenAI 格式的图像生成 API
async function callCustomApiImageGeneration({
  endpoint,
  apiKey,
  model,
  prompt,
  size = '',
  n = 1,
  quality = ''
}) {
  const token = String(apiKey || '').trim();
  if (!token) {
    throw new AppError('API Key 不能为空', 400);
  }
  const modelName = String(model || '').trim();
  if (!modelName) {
    throw new AppError('模型不能为空', 400);
  }
  if (!prompt || !String(prompt).trim()) {
    throw new AppError('图像生成提示词不能为空', 400);
  }

  const isGeminiLike = /gemini/i.test(modelName) || /generativelanguage\.googleapis\.com/i.test(String(endpoint || ''));

  // 策略1: 先尝试 OpenAI 标准 /images/generations 端点
  const imagesUrl = buildCustomApiUrl(endpoint, '/images/generations');
  const richBody = {
    model: modelName,
    prompt: String(prompt).trim(),
    n: Math.max(1, Math.min(4, n || 1)),
    response_format: 'b64_json'
  };
  if (String(size || '').trim() && !isNoLimitValue(size)) {
    richBody.size = String(size).trim();
  }
  if (String(quality || '').trim() && !isNoLimitValue(quality)) {
    richBody.quality = String(quality).trim();
  }
  const minimalBody = {
    model: modelName,
    prompt: String(prompt).trim(),
    n: Math.max(1, Math.min(4, n || 1)),
    response_format: 'b64_json'
  };

  const parseImagesFromPayload = (payload) => {
    const images = [];
    const dataItems = Array.isArray(payload?.data) ? payload.data : [];
    for (const item of dataItems) {
      if (item.url) images.push(item.url);
      else if (item.b64_json) images.push(`data:image/png;base64,${item.b64_json}`);
      else if (item?.image_url?.url) images.push(item.image_url.url);
    }
    return images;
  };

  const requestImagesGeneration = async (body) => {
    apiLog('IMG_REQ', { url: imagesUrl, body: { ...body, prompt: body.prompt?.slice(0, 50) } });
    const response = await fetch(imagesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    apiLog('IMG_RES', { url: imagesUrl, status: response.status, body: text.slice(0, 500) });
    return { response, text, payload };
  };

  apiLog('IMG_START', { endpoint, model: modelName, isGeminiLike });
  const attempts = isGeminiLike ? [minimalBody, richBody] : [richBody, minimalBody];
  let imageAttempt = null;
  for (let i = 0; i < attempts.length; i += 1) {
    const body = attempts[i];
    const mode = body === minimalBody ? 'minimal' : 'rich';
    apiLog('IMG_ATTEMPT', { round: i + 1, mode });
    imageAttempt = await requestImagesGeneration(body);
    if (imageAttempt.response.ok) {
      const images = parseImagesFromPayload(imageAttempt.payload);
      if (images.length) {
        apiLog('IMG_SUCCESS', { endpoint: imagesUrl, imageCount: images.length });
        return { endpoint: imagesUrl, model: modelName, images };
      }
    }
  }

  // 策略2: 尝试 /responses（部分第三方代理只支持该端点）
  const responsesUrl = buildCustomApiUrl(endpoint, '/responses');
  const responsesBody = {
    model: modelName,
    input: String(prompt).trim(),
    modalities: ['image'],
    tools: [
      {
        type: 'image_generation'
      }
    ]
  };
  if (String(size || '').trim() && !isNoLimitValue(size)) {
    responsesBody.tools[0].size = String(size).trim();
  }
  if (String(quality || '').trim() && !isNoLimitValue(quality)) {
    responsesBody.tools[0].quality = String(quality).trim();
  }

  let responsesAttempt = null;
  apiLog('RESP_REQ', { url: responsesUrl, model: modelName });
  try {
    const response = await fetch(responsesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(responsesBody)
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    responsesAttempt = { response, text, payload };
    apiLog('RESP_RES', { url: responsesUrl, status: response.status, body: text.slice(0, 500) });

    if (responsesAttempt.response.ok) {
      const responseImages = extractImagesFromResponsesPayload(responsesAttempt.payload);
      if (responseImages.length) {
        apiLog('RESP_SUCCESS', { imageCount: responseImages.length });
        return { endpoint: responsesUrl, model: modelName, images: responseImages };
      }
    }
  } catch (error) {
    responsesAttempt = {
      response: { status: 0, ok: false },
      text: String(error?.message || 'request_failed'),
      payload: {}
    };
    apiLog('RESP_ERROR', { error: error?.message });
  }

  // 策略3: 回退到 /chat/completions（Gemini 等多模态模型通过 chat 接口生成图片）
  const chatUrl = buildCustomApiUrl(endpoint, '/chat/completions');
  apiLog('CHAT_REQ', { url: chatUrl, imgStatus: imageAttempt.response.status });

  const chatBody = {
    model: modelName,
    messages: [
      {
        role: 'user',
        content: `请根据以下描述生成一张图片:\n\n${String(prompt).trim()}`
      }
    ],
    max_tokens: 4096,
    // Gemini 兼容: 指定输出包含图片（不同代理可能使用不同字段名）
    modalities: ['text', 'image'],
    response_modalities: ['text', 'image']
  };

  const chatResponse = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(chatBody)
  });

  const chatText = await chatResponse.text();
  apiLog('CHAT_RES', { url: chatUrl, status: chatResponse.status, body: chatText.slice(0, 800) });

  if (!chatResponse.ok) {
    apiLog('CHAT_FAIL', { status: chatResponse.status, imgStatus: imageAttempt.response.status, respStatus: responsesAttempt?.response?.status });
    throw new AppError(`图像生成 API 调用失败 (${chatResponse.status})`, 502, {
      endpoint: chatUrl,
      body: shortText(chatText, 800),
      imageGenerationError: {
        endpoint: imagesUrl,
        status: imageAttempt.response.status,
        body: shortText(imageAttempt.text, 800)
      },
      responsesGenerationError: {
        endpoint: responsesUrl,
        status: responsesAttempt?.response?.status || 0,
        body: shortText(responsesAttempt?.text || '', 800)
      }
    });
  }

  // 检测是否为 SSE 流式响应（content-type: text/event-stream 或以 "data: " 开头）
  const chatContentType = chatResponse.headers.get('content-type') || '';
  const isSseResponse = chatContentType.includes('text/event-stream') || chatText.trimStart().startsWith('data: ');

  let chatPayload = {};
  if (isSseResponse) {
    // 解析 SSE chunks，拼接 content 并尝试从流中提取图片
    apiLog('CHAT_SSE', { url: chatUrl, length: chatText.length });
    let assembledContent = '';
    for (const line of chatText.split('\n')) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const chunk = JSON.parse(line.slice(6));
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) assembledContent += delta.content;
      } catch { /* ignore malformed chunks */ }
    }
    // 将拼接好的内容包装成标准 chat 格式，复用现有提取逻辑
    chatPayload = {
      choices: [{
        message: { role: 'assistant', content: assembledContent || null }
      }]
    };
    apiLog('CHAT_SSE_ASSEMBLED', { contentLength: assembledContent.length });
  } else {
    try { chatPayload = chatText ? JSON.parse(chatText) : {}; } catch { chatPayload = {}; }
  }

  // 从 chat/completions 响应中提取图片
  const images = extractImagesFromChatResponse(chatPayload);

  if (!images.length) {
    // content 为 null 可能是服务端错误（如模型容量不足），而非模型不支持图像生成
    const rawContent = chatPayload?.choices?.[0]?.message?.content;
    const contentSnippet = rawContent ? shortText(String(rawContent), 300) : '(empty)';
    const imgErr = shortText(imageAttempt?.text || '', 200);
    const suffix = imgErr ? `；/images 响应: ${imgErr}` : '';
    const reason = rawContent === null
      ? '服务端返回内容为空，可能是模型容量不足或服务暂时不可用'
      : '模型未返回图片数据，可能不支持图像生成';
    throw new AppError(`图像生成失败：${reason}${suffix}`, 502, {
      endpoint: chatUrl,
      response: contentSnippet,
      imageGenerationError: {
        endpoint: imagesUrl,
        status: imageAttempt.response.status,
        body: shortText(imageAttempt.text, 800)
      },
      responsesGenerationError: {
        endpoint: responsesUrl,
        status: responsesAttempt?.response?.status || 0,
        body: shortText(responsesAttempt?.text || '', 800)
      }
    });
  }

  console.log(`[图像生成] /chat/completions 成功, ${images.length} 张图片`);

  return {
    endpoint: chatUrl,
    model: modelName,
    images
  };
}

// 从 /responses 响应中提取图片（兼容 OpenAI 与代理变体）
function extractImagesFromResponsesPayload(payload) {
  const images = [];
  const pushUnique = (value) => {
    const url = String(value || '').trim();
    if (!url) return;
    if (!images.includes(url)) {
      images.push(url);
    }
  };

  const toDataUri = (data, mime = 'image/png') => {
    const b64 = String(data || '').trim();
    if (!b64) return '';
    if (b64.startsWith('data:image/')) return b64;
    return `data:${mime};base64,${b64}`;
  };

  const parsePart = (part) => {
    if (!part || typeof part !== 'object') return;

    if (part.image_url?.url) pushUnique(part.image_url.url);
    if (part.url && typeof part.url === 'string' && (part.url.startsWith('http') || part.url.startsWith('data:image/'))) {
      pushUnique(part.url);
    }
    if (part.b64_json) pushUnique(toDataUri(part.b64_json, part.mime_type || part.mimeType || 'image/png'));
    if (part.result && typeof part.result === 'string') pushUnique(toDataUri(part.result, part.mime_type || part.mimeType || 'image/png'));
    if (part.data && typeof part.data === 'string') pushUnique(toDataUri(part.data, part.mime_type || part.mimeType || 'image/png'));
    if (part.inline_data?.data) pushUnique(toDataUri(part.inline_data.data, part.inline_data.mime_type || 'image/png'));

    const text = typeof part.text === 'string' ? part.text : (typeof part.content === 'string' ? part.content : '');
    if (text) {
      const mdImgRegex = /!\[[^\]]*\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/g;
      let match;
      while ((match = mdImgRegex.exec(text)) !== null) {
        pushUnique(match[1]);
      }
      const b64Regex = /data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g;
      let b64Match;
      while ((b64Match = b64Regex.exec(text)) !== null) {
        pushUnique(b64Match[0]);
      }
    }

    if (Array.isArray(part.content)) {
      for (const inner of part.content) parsePart(inner);
    }
  };

  if (Array.isArray(payload?.data)) {
    for (const item of payload.data) parsePart(item);
  }
  if (Array.isArray(payload?.output)) {
    for (const item of payload.output) parsePart(item);
  }
  if (payload?.message) {
    parsePart(payload.message);
  }

  return images;
}

// 从 chat/completions 响应中提取图片(兼容 Gemini / OpenAI 多模态格式)
function extractImagesFromChatResponse(payload) {
  const images = [];
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];

  console.log(`[extractImagesFromChatResponse] 处理 ${choices.length} 个 choices`);

  for (const choice of choices) {
    const message = choice?.message;
    if (!message) {
      console.log('[extractImagesFromChatResponse] choice 无 message，跳过');
      continue;
    }

    console.log('[extractImagesFromChatResponse] message.content 类型:', Array.isArray(message.content) ? 'array' : typeof message.content);

    // 格式1: message.content 是数组(多模态 parts)
    if (Array.isArray(message.content)) {
      console.log(`[extractImagesFromChatResponse] content 是数组，包含 ${message.content.length} 个 parts`);
      for (const part of message.content) {
        console.log('[extractImagesFromChatResponse] part 结构:', JSON.stringify(part, null, 2).slice(0, 200));

        // Gemini 风格: { type: 'image_url', image_url: { url: 'data:...' } }
        if (part?.type === 'image_url' && part?.image_url?.url) {
          console.log('[extractImagesFromChatResponse] 找到 image_url 格式');
          images.push(part.image_url.url);
        }
        // 另一种格式: { type: 'image', source: { data: '...', media_type: '...' } }
        if (part?.type === 'image' && part?.source?.data) {
          console.log('[extractImagesFromChatResponse] 找到 image/source 格式');
          const mime = part.source.media_type || 'image/png';
          images.push(`data:${mime};base64,${part.source.data}`);
        }
        // Gemini inline_data: { inline_data: { mime_type, data } }
        if (part?.inline_data?.data) {
          console.log('[extractImagesFromChatResponse] 找到 inline_data 格式');
          const mime = part.inline_data.mime_type || 'image/png';
          images.push(`data:${mime};base64,${part.inline_data.data}`);
        }
        // Gemini 可能直接在 part 中返回 base64
        if (part?.data && typeof part.data === 'string') {
          console.log('[extractImagesFromChatResponse] 找到直接 data 字段');
          const mime = part.mime_type || part.mimeType || 'image/png';
          images.push(`data:${mime};base64,${part.data}`);
        }
      }
    }

    // 格式2: message.content 是字符串,尝试提取 markdown 图片链接或 base64
    if (typeof message.content === 'string') {
      const content = message.content;
      console.log('[extractImagesFromChatResponse] content 是字符串，长度:', content.length);

      // 提取 markdown 图片 ![...](url)
      const mdImgRegex = /!\[.*?\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/g;
      let match;
      while ((match = mdImgRegex.exec(content)) !== null) {
        console.log('[extractImagesFromChatResponse] 找到 markdown 图片');
        images.push(match[1]);
      }
      // 提取独立的 base64 data URI
      const b64Regex = /data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g;
      let b64Match;
      while ((b64Match = b64Regex.exec(content)) !== null) {
        console.log('[extractImagesFromChatResponse] 找到独立 base64');
        if (!images.includes(b64Match[0])) {
          images.push(b64Match[0]);
        }
      }
    }

    // 格式3: Gemini 还可能在 message 直接有 parts 字段
    if (Array.isArray(message.parts)) {
      console.log(`[extractImagesFromChatResponse] message 有 parts 数组，包含 ${message.parts.length} 个元素`);
      for (const part of message.parts) {
        console.log('[extractImagesFromChatResponse] part 结构:', JSON.stringify(part, null, 2).slice(0, 200));

        if (part?.inline_data?.data) {
          console.log('[extractImagesFromChatResponse] 在 parts 中找到 inline_data');
          const mime = part.inline_data.mime_type || 'image/png';
          images.push(`data:${mime};base64,${part.inline_data.data}`);
        }
        if (part?.data && typeof part.data === 'string') {
          console.log('[extractImagesFromChatResponse] 在 parts 中找到直接 data');
          const mime = part.mime_type || part.mimeType || 'image/png';
          images.push(`data:${mime};base64,${part.data}`);
        }
      }
    }
  }

  console.log(`[extractImagesFromChatResponse] 最终提取到 ${images.length} 张图片`);
  return images;
}

async function callSecondMeChatStream({
  payload,
  authToken = '',
  appId = SECONDME_APP_ID,
  includeRaw = false
}) {
  const token = resolveSecondMeToken(authToken);
  ensureSecondMeConfigured(token);

  const response = await fetch(`${SECONDME_BASE_URL}/api/secondme/chat/stream`, {
    method: 'POST',
    headers: {
      ...secondMeHeaders(
        {
          'Content-Type': 'application/json',
          'X-App-Id': appId
        },
        token
      )
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    let body = { message: shortText(text, 400) };
    try {
      body = JSON.parse(text);
    } catch {
      // keep raw response
    }
    throw new AppError(body?.message || `SecondMe 聊天接口异常 (${response.status})`, 502, {
      status: response.status,
      subCode: body?.subCode,
      body
    });
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    const data = await parseSecondMeJsonResponse(response);
    return {
      stream: false,
      raw: null,
      events: [],
      content: data?.data?.content || data?.content || '',
      sessionId: data?.data?.sessionId || null,
      response: data
    };
  }

  const raw = await readStreamAsText(response.body);
  const parsed = extractSseContent(raw);
  const events = parseSseEvents(raw);

  return {
    stream: true,
    raw: includeRaw ? raw : null,
    events,
    content: parsed.content,
    sessionId: parsed.sessionId,
    response: null
  };
}

async function secondMeDelivery(task, customBrief, workerLookup) {
  const prompt = [
    '你是一个AI劳务市场里的资深交付AI。',
    '请基于以下任务，输出可直接给图像模型或设计模型使用的“最终交付提示词与交付说明”。',
    '输出格式要求：',
    '1) 任务解读（简短）',
    '2) 交付提示词（主体）',
    '3) 约束与参数建议（列表）',
    '4) 交付验收标准（列表）',
    '',
    buildTaskContextText(task, workerLookup),
    `协作摘要:\n${summarizeUpdates(task, workerLookup)}`,
    customBrief ? `补充要求: ${customBrief}` : ''
  ].filter(Boolean).join('\n');

  const streamResult = await callSecondMeChatStream({
    appId: SECONDME_APP_ID,
    payload: {
      message: prompt,
      appId: SECONDME_APP_ID,
      systemPrompt: deliverySystemPrompt(task),
      sessionId: task.sync?.secondMeSessionId || undefined
    }
  });

  const content = streamResult.content;
  if (!content) {
    throw new AppError('SecondMe 返回内容为空', 502);
  }

  return {
    mode: 'text-prompt',
    engine: streamResult.stream ? 'secondme-chat-stream' : 'secondme-json',
    content,
    sessionId: streamResult.sessionId
  };
}

async function customApiDelivery(task, customBrief, workerLookup, ability = null) {
  const config = ability?.customApi || {};
  const endpoint = String(config.endpoint || '').trim();
  const apiKey = String(config.apiKey || '').trim();
  const model = String(config.model || '').trim();

  if (!endpoint || !apiKey || !model) {
    throw new AppError('当前能力已开启自定义 API，但 endpoint / apiKey / model 配置不完整', 400, {
      abilityId: ability?.id || null,
      abilityName: ability?.name || null
    });
  }

  const prompt = [
    '你是一个AI劳务市场里的资深交付AI。',
    '请基于以下任务，输出可直接给图像模型或设计模型使用的“最终交付提示词与交付说明”。',
    '输出格式要求：',
    '1) 任务解读（简短）',
    '2) 交付提示词（主体）',
    '3) 约束与参数建议（列表）',
    '4) 交付验收标准（列表）',
    '',
    buildTaskContextText(task, workerLookup),
    `协作摘要:\n${summarizeUpdates(task, workerLookup)}`,
    customBrief ? `补充要求: ${customBrief}` : ''
  ].filter(Boolean).join('\n');

  const systemPrompt = [
    deliverySystemPrompt(task),
    ability?.prompt ? `能力系统提示词:\n${ability.prompt}` : ''
  ].filter(Boolean).join('\n\n');

  const result = await callCustomApiChatCompletions({
    endpoint,
    apiKey,
    model,
    systemPrompt,
    userPrompt: prompt
  });

  return {
    mode: 'text-prompt',
    engine: 'custom-api-chat-completions',
    content: result.content,
    model: result.model,
    abilityId: ability?.id || null
  };
}

// 图像生成交付 —— 调用图像 API 直接生成图片
async function imageApiDelivery(task, customBrief, workerLookup, ability = null) {
  const config = ability?.customApi || {};
  const endpoint = String(config.endpoint || '').trim();
  const apiKey = String(config.apiKey || '').trim();
  const model = String(config.model || '').trim();

  if (!endpoint || !apiKey || !model) {
    throw new AppError('当前能力已开启图像生成，但 endpoint / apiKey / model 配置不完整', 400, {
      abilityId: ability?.id || null,
      abilityName: ability?.name || null
    });
  }

  const imgConfig = ability?.imageConfig || {};

  // 组装图像生成提示词：结合任务描述 + 能力 prompt + 补充要求
  const promptParts = [];
  if (ability?.prompt) {
    promptParts.push(ability.prompt);
  }
  if (task?.title) {
    promptParts.push(task.title);
  }
  if (task?.description) {
    promptParts.push(task.description);
  }
  if (customBrief) {
    promptParts.push(customBrief);
  }
  // 如果有选定的风格，把风格 prompt 也加入
  const selectedStyleId = task?.selectedStyleId;
  if (selectedStyleId && Array.isArray(ability?.styles)) {
    const style = ability.styles.find(s => s.id === selectedStyleId);
    if (style?.prompt) {
      promptParts.push(`风格要求: ${style.prompt}`);
    }
  }

  const imagePrompt = promptParts.filter(Boolean).join('\n');

  if (!imagePrompt.trim()) {
    throw new AppError('图像生成提示词为空，请确保任务描述或能力提示词不为空', 400);
  }

  const selectedSize = isNoLimitValue(imgConfig.size) ? '' : String(imgConfig.size || '').trim();
  const selectedQuality = isNoLimitValue(imgConfig.quality) ? '' : String(imgConfig.quality || '').trim();
  const displaySize = selectedSize || '不限制';
  const displayQuality = selectedQuality || '不限制';
  console.log(`[图像交付] 开始生成, model=${model}, size=${displaySize}, quality=${displayQuality}`);

  const result = await callCustomApiImageGeneration({
    endpoint,
    apiKey,
    model,
    prompt: imagePrompt,
    size: selectedSize,
    n: imgConfig.n || 1,
    quality: selectedQuality
  });

  // 构建包含图片的交付内容（Markdown 格式，前端可直接渲染）
  const imageMarkdown = result.images.map((url, i) => {
    return `![生成图片${result.images.length > 1 ? ` ${i + 1}` : ''}](${url})`;
  }).join('\n\n');

  const content = [
    `## 🎨 AI 图像生成交付`,
    '',
    `**模型**: ${result.model}`,
    `**尺寸**: ${displaySize}`,
    `**质量**: ${displayQuality}`,
    `**提示词**: ${imagePrompt.length > 200 ? imagePrompt.slice(0, 200) + '…' : imagePrompt}`,
    '',
    imageMarkdown,
    '',
    `> 共生成 ${result.images.length} 张图片`
  ].join('\n');

  return {
    mode: 'image',
    engine: 'custom-api-image-generation',
    content,
    images: result.images,
    model: result.model,
    abilityId: ability?.id || null
  };
}

async function generateDelivery(task, customBrief, workerLookup, { ability = null } = {}) {
  const preferCustomApi = Boolean(ability && ability.enabled !== false && ability.useCustomApi);

  // 如果是图像生成类型的能力，先尝试图像生成路径，失败则回退到文本交付
  if (preferCustomApi && ability.abilityType === 'image') {
    try {
      return await imageApiDelivery(task, customBrief, workerLookup, ability);
    } catch (imgErr) {
      console.warn(`[generateDelivery] 图像生成失败，回退到文本交付: ${imgErr.message}`);
      // 回退到文本交付，并附加图像生成失败的提示
      const textResult = await customApiDelivery(task, customBrief, workerLookup, ability);
      textResult.content = `${textResult.content}\n\n---\n⚠️ 图像生成未成功（${imgErr.message?.slice(0, 80) || '未知错误'}），已回退为文本交付。`;
      return textResult;
    }
  }

  // 文本生成（自定义 API 或 SecondMe）
  if (preferCustomApi) {
    return customApiDelivery(task, customBrief, workerLookup, ability);
  }
  return secondMeDelivery(task, customBrief, workerLookup);
}


async function handleApi(req, res, urlObj) {
  const { method } = req;
  const { pathname, searchParams } = urlObj;

  // ===== 图片上传 =====
  if (method === 'POST' && pathname === '/api/upload/image') {
    const session = await getCurrentSessionWorker({ createIfMissing: false });
    if (!session?.user?.userId) {
      return json(res, 401, { code: 401, message: '请先登录后上传图片' });
    }

    const ct = String(req.headers['content-type'] || '');
    if (!ct.includes('multipart/form-data')) {
      throw new AppError('请使用 multipart/form-data 格式上传', 400);
    }

    const rawBody = await readRawBody(req, UPLOAD_MAX_SIZE);
    const parts = parseMultipartFormData(rawBody, ct);
    const filePart = parts.find(p => p.filename);
    if (!filePart) {
      throw new AppError('未找到上传的文件', 400);
    }

    const fileMime = filePart.contentType.toLowerCase().split(';')[0].trim();
    const ext = UPLOAD_ALLOWED_TYPES[fileMime];
    if (!ext) {
      throw new AppError(`不支持的图片格式 (${fileMime})，仅支持 jpg/png/webp/gif`, 400);
    }

    // 生成唯一文件名
    const filename = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const savePath = path.join(UPLOADS_DIR, filename);

    // 确保目录存在
    if (!existsSync(UPLOADS_DIR)) {
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
    }

    await fs.writeFile(savePath, filePart.data);
    console.log(`[upload] 图片已保存: ${filename} (${filePart.data.length} bytes)`);

    return json(res, 200, {
      code: 0,
      message: '上传成功',
      data: {
        url: `/uploads/${filename}`,
        filename,
        size: filePart.data.length
      }
    });
  }

  if (method === 'GET' && pathname === '/api/health') {
    return json(res, 200, {
      code: 0,
      message: 'ok',
      data: {
        now: nowIso()
      }
    });
  }

  if (method === 'GET' && pathname === '/api/meta') {
    const workers = await loadProfiles();
    const tasks = await loadTasks();

    // 科学统计：合并所有数据源中的不同用户 ID
    const uniqueUserIds = new Set();
    // 来源1：已注册的 profiles
    workers.forEach(w => {
      if (w.secondUserId) uniqueUserIds.add(w.secondUserId);
      else if (w.id) uniqueUserIds.add(w.id);
    });
    // 来源2：任务发布者
    tasks.forEach(t => {
      if (t.publisherId) uniqueUserIds.add(t.publisherId);
    });
    // 来源3：任务接单者
    tasks.forEach(t => {
      if (t.assigneeId) uniqueUserIds.add(t.assigneeId);
    });
    const totalUsers = uniqueUserIds.size;

    return json(res, 200, {
      code: 0,
      message: 'success',
      data: {
        laborTypes: LABOR_TYPES,
        workers,
        totalUsers,
        integration: {
          mode: 'direct-secondme',
          secondMeConfigured: Boolean(resolveSecondMeToken()),
          secondMeBaseUrl: SECONDME_BASE_URL,
          appId: SECONDME_APP_ID,
          authMode: currentAuthMode(),
          requiredScopes: REQUIRED_SCOPES,
          extendedScopes: EXTENDED_SCOPES,
          oauth: oauthConfigSnapshot(),
          oauthToken: oauthTokenSnapshot()
        },
        realtime: {
          provider: 'supabase',
          enabled: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
          supabaseUrl: SUPABASE_URL || '',
          supabaseAnonKey: '',
          supabaseAnonKeyMasked: maskToken(SUPABASE_ANON_KEY)
        }
      }
    });
  }

  if (method === 'GET' && pathname === '/api/workers') {
    const workers = await loadProfiles();
    return json(res, 200, {
      code: 0,
      message: 'success',
      data: workers
    });
  }

  // ===== 公开技能列表（无需登录） =====
  if (method === 'GET' && pathname === '/api/skills/public') {
    if (publicSkillsCache.data && Date.now() < publicSkillsCache.expiresAt) {
      return json(res, 200, {
        code: 0,
        message: 'success',
        data: publicSkillsCache.data
      });
    }

    const [allAbilities, profiles] = await Promise.all([loadAbilities(), loadProfiles()]);
    const skills = buildPublicSkillsFromSources(allAbilities, profiles);

    publicSkillsCache = {
      expiresAt: Date.now() + PUBLIC_SKILLS_CACHE_TTL,
      data: skills
    };

    return json(res, 200, {
      code: 0,
      message: 'success',
      data: skills
    });
  }

  if (method === 'POST' && pathname === '/api/admin/skills/reorder') {
    try {
      await requireAdminSession();
    } catch (error) {
      return json(res, error.statusCode || 403, { code: error.statusCode || 403, message: error.message || '无权限' });
    }

    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const ownerId = String(body.ownerId || '').trim();
    const skillId = String(body.skillId || body.abilityId || '').trim();
    const direction = String(body.direction || '').trim().toLowerCase();
    if (!ownerId || !skillId) {
      return badRequest(res, '缺少 ownerId 或 skillId');
    }
    if (!['up', 'down'].includes(direction)) {
      return badRequest(res, 'direction 仅支持 up/down');
    }

    const allAbilities = await loadAbilities();
    const entries = [];
    for (const [uid, list] of Object.entries(allAbilities)) {
      if (!Array.isArray(list)) continue;
      const normalizedList = list.map((item) => normalizeStoredAbility(item));
      allAbilities[uid] = normalizedList;
      normalizedList.forEach((ability) => {
        entries.push({ ownerId: uid, ability });
      });
    }

    const visibleSkills = entries
      .filter((entry) => entry.ability.enabled !== false)
      .sort((a, b) => compareSkillHallOrder(a.ability, b.ability));
    const index = visibleSkills.findIndex((entry) => entry.ownerId === ownerId && entry.ability.id === skillId);
    if (index < 0) {
      return json(res, 404, { code: 404, message: '技能不存在或未公开' });
    }

    moveArrayItem(visibleSkills, index, direction);
    resequenceHallSort(visibleSkills, (item, rank) => {
      item.ability.hallSort = rank;
      item.ability.updatedAt = nowIso();
    });
    await saveAbilities(allAbilities);

    return json(res, 200, {
      code: 0,
      message: '排序已更新'
    });
  }

  const adminSkillDeleteMatch = pathname.match(/^\/api\/admin\/skills\/([^/]+)\/([^/]+)$/);
  if (method === 'DELETE' && adminSkillDeleteMatch) {
    try {
      await requireAdminSession();
    } catch (error) {
      return json(res, error.statusCode || 403, { code: error.statusCode || 403, message: error.message || '无权限' });
    }

    const ownerId = decodeURIComponent(adminSkillDeleteMatch[1]);
    const skillId = decodeURIComponent(adminSkillDeleteMatch[2]);
    if (!ownerId || !skillId) {
      return badRequest(res, '参数不能为空');
    }

    const deleted = await deleteUserAbility(ownerId, skillId);
    if (!deleted) {
      return json(res, 404, { code: 404, message: '技能不存在' });
    }

    return json(res, 200, {
      code: 0,
      message: '技能已删除'
    });
  }

  if (method === 'GET' && pathname === '/api/me/labor-body') {
    const session = await getCurrentSessionWorker({ createIfMissing: true });
    const abilities = session?.user?.userId ? await getUserAbilities(session.user.userId) : [];
    return json(res, 200, {
      code: 0,
      message: 'success',
      data: {
        user: session.user,
        worker: session.worker,
        abilities
      }
    });
  }

  if (method === 'POST' && pathname === '/api/me/labor-body') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const session = await getCurrentSessionWorker({ createIfMissing: true });
    const patch = normalizeProfilePatch(body);
    const extraSpecialties = normalizeSpecialties(body.extraSpecialties, false);
    if (extraSpecialties.length) {
      patch.specialties = Array.from(new Set([...(patch.specialties || session.worker.specialties || []), ...extraSpecialties])).slice(
        0,
        12
      );
    }
    const worker = await upsertWorkerProfile(session.user, patch);

    return json(res, 200, {
      code: 0,
      message: '劳务体已更新',
      data: {
        user: session.user,
        worker
      }
    });
  }

  // ===== 能力库 API =====
  if (method === 'GET' && pathname === '/api/me/abilities') {
    const session = await getCurrentSessionWorker({ createIfMissing: false });
    if (!session?.user?.userId) {
      return json(res, 401, { code: 401, message: '请先登录' });
    }
    const abilities = await getUserAbilities(session.user.userId);
    return json(res, 200, {
      code: 0,
      message: 'success',
      data: abilities
    });
  }

  if (method === 'POST' && pathname === '/api/me/abilities') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const session = await getCurrentSessionWorker({ createIfMissing: true });
    if (!session?.user?.userId) {
      return json(res, 401, { code: 401, message: '请先登录' });
    }

    if (!body.name?.trim()) {
      return badRequest(res, '能力名称不能为空');
    }

    const ability = await addUserAbility(session.user.userId, body);
    return json(res, 200, {
      code: 0,
      message: '能力已添加',
      ability
    });
  }

  const abilityUpdateMatch = pathname.match(/^\/api\/me\/abilities\/([^/]+)$/);
  if (method === 'PUT' && abilityUpdateMatch) {
    const abilityId = decodeURIComponent(abilityUpdateMatch[1]);
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const session = await getCurrentSessionWorker({ createIfMissing: false });
    if (!session?.user?.userId) {
      return json(res, 401, { code: 401, message: '请先登录' });
    }

    const updated = await updateUserAbility(session.user.userId, abilityId, body);
    if (!updated) {
      return notFound(res);
    }

    return json(res, 200, {
      code: 0,
      message: '能力已更新',
      ability: updated
    });
  }

  if (method === 'DELETE' && abilityUpdateMatch) {
    const abilityId = decodeURIComponent(abilityUpdateMatch[1]);

    const session = await getCurrentSessionWorker({ createIfMissing: false });
    if (!session?.user?.userId) {
      return json(res, 401, { code: 401, message: '请先登录' });
    }

    const deleted = await deleteUserAbility(session.user.userId, abilityId);
    if (!deleted) {
      return notFound(res);
    }

    return json(res, 200, {
      code: 0,
      message: '能力已删除'
    });
  }

  if (method === 'POST' && pathname === '/api/custom-models/fetch') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const session = await getCurrentSessionWorker({ createIfMissing: false });
    if (!session?.user?.userId) {
      return json(res, 401, { code: 401, message: '请先登录' });
    }

    const endpoint = String(body.endpoint || body.apiEndpoint || '').trim();
    const apiKey = String(body.apiKey || '').trim();
    if (!endpoint) {
      return badRequest(res, 'endpoint 不能为空');
    }

    const result = await fetchCustomApiModels({ endpoint, apiKey });
    return json(res, 200, {
      code: 0,
      message: '模型列表拉取成功',
      data: result
    });
  }

  // 图像生成 API 测试端点
  if (method === 'POST' && pathname === '/api/image-generate/test') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const session = await getCurrentSessionWorker({ createIfMissing: false });
    if (!session?.user?.userId) {
      return json(res, 401, { code: 401, message: '请先登录' });
    }

    const endpoint = String(body.endpoint || '').trim();
    const apiKey = String(body.apiKey || '').trim();
    const model = String(body.model || '').trim();
    const prompt = String(body.prompt || '一只可爱的猫咪').trim();
    const size = String(body.size || '').trim();
    const quality = String(body.quality || '').trim();

    if (!endpoint || !apiKey || !model) {
      return badRequest(res, 'endpoint / apiKey / model 不能为空');
    }

    try {
      const result = await callCustomApiImageGeneration({
        endpoint,
        apiKey,
        model,
        prompt,
        size,
        n: 1,
        quality
      });
      return json(res, 200, {
        code: 0,
        message: '图像生成测试成功',
        data: {
          images: result.images,
          model: result.model
        }
      });
    } catch (err) {
      return json(res, err.statusCode || 502, {
        code: err.statusCode || 502,
        message: err.message || '图像生成测试失败',
        data: err.data || null
      });
    }
  }

  if (method === 'GET' && pathname === '/api/oauth/meta') {
    const ctx = getRequestAuthContext();
    return json(res, 200, {
      code: 0,
      message: 'success',
      data: {
        oauth: oauthConfigSnapshot(),
        token: oauthTokenSnapshot(),
        requestToken: {
          source: ctx?.oauthAccessToken ? 'cookie' : 'none',
          accessTokenMasked: maskToken(ctx?.oauthAccessToken || ''),
          refreshTokenMasked: maskToken(ctx?.oauthRefreshToken || '')
        },
        secondMeAuthMode: currentAuthMode(),
        secondMeBaseUrl: SECONDME_BASE_URL
      }
    });
  }

  if (method === 'GET' && pathname === '/api/oauth/authorize-url') {
    const state = String(searchParams.get('state') || '').trim() || oauthState();
    const clientId = String(searchParams.get('clientId') || '').trim() || OAUTH_CLIENT_ID;
    const host = req.headers.host || `localhost:${PORT}`;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const currentBase = `${protocol}://${host}`;

    // Find a matching redirect URI for the current host
    let defaultRedirectUri = OAUTH_REDIRECT_URIS.find(u => u.startsWith(currentBase)) || OAUTH_REDIRECT_URI;

    // Allow overriding via query param ONLY if it's in the allowed list (security)
    let redirectUri = String(searchParams.get('redirectUri') || '').trim();
    if (redirectUri && !OAUTH_REDIRECT_URIS.includes(redirectUri)) {
      redirectUri = defaultRedirectUri; // Ignore invalid override
    }
    if (!redirectUri) {
      redirectUri = defaultRedirectUri;
    }
    const authInfo = buildOAuthAuthorizeUrl({
      state,
      clientId,
      redirectUri
    });
    res.setHeader(
      'Set-Cookie',
      buildSetCookie(OAUTH_COOKIE_STATE, state, {
        maxAge: 10 * 60
      })
    );

    return json(res, 200, {
      code: 0,
      message: 'success',
      data: authInfo
    });
  }

  if (method === 'POST' && pathname === '/api/oauth/token/code') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const code = String(body.code || '').trim();
    const clientId = String(body.clientId || '').trim() || OAUTH_CLIENT_ID;
    const clientSecret = String(body.clientSecret || '').trim() || OAUTH_CLIENT_SECRET;
    const redirectUri = String(body.redirectUri || '').trim() || OAUTH_REDIRECT_URI;
    const tokenResponse = await exchangeCodeForToken({
      code,
      clientId,
      clientSecret,
      redirectUri
    });

    if (!tokenResponse?.data?.accessToken) {
      throw new AppError('OAuth2 换取 token 失败：响应中无 accessToken', 502, {
        response: tokenResponse
      });
    }

    res.setHeader('Set-Cookie', authCookiesFromToken(tokenResponse.data));
    setRuntimeAuthTokens(tokenResponse.data, 'oauth-code');
    return json(res, 200, {
      code: 0,
      message: 'OAuth2 code 换 token 成功',
      data: {
        token: tokenResponse.data,
        runtime: oauthTokenSnapshot()
      }
    });
  }

  if (method === 'POST' && pathname === '/api/oauth/token/refresh') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const ctx = getRequestAuthContext();
    const refreshToken =
      String(body.refreshToken || '').trim() || String(ctx?.oauthRefreshToken || '').trim() || runtimeAuth.refreshToken;
    const clientId = String(body.clientId || '').trim() || OAUTH_CLIENT_ID;
    const clientSecret = String(body.clientSecret || '').trim() || OAUTH_CLIENT_SECRET;
    const tokenResponse = await refreshAccessToken({
      refreshToken,
      clientId,
      clientSecret
    });

    if (!tokenResponse?.data?.accessToken) {
      throw new AppError('OAuth2 刷新 token 失败：响应中无 accessToken', 502, {
        response: tokenResponse
      });
    }

    res.setHeader('Set-Cookie', authCookiesFromToken(tokenResponse.data));
    setRuntimeAuthTokens(tokenResponse.data, 'oauth-refresh');
    return json(res, 200, {
      code: 0,
      message: 'OAuth2 refresh 成功',
      data: {
        token: tokenResponse.data,
        runtime: oauthTokenSnapshot()
      }
    });
  }

  if (method === 'POST' && pathname === '/api/oauth/token/set') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const accessToken = String(body.accessToken || '').trim();
    if (!accessToken) {
      return badRequest(res, 'accessToken 不能为空');
    }

    setRuntimeAuthTokens(
      {
        accessToken,
        refreshToken: String(body.refreshToken || '').trim(),
        tokenType: String(body.tokenType || 'Bearer').trim() || 'Bearer',
        expiresIn: Number(body.expiresIn || 0) || 0,
        scope: parseScopeList(body.scope)
      },
      'manual-set'
    );

    return json(res, 200, {
      code: 0,
      message: '运行时 OAuth token 已更新',
      data: oauthTokenSnapshot()
    });
  }

  if (method === 'POST' && pathname === '/api/oauth/token/clear') {
    res.setHeader('Set-Cookie', clearOAuthCookies());
    clearRuntimeAuthTokens();
    return json(res, 200, {
      code: 0,
      message: '运行时 OAuth token 已清空',
      data: oauthTokenSnapshot()
    });
  }

  if (method === 'POST' && pathname === '/api/oauth/logout') {
    res.setHeader('Set-Cookie', clearOAuthCookies());
    return json(res, 200, {
      code: 0,
      message: '已退出当前会话 OAuth 登录'
    });
  }

  if (method === 'POST' && pathname === '/api/oauth/authorize/external') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const userToken = String(body.userToken || '').trim();
    const clientId = String(body.clientId || '').trim();
    const redirectUri = String(body.redirectUri || '').trim();
    const state = String(body.state || '').trim();
    const scope = parseScopeList(body.scope);

    if (!userToken) {
      return badRequest(res, 'userToken 不能为空');
    }
    if (!clientId) {
      return badRequest(res, 'clientId 不能为空');
    }
    if (!redirectUri) {
      return badRequest(res, 'redirectUri 不能为空');
    }
    if (!scope.length) {
      return badRequest(res, 'scope 不能为空');
    }

    const response = await callLabJson('/api/oauth/authorize/external', {
      method: 'POST',
      authToken: userToken,
      body: {
        clientId,
        redirectUri,
        scope,
        state: state || undefined
      }
    });

    return json(res, 200, {
      code: 0,
      message: 'success',
      data: response?.data || response
    });
  }

  if (method === 'GET' && pathname === '/api/secondme/test/user/info') {
    const authToken = pickOverrideAuthToken(req, searchParams);
    const response = await callSecondMeJson('/api/secondme/user/info', { authToken });
    return json(res, 200, {
      code: 0,
      message: 'success',
      data: response?.data || response
    });
  }

  if (method === 'GET' && pathname === '/api/secondme/test/user/shades') {
    const authToken = pickOverrideAuthToken(req, searchParams);
    const response = await callSecondMeJson('/api/secondme/user/shades', { authToken });
    return json(res, 200, {
      code: 0,
      message: 'success',
      data: response?.data || response
    });
  }

  if (method === 'GET' && pathname === '/api/secondme/test/user/softmemory') {
    const authToken = pickOverrideAuthToken(req, searchParams);
    const query = new URLSearchParams();
    ['keyword', 'pageNo', 'pageSize'].forEach((key) => {
      const value = String(searchParams.get(key) || '').trim();
      if (value) {
        query.set(key, value);
      }
    });
    const endpointPath = `/api/secondme/user/softmemory${buildQueryString(query)}`;
    const response = await callSecondMeJson(endpointPath, { authToken });
    return json(res, 200, {
      code: 0,
      message: 'success',
      data: response?.data || response
    });
  }

  if (method === 'POST' && pathname === '/api/secondme/test/note/add') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const authToken = pickOverrideAuthToken(req, searchParams, body);
    const payload = {
      memoryType: String(body.memoryType || 'TEXT').trim() || 'TEXT'
    };

    if (payload.memoryType === 'LINK') {
      const urls = Array.isArray(body.urls) ? body.urls : [];
      payload.urls = urls.map((item) => String(item || '').trim()).filter(Boolean);
      payload.title = String(body.title || '').trim();
    } else {
      payload.content = String(body.content || '').trim();
      payload.title = String(body.title || '').trim();
    }

    const response = await callSecondMeJson('/api/secondme/note/add', {
      method: 'POST',
      body: payload,
      authToken
    });
    return json(res, 200, {
      code: 0,
      message: 'success',
      data: response?.data || response
    });
  }

  if (method === 'POST' && pathname === '/api/secondme/test/chat/stream') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const authToken = pickOverrideAuthToken(req, searchParams, body);
    const includeRaw = Boolean(body.includeRaw);
    const payload = {
      message: String(body.message || '').trim(),
      sessionId: body.sessionId ? String(body.sessionId).trim() : undefined,
      appId: body.appId ? String(body.appId).trim() : undefined,
      systemPrompt: body.systemPrompt ? String(body.systemPrompt).trim() : undefined,
      receiverUserId: typeof body.receiverUserId === 'number' ? body.receiverUserId : undefined,
      enableWebSearch: Boolean(body.enableWebSearch)
    };

    if (!payload.message) {
      return badRequest(res, 'message 不能为空');
    }

    const streamResult = await callSecondMeChatStream({
      authToken,
      includeRaw,
      appId: payload.appId || SECONDME_APP_ID,
      payload
    });

    return json(res, 200, {
      code: 0,
      message: 'success',
      data: {
        stream: streamResult.stream,
        sessionId: streamResult.sessionId,
        content: streamResult.content,
        events: streamResult.events,
        raw: streamResult.raw
      }
    });
  }

  if (method === 'GET' && pathname === '/api/secondme/test/chat/session/list') {
    const authToken = pickOverrideAuthToken(req, searchParams);
    const query = new URLSearchParams();
    const appId = String(searchParams.get('appId') || '').trim();
    if (appId) {
      query.set('appId', appId);
    }
    const endpointPath = `/api/secondme/chat/session/list${buildQueryString(query)}`;
    const response = await callSecondMeJson(endpointPath, { authToken });
    return json(res, 200, {
      code: 0,
      message: 'success',
      data: response?.data || response
    });
  }

  if (method === 'GET' && pathname === '/api/secondme/test/chat/session/messages') {
    const authToken = pickOverrideAuthToken(req, searchParams);
    const sessionId = String(searchParams.get('sessionId') || '').trim();
    if (!sessionId) {
      return badRequest(res, 'sessionId 不能为空');
    }
    const query = new URLSearchParams();
    query.set('sessionId', sessionId);
    const endpointPath = `/api/secondme/chat/session/messages${buildQueryString(query)}`;
    const response = await callSecondMeJson(endpointPath, { authToken });
    return json(res, 200, {
      code: 0,
      message: 'success',
      data: response?.data || response
    });
  }

  if (method === 'POST' && pathname === '/api/secondme/test/request') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const requestMethod = String(body.method || 'GET').trim().toUpperCase();
    const requestPath = String(body.path || '').trim();
    const query = new URLSearchParams(body.query || {});
    const parseSse = Boolean(body.parseSse);
    const includeRaw = Boolean(body.includeRaw);

    if (!requestPath.startsWith('/api/secondme/')) {
      return badRequest(res, 'path 必须以 /api/secondme/ 开头');
    }
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(requestMethod)) {
      return badRequest(res, 'method 仅支持 GET/POST/PUT/PATCH/DELETE');
    }

    const authToken = pickOverrideAuthToken(req, searchParams, body);
    const headers = {
      ...(body.headers && typeof body.headers === 'object' ? body.headers : {})
    };
    const token = resolveSecondMeToken(authToken);
    ensureSecondMeConfigured(token);
    headers.Authorization = `Bearer ${token}`;

    const hasPayload = typeof body.payload !== 'undefined';
    let requestBody = undefined;
    if (hasPayload) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      requestBody = headers['Content-Type'].includes('application/json')
        ? JSON.stringify(body.payload)
        : String(body.payload);
    }

    const response = await fetch(`${SECONDME_BASE_URL}${requestPath}${buildQueryString(query)}`, {
      method: requestMethod,
      headers,
      body: requestBody
    });

    if (!response.ok) {
      const text = await response.text();
      let parsed = text;
      try {
        parsed = text ? JSON.parse(text) : '';
      } catch {
        // keep raw text
      }
      throw new AppError(`SecondMe HTTP ${response.status}`, 502, {
        status: response.status,
        body: parsed
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (parseSse && contentType.includes('text/event-stream')) {
      const raw = await readStreamAsText(response.body);
      const parsed = extractSseContent(raw);
      return json(res, 200, {
        code: 0,
        message: 'success',
        data: {
          stream: true,
          sessionId: parsed.sessionId,
          content: parsed.content,
          events: parseSseEvents(raw),
          raw: includeRaw ? raw : undefined
        }
      });
    }

    if (contentType.includes('application/json')) {
      const data = await parseSecondMeJsonResponse(response);
      return json(res, 200, {
        code: 0,
        message: 'success',
        data: data?.data || data
      });
    }

    const text = await response.text();
    return json(res, 200, {
      code: 0,
      message: 'success',
      data: {
        contentType,
        text: shortText(text, 50000)
      }
    });
  }

  // ===== 对话 API =====

  // 创建对话
  if (method === 'POST' && pathname === '/api/conversations') {
    const session = await getCurrentSessionWorker({ createIfMissing: false });
    if (!session?.user?.userId) {
      return json(res, 401, { code: 401, message: '请先登录' });
    }
    if (!supabase) {
      return json(res, 503, { code: 503, message: '数据库未配置' });
    }

    let body;
    try { body = await readBody(req); } catch (error) {
      if (String(error.message) === 'INVALID_JSON') return badRequest(res, '请求体不是合法 JSON');
      throw error;
    }

    const refId = String(body.refId || '').trim();
    const refType = String(body.refType || 'skill').trim();
    const rawReceiverId = String(body.receiverId || '').trim();
    const receiverName = String(body.receiverName || '').trim();
    const receiverAvatar = String(body.receiverAvatar || '').trim();
    const title = String(body.title || '').trim();

    if (!refId || !rawReceiverId) {
      return badRequest(res, 'refId 和 receiverId 不能为空');
    }

    const receiverId = await resolveConversationUserId(rawReceiverId);

    const myId = String(session.user.userId);
    const myName = session.user.name || session.user.displayName || '匿名用户';
    const myAvatar = session.user.avatar || session.user.profileImageUrl || '';
    const myAliases = getChatIdentityAliases(session);
    const receiverAliases = Array.from(new Set([
      rawReceiverId,
      receiverId,
      receiverId ? buildWorkerId(receiverId) : ''
    ].filter(Boolean)));

    // 不能和自己对话
    if (new Set(myAliases).has(receiverId) || new Set(myAliases).has(rawReceiverId)) {
      return badRequest(res, '不能和自己发起对话');
    }

    // 查重：同一 ref + 双方 ID（不区分发起方/接收方顺序）
    const pairOrQuery = buildConversationPairOrQuery(myAliases, receiverAliases);
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('ref_id', refId)
      .eq('ref_type', refType)
      .or(pairOrQuery);

    if (existing && existing.length > 0) {
      // 已有对话，直接返回
      return json(res, 200, { code: 0, message: '对话已存在', data: existing[0] });
    }

    // 创建新对话
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        ref_id: refId,
        ref_type: refType,
        initiator_id: myId,
        initiator_name: myName,
        initiator_avatar: myAvatar,
        receiver_id: receiverId,
        receiver_name: receiverName,
        receiver_avatar: receiverAvatar,
        title,
        last_message: ''
      })
      .select()
      .single();

    if (convErr) {
      console.error('创建对话失败:', convErr);
      throw new AppError('创建对话失败', 500, convErr);
    }

    // 插入系统消息
    await supabase.from('messages').insert({
      conversation_id: conv.id,
      sender_id: myId,
      sender_name: myName,
      type: 'system',
      content: `${myName} 发起了对话`
    });

    return json(res, 200, { code: 0, message: '对话已创建', data: conv });
  }

  // 获取当前用户的对话列表
  if (method === 'GET' && pathname === '/api/conversations') {
    const session = await getCurrentSessionWorker({ createIfMissing: false });
    if (!session?.user?.userId) {
      return json(res, 401, { code: 401, message: '请先登录' });
    }
    if (!supabase) {
      return json(res, 503, { code: 503, message: '数据库未配置' });
    }

    const myAliases = getChatIdentityAliases(session);
    const aliasOrQuery = buildConversationAliasOrQuery(myAliases);

    const { data, error: fetchErr } = await supabase
      .from('conversations')
      .select('*')
      .or(aliasOrQuery)
      .order('updated_at', { ascending: false });

    if (fetchErr) {
      console.error('获取对话列表失败:', fetchErr);
      throw new AppError('获取对话列表失败', 500, fetchErr);
    }

    return json(res, 200, { code: 0, message: 'success', data: data || [] });
  }

  // 获取对话消息
  const convMessagesMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (method === 'GET' && convMessagesMatch) {
    const convId = decodeURIComponent(convMessagesMatch[1]);
    const session = await getCurrentSessionWorker({ createIfMissing: false });
    if (!session?.user?.userId) {
      return json(res, 401, { code: 401, message: '请先登录' });
    }
    if (!supabase) {
      return json(res, 503, { code: 503, message: '数据库未配置' });
    }

    const myAliases = getChatIdentityAliases(session);

    // 验证用户是对话参与方
    const { data: conv } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', convId)
      .single();

    if (!conv) {
      return json(res, 404, { code: 404, message: '对话不存在' });
    }
    if (!conversationHasParticipant(conv, myAliases)) {
      return json(res, 403, { code: 403, message: '无权访问此对话' });
    }

    const { data: messages, error: msgErr } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    if (msgErr) {
      console.error('获取消息失败:', msgErr);
      throw new AppError('获取消息失败', 500, msgErr);
    }

    return json(res, 200, { code: 0, message: 'success', data: messages || [] });
  }

  // 发送消息
  if (method === 'POST' && convMessagesMatch) {
    const convId = decodeURIComponent(convMessagesMatch[1]);
    const session = await getCurrentSessionWorker({ createIfMissing: false });
    if (!session?.user?.userId) {
      return json(res, 401, { code: 401, message: '请先登录' });
    }
    if (!supabase) {
      return json(res, 503, { code: 503, message: '数据库未配置' });
    }

    let body;
    try { body = await readBody(req); } catch (error) {
      if (String(error.message) === 'INVALID_JSON') return badRequest(res, '请求体不是合法 JSON');
      throw error;
    }

    const myId = String(session.user.userId);
    const myName = session.user.name || session.user.displayName || '匿名用户';
    const myAliases = getChatIdentityAliases(session);

    // 验证用户是对话参与方
    const { data: conv } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', convId)
      .single();

    if (!conv) {
      return json(res, 404, { code: 404, message: '对话不存在' });
    }
    if (!conversationHasParticipant(conv, myAliases)) {
      return json(res, 403, { code: 403, message: '无权访问此对话' });
    }

    const content = String(body.content || '').trim();
    const type = String(body.type || 'text').trim();
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

    if (!content && type === 'text') {
      return badRequest(res, '消息内容不能为空');
    }

    const { data: msg, error: msgErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: convId,
        sender_id: myId,
        sender_name: myName,
        type,
        content,
        metadata
      })
      .select()
      .single();

    if (msgErr) {
      console.error('发送消息失败:', msgErr);
      throw new AppError('发送消息失败', 500, msgErr);
    }

    // 更新对话的 last_message 和 updated_at
    await supabase
      .from('conversations')
      .update({
        last_message: type === 'delivery' ? '🎉 交付结果' : content.slice(0, 50),
        updated_at: new Date().toISOString()
      })
      .eq('id', convId);

    return json(res, 200, { code: 0, message: 'success', data: msg });
  }

  // 对话中的交付（调用技能生成结果并存为 delivery 消息）
  const convDeliverMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/deliver$/);
  if (method === 'POST' && convDeliverMatch) {
    const convId = decodeURIComponent(convDeliverMatch[1]);
    const session = await getCurrentSessionWorker({ createIfMissing: true });
    if (!session?.user?.userId) {
      return json(res, 401, { code: 401, message: '请先登录' });
    }
    if (!supabase) {
      return json(res, 503, { code: 503, message: '数据库未配置' });
    }

    let body;
    try { body = await readBody(req); } catch (error) {
      if (String(error.message) === 'INVALID_JSON') return badRequest(res, '请求体不是合法 JSON');
      throw error;
    }

    const myId = String(session.user.userId);
    const myName = session.user.name || session.user.displayName || '匿名用户';
    const myAliases = getChatIdentityAliases(session);

    // 验证用户是对话参与方
    const { data: conv } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', convId)
      .single();

    if (!conv) {
      return json(res, 404, { code: 404, message: '对话不存在' });
    }
    if (!conversationHasParticipant(conv, myAliases)) {
      return json(res, 403, { code: 403, message: '无权访问此对话' });
    }

    const skillId = String(body.skillId || '').trim();
    const requirement = String(body.requirement || '').trim();
    const selectedStyleId = String(body.selectedStyleId || '').trim();

    if (!skillId) {
      return badRequest(res, 'skillId 不能为空');
    }

    // 先发一条系统消息：正在生成交付
    await supabase.from('messages').insert({
      conversation_id: convId,
      sender_id: myId,
      sender_name: myName,
      type: 'system',
      content: '正在生成交付…'
    });

    // 调用交付引擎（与 /api/skills/hire 相同逻辑）
    try {
      const allAbilities = await loadAbilities();
      let foundAbility = null;
      let abilityOwnerId = null;

      for (const [userId, abilities] of Object.entries(allAbilities)) {
        if (!Array.isArray(abilities)) continue;
        const match = abilities.find(a => a.id === skillId);
        if (match) {
          foundAbility = normalizeStoredAbility(match);
          abilityOwnerId = userId;
          break;
        }
      }

      if (!foundAbility) {
        throw new AppError('技能不存在或已下架', 404);
      }

      const workerLookup = workersMap(await loadProfiles());

      // 构建临时任务对象
      const tempTask = {
        id: uid('hire'),
        title: `雇佣: ${foundAbility.name}`,
        description: requirement,
        laborType: foundAbility.abilityType === 'image' ? 'studio-retouch' : 'custom:general',
        laborTypeName: foundAbility.name,
        requirements: requirement,
        selectedStyleId: selectedStyleId || null,
        status: 'IN_PROGRESS',
        requesterAi: myName,
        publisherId: myId,
        assigneeId: myId,
        budget: '',
        deadline: '',
        participants: [myId],
        updates: [],
        sync: { events: [], secondMeSessionId: null },
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      const delivery = await generateDelivery(tempTask, requirement, workerLookup, {
        ability: foundAbility
      });

      const deliveryContent = delivery?.content || '交付完成';
      const deliveryImages = delivery?.images || [];
      const settlement = await settleSkillDeliveryPoints({
        buyerWorkerId: session.worker?.id,
        providerSecondUserId: abilityOwnerId,
        pricePoints: foundAbility.pricePoints,
        abilityId: foundAbility.id,
        abilityName: foundAbility.name
      });

      // 存交付消息
      const { data: deliveryMsg } = await supabase
        .from('messages')
        .insert({
          conversation_id: convId,
          sender_id: myId,
          sender_name: myName,
          type: 'delivery',
          content: deliveryContent,
          metadata: {
            skillId,
            skillName: foundAbility.name || '',
            skillIcon: foundAbility.icon || '🔧',
            images: deliveryImages,
            pricePoints: normalizePointsValue(foundAbility.pricePoints, 0),
            settlement
          }
        })
        .select()
        .single();

      // 更新对话
      await supabase.from('conversations').update({
        last_message: '🎉 交付结果',
        updated_at: new Date().toISOString()
      }).eq('id', convId);

      return json(res, 200, {
        code: 0,
        message: '交付成功',
        data: deliveryMsg
      });
    } catch (err) {
      // 发送错误消息
      await supabase.from('messages').insert({
        conversation_id: convId,
        sender_id: myId,
        sender_name: myName,
        type: 'system',
        content: `❌ 交付失败：${err.message || '未知错误'}`
      });

      return json(res, err.statusCode || 500, {
        code: err.statusCode || 500,
        message: err.message || '交付失败'
      });
    }
  }

  if (method === 'POST' && pathname === '/api/admin/tasks/reorder') {
    try {
      await requireAdminSession();
    } catch (error) {
      return json(res, error.statusCode || 403, { code: error.statusCode || 403, message: error.message || '无权限' });
    }

    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const taskId = String(body.taskId || '').trim();
    const direction = String(body.direction || '').trim().toLowerCase();
    if (!taskId) {
      return badRequest(res, 'taskId 不能为空');
    }
    if (!['up', 'down'].includes(direction)) {
      return badRequest(res, 'direction 仅支持 up/down');
    }

    const tasks = await loadTasks();
    const orderedTasks = tasks.slice().sort(compareTaskHallOrder);
    const index = orderedTasks.findIndex((item) => item.id === taskId);
    if (index < 0) {
      return json(res, 404, { code: 404, message: '任务不存在' });
    }

    moveArrayItem(orderedTasks, index, direction);
    resequenceHallSort(orderedTasks, (item, rank) => {
      item.hallSort = rank;
      item.updatedAt = nowIso();
    });
    await saveTasks(tasks);

    return json(res, 200, {
      code: 0,
      message: '排序已更新'
    });
  }

  const adminTaskDeleteMatch = pathname.match(/^\/api\/admin\/tasks\/([^/]+)$/);
  if (method === 'DELETE' && adminTaskDeleteMatch) {
    try {
      await requireAdminSession();
    } catch (error) {
      return json(res, error.statusCode || 403, { code: error.statusCode || 403, message: error.message || '无权限' });
    }

    const taskId = decodeURIComponent(adminTaskDeleteMatch[1]);
    const tasks = await loadTasks();
    const index = tasks.findIndex((item) => item.id === taskId);
    if (index < 0) {
      return json(res, 404, { code: 404, message: '任务不存在' });
    }

    tasks.splice(index, 1);
    await saveTasks(tasks);
    return json(res, 200, {
      code: 0,
      message: '任务已删除'
    });
  }

  if (method === 'GET' && pathname === '/api/tasks') {
    const tasks = await loadTasks();
    const workers = await loadProfiles();
    const viewerSession = await tryGetCurrentSessionWorker({ createIfMissing: false });
    const statusFilter = searchParams.get('status');

    let list = tasks;
    if (statusFilter) {
      list = list.filter((item) => item.status === statusFilter);
    }

    list = list
      .slice()
      .sort(compareTaskHallOrder)
      .map((task) => {
        const { summary } = buildTaskSummaryForViewer(task, viewerSession, { listView: true });
        // 从 profiles 中查找发布者信息，展示真实头像和名称
        if (task.publisherId) {
          const publisher = workers.find(w => w.id === task.publisherId || w.secondUserId === task.publisherId);
          if (publisher) {
            summary.publisherName = publisher.name;
            summary.publisherAvatar = publisher.avatar;
          }
        }
        // 如果 publisherName 仍然为空，使用任务中保存的 requesterAi
        if (!summary.publisherName) {
          summary.publisherName = task.publisherName || task.requesterAi || '';
        }
        return summary;
      });

    return json(res, 200, {
      code: 0,
      message: 'success',
      data: list
    });
  }

  // 获取单个任务详情
  const taskDetailMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (method === 'GET' && taskDetailMatch) {
    const taskId = decodeURIComponent(taskDetailMatch[1]);
    const tasks = await loadTasks();
    const task = tasks.find((t) => t.id === taskId);

    if (!task) {
      return json(res, 404, { code: 404, message: '任务不存在' });
    }
    const viewerSession = await tryGetCurrentSessionWorker({ createIfMissing: false });
    const { summary: viewerTaskSummary, scope: viewerScope } = buildTaskSummaryForViewer(task, viewerSession);

    // 获取派活人信息
    const workers = await loadProfiles();
    let publisherInfo = {};
    if (task.publisherId) {
      const publisher = workers.find(w => w.id === task.publisherId || w.secondUserId === task.publisherId);
      if (publisher) {
        publisherInfo = {
          publisherName: publisher.name,
          publisherAvatar: publisher.avatar
        };
      }
    }

    // 获取接单者信息
    let assigneeInfo = {};
    if (task.assigneeId) {
      const assignee = workers.find(w => w.id === task.assigneeId);
      if (assignee) {
        assigneeInfo = {
          assigneeName: assignee.name,
          assigneeAvatar: assignee.avatar,
          assigneeAbility: task.abilityBindings?.[task.assigneeId] || null
        };
      }
    }

    // 获取交付记录
    let deliveries = [];
    if (supabase) {
      try {
        const { data } = await supabase
          .from('deliveries')
          .select('*')
          .eq('task_id', taskId)
          .order('created_at', { ascending: false });

        // 映射交付记录,并填充缺失的 worker_name
        deliveries = (data || []).map(d => {
          let workerName = d.worker_name || 'AI 分身';
          let workerAvatar = null;

          // 如果 worker_name 为空,尝试从 workers 中查找
          if (!d.worker_name && d.worker_id) {
            const worker = workers.find(w => w.id === d.worker_id || w.secondUserId === d.worker_id);
            if (worker) {
              workerName = worker.name || 'AI 分身';
              workerAvatar = worker.avatar;
            }
          }

          return {
            id: d.id,
            workerId: d.worker_id,
            workerName,
            workerAvatar,
            abilityId: d.ability_id,
            abilityName: d.ability_name,
            content: d.content,
            status: d.status,
            createdAt: d.created_at
          };
        });
      } catch (err) {
        console.error('获取交付记录失败:', err);
      }
    }

    if (!viewerScope.canViewDeliveryContent) {
      deliveries = [];
    }

    // 获取讨论（从任务的 comments 字段）
    const comments = task.comments || [];

    return json(res, 200, {
      code: 0,
      message: 'success',
      task: {
        ...viewerTaskSummary,
        ...publisherInfo,
        ...assigneeInfo,
        publisherId: task.publisherId,
        assigneeId: task.assigneeId,
        takenAt: task.takenAt,
        deliveryVisibility: task.deliveryVisibility || 'public'
      },
      deliveries,
      comments
    });
  }

  // 任务讨论区：AI 自动回复
  const aiReplyMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/ai-reply$/);
  if (method === 'POST' && aiReplyMatch) {
    const taskId = decodeURIComponent(aiReplyMatch[1]);
    const session = await getCurrentSessionWorker({ createIfMissing: false });

    if (!session?.user) {
      return json(res, 401, { code: 401, message: '请先登录' });
    }

    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const tasks = await loadTasks();
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return notFound(res);
    }

    const workerLookup = workersMap(await loadProfiles());
    const latestComments = Array.isArray(task.comments) ? task.comments.slice(-8) : [];
    const commentsText = latestComments.length
      ? latestComments
        .map((item, index) => `${index + 1}. ${item.userName || '匿名用户'}: ${item.content || ''}`)
        .join('\n')
      : '暂无讨论内容';
    const hint = String(body?.content || body?.hint || '').trim();

    const prompt = [
      '请基于任务上下文与讨论记录，生成一条可直接发送在讨论区的简短中文回复。',
      '硬性要求：',
      '1) 只输出 1~2 句，不要分点，不要解释',
      '2) 总长度不超过 40 字',
      '3) 可以是：正面回答、简短唠嗑、同问、等答案、先补充信息',
      '4) 若信息不足，优先输出“同问，等答案。”或“先补充下关键要求哈”',
      '',
      buildTaskContextText(task, workerLookup),
      `协作摘要:\n${summarizeUpdates(task, workerLookup)}`,
      `近期讨论:\n${commentsText}`,
      hint ? `补充要求: ${hint}` : ''
    ].filter(Boolean).join('\n');

    const streamResult = await callSecondMeChatStream({
      appId: SECONDME_APP_ID,
      payload: {
        message: prompt,
        appId: SECONDME_APP_ID,
        systemPrompt: '你是任务讨论区助手。请仅输出短消息正文，最多两句、40字内，不要输出任何解释、标题或Markdown。',
        sessionId: task.sync?.aiReplySessionId || task.sync?.secondMeSessionId || undefined
      }
    });

    const reply = normalizeAiDiscussionReply(streamResult?.content || '');
    if (!reply) {
      throw new AppError('SecondMe 返回内容为空', 502);
    }

    if (streamResult.sessionId) {
      ensureTaskSyncState(task);
      task.sync.aiReplySessionId = streamResult.sessionId;
      task.updatedAt = nowIso();
      await saveTasks(tasks);
    }

    return json(res, 200, {
      code: 0,
      message: 'AI 回复生成成功',
      reply,
      data: {
        reply,
        sessionId: streamResult.sessionId || null
      }
    });
  }

  // 获取任务讨论
  const commentsGetMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/comments$/);
  if (method === 'GET' && commentsGetMatch) {
    const taskId = decodeURIComponent(commentsGetMatch[1]);
    const tasks = await loadTasks();
    const task = tasks.find((t) => t.id === taskId);

    if (!task) {
      return json(res, 404, { code: 404, message: '任务不存在' });
    }

    return json(res, 200, {
      code: 0,
      message: 'success',
      comments: task.comments || []
    });
  }

  // 发布讨论
  if (method === 'POST' && commentsGetMatch) {
    const taskId = decodeURIComponent(commentsGetMatch[1]);
    const session = await getCurrentSessionWorker({ createIfMissing: false });

    if (!session?.user) {
      return json(res, 401, { code: 401, message: '请先登录' });
    }

    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const content = String(body.content || '').trim();
    if (!content) {
      return badRequest(res, '讨论内容不能为空');
    }

    const tasks = await loadTasks();
    const taskIndex = tasks.findIndex((t) => t.id === taskId);

    if (taskIndex < 0) {
      return json(res, 404, { code: 404, message: '任务不存在' });
    }

    // 初始化 comments 数组
    if (!tasks[taskIndex].comments) {
      tasks[taskIndex].comments = [];
    }

    const comment = {
      id: uid('comment'),
      userId: session.user.id || session.user.userId,
      userName: session.user.name || session.user.displayName || '匿名用户',
      userAvatar: session.user.avatar || session.user.profileImageUrl,
      content,
      createdAt: nowIso()
    };

    tasks[taskIndex].comments.push(comment);
    tasks[taskIndex].updatedAt = nowIso();
    await saveTasks(tasks);

    return json(res, 201, {
      code: 0,
      message: '发送成功',
      comment
    });
  }

  // 取消任务
  const cancelMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/cancel$/);
  if (method === 'POST' && cancelMatch) {
    const taskId = decodeURIComponent(cancelMatch[1]);
    const session = await getCurrentSessionWorker({ createIfMissing: false });

    if (!session?.user) {
      return json(res, 401, { code: 401, message: '请先登录' });
    }

    const tasks = await loadTasks();
    const taskIndex = tasks.findIndex((t) => t.id === taskId);

    if (taskIndex < 0) {
      return json(res, 404, { code: 404, message: '任务不存在' });
    }

    const task = tasks[taskIndex];

    // 只有派活人可以取消
    if (task.publisherId !== session.user.id && task.publisherId !== session.user.userId) {
      return json(res, 403, { code: 403, message: '只有派活人可以取消任务' });
    }

    if (task.status === 'DELIVERED') {
      return badRequest(res, '已交付的任务不能取消');
    }

    // 删除任务
    tasks.splice(taskIndex, 1);
    await saveTasks(tasks);

    return json(res, 200, {
      code: 0,
      message: '任务已取消'
    });
  }

  if (method === 'POST' && pathname === '/api/tasks') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    const laborTypeInput = String(body.laborType || '').trim();
    const session = await getCurrentSessionWorker({ createIfMissing: true });
    const requesterAi = session.worker?.name || String(session.user?.name || '').trim();
    const budget = String(body.budget || '').trim();
    const deadline = String(body.deadline || '').trim();

    if (!title) {
      return badRequest(res, '任务标题不能为空');
    }
    if (!description) {
      return badRequest(res, '任务描述不能为空');
    }
    // 劳务类型改为可选，默认为"通用"
    const typeInfo = resolveLaborType(laborTypeInput || 'general');

    const tasks = await loadTasks();
    const publisherId = session.worker?.id || session.user?.id || session.user?.userId || '';
    const deliveryVisibility = String(body.deliveryVisibility || 'public').trim();

    const task = {
      id: uid('task'),
      title,
      description,
      laborType: typeInfo.laborType,
      laborTypeName: typeInfo.laborTypeName,
      coverImage: String(body.coverImage || '').trim() || null,
      requesterAi,
      publisherId,
      publisherName: requesterAi,
      budget,
      deadline,
      deliveryVisibility: ['public', 'private'].includes(deliveryVisibility) ? deliveryVisibility : 'public',
      status: 'OPEN',
      participants: [],
      abilityBindings: {},
      updates: [],
      comments: [],
      delivery: null,
      sync: {
        events: [],
        secondMeSessionId: null
      },
      hallSort: Date.now(),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    const workerLookup = workersMap(await loadProfiles());
    await syncTaskCreated(task, workerLookup);
    tasks.push(task);
    await saveTasks(tasks);

    return json(res, 201, {
      code: 0,
      message: '任务发布成功',
      data: safeTaskSummary(task)
    });
  }

  const joinMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/join$/);
  if (method === 'POST' && joinMatch) {
    const taskId = decodeURIComponent(joinMatch[1]);
    const session = await getCurrentSessionWorker({ createIfMissing: true });
    const worker = session.worker;
    const workerId = String(worker?.id || '').trim();
    if (!workerId || !worker) {
      return badRequest(res, '当前会话缺少劳务体，请先完善资料');
    }

    const tasks = await loadTasks();
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return notFound(res);
    }

    if (task.laborType && !task.laborType.startsWith('custom:') && !worker.specialties.includes(task.laborType)) {
      return badRequest(res, `${worker.name} 不支持该劳务类型`);
    }

    ensureTaskAbilityBindings(task);
    const userAbilities = await getUserAbilities(session.user.userId);
    let abilityAssigned = false;
    if (!getTaskWorkerAbilityId(task, workerId) && userAbilities.length > 0) {
      setTaskWorkerAbility(task, workerId, userAbilities[0].id);
      abilityAssigned = true;
      task.updatedAt = nowIso();
    }

    if (!task.participants.includes(workerId)) {
      task.participants.push(workerId);
      task.status = 'IN_PROGRESS';
      task.updatedAt = nowIso();
      const workerLookup = workersMap(await loadProfiles());
      await syncTaskJoined(task, worker, workerLookup);
      await saveTasks(tasks);
      abilityAssigned = false;
    } else if (abilityAssigned) {
      await saveTasks(tasks);
    }

    return json(res, 200, {
      code: 0,
      message: 'AI 参与成功',
      data: safeTaskSummary(task)
    });
  }

  const takeMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/take$/);
  if (method === 'POST' && takeMatch) {
    const taskId = decodeURIComponent(takeMatch[1]);
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const requestedAbilityId = String(body.abilityId || '').trim();
    const note = String(body.note || '').trim();
    const session = await getCurrentSessionWorker({ createIfMissing: true });
    const worker = session.worker;
    const workerId = String(worker?.id || '').trim();
    if (!workerId || !worker) {
      return badRequest(res, '当前会话缺少劳务体，请先完善资料');
    }

    const tasks = await loadTasks();
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return notFound(res);
    }

    if (task.laborType && !task.laborType.startsWith('custom:') && !worker.specialties.includes(task.laborType)) {
      return badRequest(res, `${worker.name} 不支持该劳务类型`);
    }
    if (task.status === 'DELIVERED') {
      return badRequest(res, '任务已交付，不能再次接单');
    }
    const existingAssigneeId = String(task.assigneeId || '').trim();
    if (existingAssigneeId && existingAssigneeId !== workerId) {
      return json(res, 409, { code: 409, message: '任务已被其他 AI 接单' });
    }

    const userAbilities = await getUserAbilities(session.user.userId);
    let selectedAbilityId = requestedAbilityId;
    if (selectedAbilityId && !userAbilities.some((item) => item.id === selectedAbilityId)) {
      return badRequest(res, '所选能力不存在或不属于当前账号');
    }
    if (!selectedAbilityId && userAbilities.length > 0) {
      selectedAbilityId = userAbilities[0].id;
    }

    ensureTaskAbilityBindings(task);
    if (selectedAbilityId) {
      setTaskWorkerAbility(task, workerId, selectedAbilityId);
    }

    const workerLookup = workersMap(await loadProfiles());
    let shouldSave = false;
    const joinedNow = !task.participants.includes(workerId);
    if (joinedNow) {
      task.participants.push(workerId);
    }
    if (!existingAssigneeId) {
      task.assigneeId = workerId;  // 保存接单者ID
      task.assigneeName = worker.name;  // 保存接单者名称
      task.takenAt = nowIso();  // 保存接单时间
      shouldSave = true;
    } else if (!task.takenAt) {
      task.takenAt = nowIso();
      shouldSave = true;
    }

    if (joinedNow || shouldSave) {
      task.status = 'IN_PROGRESS';
      task.updatedAt = nowIso();
    }

    if (joinedNow) {
      await syncTaskJoined(task, worker, workerLookup);
      shouldSave = true;
    }

    if (note) {
      task.updates.push({
        id: uid('upd'),
        workerId,
        message: note,
        at: nowIso()
      });
      task.updatedAt = nowIso();
      await syncTaskUpdate(task, worker, note, workerLookup);
      shouldSave = true;
    }

    if (shouldSave || selectedAbilityId) {
      task.updatedAt = nowIso();
      await saveTasks(tasks);
    }

    return json(res, 200, {
      code: 0,
      message: '接单成功',
      data: safeTaskSummary(task)
    });
  }

  const updateMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/updates$/);
  if (method === 'POST' && updateMatch) {
    const taskId = decodeURIComponent(updateMatch[1]);
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const message = String(body.message || '').trim();

    if (!message) {
      return badRequest(res, 'message 不能为空');
    }
    const session = await getCurrentSessionWorker({ createIfMissing: true });
    const worker = session.worker;
    const workerId = String(worker?.id || '').trim();
    if (!workerId || !worker) {
      return badRequest(res, '当前会话缺少劳务体，请先完善资料');
    }

    const tasks = await loadTasks();
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return notFound(res);
    }

    if (!task.participants.includes(workerId)) {
      return badRequest(res, '该 AI 尚未参与任务，无法提交协作备注');
    }

    task.updates.push({
      id: uid('upd'),
      workerId,
      message,
      at: nowIso()
    });
    task.updatedAt = nowIso();
    const workerLookup = workersMap(await loadProfiles());
    await syncTaskUpdate(task, worker, message, workerLookup);

    await saveTasks(tasks);

    return json(res, 200, {
      code: 0,
      message: '协作备注已提交',
      data: safeTaskSummary(task)
    });
  }

  // ===== 技能雇佣（即时交付） =====
  if (method === 'POST' && pathname === '/api/skills/hire') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const skillId = String(body.skillId || '').trim();
    const requirement = String(body.requirement || '').trim();
    const selectedStyleId = String(body.selectedStyleId || '').trim();

    if (!skillId) {
      return badRequest(res, '缺少技能ID (skillId)');
    }
    if (!requirement) {
      return badRequest(res, '请填写需求描述 (requirement)');
    }

    // 验证用户已登录
    const session = await getCurrentSessionWorker({ createIfMissing: true });
    const worker = session.worker;
    if (!worker) {
      return badRequest(res, '请先登录');
    }

    // 在所有用户的能力中查找该 skillId（abilityId）
    const allAbilities = await loadAbilities();
    let foundAbility = null;
    let abilityOwnerId = null;

    for (const [userId, abilities] of Object.entries(allAbilities)) {
      if (!Array.isArray(abilities)) continue;
      const match = abilities.find(a => a.id === skillId);
      if (match) {
        foundAbility = normalizeStoredAbility(match);
        abilityOwnerId = userId;
        break;
      }
    }

    if (!foundAbility) {
      return badRequest(res, '技能不存在或已下架');
    }

    const availableStyles = Array.isArray(foundAbility.styles) ? foundAbility.styles : [];
    if (selectedStyleId && availableStyles.length === 0) {
      return badRequest(res, '当前技能未配置风格');
    }
    if (selectedStyleId && !availableStyles.some((style) => style.id === selectedStyleId)) {
      return badRequest(res, '所选风格不存在或已下架');
    }

    // 构建临时任务对象（不持久化到任务列表,仅用于交付引擎）
    const tempTask = {
      id: uid('hire'),
      title: `雇佣: ${foundAbility.name}`,
      description: requirement,
      laborType: foundAbility.abilityType === 'image' ? 'studio-retouch' : 'custom:general',
      laborTypeName: foundAbility.name,
      requirements: requirement,
      selectedStyleId: selectedStyleId || null,
      status: 'IN_PROGRESS',
      requesterAi: worker.name || 'AI 用户',
      publisherId: worker.id,
      assigneeId: worker.id,
      budget: '',
      deadline: '',
      participants: [worker.id],
      updates: [],
      sync: { events: [], secondMeSessionId: null },
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    const workerLookup = workersMap(await loadProfiles());

    // 调用交付引擎
    const delivery = await generateDelivery(tempTask, requirement, workerLookup, {
      ability: foundAbility
    });

    // 交付完成后进行积分结算（技能定价）
    const settlement = await settleSkillDeliveryPoints({
      buyerWorkerId: worker.id,
      providerSecondUserId: abilityOwnerId,
      pricePoints: foundAbility.pricePoints,
      abilityId: foundAbility.id,
      abilityName: foundAbility.name
    });

    // 保存交付历史
    await saveDeliveryHistory({
      id: uid('delivery'),
      taskId: tempTask.id,
      workerId: worker.id,
      workerName: worker.name || 'AI 用户',
      abilityId: foundAbility.id,
      abilityName: foundAbility.name,
      content: delivery.content || '',
      status: 'completed',
      createdAt: nowIso()
    });

    return json(res, 200, {
      code: 0,
      message: '雇佣交付已完成',
      data: {
        content: delivery.content || '',
        images: delivery.images || [],
        engine: delivery.engine || 'unknown',
        abilityName: foundAbility.name,
        abilityId: foundAbility.id,
        pricePoints: normalizePointsValue(foundAbility.pricePoints, 0),
        settlement
      }
    });
  }

  const deliverMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/deliver$/);
  if (method === 'POST' && deliverMatch) {
    const taskId = decodeURIComponent(deliverMatch[1]);
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      if (String(error.message) === 'INVALID_JSON') {
        return badRequest(res, '请求体不是合法 JSON');
      }
      throw error;
    }

    const brief = String(body.brief || '').trim();
    const session = await getCurrentSessionWorker({ createIfMissing: true });
    const worker = session.worker;
    const workerId = String(worker?.id || '').trim();
    if (!workerId || !worker) {
      return badRequest(res, '当前会话缺少劳务体，请先完善资料');
    }

    const tasks = await loadTasks();
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return notFound(res);
    }
    if (task.status === 'OPEN' && !task.assigneeId) {
      return badRequest(res, '请先接单再交付');
    }

    const actorIds = sessionActorIds(session);
    const currentAssigneeId = String(task.assigneeId || '').trim();
    if (currentAssigneeId && !actorIds.has(currentAssigneeId)) {
      return json(res, 403, { code: 403, message: '只有接单者可以交付' });
    }

    if (!task.participants.includes(workerId)) {
      task.participants.push(workerId);
      task.updatedAt = nowIso();
    }
    if (!currentAssigneeId) {
      task.assigneeId = workerId;
      task.assigneeName = worker.name;
      task.takenAt = task.takenAt || nowIso();
      task.status = 'IN_PROGRESS';
      task.updatedAt = nowIso();
    }

    ensureTaskAbilityBindings(task);
    const workerLookup = workersMap(await loadProfiles());
    const userAbilities = await getUserAbilities(session.user.userId);
    const selectedAbilityId = getTaskWorkerAbilityId(task, workerId);
    const boundAbility = userAbilities.find((item) => item.id === selectedAbilityId) || null;
    const imagePreferredAbility = userAbilities.find((item) => (
      item
      && item.enabled !== false
      && item.useCustomApi
      && item.abilityType === 'image'
    )) || null;
    const selectedAbility = boundAbility || imagePreferredAbility || userAbilities[0] || null;
    const delivery = await generateDelivery(task, brief, workerLookup, {
      ability: selectedAbility
    });

    task.delivery = {
      ...delivery,
      createdAt: nowIso()
    };
    if (delivery.sessionId) {
      ensureTaskSyncState(task);
      task.sync.secondMeSessionId = delivery.sessionId;
    }
    task.status = 'DELIVERED';
    task.updatedAt = nowIso();
    await syncTaskDelivery(task, workerLookup);

    // 保存交付历史到 Supabase
    await saveDeliveryHistory({
      id: uid('delivery'),
      taskId: task.id,
      workerId,
      workerName: worker?.name || session.user?.name || 'AI 分身',
      abilityId: selectedAbility?.id || null,
      abilityName: selectedAbility?.name || null,
      content: delivery.content || '',
      status: 'completed',
      createdAt: nowIso()
    });

    await saveTasks(tasks);

    return json(res, 200, {
      code: 0,
      message: '交付已生成',
      data: safeTaskSummary(task)
    });
  }

  // 获取任务交付历史
  const deliveriesMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/deliveries$/);
  if (method === 'GET' && deliveriesMatch) {
    const taskId = decodeURIComponent(deliveriesMatch[1]);
    const tasks = await loadTasks();
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return notFound(res);
    }
    const viewerSession = await tryGetCurrentSessionWorker({ createIfMissing: false });
    const scope = taskViewerScope(task, viewerSession);
    if (!scope.canViewDeliveryContent) {
      return json(res, 403, { code: 403, message: '该任务交付内容仅派活人可见' });
    }
    const deliveries = await getTaskDeliveries(taskId);
    return json(res, 200, {
      code: 0,
      message: 'success',
      data: deliveries
    });
  }

  // 删除交付记录
  const deleteDeliveryMatch = pathname.match(/^\/api\/deliveries\/([^/]+)$/);
  if (method === 'DELETE' && deleteDeliveryMatch) {
    const deliveryId = decodeURIComponent(deleteDeliveryMatch[1]);
    const session = await getCurrentSessionWorker({ createIfMissing: true });
    if (!session?.user?.userId) {
      return badRequest(res, '请先登录');
    }
    if (!supabase) {
      return json(res, 503, { code: 503, message: '当前环境不支持删除交付记录' });
    }

    const { data: deliveryRow, error: deliveryFetchError } = await supabase
      .from('deliveries')
      .select('*')
      .eq('id', deliveryId)
      .single();

    if (deliveryFetchError && deliveryFetchError.code !== 'PGRST116') {
      throw new AppError('查询交付记录失败', 500, deliveryFetchError);
    }
    if (!deliveryRow) {
      return json(res, 404, { code: 404, message: '交付记录不存在' });
    }

    const actorIds = sessionActorIds(session);
    let canDelete = isAdminUser(session.user);
    if (!canDelete && actorIds.has(String(deliveryRow.worker_id || '').trim())) {
      canDelete = true;
    }
    if (!canDelete) {
      const tasks = await loadTasks();
      const relatedTask = tasks.find((item) => item.id === deliveryRow.task_id);
      if (relatedTask) {
        canDelete = taskViewerScope(relatedTask, session).canManageDeliveries;
      }
    }
    if (!canDelete) {
      return json(res, 403, { code: 403, message: '无权删除该交付记录' });
    }

    const success = await deleteDeliveryById(deliveryId);
    if (!success) {
      return json(res, 500, {
        code: -1,
        message: '删除失败'
      });
    }

    return json(res, 200, {
      code: 0,
      message: '删除成功'
    });
  }

  if (method === 'GET' && pathname === '/api/secondme/profile') {
    const ctx = getRequestAuthContext();
    const sessionToken = String(ctx?.oauthAccessToken || '').trim();
    if (!sessionToken) {
      return json(res, 200, {
        code: 0,
        message: '当前未登录 SecondMe 账号',
        data: {
          connected: false,
          isAdmin: false,
          profile: null,
          worker: null,
          authMode: currentAuthMode(),
          requiredScopes: REQUIRED_SCOPES,
          extendedScopes: EXTENDED_SCOPES,
          oauthToken: oauthTokenSnapshot()
        }
      });
    }
    try {
      const session = await getCurrentSessionWorker({ createIfMissing: true });
      return json(res, 200, {
        code: 0,
        message: 'success',
        data: {
          isAdmin: isAdminUser(session.user),
          connected: true,
          profile: {
            code: 0,
            data: session.user
          },
          worker: session.worker,
          appId: SECONDME_APP_ID,
          authMode: currentAuthMode(),
          oauthToken: oauthTokenSnapshot()
        }
      });
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'SecondMe 连接失败';
      const details = error instanceof AppError ? error.details : null;
      return json(res, 200, {
        code: 0,
        message,
        data: {
          connected: false,
          isAdmin: false,
          error: details,
          authMode: currentAuthMode(),
          requiredScopes: REQUIRED_SCOPES,
          extendedScopes: EXTENDED_SCOPES,
          oauthToken: oauthTokenSnapshot()
        }
      });
    }
  }

  return false;
}

function escapeHtmlText(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function handleOAuthCallbackPage(req, res, urlObj) {
  const ctx = getRequestAuthContext();
  const code = String(urlObj.searchParams.get('code') || '').trim();
  const state = String(urlObj.searchParams.get('state') || '').trim();
  const error = String(urlObj.searchParams.get('error') || '').trim();
  const errorDescription = String(urlObj.searchParams.get('error_description') || '').trim();
  const stateFromCookie = String(ctx?.oauthState || '').trim();

  if (stateFromCookie && stateFromCookie !== state) {
    const content = buildCallbackPage({
      success: false,
      title: '登录验证失败',
      message: '安全状态校验不通过（可能重复打开或会话已变化），请重新发起登录。',
      redirectTarget: null
    });
    res.setHeader('Set-Cookie', clearCookie(OAUTH_COOKIE_STATE));
    return html(res, 400, content);
  }

  if (error) {
    const content = buildCallbackPage({
      success: false,
      title: '登录被拒绝',
      message: `授权失败：${escapeHtmlText(errorDescription || error)}。请返回重试。`,
      redirectTarget: null
    });
    res.setHeader('Set-Cookie', clearCookie(OAUTH_COOKIE_STATE));
    return html(res, 400, content);
  }

  if (!code) {
    const content = buildCallbackPage({
      success: false,
      title: '登录参数缺失',
      message: '未检测到授权码，请重新发起登录。',
      redirectTarget: null
    });
    res.setHeader('Set-Cookie', clearCookie(OAUTH_COOKIE_STATE));
    return html(res, 400, content);
  }

  const host = req.headers.host || `localhost:${PORT}`;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const currentBase = `${protocol}://${host}`;
  const matchedRedirectUri = OAUTH_REDIRECT_URIS.find(u => u.startsWith(currentBase));

  const redirectUri = matchedRedirectUri || OAUTH_REDIRECT_URI || `${absoluteBaseUrl(req)}${urlObj.pathname}`;
  let exchanged = false;
  let exchangeErrorMsg = '';

  if (OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET) {
    try {
      const tokenResponse = await exchangeCodeForToken({
        code,
        clientId: OAUTH_CLIENT_ID,
        clientSecret: OAUTH_CLIENT_SECRET,
        redirectUri
      });
      if (!tokenResponse?.data?.accessToken) {
        throw new AppError('token 响应缺少 accessToken', 502, tokenResponse);
      }
      const setCookies = authCookiesFromToken(tokenResponse.data);
      setCookies.push(clearCookie(OAUTH_COOKIE_STATE));
      res.setHeader('Set-Cookie', setCookies);
      setRuntimeAuthTokens(tokenResponse.data, 'oauth-callback');
      exchanged = true;
    } catch (errorObj) {
      exchanged = false;
      exchangeErrorMsg = errorObj instanceof Error ? errorObj.message : String(errorObj);
    }
  } else {
    exchangeErrorMsg = '服务器未配置 OAuth 参数，请联系管理员。';
  }
  if (!exchanged) {
    res.setHeader('Set-Cookie', clearCookie(OAUTH_COOKIE_STATE));
  }

  const redirectTarget = '/';
  const redirectDelayMs = 1200;

  const content = exchanged
    ? buildCallbackPage({
      success: true, title: '登录成功', message: '正在进入...', redirectTarget, redirectDelayMs,
      accessToken: exchanged ? String(tokenResponse?.data?.accessToken || '').trim() : ''
    })
    : buildCallbackPage({ success: false, title: '登录失败', message: exchangeErrorMsg || '获取登录凭证失败，请重试。', redirectTarget: null });

  return html(res, exchanged ? 200 : 400, content);
}

/** 生成美观的 OAuth 回调页（成功/失败通用） */
function buildCallbackPage({ success, title, message, redirectTarget, redirectDelayMs = 1200, accessToken = '' }) {
  // 登录成功时，将 token 存入 sessionStorage，解决 WKWebView Cookie 不传递的问题
  const storeToken = accessToken
    ? `<script>try{sessionStorage.setItem('niuma_access_token',${JSON.stringify(accessToken)});}catch(e){}<\/script>`
    : '';
  const autoRedirect = success && redirectTarget
    ? `<script>setTimeout(()=>{window.location.replace(${JSON.stringify(redirectTarget)});},${redirectDelayMs});<\/script>`
    : '';

  const iconHtml = success
    ? `<div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;box-shadow:0 8px 24px rgba(217,119,6,0.3);">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      </div>`
    : `<div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#ef4444,#dc2626);display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;box-shadow:0 8px 24px rgba(239,68,68,0.3);">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </div>`;

  const spinnerHtml = success
    ? `<div style="display:flex;align-items:center;justify-content:center;gap:0.5rem;margin-top:1.5rem;color:#9ca3af;font-size:0.875rem;">
        <div style="width:16px;height:16px;border:2px solid #e5e7eb;border-top-color:#d97706;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        正在跳转首页...
      </div>`
    : `<a href="/" style="display:inline-flex;align-items:center;gap:0.5rem;margin-top:1.5rem;padding:0.625rem 1.5rem;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;border-radius:0.75rem;text-decoration:none;font-weight:600;font-size:0.875rem;box-shadow:0 4px 12px rgba(217,119,6,0.3);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        返回重试
      </a>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${success ? '登录成功' : '登录失败'} · Cyber NiuMa</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&display=swap" rel="stylesheet" />
  ${storeToken}
  ${autoRedirect}
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:"Noto Sans SC",ui-sans-serif,system-ui,sans-serif;background:#fdfbf7;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem;}
    body::before{content:'';position:fixed;inset:0;background:linear-gradient(135deg,rgba(255,169,109,0.15) 0%,rgba(114,198,193,0.1) 100%);pointer-events:none;}
    .card{position:relative;background:white;border-radius:1.5rem;padding:2.5rem 2rem;max-width:380px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.08),0 4px 16px rgba(0,0,0,0.04);border:1px solid rgba(255,255,255,0.8);}
    .logo{display:flex;align-items:center;justify-content:center;gap:0.625rem;margin-bottom:2rem;}
    .logo img{width:36px;height:36px;border-radius:0.625rem;}
    .logo span{font-size:1rem;font-weight:900;color:#111827;letter-spacing:-0.02em;}
    h1{font-size:1.25rem;font-weight:700;color:#111827;margin-bottom:0.625rem;}
    p{font-size:0.875rem;color:#6b7280;line-height:1.6;}
    @keyframes spin{to{transform:rotate(360deg);}}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <img src="/logo.png" alt="logo" onerror="this.style.display='none'" />
      <span>Cyber NiuMa</span>
    </div>
    ${iconHtml}
    <h1>${escapeHtmlText(title)}</h1>
    <p>${escapeHtmlText(message)}</p>
    ${spinnerHtml}
  </div>
</body>
</html>`;

}

async function serveStatic(req, res, urlObj) {
  let pathname = urlObj.pathname;

  if (pathname === '/') {
    pathname = '/index.html';
  }

  if (pathname.startsWith('/uploads/')) {
    // 上传文件支持从当前目录和历史目录读取，兼容旧数据。
    const uploadName = path.basename(pathname);
    const uploadRoots = [UPLOADS_DIR];
    if (LEGACY_UPLOADS_DIR !== UPLOADS_DIR) {
      uploadRoots.push(LEGACY_UPLOADS_DIR);
    }

    for (const root of uploadRoots) {
      const uploadPath = path.join(root, uploadName);
      try {
        const data = await fs.readFile(uploadPath);
        const ext = path.extname(uploadPath).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': type,
          'Content-Length': data.length
        });
        return res.end(data);
      } catch {
        // try next root
      }
    }

    res.writeHead(404);
    return res.end('Not Found');
  }

  const safePath = path.normalize(pathname).replace(/^([.]{2}[\/])+/, '');
  const filePath = path.join(WEB_DIR, safePath);

  if (!filePath.startsWith(WEB_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length
    });
    res.end(data);
  } catch {
    if (pathname !== '/index.html') {
      try {
        const html = await fs.readFile(path.join(WEB_DIR, 'index.html'));
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': html.length
        });
        return res.end(html);
      } catch {
        // ignore
      }
    }
    res.writeHead(404);
    res.end('Not Found');
  }
}

export async function requestHandler(req, res) {
  const cookies = parseCookieHeader(req.headers.cookie || '');
  // 优先从 Cookie 读取 Token（浏览器正常登录流程）
  // Fallback: 从 Authorization: Bearer <token> header 读取（App WKWebView 环境）
  const cookieToken = String(cookies[OAUTH_COOKIE_ACCESS] || '').trim();
  const bearerHeader = String(req.headers.authorization || req.headers['x-secondme-token'] || '').trim();
  const bearerToken = bearerHeader.startsWith('Bearer ') ? bearerHeader.slice(7).trim() : bearerHeader;
  const resolvedToken = cookieToken || bearerToken;

  return requestAuthStore.run(
    {
      oauthAccessToken: resolvedToken,
      oauthRefreshToken: String(cookies[OAUTH_COOKIE_REFRESH] || '').trim(),
      oauthState: String(cookies[OAUTH_COOKIE_STATE] || '').trim()
    },
    async () => {
      try {
        const host = req.headers.host || `localhost:${PORT}`;
        const urlObj = new URL(req.url || '/', `http://${host}`);

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          return res.end();
        }

        if (req.method === 'GET' && urlObj.pathname === '/oauth/callback') {
          await handleOAuthCallbackPage(req, res, urlObj);
          return;
        }

        if (urlObj.pathname.startsWith('/api/')) {
          const handled = await handleApi(req, res, urlObj);
          if (handled === false) {
            return notFound(res);
          }
          return;
        }

        await serveStatic(req, res, urlObj);
      } catch (error) {
        if (error instanceof AppError) {
          return json(res, error.statusCode, {
            code: error.statusCode,
            message: error.message,
            details: error.details || null
          });
        }
        internalError(res, error);
      }
    }
  );
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMainModule) {
  const server = http.createServer(requestHandler);
  server.listen(PORT, HOST, () => {
    console.log(`[AI Labor Market] running at http://127.0.0.1:${PORT}`);
    console.log(`[AI Labor Market] SecondMe base: ${SECONDME_BASE_URL}`);
    console.log(`[AI Labor Market] mode: direct-secondme`);
    console.log(`[AI Labor Market] auth mode: ${currentAuthMode()}`);
    console.log(`[AI Labor Market] OAuth client: ${oauthClientConfigured() ? 'configured' : 'missing'}; redirect_uris: ${OAUTH_REDIRECT_URIS.join(', ') || 'missing'}`);
    console.log(`[AI Labor Market] required scopes: ${REQUIRED_SCOPES.join(',')}; extended scopes: ${EXTENDED_SCOPES.join(',')}`);
    if (!resolveSecondMeToken()) {
      console.log('[AI Labor Market] required login: OAuth Access Token');
    }
    if (IS_VERCEL) {
      console.log(`[AI Labor Market] data file (ephemeral): ${DATA_FILE}`);
    }
  });
}
