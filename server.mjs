import http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const WEB_DIR = path.join(__dirname, 'web');
const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'ai-labor-market') : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tasks.json');
const PROFILE_FILE = path.join(DATA_DIR, 'profiles.json');
const ABILITIES_FILE = path.join(DATA_DIR, 'abilities.json');
const SECONDME_BASE_URL = process.env.SECONDME_BASE_URL || 'https://app.mindos.com/gate/lab';
const SECONDME_APP_ID = process.env.SECONDME_APP_ID || 'general';
const OAUTH_AUTHORIZE_URL = process.env.SECONDME_OAUTH_AUTHORIZE_URL || 'https://go.second.me/oauth/';
const OAUTH_CLIENT_ID = process.env.SECONDME_CLIENT_ID || process.env.OAUTH_CLIENT_ID || '';
const OAUTH_CLIENT_SECRET = process.env.SECONDME_CLIENT_SECRET || process.env.OAUTH_CLIENT_SECRET || '';
const OAUTH_REDIRECT_URI = process.env.SECONDME_REDIRECT_URI || process.env.OAUTH_REDIRECT_URI || '';
const OAUTH_ACCESS_TOKEN = process.env.SECONDME_ACCESS_TOKEN || process.env.OAUTH_ACCESS_TOKEN || '';
const OAUTH_REFRESH_TOKEN = process.env.SECONDME_REFRESH_TOKEN || process.env.OAUTH_REFRESH_TOKEN || '';
const OAUTH_SCOPE_ENV = process.env.SECONDME_OAUTH_SCOPE || process.env.OAUTH_SCOPE || '';
const REQUIRED_SCOPES = ['user.info', 'chat', 'note.add'];
const EXTENDED_SCOPES = ['user.info.shades', 'user.info.softmemory', 'voice'];
const OAUTH_COOKIE_ACCESS = 'niuma_oauth_at';
const OAUTH_COOKIE_REFRESH = 'niuma_oauth_rt';
const OAUTH_COOKIE_STATE = 'niuma_oauth_state';
const COOKIE_SECURE = IS_VERCEL || process.env.NODE_ENV === 'production';

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
  '.ico': 'image/x-icon'
};

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

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
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
  return Boolean(OAUTH_REDIRECT_URI);
}

