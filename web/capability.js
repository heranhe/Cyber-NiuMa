const state = {
  connected: false,
  me: null,
  abilities: [],
  selectedId: '',
  current: null,
  search: '',
  modelOptions: [],
  providers: [],
  editingProvider: null
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

  // 供应商相关元素
  providerManageBtn: document.querySelector('#provider-manage-btn'),
  providerModal: document.querySelector('#provider-modal'),
  providerModalBackdrop: document.querySelector('#provider-modal-backdrop'),
  providerModalClose: document.querySelector('#provider-modal-close'),
  providerList: document.querySelector('#provider-list'),
  providerFormPanel: document.querySelector('#provider-form-panel'),
  providerFormTitle: document.querySelector('#provider-form-title'),
  addProviderBtn: document.querySelector('#add-provider-btn'),
  addProviderQuickBtn: document.querySelector('#add-provider-quick-btn'),
  providerName: document.querySelector('#provider-name'),
  providerEndpoint: document.querySelector('#provider-endpoint'),
  providerApiKey: document.querySelector('#provider-apikey'),
  providerSaveBtn: document.querySelector('#provider-save-btn'),
  providerCancelBtn: document.querySelector('#provider-cancel-btn'),
  fieldProviderSelect: document.querySelector('#field-provider-select'),

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


    return `
      <button type="button" data-ability-id="${escapeHtml(ability.id)}"
        class="ability-card w-full text-left rounded-2xl border border-gray-200 bg-white px-3.5 py-3 hover:border-primary/50 transition-colors ${isActive ? 'is-active' : ''}">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center text-lg">${escapeHtml(ability.icon || '🤖')}</div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-bold text-gray-900 truncate">${escapeHtml(ability.name || '未命名能力')}</h3>
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

// ===== 供应商管理功能 =====

const PROVIDER_STORAGE_KEY = 'cyber_niuma_providers';

function loadProviders() {
  try {
    const raw = localStorage.getItem(PROVIDER_STORAGE_KEY);
    state.providers = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('[capability] loadProviders failed:', e);
    state.providers = [];
  }
  renderProviderSelect();
}

function saveProviders() {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(state.providers));
  } catch (e) {
    console.error('[capability] saveProviders failed:', e);
  }
}

function renderProviderSelect() {
  if (!el.fieldProviderSelect) return;

  const currentValue = el.fieldProviderSelect.value;
  el.fieldProviderSelect.innerHTML = '<option value="">-- 手动填写 --</option>' +
    state.providers.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');

  // 恢复之前的选中值（如果仍存在）
  if (state.providers.some(p => p.id === currentValue)) {
    el.fieldProviderSelect.value = currentValue;
  }
}

function renderProviderList() {
  if (!el.providerList) return;

  if (!state.providers.length) {
    el.providerList.innerHTML = '<p class="text-sm text-gray-400 text-center py-6">暂无供应商，点击「添加」创建</p>';
    return;
  }

  el.providerList.innerHTML = state.providers.map(p => `
    <div class="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-primary/50 transition-colors" data-provider-id="${escapeHtml(p.id)}">
      <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center text-lg">🔗</div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-gray-900 truncate">${escapeHtml(p.name)}</p>
        <p class="text-xs text-gray-500 truncate">${escapeHtml(p.endpoint)}</p>
      </div>
      <div class="flex items-center gap-1">
        <button type="button" class="provider-edit-btn p-1.5 rounded-lg hover:bg-gray-100" title="编辑">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-500">
            <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
          </svg>
        </button>
        <button type="button" class="provider-delete-btn p-1.5 rounded-lg hover:bg-red-50" title="删除">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-red-500">
            <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

function openProviderModal() {
  if (el.providerModal) {
    el.providerModal.classList.remove('hidden');
    renderProviderList();
    hideProviderForm();
  }
}

function closeProviderModal() {
  if (el.providerModal) {
    el.providerModal.classList.add('hidden');
    hideProviderForm();
  }
}

function showProviderForm(provider = null) {
  state.editingProvider = provider ? clone(provider) : null;

  if (el.providerFormPanel) {
    el.providerFormPanel.classList.remove('hidden');
  }
  if (el.providerFormTitle) {
    el.providerFormTitle.textContent = provider ? '编辑供应商' : '新建供应商';
  }
  if (el.providerName) {
    el.providerName.value = provider?.name || '';
  }
  if (el.providerEndpoint) {
    el.providerEndpoint.value = provider?.endpoint || '';
  }
  if (el.providerApiKey) {
    el.providerApiKey.value = provider?.apiKey || '';
  }
}

function hideProviderForm() {
  state.editingProvider = null;
  if (el.providerFormPanel) {
    el.providerFormPanel.classList.add('hidden');
  }
  if (el.providerName) el.providerName.value = '';
  if (el.providerEndpoint) el.providerEndpoint.value = '';
  if (el.providerApiKey) el.providerApiKey.value = '';
}

function onProviderSave() {
  const name = el.providerName?.value?.trim() || '';
  const endpoint = el.providerEndpoint?.value?.trim() || '';
  const apiKey = el.providerApiKey?.value?.trim() || '';

  if (!name) {
    showToast('请输入供应商名称');
    return;
  }
  if (!endpoint) {
    showToast('请输入 API Endpoint');
    return;
  }

  try {
    const parsed = new URL(endpoint);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('endpoint 协议仅支持 http/https');
    }
  } catch {
    showToast('API Endpoint 不是合法 URL');
    return;
  }

  if (state.editingProvider) {
    // 编辑模式
    const idx = state.providers.findIndex(p => p.id === state.editingProvider.id);
    if (idx >= 0) {
      state.providers[idx] = { ...state.providers[idx], name, endpoint, apiKey };
    }
  } else {
    // 新建模式
    const newProvider = {
      id: 'provider_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name,
      endpoint,
      apiKey,
      models: []
    };
    state.providers.push(newProvider);
  }

  saveProviders();
  renderProviderList();
  renderProviderSelect();
  hideProviderForm();
  showToast(state.editingProvider ? '供应商已更新' : '供应商已添加');
}

