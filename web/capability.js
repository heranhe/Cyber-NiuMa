const state = {
  connected: false,
  me: null,
  abilities: [],
  selectedId: '',
  current: null,
  search: '',
  modelOptions: []
};

const el = {
  loginBtn: document.querySelector('#login-btn'),
  logoutBtn: document.querySelector('#logout-btn'),
  userChip: document.querySelector('#user-chip'),
  authBanner: document.querySelector('#auth-banner'),

  count: document.querySelector('#ability-count'),
  addBtn: document.querySelector('#add-ability-btn'),
  searchInput: document.querySelector('#search-input'),
  list: document.querySelector('#ability-list'),

  form: document.querySelector('#ability-form'),
  formTitle: document.querySelector('#form-title'),
  avatarEmoji: document.querySelector('#avatar-emoji'),

  fieldEnabled: document.querySelector('#field-enabled'),
  fieldName: document.querySelector('#field-name'),
  fieldIcon: document.querySelector('#field-icon'),
  fieldDescription: document.querySelector('#field-description'),
  fieldPrompt: document.querySelector('#field-prompt'),

  fieldUseCustomApi: document.querySelector('#field-use-custom-api'),
  apiModeHint: document.querySelector('#api-mode-hint'),
  customApiPanel: document.querySelector('#custom-api-panel'),
  fieldApiEndpoint: document.querySelector('#field-api-endpoint'),
  fieldApiKey: document.querySelector('#field-api-key'),
  fieldApiModel: document.querySelector('#field-api-model'),
  fetchModelsBtn: document.querySelector('#fetch-models-btn'),
  fetchStatus: document.querySelector('#fetch-status'),

  deleteBtn: document.querySelector('#delete-btn'),
  resetBtn: document.querySelector('#reset-btn'),
  saveBtn: document.querySelector('#save-btn'),

  toast: document.querySelector('#toast')
};

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function showToast(message) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.add('show');
  setTimeout(() => el.toast.classList.remove('show'), 2200);
}