function oauthConfigSnapshot() {
  return {
    authorizeUrl: OAUTH_AUTHORIZE_URL,
    clientIdConfigured: Boolean(OAUTH_CLIENT_ID),
    clientSecretConfigured: Boolean(OAUTH_CLIENT_SECRET),
    redirectUriConfigured: Boolean(OAUTH_REDIRECT_URI),
    redirectUri: OAUTH_REDIRECT_URI || null,
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
    participants: task.participants,
    abilityBindings: task.abilityBindings,
    updates: task.updates,
    delivery: task.delivery,
    sync: task.sync || null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
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

function normalizeStoredAbility(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return {
    id: String(source.id || '').trim() || uid('ability'),
    name: String(source.name || '').trim(),
    icon: String(source.icon || '🔧').trim() || '🔧',
    description: String(source.description || '').trim(),
    prompt: String(source.prompt || '').trim(),
    enabled: toBoolean(source.enabled, true),
    useCustomApi: toBoolean(source.useCustomApi, false),
    customApi: normalizeCustomApiConfig(
      {
        endpoint: source?.customApi?.endpoint ?? source.endpoint ?? source.apiEndpoint,
        apiKey: source?.customApi?.apiKey ?? source.apiKey,
        model: source?.customApi?.model ?? source.model
      },
      source?.customApi
    ),
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
  return new Map(workers.map((worker) => [worker.id, worker]));
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
}

async function loadTasks() {
  await ensureDataFiles();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function saveTasks(tasks) {
  await fs.writeFile(DATA_FILE, JSON.stringify(tasks, null, 2), 'utf8');
}

async function loadProfiles() {
  await ensureDataFiles();
  const raw = await fs.readFile(PROFILE_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : [];
  return list.map(profileToWorker);
}

async function saveProfiles(workers) {
  await ensureDataFiles();
  const normalized = (Array.isArray(workers) ? workers : []).map((worker) => ({
    secondUserId: String(worker.secondUserId || '').trim(),
    workerId: String(worker.id || worker.workerId || '').trim(),
    name: String(worker.name || '').trim(),
    title: String(worker.title || '').trim(),
    specialties: normalizeSpecialties(worker.specialties),
    persona: String(worker.persona || '').trim(),
    avatar: String(worker.avatar || '').trim(),
    createdAt: worker.createdAt || nowIso(),
    updatedAt: worker.updatedAt || nowIso()
  }));
  await fs.writeFile(PROFILE_FILE, JSON.stringify(normalized, null, 2), 'utf8');
}

// ===== 能力库 CRUD =====
async function loadAbilities() {
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
  await ensureDataFiles();
  await fs.writeFile(ABILITIES_FILE, JSON.stringify(data, null, 2), 'utf8');
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
  const updated = normalizeStoredAbility({
    ...current,
    name: hasOwn(patch, 'name') ? String(patch.name || '').trim() : current.name,
    icon: hasOwn(patch, 'icon') ? String(patch.icon || '🔧').trim() : current.icon,
    description: hasOwn(patch, 'description') ? String(patch.description || '').trim() : current.description,
    prompt: hasOwn(patch, 'prompt') ? String(patch.prompt || '').trim() : current.prompt,
    enabled: hasOwn(patch, 'enabled') ? toBoolean(patch.enabled, true) : current.enabled,
    useCustomApi: hasOwn(patch, 'useCustomApi') ? toBoolean(patch.useCustomApi, false) : current.useCustomApi,
    customApi: mergedCustomApi,
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
    // 积分系统字段
    earnedPoints: base.earnedPoints || 0,
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
  if (pathname.endsWith('/models')) {
    pathname = pathname.slice(0, -'/models'.length) || '/v1';
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

async function generateDelivery(task, customBrief, workerLookup, { ability = null } = {}) {
  const preferCustomApi = Boolean(ability && ability.enabled !== false && ability.useCustomApi);
  if (preferCustomApi) {
    return customApiDelivery(task, customBrief, workerLookup, ability);
  }
  return secondMeDelivery(task, customBrief, workerLookup);
}

async function handleApi(req, res, urlObj) {
  const { method } = req;
  const { pathname, searchParams } = urlObj;

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
    return json(res, 200, {
      code: 0,
      message: 'success',
      data: {
        laborTypes: LABOR_TYPES,
        workers,
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
    const redirectUri = String(searchParams.get('redirectUri') || '').trim() || OAUTH_REDIRECT_URI;
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

  if (method === 'GET' && pathname === '/api/tasks') {
    const tasks = await loadTasks();
    const statusFilter = searchParams.get('status');

    let list = tasks;
    if (statusFilter) {
      list = list.filter((item) => item.status === statusFilter);
    }

    list = list
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(safeTaskSummary);

    return json(res, 200, {
      code: 0,
      message: 'success',
      data: list
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
    if (!laborTypeInput) {
      return badRequest(res, '劳务类型不能为空');
    }
    const typeInfo = resolveLaborType(laborTypeInput);

    const tasks = await loadTasks();
    const task = {
      id: uid('task'),
      title,
      description,
      laborType: typeInfo.laborType,
      laborTypeName: typeInfo.laborTypeName,
      requesterAi,
      budget,
      deadline,
      status: 'OPEN',
      participants: [],
      abilityBindings: {},
      updates: [],
      delivery: null,
      sync: {
        events: [],
        secondMeSessionId: null
      },
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
    if (!task.participants.includes(workerId)) {
      task.participants.push(workerId);
      task.status = 'IN_PROGRESS';
      task.updatedAt = nowIso();
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

    if (!task.participants.includes(workerId) && task.requesterAi !== worker.name) {
      return badRequest(res, '仅任务发布者或参与者可生成交付');
    }

    ensureTaskAbilityBindings(task);
    const workerLookup = workersMap(await loadProfiles());
    const userAbilities = await getUserAbilities(session.user.userId);
    const selectedAbilityId = getTaskWorkerAbilityId(task, workerId);
    const selectedAbility =
      userAbilities.find((item) => item.id === selectedAbilityId) ||
      userAbilities[0] ||
      null;
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

    await saveTasks(tasks);

    return json(res, 200, {
      code: 0,
      message: '交付已生成',
      data: safeTaskSummary(task)
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
    const content = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>OAuth 回调失败</title></head>
  <body style="font-family: ui-sans-serif,system-ui; padding: 24px;">
    <h2>OAuth 回调失败</h2>
    <p><strong>error:</strong> state 校验失败（可能重复打开或会话已变化）</p>
    <p><strong>state(query):</strong> ${escapeHtmlText(state)}</p>
    <p><strong>state(cookie):</strong> ${escapeHtmlText(stateFromCookie)}</p>
  </body>
</html>`;
    res.setHeader('Set-Cookie', clearCookie(OAUTH_COOKIE_STATE));
    return html(res, 400, content);
  }

  if (error) {
    const content = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>OAuth 回调失败</title></head>
  <body style="font-family: ui-sans-serif,system-ui; padding: 24px;">
    <h2>OAuth 回调失败</h2>
    <p><strong>error:</strong> ${escapeHtmlText(error)}</p>
    <p><strong>error_description:</strong> ${escapeHtmlText(errorDescription || '无')}</p>
    <p><strong>state:</strong> ${escapeHtmlText(state || '无')}</p>
  </body>
</html>`;
    res.setHeader('Set-Cookie', clearCookie(OAUTH_COOKIE_STATE));
    return html(res, 400, content);
  }

  if (!code) {
    const content = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>OAuth 回调</title></head>
  <body style="font-family: ui-sans-serif,system-ui; padding: 24px;">
    <h2>OAuth 回调</h2>
    <p>未检测到授权码 <code>code</code>。</p>
  </body>
</html>`;
    res.setHeader('Set-Cookie', clearCookie(OAUTH_COOKIE_STATE));
    return html(res, 400, content);
  }

  const redirectUri = OAUTH_REDIRECT_URI || `${absoluteBaseUrl(req)}${urlObj.pathname}`;
  let exchanged = false;
  let exchangeMessage = '尚未执行 code 换 token';
  let exchangePayload = null;

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
      exchangeMessage = 'code 换 token 成功，已写入当前浏览器会话';
      exchangePayload = tokenResponse.data;
    } catch (errorObj) {
      exchanged = false;
      exchangeMessage = errorObj instanceof Error ? errorObj.message : String(errorObj);
    }
  } else {
    exchangeMessage = '未配置 SECONDME_CLIENT_ID / SECONDME_CLIENT_SECRET，未自动换 token';
  }
  if (!exchanged) {
    res.setHeader('Set-Cookie', clearCookie(OAUTH_COOKIE_STATE));
  }

  const redirectTarget = '/';
  const redirectDelayMs = 1200;
  const autoRedirectScript = exchanged
    ? `<script>
      setTimeout(() => {
        window.location.replace(${JSON.stringify(redirectTarget)});
      }, ${redirectDelayMs});
    </script>`
    : '';

  const content = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>OAuth 回调结果</title>${autoRedirectScript}</head>
  <body style="font-family: ui-sans-serif,system-ui; padding: 24px; line-height: 1.6;">
    <h2>OAuth 回调成功</h2>
    <p><strong>code:</strong> ${escapeHtmlText(maskToken(code))}</p>
    <p><strong>state:</strong> ${escapeHtmlText(state || '无')}</p>
    <p><strong>自动换 token:</strong> ${exchanged ? '成功' : '未成功'}</p>
    <p><strong>说明:</strong> ${escapeHtmlText(exchangeMessage)}</p>
    <p><strong>下一步:</strong> ${exchanged ? `即将自动跳转到首页（约 ${Math.round(redirectDelayMs / 1000)} 秒）` : '请检查错误并重试登录。'}</p>
    <p><a href="${redirectTarget}" style="display:inline-block; margin: 6px 0;">返回首页</a></p>
    <pre style="background:#f6f8fa; padding: 12px; border-radius: 8px;">${escapeHtmlText(
    JSON.stringify(
      {
        redirectUri,
        runtime: oauthTokenSnapshot(),
        token: exchangePayload
      },
      null,
      2
    )
  )}</pre>
  </body>
</html>`;

  return html(res, exchanged ? 200 : 400, content);
}

async function serveStatic(req, res, urlObj) {
  let pathname = urlObj.pathname;

  if (pathname === '/') {
    pathname = '/index.html';
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
  return requestAuthStore.run(
    {
      oauthAccessToken: String(cookies[OAUTH_COOKIE_ACCESS] || '').trim(),
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
    console.log(`[AI Labor Market] OAuth client: ${oauthClientConfigured() ? 'configured' : 'missing'}; redirect_uri: ${OAUTH_REDIRECT_URI || 'missing'}`);
    console.log(`[AI Labor Market] required scopes: ${REQUIRED_SCOPES.join(',')}; extended scopes: ${EXTENDED_SCOPES.join(',')}`);
    if (!resolveSecondMeToken()) {
      console.log('[AI Labor Market] required login: OAuth Access Token');
    }
    if (IS_VERCEL) {
      console.log(`[AI Labor Market] data file (ephemeral): ${DATA_FILE}`);
    }
  });
}
