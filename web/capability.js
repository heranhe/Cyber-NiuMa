const state = {
  connected: false,
  me: null,
  abilities: [],
  selectedId: '',
  current: null,
  search: '',
  modelOptions: [],
  providers: [],
  editingProvider: null,
  editingStyleId: null,     // 当前正在编辑的风格ID（null=新建）
  selectedStyleId: null     // 当前选中的风格ID（null=默认提示词）
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

  // 风格相关元素
  styleList: document.querySelector('#style-list'),
  styleCount: document.querySelector('#style-count'),
  styleModal: document.querySelector('#style-modal'),
  styleModalBackdrop: document.querySelector('#style-modal-backdrop'),
  styleModalClose: document.querySelector('#style-modal-close'),
  styleModalTitle: document.querySelector('#style-modal-title'),
  styleFieldName: document.querySelector('#style-field-name'),
  styleFieldImage: document.querySelector('#style-field-image'),
  styleFieldPrompt: document.querySelector('#style-field-prompt'),
  styleImagePreview: document.querySelector('#style-image-preview'),
  styleFileInput: document.querySelector('#style-file-input'),
  styleUploadArea: document.querySelector('#style-upload-area'),
  styleUploadStatus: document.querySelector('#style-upload-status'),
  styleImageClear: document.querySelector('#style-image-clear'),
  styleSaveBtn: document.querySelector('#style-save-btn'),
  styleDeleteBtn: document.querySelector('#style-delete-btn'),
  styleCancelBtn: document.querySelector('#style-cancel-btn'),
  promptLabelText: document.querySelector('#prompt-label-text'),

  // 图像生成相关元素
  fieldAbilityTypeText: document.querySelector('#field-ability-type-text'),
  fieldAbilityTypeImage: document.querySelector('#field-ability-type-image'),
  abilityTypeTextLabel: document.querySelector('#ability-type-text-label'),
  abilityTypeImageLabel: document.querySelector('#ability-type-image-label'),
  imageConfigPanel: document.querySelector('#image-config-panel'),
  fieldImageSize: document.querySelector('#field-image-size'),
  fieldImageQuality: document.querySelector('#field-image-quality'),
  testImageBtn: document.querySelector('#test-image-btn'),
  testImageStatus: document.querySelector('#test-image-status'),
  testImagePreview: document.querySelector('#test-image-preview'),

  // 封面图上传相关元素
  coverUploadArea: document.querySelector('#cover-upload-area'),
  coverPreviewWrapper: document.querySelector('#cover-preview-wrapper'),
  coverPreviewImg: document.querySelector('#cover-preview-img'),
  coverRemoveBtn: document.querySelector('#cover-remove-btn'),
  coverFileInput: document.querySelector('#cover-file-input'),
  avatarEmoji: document.querySelector('#avatar-emoji'),

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
  const imageConfig = source.imageConfig && typeof source.imageConfig === 'object' ? source.imageConfig : {};
  const styles = Array.isArray(source.styles) ? source.styles.map(s => ({
    id: String(s?.id || '').trim(),
    name: String(s?.name || '').trim(),
    image: String(s?.image || '').trim(),
    prompt: String(s?.prompt || '').trim()
  })).filter(s => s.name) : [];
  return {
    id: String(source.id || '').trim(),
    name: String(source.name || '').trim(),
    icon: String(source.icon || '🤖').trim() || '🤖',
    description: String(source.description || '').trim(),
    prompt: String(source.prompt || '').trim(),

    abilityType: ['text', 'image'].includes(String(source.abilityType || '')) ? source.abilityType : 'text',
    coverImage: String(source.coverImage || '').trim() || null,
    useCustomApi: !!source.useCustomApi,
    customApi: {
      endpoint: String(customApi.endpoint || source.apiEndpoint || source.endpoint || '').trim(),
      apiKey: String(customApi.apiKey || source.apiKey || '').trim(),
      model: String(customApi.model || source.model || '').trim()
    },
    imageConfig: {
      size: String(imageConfig.size ?? '1024x1024').trim(),
      quality: String(imageConfig.quality ?? 'standard').trim()
    },
    styles,
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

    abilityType: 'text',
    coverImage: null,
    useCustomApi: false,
    customApi: {
      endpoint: '',
      apiKey: '',
      model: ''
    },
    imageConfig: {
      size: '1024x1024',
      quality: 'standard'
    },
    styles: []
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
    const typeTag = ability.abilityType === 'image' ? '🎨 图像' : '📝 文本';
    const mode = ability.useCustomApi
      ? `${typeTag} · API · ${escapeHtml(ability.customApi?.model || '未选模型')}`
      : `${typeTag} · SecondMe`;


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

  // 切换能力时重置风格选中状态
  state.selectedStyleId = null;
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

  // 能力类型选择
  const isImage = ability.abilityType === 'image';
  if (el.fieldAbilityTypeText) el.fieldAbilityTypeText.checked = !isImage;
  if (el.fieldAbilityTypeImage) el.fieldAbilityTypeImage.checked = isImage;
  updateAbilityTypeUI(isImage);

  // 图像配置
  if (el.fieldImageSize) el.fieldImageSize.value = ability.imageConfig?.size || '1024x1024';
  if (el.fieldImageQuality) el.fieldImageQuality.value = ability.imageConfig?.quality || 'standard';

  if (el.deleteBtn) {
    el.deleteBtn.classList.toggle('hidden', !ability.id);
    el.deleteBtn.disabled = !state.connected;
  }

  // 封面图预览
  updateCoverPreview(ability.coverImage);

  renderModelOptions();
  renderStyles();
}

// 更新封面图预览 UI（集成在左上角头像区域）
function updateCoverPreview(coverImage) {
  if (coverImage) {
    // 有封面图：隐藏 emoji，显示图片
    if (el.avatarEmoji) el.avatarEmoji.classList.add('hidden');
    if (el.coverPreviewWrapper) el.coverPreviewWrapper.classList.remove('hidden');
    if (el.coverPreviewImg) el.coverPreviewImg.src = coverImage;
  } else {
    // 无封面图：显示 emoji，隐藏图片
    if (el.avatarEmoji) el.avatarEmoji.classList.remove('hidden');
    if (el.coverPreviewWrapper) el.coverPreviewWrapper.classList.add('hidden');
    if (el.coverPreviewImg) el.coverPreviewImg.src = '';
  }
}

// 更新能力类型 UI 状态
function updateAbilityTypeUI(isImage) {
  if (el.abilityTypeTextLabel) {
    el.abilityTypeTextLabel.style.borderColor = !isImage ? '#D97706' : '#E5E7EB';
    el.abilityTypeTextLabel.style.backgroundColor = !isImage ? '#FFF7ED' : '';
  }
  if (el.abilityTypeImageLabel) {
    el.abilityTypeImageLabel.style.borderColor = isImage ? '#2563EB' : '#E5E7EB';
    el.abilityTypeImageLabel.style.backgroundColor = isImage ? '#EFF6FF' : '';
  }
  if (el.imageConfigPanel) {
    el.imageConfigPanel.classList.toggle('hidden', !isImage);
  }
  // 重置测试图片状态
  if (el.testImagePreview) el.testImagePreview.classList.add('hidden');
  if (el.testImageStatus) {
    el.testImageStatus.textContent = '点击按钮测试当前 API 是否支持图像生成。';
    el.testImageStatus.className = 'text-xs text-gray-500 mt-2';
  }
}

function updateCurrentFromForm() {
  const ability = getCurrentAbility();

  ability.name = String(el.fieldName?.value || '').trim();
  ability.icon = String(el.fieldIcon?.value || '').trim() || '🤖';
  ability.description = String(el.fieldDescription?.value || '').trim();

  // 根据选中的风格，将 textarea 内容写回正确的目标
  const textareaPrompt = String(el.fieldPrompt?.value || '').trim();
  if (state.selectedStyleId) {
    const style = (ability.styles || []).find(s => s.id === state.selectedStyleId);
    if (style) style.prompt = textareaPrompt;
  } else {
    ability.prompt = textareaPrompt;
  }

  ability.useCustomApi = !!el.fieldUseCustomApi?.checked;

  ability.customApi.endpoint = String(el.fieldApiEndpoint?.value || '').trim();
  ability.customApi.apiKey = String(el.fieldApiKey?.value || '').trim();
  ability.customApi.model = String(el.fieldApiModel?.value || '').trim();

  // 能力类型
  ability.abilityType = el.fieldAbilityTypeImage?.checked ? 'image' : 'text';

  // 图像配置
  if (!ability.imageConfig) ability.imageConfig = {};
  ability.imageConfig.size = String(el.fieldImageSize?.value ?? '1024x1024').trim();
  ability.imageConfig.quality = String(el.fieldImageQuality?.value ?? 'standard').trim();

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

  // 更新能力类型 UI
  updateAbilityTypeUI(ability.abilityType === 'image');

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

    abilityType: ability.abilityType || 'text',
    coverImage: ability.coverImage || null,
    useCustomApi: ability.useCustomApi,
    customApi: {
      endpoint: ability.customApi.endpoint,
      apiKey: ability.customApi.apiKey,
      model: ability.customApi.model
    },
    imageConfig: {
      size: ability.imageConfig?.size || '1024x1024',
      quality: ability.imageConfig?.quality || 'standard'
    },
    styles: (ability.styles || []).map(s => ({
      id: s.id,
      name: s.name,
      image: s.image,
      prompt: s.prompt
    }))
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

// 测试图像生成功能
async function onTestImageGeneration() {
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
  if (!ability.customApi.apiKey) {
    showToast('请先填写 API Key');
    return;
  }
  if (!ability.customApi.model) {
    showToast('请先选择模型');
    return;
  }

  if (el.testImageBtn) {
    el.testImageBtn.disabled = true;
    el.testImageBtn.textContent = '⏳ 生成中...';
  }
  if (el.testImageStatus) {
    el.testImageStatus.textContent = '正在调用图像生成 API，请稍候（可能需要 5~30 秒）...';
    el.testImageStatus.className = 'text-xs text-blue-600 mt-2';
  }
  if (el.testImagePreview) {
    el.testImagePreview.classList.add('hidden');
  }

  try {
    const res = await api('/api/image-generate/test', {
      method: 'POST',
      body: {
        endpoint: ability.customApi.endpoint,
        apiKey: ability.customApi.apiKey,
        model: ability.customApi.model,
        prompt: '一只戴着太阳镜的猫咪，赛博朋克风格',
        size: ability.imageConfig?.size || '1024x1024',
        quality: ability.imageConfig?.quality || 'standard'
      }
    });

    const images = res?.data?.images || [];
    if (images.length > 0) {
      if (el.testImagePreview) {
        const img = el.testImagePreview.querySelector('img');
        if (img) img.src = images[0];
        el.testImagePreview.classList.remove('hidden');
      }
      if (el.testImageStatus) {
        el.testImageStatus.textContent = `✅ 测试成功！模型: ${res.data.model || ability.customApi.model}`;
        el.testImageStatus.className = 'text-xs text-green-700 mt-2 font-bold';
      }
      showToast('图像生成测试成功！');
    } else {
      throw new Error('API 未返回图片');
    }
  } catch (error) {
    if (el.testImageStatus) {
      el.testImageStatus.textContent = `❌ 测试失败: ${error.message || '未知错误'}`;
      el.testImageStatus.className = 'text-xs text-red-600 mt-2';
    }
    showToast(error.message || '图像生成测试失败');
  } finally {
    if (el.testImageBtn) {
      el.testImageBtn.disabled = false;
      el.testImageBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg> 测试图像生成`;
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

  // 能力类型切换事件
  el.fieldAbilityTypeText?.addEventListener('change', updateCurrentFromForm);
  el.fieldAbilityTypeImage?.addEventListener('change', updateCurrentFromForm);

  // 测试图像生成按钮
  el.testImageBtn?.addEventListener('click', onTestImageGeneration);

  [
    el.fieldEnabled,
    el.fieldName,
    el.fieldIcon,
    el.fieldDescription,
    el.fieldPrompt,
    el.fieldUseCustomApi,
    el.fieldApiEndpoint,
    el.fieldApiKey,
    el.fieldApiModel,
    el.fieldImageSize,
    el.fieldImageQuality
  ].forEach((node) => {
    node?.addEventListener('input', updateCurrentFromForm);
    node?.addEventListener('change', updateCurrentFromForm);
  });

  // 封面图上传事件
  el.coverUploadArea?.addEventListener('click', (e) => {
    if (e.target.closest('#cover-remove-btn')) return;
    el.coverFileInput?.click();
  });

  el.coverUploadArea?.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.coverUploadArea.classList.add('border-primary', 'bg-orange-50/50');
  });

  el.coverUploadArea?.addEventListener('dragleave', () => {
    el.coverUploadArea.classList.remove('border-primary', 'bg-orange-50/50');
  });

  el.coverUploadArea?.addEventListener('drop', (e) => {
    e.preventDefault();
    el.coverUploadArea.classList.remove('border-primary', 'bg-orange-50/50');
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleCoverFileSelect(file);
    }
  });

  el.coverFileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleCoverFileSelect(file);
    e.target.value = '';
  });

  el.coverRemoveBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const ability = getCurrentAbility();
    ability.coverImage = null;
    updateCoverPreview(null);
  });
}

// 处理封面图文件选择：转为 base64 data URL
function handleCoverFileSelect(file) {
  if (!file || !file.type.startsWith('image/')) return;

  // 限制文件大小（2MB）
  if (file.size > 2 * 1024 * 1024) {
    showToast('封面图不能超过 2MB');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const ability = getCurrentAbility();
    ability.coverImage = dataUrl;
    updateCoverPreview(dataUrl);
  };
  reader.onerror = () => {
    showToast('读取图片失败');
  };
  reader.readAsDataURL(file);
}

// ===== 风格管理功能 =====

function renderStyles() {
  const ability = getCurrentAbility();
  const styles = ability.styles || [];

  // 更新风格计数
  if (el.styleCount) {
    el.styleCount.textContent = String(styles.length);
  }

  if (!el.styleList) return;

  // 生成风格卡片 HTML（包含选中状态）
  const cardsHtml = styles.map(style => {
    const isSelected = state.selectedStyleId === style.id;
    const selectedClass = isSelected ? ' style-card--selected' : '';
    const imgContent = style.image
      ? `<img src="${escapeHtml(style.image)}" alt="${escapeHtml(style.name)}" onerror="this.parentElement.innerHTML='🎨'" />`
      : '🎨';
    return `
      <div class="style-card${selectedClass}" data-style-id="${escapeHtml(style.id)}" title="${escapeHtml(style.name)}">
        <button type="button" class="style-card-edit" data-edit-style-id="${escapeHtml(style.id)}" title="编辑">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="10" height="10">
            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
          </svg>
        </button>
        <div class="style-card-img">${imgContent}</div>
        <div class="style-card-name">${escapeHtml(style.name)}</div>
      </div>
    `;
  }).join('');

  // 添加按钮
  const addBtnHtml = `
    <button type="button" class="style-card-add" id="add-style-btn">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      添加风格
    </button>
  `;

  el.styleList.innerHTML = cardsHtml + addBtnHtml;

  // 更新提示词标签
  updatePromptLabel();
}

function openStyleEditor(styleId = null) {
  const ability = getCurrentAbility();
  let style = null;

  if (styleId) {
    style = (ability.styles || []).find(s => s.id === styleId);
  }

  state.editingStyleId = style ? style.id : null;

  if (el.styleModalTitle) {
    el.styleModalTitle.textContent = style ? '编辑风格' : '添加风格';
  }
  if (el.styleFieldName) el.styleFieldName.value = style?.name || '';
  if (el.styleFieldImage) el.styleFieldImage.value = style?.image || '';

  // 图片预览
  updateStyleImagePreview(style?.image || '');

  // 重置上传区域状态
  if (el.styleFileInput) el.styleFileInput.value = '';
  if (el.styleUploadStatus) {
    el.styleUploadStatus.textContent = '';
    el.styleUploadStatus.classList.add('hidden');
  }

  if (el.styleModal) {
    el.styleModal.classList.remove('hidden');
  }

  // 编辑模式时显示删除按钮
  if (el.styleDeleteBtn) {
    el.styleDeleteBtn.classList.toggle('hidden', !style);
  }
}

function closeStyleEditor() {
  state.editingStyleId = null;
  if (el.styleModal) {
    el.styleModal.classList.add('hidden');
  }
}

function updateStyleImagePreview(url) {
  if (!el.styleImagePreview) return;
  const img = el.styleImagePreview.querySelector('img');
  if (url && img) {
    img.src = url;
    img.onerror = () => {
      el.styleImagePreview.classList.add('hidden');
      if (el.styleUploadArea) el.styleUploadArea.classList.remove('hidden');
    };
    el.styleImagePreview.classList.remove('hidden');
    // 有预览图时隐藏上传区域
    if (el.styleUploadArea) el.styleUploadArea.classList.add('hidden');
  } else {
    el.styleImagePreview.classList.add('hidden');
    // 没有预览图时显示上传区域
    if (el.styleUploadArea) el.styleUploadArea.classList.remove('hidden');
  }
}

// 上传风格图片
async function uploadStyleImage(file) {
  if (!file) return;

  // 前端校验
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    showToast('不支持的图片格式，仅支持 JPG/PNG/WebP/GIF');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('图片大小超过 5MB 限制');
    return;
  }

  // 显示上传状态
  if (el.styleUploadStatus) {
    el.styleUploadStatus.textContent = '正在上传...';
    el.styleUploadStatus.classList.remove('hidden');
    el.styleUploadStatus.className = 'text-xs text-blue-600 mb-2';
  }

  try {
    const formData = new FormData();
    formData.append('file', file);

    const resp = await fetch('/api/upload/image', {
      method: 'POST',
      body: formData
    });

    const result = await resp.json();
    if (!resp.ok || result.code !== 0) {
      throw new Error(result.message || '上传失败');
    }

    const imageUrl = result.data.url;
    if (el.styleFieldImage) el.styleFieldImage.value = imageUrl;
    updateStyleImagePreview(imageUrl);

    if (el.styleUploadStatus) {
      el.styleUploadStatus.textContent = '上传成功';
      el.styleUploadStatus.className = 'text-xs text-green-600 mb-2';
    }

    showToast('图片上传成功');
  } catch (error) {
    console.error('[capability] uploadStyleImage failed:', error);
    if (el.styleUploadStatus) {
      el.styleUploadStatus.textContent = error.message || '上传失败';
      el.styleUploadStatus.className = 'text-xs text-red-600 mb-2';
    }
    showToast(error.message || '图片上传失败');
  }
}
function updatePromptLabel() {
  if (!el.promptLabelText) return;
  const ability = getCurrentAbility();
  if (state.selectedStyleId) {
    const style = (ability.styles || []).find(s => s.id === state.selectedStyleId);
    if (style) {
      el.promptLabelText.textContent = `🎨 ${style.name} · 风格提示词`;
      return;
    }
  }
  el.promptLabelText.textContent = '系统提示词 (System Prompt)';
}

// 将当前 textarea 内容保存到当前选中的目标（风格 or 默认 prompt）
function savePromptToCurrentTarget() {
  const ability = getCurrentAbility();
  const currentPrompt = el.fieldPrompt?.value || '';

  if (state.selectedStyleId) {
    const style = (ability.styles || []).find(s => s.id === state.selectedStyleId);
    if (style) {
      style.prompt = currentPrompt;
    }
  } else {
    ability.prompt = currentPrompt;
  }
}

// 点击风格卡片：切换选中状态，切换 textarea 内容
function selectStyle(styleId) {
  const ability = getCurrentAbility();

  // 1. 先把当前 textarea 保存到原来的目标
  savePromptToCurrentTarget();

  // 2. 如果点击的是已选中的，取消选中（回到默认提示词）
  if (state.selectedStyleId === styleId) {
    state.selectedStyleId = null;
    if (el.fieldPrompt) el.fieldPrompt.value = ability.prompt || '';
  } else {
    // 3. 选中新风格，加载其 prompt
    state.selectedStyleId = styleId;
    const style = (ability.styles || []).find(s => s.id === styleId);
    if (el.fieldPrompt) {
      el.fieldPrompt.value = style?.prompt || '';
    }
  }

  // 4. 重新渲染卡片（更新选中状态）
  renderStyles();
}

function onStyleSave() {
  const name = el.styleFieldName?.value?.trim() || '';
  const image = el.styleFieldImage?.value?.trim() || '';

  if (!name) {
    showToast('请输入风格名称');
    return;
  }

  const ability = getCurrentAbility();
  if (!ability.styles) ability.styles = [];

  if (state.editingStyleId) {
    // 编辑已有风格（只更新名称和图片，不动 prompt）
    const idx = ability.styles.findIndex(s => s.id === state.editingStyleId);
    if (idx >= 0) {
      ability.styles[idx].name = name;
      ability.styles[idx].image = image;
    }
  } else {
    // 新增风格（prompt 默认为空，界面上选中后在 textarea 编辑）
    const newStyle = {
      id: 'style_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name,
      image,
      prompt: ''
    };
    ability.styles.push(newStyle);
    // 自动选中新添加的风格
    savePromptToCurrentTarget();
    state.selectedStyleId = newStyle.id;
    if (el.fieldPrompt) el.fieldPrompt.value = '';
  }

  closeStyleEditor();
  renderStyles();
  showToast(state.editingStyleId ? '风格已更新' : '风格已添加');
}

function onStyleDelete(styleId) {
  const ability = getCurrentAbility();
  if (!ability.styles) return;

  const style = ability.styles.find(s => s.id === styleId);
  if (!style) return;

  if (!window.confirm(`确认删除风格「${style.name}」？`)) {
    return;
  }

  // 如果删除的是当前选中的风格，切换回默认 prompt
  if (state.selectedStyleId === styleId) {
    state.selectedStyleId = null;
    if (el.fieldPrompt) el.fieldPrompt.value = ability.prompt || '';
  }

  ability.styles = ability.styles.filter(s => s.id !== styleId);
  renderStyles();
  showToast('风格已删除');
}

function bindStyleEvents() {
  // 风格列表点击事件（事件委托）
  el.styleList?.addEventListener('click', (event) => {
    // 编辑按钮
    const editBtn = event.target.closest('[data-edit-style-id]');
    if (editBtn) {
      event.stopPropagation();
      const id = editBtn.dataset.editStyleId;
      if (id) openStyleEditor(id);
      return;
    }

    // 添加按钮
    const addBtn = event.target.closest('#add-style-btn');
    if (addBtn) {
      openStyleEditor();
      return;
    }

    // 点击卡片 → 选中该风格（切换提示词）
    const card = event.target.closest('[data-style-id]');
    if (card) {
      const id = card.dataset.styleId;
      if (id) selectStyle(id);
    }
  });

  // 弹窗事件
  el.styleModalClose?.addEventListener('click', closeStyleEditor);
  el.styleModalBackdrop?.addEventListener('click', closeStyleEditor);
  el.styleCancelBtn?.addEventListener('click', closeStyleEditor);
  el.styleSaveBtn?.addEventListener('click', onStyleSave);

  // 弹窗中删除按钮
  el.styleDeleteBtn?.addEventListener('click', () => {
    if (state.editingStyleId) {
      onStyleDelete(state.editingStyleId);
      closeStyleEditor();
    }
  });


  // 文件上传事件
  el.styleFileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadStyleImage(file);
    }
  });

  // 清除图片按钮
  el.styleImageClear?.addEventListener('click', () => {
    if (el.styleFieldImage) el.styleFieldImage.value = '';
    if (el.styleFileInput) el.styleFileInput.value = '';
    updateStyleImagePreview('');
    if (el.styleUploadStatus) {
      el.styleUploadStatus.textContent = '';
      el.styleUploadStatus.classList.add('hidden');
    }
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
  bindStyleEvents();
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