function onProviderDelete(providerId) {
  const provider = state.providers.find(p => p.id === providerId);
  if (!provider) return;

  if (!window.confirm(`确认删除供应商「${provider.name}」？`)) {
    return;
  }

  state.providers = state.providers.filter(p => p.id !== providerId);
  saveProviders();
  renderProviderList();
  renderProviderSelect();

  // 如果正在编辑该供应商，关闭表单
  if (state.editingProvider?.id === providerId) {
    hideProviderForm();
  }

  showToast('供应商已删除');
}

function onProviderSelect() {
  const selectedId = el.fieldProviderSelect?.value || '';
  if (!selectedId) return;

  const provider = state.providers.find(p => p.id === selectedId);
  if (!provider) return;

  // 自动填充
  if (el.fieldApiEndpoint) {
    el.fieldApiEndpoint.value = provider.endpoint;
  }
  if (el.fieldApiKey) {
    el.fieldApiKey.value = provider.apiKey;
  }

  // 更新当前能力的 customApi
  updateCurrentFromForm();
  showToast(`已应用供应商「${provider.name}」的配置`);
}

function bindProviderEvents() {
  // 打开供应商管理弹窗
  el.providerManageBtn?.addEventListener('click', openProviderModal);
  el.addProviderQuickBtn?.addEventListener('click', () => {
    openProviderModal();
    setTimeout(() => showProviderForm(), 100);
  });

  // 关闭弹窗
  el.providerModalClose?.addEventListener('click', closeProviderModal);
  el.providerModalBackdrop?.addEventListener('click', closeProviderModal);

  // 添加供应商按钮
  el.addProviderBtn?.addEventListener('click', () => showProviderForm());

  // 保存/取消
  el.providerSaveBtn?.addEventListener('click', onProviderSave);
  el.providerCancelBtn?.addEventListener('click', hideProviderForm);

  // 供应商列表点击（编辑/删除）
  el.providerList?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-provider-id]');
    if (!card) return;
    const providerId = card.dataset.providerId;

    if (e.target.closest('.provider-edit-btn')) {
      const provider = state.providers.find(p => p.id === providerId);
      if (provider) showProviderForm(provider);
    } else if (e.target.closest('.provider-delete-btn')) {
      onProviderDelete(providerId);
    }
  });

  // 供应商选择下拉框
  el.fieldProviderSelect?.addEventListener('change', onProviderSelect);
}

async function bootstrap() {
  bindEvents();
  bindProviderEvents();
  loadProviders();
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