async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const body = options.body ? JSON.stringify(options.body) : undefined;
  const res = await fetch(path, { method, headers, body, credentials: 'include' });
  let payload = {};
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }

  if (!res.ok) {
    const message = payload.message || payload.error || '请求失败';
    const err = new Error(message);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

function normalizeAbility(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const customApi = source.customApi && typeof source.customApi === 'object' ? source.customApi : {};
  return {
    id: String(source.id || '').trim(),
    name: String(source.name || '').trim(),
    icon: String(source.icon || '🤖').trim() || '🤖',
    description: String(source.description || '').trim(),
    prompt: String(source.prompt || '').trim(),
    enabled: source.enabled !== false,
    useCustomApi: !!source.useCustomApi,
    customApi: {
      endpoint: String(customApi.endpoint || source.apiEndpoint || source.endpoint || '').trim(),
      apiKey: String(customApi.apiKey || source.apiKey || '').trim(),
      model: String(customApi.model || source.model || '').trim()
    },
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null
  };
}

function newAbilityDraft() {
  return normalizeAbility({
    id: '',
    name: '',
    icon: '🤖',
    description: '',
    prompt: '',
    enabled: true,
    useCustomApi: false,
    customApi: {
      endpoint: '',
      apiKey: '',
      model: ''
    }
  });
}

function getCurrentAbility() {
  if (!state.current) {
    state.current = newAbilityDraft();
  }
  return state.current;
}

function setAuthUI() {
  const connected = !!state.connected;
  if (el.loginBtn) el.loginBtn.classList.toggle('hidden', connected);
  if (el.logoutBtn) el.logoutBtn.classList.toggle('hidden', !connected);

  if (el.userChip) {
    if (connected && state.me) {
      const username = state.me.name || state.me.username || state.me.userId || 'SecondMe 用户';
      el.userChip.textContent = username;
      el.userChip.classList.remove('hidden');
    } else {
      el.userChip.textContent = '';
      el.userChip.classList.add('hidden');
    }
  }

  if (el.authBanner) {
    el.authBanner.classList.toggle('hidden', connected);
  }

  const disabled = !connected;
  if (el.addBtn) el.addBtn.disabled = disabled;
  if (el.saveBtn) el.saveBtn.disabled = disabled;
  if (el.fetchModelsBtn) el.fetchModelsBtn.disabled = disabled;
}

function renderAbilityList() {
  if (!el.list) return;

  const keyword = state.search.trim().toLowerCase();
  const visibleList = state.abilities.filter((item) => {
    if (!keyword) return true;
    const text = `${item.name} ${item.description} ${item.customApi?.model || ''}`.toLowerCase();
    return text.includes(keyword);
  });

  if (el.count) {
    el.count.textContent = String(state.abilities.length);
  }

  if (!visibleList.length) {
    el.list.innerHTML = `
      <div class="h-full min-h-[220px] flex flex-col items-center justify-center text-center text-sm text-gray-400 px-3">
        <p class="font-medium">${state.search ? '没有匹配的能力' : '暂无能力'}</p>
        <p class="text-xs mt-1">${state.search ? '换个关键词试试' : '点击“添加能力”创建你的第一个技能'}</p>
      </div>
    `;
    return;
  }

  el.list.innerHTML = visibleList.map((ability) => {
    const isActive = ability.id && ability.id === state.selectedId;
    const mode = ability.useCustomApi
      ? `API · ${escapeHtml(ability.customApi?.model || '未选模型')}`
      : 'SecondMe';
    const statusClass = ability.enabled ? 'bg-green-500' : 'bg-gray-300';

    return `
      <button type="button" data-ability-id="${escapeHtml(ability.id)}"
        class="ability-card w-full text-left rounded-2xl border border-gray-200 bg-white px-3.5 py-3 hover:border-primary/50 transition-colors ${isActive ? 'is-active' : ''}">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center text-lg">${escapeHtml(ability.icon || '🤖')}</div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-bold text-gray-900 truncate">${escapeHtml(ability.name || '未命名能力')}</h3>
              <span class="inline-block w-2 h-2 rounded-full ${statusClass}"></span>
            </div>
            <p class="text-xs text-gray-500 mt-0.5 line-clamp-1">${escapeHtml(ability.description || '暂无简介')}</p>
            <p class="text-[11px] text-amber-700 mt-1.5 font-medium">${mode}</p>
          </div>
        </div>
      </button>
    `;
  }).join('');
}

function renderModelOptions() {
  if (!el.fieldApiModel) return;
  const current = getCurrentAbility();

  const models = Array.from(new Set([
    ...state.modelOptions,
    current.customApi.model
  ].filter(Boolean)));

  if (!models.length) {
    el.fieldApiModel.innerHTML = '<option value="">请先 Fetch 模型</option>';
    el.fieldApiModel.value = '';
    return;
  }

  el.fieldApiModel.innerHTML = models
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join('');

  el.fieldApiModel.value = current.customApi.model || models[0];
  current.customApi.model = el.fieldApiModel.value;
}

function renderForm() {
  const ability = getCurrentAbility();

  if (el.formTitle) {
    el.formTitle.textContent = ability.name || (ability.id ? '编辑能力' : '新建能力');
  }
  if (el.avatarEmoji) {
    el.avatarEmoji.textContent = ability.icon || '🤖';
  }

  if (el.fieldEnabled) el.fieldEnabled.checked = !!ability.enabled;
  if (el.fieldName) el.fieldName.value = ability.name || '';
  if (el.fieldIcon) el.fieldIcon.value = ability.icon || '';
  if (el.fieldDescription) el.fieldDescription.value = ability.description || '';
  if (el.fieldPrompt) el.fieldPrompt.value = ability.prompt || '';

  if (el.fieldUseCustomApi) el.fieldUseCustomApi.checked = !!ability.useCustomApi;
  if (el.fieldApiEndpoint) el.fieldApiEndpoint.value = ability.customApi.endpoint || '';
  if (el.fieldApiKey) el.fieldApiKey.value = ability.customApi.apiKey || '';

  if (el.customApiPanel) {
    el.customApiPanel.classList.toggle('opacity-70', !ability.useCustomApi);
  }
  if (el.apiModeHint) {
    el.apiModeHint.textContent = ability.useCustomApi
      ? '当前已开启：交付会调用自定义 API（请确保 Endpoint / Key / 模型均已正确配置）。'
      : '当前已关闭：交付默认使用 SecondMe AI 接口。';
  }

  if (el.deleteBtn) {
    el.deleteBtn.classList.toggle('hidden', !ability.id);
    el.deleteBtn.disabled = !state.connected;
  }

  renderModelOptions();
}

function updateCurrentFromForm() {
  const ability = getCurrentAbility();
  ability.enabled = !!el.fieldEnabled?.checked;
  ability.name = String(el.fieldName?.value || '').trim();
  ability.icon = String(el.fieldIcon?.value || '').trim() || '🤖';
  ability.description = String(el.fieldDescription?.value || '').trim();
  ability.prompt = String(el.fieldPrompt?.value || '').trim();
  ability.useCustomApi = !!el.fieldUseCustomApi?.checked;

  ability.customApi.endpoint = String(el.fieldApiEndpoint?.value || '').trim();
  ability.customApi.apiKey = String(el.fieldApiKey?.value || '').trim();
  ability.customApi.model = String(el.fieldApiModel?.value || '').trim();

  if (el.avatarEmoji) {
    el.avatarEmoji.textContent = ability.icon || '🤖';
  }
  if (el.formTitle) {
    el.formTitle.textContent = ability.name || (ability.id ? '编辑能力' : '新建能力');
  }
  if (el.apiModeHint) {
    el.apiModeHint.textContent = ability.useCustomApi
      ? '当前已开启：交付会调用自定义 API（请确保 Endpoint / Key / 模型均已正确配置）。'
      : '当前已关闭：交付默认使用 SecondMe AI 接口。';
  }
  if (el.customApiPanel) {
    el.customApiPanel.classList.toggle('opacity-70', !ability.useCustomApi);
  }

  const targetIdx = state.abilities.findIndex((item) => item.id && item.id === ability.id);
  if (targetIdx >= 0) {
    state.abilities[targetIdx] = normalizeAbility({ ...state.abilities[targetIdx], ...ability });
    renderAbilityList();
  }
}

function selectAbility(abilityId) {
  const target = state.abilities.find((item) => item.id === abilityId);
  if (!target) {
    return;
  }
  state.selectedId = target.id;
  state.current = clone(normalizeAbility(target));
  state.modelOptions = [];
  if (el.fetchStatus) {
    el.fetchStatus.textContent = '点击 “Fetch 模型” 获取当前 API 可用模型。';
    el.fetchStatus.className = 'text-xs text-gray-500';
  }
  renderAbilityList();
  renderForm();
}

function createNewAbility() {
  state.selectedId = '';
  state.current = newAbilityDraft();
  state.modelOptions = [];
  if (el.fetchStatus) {
    el.fetchStatus.textContent = '点击 “Fetch 模型” 获取当前 API 可用模型。';
    el.fetchStatus.className = 'text-xs text-gray-500';
  }
  renderAbilityList();
  renderForm();
}

function validateCurrentAbility(ability) {
  if (!ability.name) {
    throw new Error('能力名称不能为空');
  }

  if (ability.useCustomApi) {
    if (!ability.customApi.endpoint) {
      throw new Error('已开启自定义 API，请填写 API Endpoint');
    }
    try {
      const parsed = new URL(ability.customApi.endpoint);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('endpoint 协议仅支持 http/https');
      }
    } catch {
      throw new Error('API Endpoint 不是合法 URL');
    }

    if (!ability.customApi.apiKey) {
      throw new Error('已开启自定义 API，请填写 API Key');
    }
    if (!ability.customApi.model) {
      throw new Error('已开启自定义 API，请先 Fetch 并选择模型');
    }
  }
}

function abilityPayload(ability) {
  return {
    name: ability.name,
    icon: ability.icon,
    description: ability.description,
    prompt: ability.prompt,
    enabled: ability.enabled,
    useCustomApi: ability.useCustomApi,
    customApi: {
      endpoint: ability.customApi.endpoint,
      apiKey: ability.customApi.apiKey,
      model: ability.customApi.model
    }
  };
}

async function loadProfile() {
  const profileRes = await api('/api/secondme/profile');
  const data = profileRes?.data || {};
  state.connected = !!data.connected;
  state.me = data?.profile?.data || null;
  setAuthUI();
}

async function loadAbilities() {
  if (!state.connected) {
    state.abilities = [];
    createNewAbility();
    return;
  }

  const res = await api('/api/me/abilities');
  const list = Array.isArray(res?.data) ? res.data : [];
  state.abilities = list.map((item) => normalizeAbility(item));

  if (state.abilities.length > 0) {
    selectAbility(state.abilities[0].id);
  } else {
    createNewAbility();
  }
}

async function onLogin() {
  try {
    const stateToken = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem('oauth_state', stateToken);
    const res = await api('/api/oauth/authorize-url');
    const url = res?.data?.url || res?.url || '';
    if (!url) {
      throw new Error('无法获取授权链接');
    }
    window.location.href = url;
  } catch (error) {
    showToast(error.message || '登录失败');
  }
}

async function onLogout() {
  try {
    await api('/api/oauth/logout', { method: 'POST' });
    window.location.reload();
  } catch (error) {
    showToast(error.message || '退出失败');
  }
}

async function onFetchModels() {
  if (!state.connected) {
    showToast('请先登录');
    return;
  }

  updateCurrentFromForm();
  const ability = getCurrentAbility();
  if (!ability.customApi.endpoint) {
    showToast('请先填写 API Endpoint');
    return;
  }

  if (el.fetchModelsBtn) {
    el.fetchModelsBtn.disabled = true;
    el.fetchModelsBtn.textContent = '拉取中...';
  }

  try {
    const res = await api('/api/custom-models/fetch', {
      method: 'POST',
      body: {
        endpoint: ability.customApi.endpoint,
        apiKey: ability.customApi.apiKey
      }
    });

    const models = Array.isArray(res?.data?.models) ? res.data.models : [];
    if (!models.length) {
      throw new Error('未返回可用模型');
    }

    state.modelOptions = models;
    if (!models.includes(ability.customApi.model)) {
      ability.customApi.model = models[0];
    }

    renderModelOptions();
    if (el.fetchStatus) {
      el.fetchStatus.textContent = `已获取 ${models.length} 个模型，请选择本技能使用的模型。`;
      el.fetchStatus.className = 'text-xs text-green-700';
    }
    showToast('模型列表获取成功');
  } catch (error) {
    if (el.fetchStatus) {
      el.fetchStatus.textContent = error.message || '模型拉取失败';
      el.fetchStatus.className = 'text-xs text-red-600';
    }
    showToast(error.message || '模型拉取失败');
  } finally {
    if (el.fetchModelsBtn) {
      el.fetchModelsBtn.disabled = !state.connected;
      el.fetchModelsBtn.textContent = 'Fetch 模型';
    }
  }
}

async function onSave(event) {
  event.preventDefault();
  if (!state.connected) {
    showToast('请先登录 SecondMe');
    return;
  }

  updateCurrentFromForm();
  const ability = normalizeAbility(getCurrentAbility());

  try {
    validateCurrentAbility(ability);

    let saved = null;
    if (ability.id) {
      const res = await api(`/api/me/abilities/${encodeURIComponent(ability.id)}`, {
        method: 'PUT',
        body: abilityPayload(ability)
      });
      saved = normalizeAbility(res?.ability || ability);
      const index = state.abilities.findIndex((item) => item.id === ability.id);
      if (index >= 0) {
        state.abilities[index] = saved;
      }
    } else {
      const res = await api('/api/me/abilities', {
        method: 'POST',
        body: abilityPayload(ability)
      });
      saved = normalizeAbility(res?.ability || {});
      state.abilities.unshift(saved);
    }

    state.current = clone(saved);
    state.selectedId = saved.id;
    renderAbilityList();
    renderForm();
    showToast('能力已保存');
  } catch (error) {
    showToast(error.message || '保存失败');
  }
}

function onReset() {
  if (state.selectedId) {
    const target = state.abilities.find((item) => item.id === state.selectedId);
    if (target) {
      state.current = clone(normalizeAbility(target));
      state.modelOptions = [];
      renderForm();
      showToast('已重置为保存版本');
      return;
    }
  }

  createNewAbility();
  showToast('已清空当前编辑内容');
}

async function onDelete() {
  if (!state.connected) {
    showToast('请先登录');
    return;
  }

  const ability = getCurrentAbility();
  if (!ability.id) {
    createNewAbility();
    return;
  }

  if (!window.confirm(`确认删除能力「${ability.name || ability.id}」？`)) {
    return;
  }

  try {
    await api(`/api/me/abilities/${encodeURIComponent(ability.id)}`, { method: 'DELETE' });
    state.abilities = state.abilities.filter((item) => item.id !== ability.id);

    if (state.abilities.length > 0) {
      selectAbility(state.abilities[0].id);
    } else {
      createNewAbility();
    }

    showToast('能力已删除');
  } catch (error) {
    showToast(error.message || '删除失败');
  }
}

function bindEvents() {
  el.loginBtn?.addEventListener('click', onLogin);
  el.logoutBtn?.addEventListener('click', onLogout);

  el.addBtn?.addEventListener('click', createNewAbility);
  el.searchInput?.addEventListener('input', (e) => {
    state.search = String(e.target.value || '');
    renderAbilityList();
  });

  el.list?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-ability-id]');
    if (!card) return;
    const id = String(card.dataset.abilityId || '').trim();
    if (!id) return;
    selectAbility(id);
  });

  el.form?.addEventListener('submit', onSave);
  el.resetBtn?.addEventListener('click', onReset);
  el.deleteBtn?.addEventListener('click', onDelete);
  el.fetchModelsBtn?.addEventListener('click', onFetchModels);

  [
    el.fieldEnabled,
    el.fieldName,
    el.fieldIcon,
    el.fieldDescription,
    el.fieldPrompt,
    el.fieldUseCustomApi,
    el.fieldApiEndpoint,
    el.fieldApiKey,
    el.fieldApiModel
  ].forEach((node) => {
    node?.addEventListener('input', updateCurrentFromForm);
    node?.addEventListener('change', updateCurrentFromForm);
  });
}

async function bootstrap() {
  bindEvents();
  try {
    await loadProfile();
    await loadAbilities();
  } catch (error) {
    console.error('[capability] bootstrap failed:', error);
    showToast(error.message || '页面初始化失败');
    createNewAbility();
  }
  renderAbilityList();
  renderForm();
}

bootstrap();
