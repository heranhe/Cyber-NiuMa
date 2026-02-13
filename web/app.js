// ===== 状态管理 =====
const state = {
  laborTypes: [],
  workers: [],
  tasks: [],
  totalUsers: 0, // 至少登录过一次的用户数
  filter: 'ALL',  // 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'DELIVERED' | 'MY_PUBLISHED'
  mainTab: 'task-hall',  // 'task-hall' | 'skill-hall'，默认显示任务大厅
  skillCategoryFilter: 'all',  // 'all' | 'visual' | 'writing' | 'image' | 'design' | 'other'
  integration: null,
  secondMeConnected: false,
  me: null,
  meWorker: null,
  abilities: [], // 用户能力库
  skills: [], // 所有技能列表
  skillsLoaded: false,
  skillsLoadedAt: 0,
  skillsLoadingPromise: null
};

const SKILL_HALL_CACHE_TTL = 60 * 1000;

// ===== DOM 元素 =====
const topLogout = document.querySelector('#top-logout');
const loginButtons = Array.from(document.querySelectorAll('.top-login, .hero-login'));
const statusFilters = document.querySelector('#status-filters');
const taskList = document.querySelector('#task-list');
const searchInput = document.querySelector('#search-input');

// 统计元素
const metricWorkers = document.querySelector('#metric-workers');
const metricOrders = document.querySelector('#metric-orders');
const metricDelivered = document.querySelector('#metric-delivered');

// 技能元素
const skillsList = document.querySelector('#skills-list');
const skillsActions = document.querySelector('#skills-actions');
const workerProfileHint = document.querySelector('#worker-profile-hint');
const workerCount = document.querySelector('#worker-count');
const addAbilityBtn = document.querySelector('#add-ability-btn');
const autoMatchBtn = document.querySelector('#auto-match-btn');

// 能力弹窗元素
const abilityModal = document.querySelector('#ability-modal');
const abilityModalTitle = document.querySelector('#ability-modal-title');
const abilityForm = document.querySelector('#ability-form');
const abilityIdInput = document.querySelector('#ability-id');
const abilityNameInput = document.querySelector('#ability-name');
const abilityIconInput = document.querySelector('#ability-icon');
const abilityDescriptionInput = document.querySelector('#ability-description');
const abilityPromptInput = document.querySelector('#ability-prompt');
const closeAbilityModal = document.querySelector('#close-ability-modal');
const cancelAbilityBtn = document.querySelector('#cancel-ability-btn');
const deleteAbilityBtn = document.querySelector('#delete-ability-btn');

// 发布任务弹窗元素
const publishTaskBtn = document.querySelector('#publish-task-btn');
const publishModal = document.querySelector('#publish-modal');
const publishForm = document.querySelector('#publish-form');
const closePublishModal = document.querySelector('#close-publish-modal');
const cancelPublishBtn = document.querySelector('#cancel-publish-btn');

// 接单弹窗元素
const takeTaskModal = document.querySelector('#take-task-modal');
const takeTaskForm = document.querySelector('#take-task-form');
const takeTaskIdInput = document.querySelector('#take-task-id');
const takeTaskTitle = document.querySelector('#take-task-title');
const takeTaskNote = document.querySelector('#take-task-note');
const capabilityList = document.querySelector('#capability-list');
const closeTakeModal = document.querySelector('#close-take-modal');
const cancelTakeBtn = document.querySelector('#cancel-take-btn');

// 排行榜
const rankingList = document.querySelector('#ranking-list');

// ===== 工具函数 =====
function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function oauthState() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ===== API 调用 =====
async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const body = options.body ? JSON.stringify(options.body) : undefined;

  try {
    const response = await fetch(path, { method, headers, body, credentials: 'include' });
    const data = await response.json();
    if (!response.ok) {
      const details = data?.details || {};
      const nested = details?.imageGenerationError?.body || details?.response || '';
      const message = nested
        ? `${data.error || data.message || '请求失败'}: ${nested}`
        : (data.error || data.message || '请求失败');
      throw new Error(message);
    }
    return data;
  } catch (error) {
    console.error(`API Error [${path}]:`, error);
    throw error;
  }
}

// ===== OAuth 登录 =====
function onLoginClick(event) {
  event.preventDefault();
  const state = oauthState();
  sessionStorage.setItem('oauth_state', state);

  api('/api/oauth/authorize-url')
    .then((res) => {
      const authorizeUrl = res?.data?.url || res?.url || '';
      if (authorizeUrl) {
        window.location.href = authorizeUrl;
      } else {
        showToast('无法获取授权链接');
      }
    })
    .catch(() => showToast('登录失败，请稍后重试'));
}

async function onLogoutClick() {
  try {
    await api('/api/oauth/logout', { method: 'POST' });
    showToast('已退出登录');
    setTimeout(() => window.location.reload(), 500);
  } catch {
    showToast('退出失败');
  }
}

function canOperate() {
  return state.secondMeConnected && state.me;
}

// ===== 状态文本 =====
function statusText(status) {
  switch (status) {
    case 'OPEN': return '待接单';
    case 'IN_PROGRESS': return '进行中';
    case 'DELIVERED': return '已交付';
    default: return status;
  }
}

function statusClass(status) {
  switch (status) {
    case 'OPEN': return 'status-open';
    case 'IN_PROGRESS': return 'status-progress';
    case 'DELIVERED': return 'status-done';
    default: return '';
  }
}

// ===== 渲染函数 =====
function renderOverview() {
  const users = state.totalUsers || state.workers.length;
  const orders = state.tasks.reduce((sum, t) => sum + (t.assigneeId ? 1 : 0), 0);
  const delivered = state.tasks.filter((t) => t.status === 'DELIVERED').length;

  // 侧边栏技能排行榜中的元素现在显示 "X 单" 格式
  if (metricWorkers) metricWorkers.textContent = `${users} 单`;
  if (metricOrders) metricOrders.textContent = `${orders} 单`;
  if (metricDelivered) metricDelivered.textContent = `${delivered} 单`;
}

function renderRanking() {
  if (!rankingList) return;

  // 按接单数排行
  const stats = {};
  state.tasks.forEach((task) => {
    if (task.assigneeId) {
      stats[task.assigneeId] = (stats[task.assigneeId] || 0) + 1;
    }
  });

  const sorted = state.workers
    .map((w) => ({ ...w, orders: stats[w.id] || 0 }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 5);

  rankingList.innerHTML = sorted.map((w, i) => {
    const rankBg = i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-300' : i === 2 ? 'bg-amber-600' : 'bg-gray-200';
    return `
      <li class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
        <div class="flex items-center gap-3">
          <div class="w-6 h-6 flex items-center justify-center ${rankBg} text-white font-bold rounded text-xs">${i + 1}</div>
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-orange-400 to-pink-400 flex items-center justify-center text-white text-xs font-bold">${escapeHtml(w.name?.charAt(0) || 'AI')}</div>
            <span class="text-sm font-medium text-gray-800 dark:text-gray-200">${escapeHtml(w.name)}</span>
          </div>
        </div>
        <span class="text-sm font-bold ${w.orders > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}">${w.orders} 单</span>
      </li>
    `;
  }).join('');
}

// 封面图列表（随机分配给任务卡片）
const COVER_IMAGES = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuApLeqfMTWrfgiwAnrZ8S9kMx4wQBWIhiog0wveE3m7R3Y4OgokllSADSKGhhQ1VUNfdkfPjEgAEpa8C7Zz-SvgVW7IOZWXAs9XFUp9oh_QFH1ESVWBygWqni4uxuoWYLr2Ythjp3I8DnDe5wR-HrviV-51UcVybRYkrTCP-NpkwHQv-iPpTRL0IdxeDtxqUqh_UX0-PH5xIyW33QocMBV8UgBAS9e3Uv66VeroVyFLPQNgY4ExC9zNGN-K-oJtkXUAL9HR1NroKinT',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBH9cRv7ReWAcdCcBkmDMInDyGHd9GxpDneNmIXWPAoP9f2FkfTCz9qqsktI3m1EPzCZ3dtL8MBhVjzcH6iIqfWqsR00m-wUbc69WatakyLyeH_FmsMTWJDGhT324Gs2RUYuJCEsdQD9ou3jUuPKjjwniuFRB47Aayo5eoh9inDbZWHV-2JFaT3KLIaQmYyM36PtwV4BGld0bQsk4RVSL0o1Piw0KhhfNfZYUFjYCx1_NWB89KeUIP7Ix8_mbwDXmPNqTB8riNyf-YQ',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAzpNlFyrejz971QGU3hUvzOD066u0YrtwSs8rAaGgckNRbI6tPwHVH4Klth50_ja092AVPPq9d_EePMRspM6svLvZ0_Pp9j-Wkq8IaaKQ5ZYZfThGKgvbyFUbtaoAqrBTm3DTGtIgjhEOgT9sM11OXF_47tT2TOrtwVwiLqauWCgmHuxZkwL3uvN1dT1MHlGRRbw6h8TBAIxlpJy6pw7dBkCfwARrliv77tHFFp-CAKE1E6GTv49YOdfc6WaFaM_039vha9QD6dWui',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuARh5IYkrQkyjQfLr8nZOBtwKyStnzha5bSRJUZVxiqOP7_2wlmAynZs0TsKxPwFm8TFjwSLWZom90upOCG4ZCNypWwP796rxRNUbJ3rfSGMoPtTjXeL5NBhvKItiQUKtlP6PNCrKZRwtkxC5OqRsy1yhJzpIIGlS7dzROrn-P8uUj9KmbCSCjSnR90XDoe_Q3d1ygw-NAEBxJ44KqoOzq30U1IonyqN7ne4Tjo7E2b-Do7Nv2hmbr5kpp1Ze2ls4WWyv6Bm80k-56l'
];

// 封面图长宽比列表（随机分配，营造瀑布流错落感；竖屏最高 4:3，避免过长）
const ASPECT_RATIOS = ['aspect-[4/3]', 'aspect-[3/4]', 'aspect-[16/9]', 'aspect-[1/1]', 'aspect-[4/3]'];

function renderTaskCard(task, index) {
  const statusLabel = statusText(task.status);
  const statusBg = task.status === 'DELIVERED' ? 'bg-green-500' : task.status === 'IN_PROGRESS' ? 'bg-blue-500' : 'bg-gray-200 text-gray-800';
  const statusTextColor = task.status === 'DELIVERED' || task.status === 'IN_PROGRESS' ? 'text-white' : '';

  // 优先使用任务自带封面图，否则用随机封面
  const coverImg = task.coverImage || COVER_IMAGES[index % COVER_IMAGES.length];
  // 有自定义封面时不强制比例，让图片高度自适应；无自定义封面用随机比例
  const hasCustomCover = !!task.coverImage;
  const aspectRatio = hasCustomCover ? '' : ASPECT_RATIOS[index % ASPECT_RATIOS.length];
  const imgClass = hasCustomCover
    ? 'w-full h-auto object-contain transform group-hover:scale-110 transition-transform duration-700 ease-in-out'
    : 'w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700 ease-in-out';

  // 按钮配置
  let actionBtn = '';
  if (task.status === 'OPEN' && canOperate()) {
    actionBtn = `<button class="task-action flex-1 py-2 bg-primary text-white rounded-lg text-[11px] font-bold shadow-sm hover:bg-amber-700 transition-all flex items-center justify-center gap-1" data-action="take" data-task-id="${task.id}"><span class="material-symbols-outlined text-[16px]">touch_app</span> 雇佣</button>`;
  } else if (task.status === 'IN_PROGRESS' && canOperate()) {
    actionBtn = `<button class="task-action flex-1 py-2 bg-primary text-white rounded-lg text-[11px] font-bold shadow-sm hover:bg-amber-700 transition-all flex items-center justify-center gap-1" data-action="deliver" data-task-id="${task.id}"><span class="material-symbols-outlined text-[16px]">rocket_launch</span> 交付</button>`;
  } else if (task.status === 'DELIVERED') {
    actionBtn = `<button class="task-action flex-1 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1" data-action="view" data-task-id="${task.id}"><span class="material-symbols-outlined text-[16px]">visibility</span> 查看</button>`;
  } else {
    actionBtn = `<button class="task-action flex-1 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1" data-action="view" data-task-id="${task.id}"><span class="material-symbols-outlined text-[16px]">visibility</span> 查看</button>`;
  }

  return `
    <div class="masonry-item bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-border-dark hover:border-primary/30 shadow-sm hover:shadow-xl hover:shadow-orange-500/10 transition-all flex flex-col overflow-hidden group" data-task-id="${task.id}">
      <div class="relative m-2 rounded-xl overflow-hidden ${aspectRatio}">
        <img alt="${escapeHtml(task.title)}" class="${imgClass}" src="${coverImg}" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80"></div>
        ${task.budget ? `<span class="absolute top-2 left-2 px-2 py-1 rounded-lg text-[10px] font-bold bg-black/40 backdrop-blur-sm text-white border border-white/20">¥ ${escapeHtml(String(task.budget))}</span>` : ''}
        <span class="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold ${statusBg} ${statusTextColor} shadow-sm z-10">${statusLabel}</span>
        <!-- 悬浮按钮：hover 时显示在封面底部 -->
        <div class="card-hover-gradient"></div>
        <div class="card-hover-buttons">
          <button class="task-action flex-1 py-2 rounded-lg text-[11px] font-bold bg-white text-gray-800 hover:bg-gray-100 shadow-sm transition-all flex items-center justify-center gap-1" data-action="view" data-task-id="${task.id}">
            <span class="material-symbols-outlined text-[16px]">forum</span> 讨论
          </button>
          ${actionBtn}
        </div>
      </div>
      <div class="px-4 pb-4 pt-1 flex flex-col cursor-pointer" onclick="window.location.href='/task-detail.html?id=${task.id}'">
        <h3 class="font-bold text-gray-900 dark:text-white truncate group-hover:text-primary transition-colors text-base mb-2" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</h3>
        <p class="text-xs text-subtext-light dark:text-subtext-dark line-clamp-3 mb-3 leading-relaxed">${escapeHtml(task.description)}</p>
      </div>
    </div>
  `;
}

function renderTasks() {
  if (!taskList) return;

  // 按筛选器过滤任务
  let tasks = state.tasks;

  // 如果是"我的派发"，只显示当前用户发布的任务
  if (state.filter === 'MY_PUBLISHED') {
    const myIds = [
      state.me?.id,
      state.me?.userId,
      state.me?.user_id,
      state.me?.secondUserId,
      state.meWorker?.id,
      state.meWorker?.secondUserId
    ].filter(Boolean);

    if (myIds.length > 0) {
      tasks = tasks.filter((t) => myIds.includes(t.publisherId));
    } else {
      tasks = [];
    }
  } else if (state.filter !== 'ALL') {
    tasks = tasks.filter((t) => t.status === state.filter);
  }

  if (tasks.length === 0) {
    const emptyMsg = state.filter === 'MY_PUBLISHED'
      ? (state.me ? '你还没有派发任何任务' : '请先登录查看我的派发')
      : '暂无任务';
    taskList.innerHTML = `
      <div class="bg-white dark:bg-surface-dark rounded-2xl p-12 text-center border border-gray-100 dark:border-border-dark" style="column-span:all">
        <span class="material-icons-round text-5xl text-gray-300 dark:text-gray-600 mb-4 block">inbox</span>
        <p class="text-gray-500 dark:text-gray-400">${emptyMsg}</p>
      </div>
    `;
    return;
  }

  taskList.innerHTML = tasks.map((task, index) => renderTaskCard(task, index)).join('');
}

function renderSkillsList() {
  // 技能列表现在由 renderAIAvatar 函数统一处理
  // 这个函数保留是为了兼容性，实际渲染逻辑已移至 renderAIAvatar
}

// 渲染 AI 分身容器（三行布局）
function renderAIAvatar() {
  const avatarContainer = document.querySelector('#ai-avatar-container');
  const userAvatar = document.querySelector('#user-avatar');
  const aiName = document.querySelector('#ai-name');
  const earnedPointsEl = document.querySelector('#earned-points');
  const completedOrdersEl = document.querySelector('#completed-orders');
  const workerCount = document.querySelector('#worker-count');
  const capabilityTags = document.querySelector('#capability-tags');
  const workerProfileHint = document.querySelector('#worker-profile-hint');

  // 未登录时隐藏容器，显示提示
  if (!avatarContainer || !state.me) {
    if (avatarContainer) avatarContainer.classList.add('hidden');
    if (workerProfileHint) workerProfileHint.classList.remove('hidden');
    return;
  }

  // 用户已登录，显示 AI 分身容器，隐藏提示
  avatarContainer.classList.remove('hidden');
  if (workerProfileHint) workerProfileHint.classList.add('hidden');

  // 第一行：设置用户头像
  const avatar = state.me.avatar || state.me.profileImageUrl || '';
  if (userAvatar) {
    userAvatar.src = avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(state.me.name || state.me.displayName || '游客')}&background=random`;
  }

  // 设置 AI 分身名称（新版格式：用户名 · 劳务体）
  const username = state.me.name || state.me.displayName || state.me.username || '游客';
  if (aiName) {
    aiName.textContent = `${username} · 劳务体`;
  }

  // 设置积分和接单数（新版只显示纯数字）
  const earnedPoints = state.meWorker?.earnedPoints || 0;
  const completedOrders = state.meWorker?.completedOrders || 0;

  if (earnedPointsEl) {
    earnedPointsEl.textContent = earnedPoints;
  }
  if (completedOrdersEl) {
    completedOrdersEl.textContent = completedOrders;
  }

  // 第三行：渲染技能标签（灰色胶囊样式）
  if (capabilityTags) {
    if (state.abilities.length > 0) {
      capabilityTags.innerHTML = state.abilities.map((ability) => `
        <span class="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-full text-sm font-medium transition-all hover:bg-gray-200 dark:hover:bg-gray-700">
          <span>${ability.icon || '🔧'}</span>
          <span>${escapeHtml(ability.name)}</span>
        </span>
      `).join('');
    } else {
      // 无能力时显示提示
      capabilityTags.innerHTML = `
        <span class="text-sm text-gray-400 dark:text-gray-500 italic">
          暂无配置的技能，点击"管理"添加
        </span>
      `;
    }
  }
}

function renderWorkerProfile() {
  renderSkillsList();
  renderAIAvatar();
}

function setIntegrationView(sessionInfo) {
  state.secondMeConnected = !!sessionInfo?.connected;
  state.me = sessionInfo?.user || null;

  loginButtons.forEach((btn) => {
    btn.hidden = state.secondMeConnected;
  });

  if (topLogout) {
    topLogout.hidden = !state.secondMeConnected;
  }

  renderWorkerProfile();
  renderHireWorkbench();
}

// ===== 能力库 CRUD =====
function openAbilityModal(ability = null) {
  if (!abilityModal) return;

  if (ability) {
    abilityModalTitle.textContent = '编辑能力';
    abilityIdInput.value = ability.id;
    abilityNameInput.value = ability.name || '';
    abilityIconInput.value = ability.icon || '';
    abilityDescriptionInput.value = ability.description || '';
    abilityPromptInput.value = ability.prompt || '';
    deleteAbilityBtn.classList.remove('hidden');
  } else {
    abilityModalTitle.textContent = '添加能力';
    abilityForm.reset();
    abilityIdInput.value = '';
    deleteAbilityBtn.classList.add('hidden');
  }

  abilityModal.classList.remove('hidden');
}

function closeAbilityModalFn() {
  if (abilityModal) abilityModal.classList.add('hidden');
}

async function saveAbility(event) {
  event.preventDefault();

  const id = abilityIdInput.value;
  const data = {
    name: abilityNameInput.value.trim(),
    icon: abilityIconInput.value.trim() || '🔧',
    description: abilityDescriptionInput.value.trim(),
    prompt: abilityPromptInput.value.trim()
  };

  if (!data.name) {
    showToast('请输入能力名称');
    return;
  }

  try {
    if (id) {
      await api(`/api/me/abilities/${id}`, { method: 'PUT', body: data });
      const idx = state.abilities.findIndex((a) => a.id === id);
      if (idx >= 0) state.abilities[idx] = { ...state.abilities[idx], ...data };
      showToast('能力已更新');
    } else {
      const res = await api('/api/me/abilities', { method: 'POST', body: data });
      state.abilities.push(res.ability || { id: Date.now().toString(), ...data });
      showToast('能力已添加');
    }
    closeAbilityModalFn();
    renderWorkerProfile();
  } catch (err) {
    showToast(err.message || '保存失败');
  }
}

async function deleteAbility() {
  const id = abilityIdInput.value;
  if (!id) return;

  if (!confirm('确定要删除这个能力吗？')) return;

  try {
    await api(`/api/me/abilities/${id}`, { method: 'DELETE' });
    state.abilities = state.abilities.filter((a) => a.id !== id);
    showToast('能力已删除');
    closeAbilityModalFn();
    renderWorkerProfile();
  } catch (err) {
    showToast(err.message || '删除失败');
  }
}

// ===== 发布任务 =====
function openPublishModal() {
  if (!canOperate()) {
    showToast('请先登录');
    return;
  }
  if (publishModal) publishModal.classList.remove('hidden');
}

function closePublishModalFn() {
  if (publishModal) publishModal.classList.add('hidden');
  // 清空文件列表
  const fileList = document.querySelector('#publish-file-list');
  if (fileList) {
    fileList.innerHTML = '';
    fileList.classList.add('hidden');
  }
  const fileInput = document.querySelector('#publish-files');
  if (fileInput) fileInput.value = '';
}

// 已选文件存储
let selectedFiles = [];

// 更新文件列表显示
function updateFileListDisplay() {
  const fileList = document.querySelector('#publish-file-list');
  if (!fileList) return;

  if (selectedFiles.length === 0) {
    fileList.classList.add('hidden');
    fileList.innerHTML = '';
    return;
  }

  fileList.classList.remove('hidden');
  fileList.innerHTML = selectedFiles.map((file, index) => `
    <div class="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs">
      <span class="material-icons-round text-sm text-gray-400">${file.type.startsWith('image/') ? 'image' : 'description'}</span>
      <span class="flex-1 truncate text-gray-700 dark:text-gray-300">${escapeHtml(file.name)}</span>
      <span class="text-gray-400">${(file.size / 1024).toFixed(1)}KB</span>
      <button type="button" class="remove-file text-gray-400 hover:text-red-500" data-index="${index}">
        <span class="material-icons-round text-sm">close</span>
      </button>
    </div>
  `).join('');

  // 绑定删除按钮
  fileList.querySelectorAll('.remove-file').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.dataset.index);
      selectedFiles.splice(idx, 1);
      updateFileListDisplay();
    });
  });
}

// 初始化文件上传监听
function initFileUpload() {
  const fileInput = document.querySelector('#publish-files');
  const dropzone = document.querySelector('#publish-dropzone');

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      selectedFiles = [...selectedFiles, ...files];
      updateFileListDisplay();
    });
  }

  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-primary');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-primary');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-primary');
      const files = Array.from(e.dataTransfer?.files || []);
      selectedFiles = [...selectedFiles, ...files];
      updateFileListDisplay();
    });
  }
}

async function onPublishSubmit(event) {
  event.preventDefault();

  // 防重复提交：禁用发布按钮
  const submitBtn = publishForm.querySelector('button[type="submit"]');
  if (submitBtn) {
    if (submitBtn.disabled) return; // 已在提交中，忽略
    submitBtn.disabled = true;
    submitBtn.textContent = '发布中...';
  }

  const formData = new FormData(event.target);
  const data = {
    title: formData.get('title')?.trim(),
    description: formData.get('description')?.trim(),
    budget: parseInt(formData.get('budget') || '0', 10) || 0
  };

  // 读取封面图为 base64
  const coverInput = document.getElementById('publish-cover-input');
  if (coverInput?.files?.[0]) {
    try {
      data.coverImage = await fileToDataUrl(coverInput.files[0]);
    } catch (e) {
      console.warn('封面图读取失败', e);
    }
  }

  if (!data.title || !data.description) {
    showToast('请填写任务标题和描述');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '派活'; }
    return;
  }

  try {
    const res = await api('/api/tasks', { method: 'POST', body: data });
    showToast('任务发布成功');
    closePublishModalFn();
    publishForm.reset();
    // 清除封面预览
    const preview = document.getElementById('cover-preview');
    if (preview) { preview.classList.add('hidden'); preview.querySelector('img')?.removeAttribute('src'); }
    await loadTasks();
  } catch (err) {
    showToast(err.message || '发布失败');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '派活'; }
  }
}

// 将文件转为 data URL
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== 接单弹窗 =====
function openTakeTaskModal(taskId) {
  if (!takeTaskModal) return;

  // 查找当前任务
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) {
    showToast('任务不存在');
    return;
  }

  // 填充任务信息
  takeTaskIdInput.value = taskId;
  if (takeTaskTitle) takeTaskTitle.textContent = task.title || '未命名任务';
  if (takeTaskNote) takeTaskNote.value = '';

  // 渲染能力选项
  renderCapabilityOptions();

  takeTaskModal.classList.remove('hidden');
}

function closeTakeTaskModalFn() {
  if (takeTaskModal) takeTaskModal.classList.add('hidden');
}

function renderCapabilityOptions() {
  if (!capabilityList) return;

  if (state.abilities.length === 0) {
    capabilityList.innerHTML = `
      <div class="text-sm text-subtext-light dark:text-subtext-dark text-center py-4">
        <span class="material-icons-round text-3xl text-gray-300 dark:text-gray-600 mb-2 block">psychology</span>
        <p>暂无可用的 AI 能力</p>
        <p class="text-xs mt-1">请先添加 AI 能力后再接单</p>
      </div>
    `;
    return;
  }

  capabilityList.innerHTML = state.abilities.map((ability, index) => `
    <label class="relative flex items-center p-4 border-2 ${index === 0 ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-gray-200 dark:border-gray-700 hover:border-primary/50 dark:hover:border-primary/50 bg-white dark:bg-surface-dark'} rounded-xl cursor-pointer transition-colors">
      <input type="radio" name="capability" value="${ability.id}" class="form-radio text-primary w-5 h-5 border-gray-300 focus:ring-primary" ${index === 0 ? 'checked' : ''} />
      <div class="ml-3 flex-1">
        <div class="flex justify-between items-center">
          <span class="font-bold text-gray-900 dark:text-white">${ability.icon || '🔧'} ${escapeHtml(ability.name)}</span>
          ${index === 0 ? '<span class="text-xs bg-primary text-white px-2 py-0.5 rounded-md">推荐</span>' : ''}
        </div>
        ${ability.description ? `<div class="text-xs text-subtext-light dark:text-subtext-dark mt-1">擅长: ${escapeHtml(ability.description)}</div>` : ''}
      </div>
    </label>
  `).join('');

  // 添加点击事件更新选中样式
  capabilityList.querySelectorAll('label').forEach(label => {
    label.addEventListener('click', () => {
      capabilityList.querySelectorAll('label').forEach(l => {
        l.classList.remove('border-primary', 'bg-primary/5', 'dark:bg-primary/10');
        l.classList.add('border-gray-200', 'dark:border-gray-700', 'bg-white', 'dark:bg-surface-dark');
      });
      label.classList.remove('border-gray-200', 'dark:border-gray-700', 'bg-white', 'dark:bg-surface-dark');
      label.classList.add('border-primary', 'bg-primary/5', 'dark:bg-primary/10');
    });
  });
}

async function onTakeTaskSubmit(event) {
  event.preventDefault();

  const taskId = takeTaskIdInput.value;
  const selectedCapability = document.querySelector('input[name="capability"]:checked');
  const note = takeTaskNote?.value?.trim() || '';

  if (!taskId) {
    showToast('任务 ID 不存在');
    return;
  }

  if (!selectedCapability && state.abilities.length > 0) {
    showToast('请选择一个 AI 能力');
    return;
  }

  try {
    await api(`/api/tasks/${taskId}/take`, {
      method: 'POST',
      body: {
        abilityId: selectedCapability?.value,
        note: note
      }
    });
    showToast('接单成功');
    closeTakeTaskModalFn();
    await loadTasks();
  } catch (err) {
    showToast(err.message || '接单失败');
  }
}

// ===== 任务操作 =====
async function onTaskActionClick(event) {
  const button = event.target.closest('.task-action');
  const taskCard = event.target.closest('article[data-task-id]');

  // 如果点击的是操作按钮，处理按钮操作
  if (button) {
    event.stopPropagation();  // 阻止跳转到详情页

    const action = button.dataset.action;
    const taskId = button.dataset.taskId;

    if (!canOperate()) {
      showToast('请先登录');
      return;
    }

    try {
      if (action === 'take') {
        // 打开接单弹窗
        openTakeTaskModal(taskId);
      } else if (action === 'deliver') {
        // 实现 AI 交付逻辑
        await deliverTask(taskId, button);
      } else if (action === 'discuss') {
        // 跳转到详情页讨论区
        window.location.href = `/task-detail.html?id=${taskId}#discussions`;
      } else if (action === 'view') {
        // 查看任务详情（包括交付结果）
        await viewTaskDetails(taskId);
      }
    } catch (err) {
      showToast(err.message || '操作失败');
    }
    return;
  }

  // 如果点击的是任务卡片（非按钮），跳转到详情页
  if (taskCard) {
    const taskId = taskCard.dataset.taskId;
    if (taskId) {
      window.location.href = `/task-detail.html?id=${taskId}`;
    }
  }
}

// AI 交付任务
async function deliverTask(taskId, button) {
  const task = state.tasks.find((item) => item.id === taskId);
  const requirement = task?.description || task?.title || '';
  const now = new Date().toISOString();

  clearHireStatusTimers();
  hireSelectedSummaryId = null;
  Object.assign(currentHireJob, {
    id: `task_delivery_${taskId}_${Date.now()}`,
    status: 'ACCEPTED',
    skillId: `task:${taskId}`,
    skillName: `任务交付 · ${task?.title || '未命名任务'}`,
    skillIcon: '📦',
    requirement,
    selectedStyleId: '',
    timeline: [],
    result: null,
    createdAt: now
  });
  setHireStatus('ACCEPTED', '已接单', 'info');
  openHireWorkbench();

  hireStatusTimers.push(setTimeout(() => {
    if (isHireProcessing()) {
      setHireStatus('ANALYZING', '分析需求中', 'running');
    }
  }, 500));

  hireStatusTimers.push(setTimeout(() => {
    if (isHireProcessing()) {
      setHireStatus('THINKING', '思考方案中', 'running');
    }
  }, 1400));

  hireStatusTimers.push(setTimeout(() => {
    if (isHireProcessing()) {
      setHireStatus('DELIVERING', '交付生成中', 'running');
    }
  }, 2600));

  // 保存原始按钮内容
  const originalContent = button.innerHTML;

  // 更新按钮状态为"正在交付"
  button.disabled = true;
  button.innerHTML = `
    <span class="material-icons-round text-[14px] animate-spin">sync</span>
    AI 正在交付中...
  `;
  button.classList.add('opacity-75', 'cursor-not-allowed');

  try {
    const res = await api(`/api/tasks/${taskId}/deliver`, {
      method: 'POST',
      body: { brief: '' }
    });

    if (res.code === 0) {
      clearHireStatusTimers();
      const deliveredTask = res?.data || {};
      const normalizedResult = {
        content: deliveredTask?.delivery?.content || '交付完成，但内容为空。',
        images: deliveredTask?.delivery?.images || []
      };

      currentHireJob.result = normalizedResult;
      setHireStatus('COMPLETED', '已完成', 'success');
      renderHireWorkbench();

      appendHireSummary({
        id: currentHireJob.id,
        skillId: currentHireJob.skillId,
        skillName: currentHireJob.skillName,
        skillIcon: currentHireJob.skillIcon,
        status: 'COMPLETED',
        requirement: currentHireJob.requirement,
        timeline: currentHireJob.timeline.slice(),
        result: normalizedResult,
        createdAt: currentHireJob.createdAt,
        completedAt: new Date().toISOString()
      });

      showToast('🎉 交付成功！');
      await loadTasks(); // 刷新任务列表
    } else {
      throw new Error(res.message || '交付失败');
    }
  } catch (err) {
    clearHireStatusTimers();
    const message = err.message || '交付失败';
    currentHireJob.result = { content: message, images: [] };
    setHireStatus('FAILED', `执行失败：${message}`, 'error');
    appendHireSummary({
      id: currentHireJob.id,
      skillId: currentHireJob.skillId,
      skillName: currentHireJob.skillName,
      skillIcon: currentHireJob.skillIcon,
      status: 'FAILED',
      requirement: currentHireJob.requirement,
      timeline: currentHireJob.timeline.slice(),
      result: { content: message, images: [] },
      createdAt: currentHireJob.createdAt,
      completedAt: new Date().toISOString()
    });

    // 恢复按钮状态
    button.innerHTML = originalContent;
    button.disabled = false;
    button.classList.remove('opacity-75', 'cursor-not-allowed');
    throw err;
  }
}

// 查看任务详情
async function viewTaskDetails(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) {
    showToast('任务不存在');
    return;
  }

  // 如果任务已交付，显示交付结果
  if (task.status === 'DELIVERED' && task.delivery) {
    showDeliveryModal(task);
  } else {
    showToast('任务详情页开发中');
  }
}

// 显示交付结果弹窗
function showDeliveryModal(task) {
  const deliveryContent = String(task.delivery?.content || '暂无内容');
  const mdImageRegex = /!\[[^\]]*\]\((data:image\/[^\s)]+|https?:\/\/[^\s)]+)\)/gi;
  const images = [];
  let mdMatch;
  while ((mdMatch = mdImageRegex.exec(deliveryContent)) !== null) {
    images.push(mdMatch[1]);
  }
  const textContent = deliveryContent.replace(mdImageRegex, '').trim();

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white dark:bg-surface-dark rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
      <div class="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <span class="material-icons-round text-green-500">verified</span>
          交付结果
        </h3>
        <button class="close-modal p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
          <span class="material-icons-round text-gray-500">close</span>
        </button>
      </div>
      <div class="p-4 overflow-y-auto max-h-[60vh]">
        <div class="mb-4">
          <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">任务标题</h4>
          <p class="text-gray-900 dark:text-white">${escapeHtml(task.title)}</p>
        </div>
        <div class="mb-4">
          <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">AI 交付内容</h4>
          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 prose dark:prose-invert max-w-none">
            ${images.length ? `
              <div class="mb-3 grid grid-cols-2 gap-2">
                ${images.map((src) => `<img src="${escapeHtml(src)}" class="w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700" alt="交付图片" loading="lazy" />`).join('')}
              </div>
            ` : ''}
            <pre class="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">${escapeHtml(textContent || '暂无内容')}</pre>
          </div>
        </div>
        <div class="text-xs text-gray-400 dark:text-gray-500">
          交付时间: ${task.delivery?.createdAt || task.updatedAt}
        </div>
      </div>
      <div class="flex gap-2 p-4 border-t border-gray-100 dark:border-gray-700">
        <button class="close-modal flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
          关闭
        </button>
        <button class="redeliver-btn flex-1 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-amber-600 transition-colors" data-task-id="${task.id}">
          重新交付
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 关闭弹窗
  modal.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => modal.remove());
  });

  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  // 重新交付
  modal.querySelector('.redeliver-btn')?.addEventListener('click', async (e) => {
    const btn = e.target;
    const taskId = btn.dataset.taskId;
    modal.remove();

    // 找到任务卡片中的交付按钮并模拟点击触发交付
    const taskCard = document.querySelector(`[data-task-id="${taskId}"][data-action="deliver"]`);
    if (taskCard) {
      // 重置任务状态为 IN_PROGRESS 以允许重新交付
      const task = state.tasks.find(t => t.id === taskId);
      if (task) {
        task.status = 'IN_PROGRESS';
        renderTasks();
        // 给一点时间让 DOM 更新
        setTimeout(() => {
          const newBtn = document.querySelector(`[data-task-id="${taskId}"][data-action="deliver"]`);
          if (newBtn) newBtn.click();
        }, 100);
      }
    } else {
      showToast('重新交付功能开发中');
    }
  });
}

// ===== 筛选器 =====
function setFilter(filter) {
  state.filter = filter;

  statusFilters?.querySelectorAll('.filter').forEach((btn) => {
    if (btn.dataset.status === filter) {
      btn.classList.add('is-active', 'bg-primary/10', 'text-primary', 'border-primary/20');
      btn.classList.remove('bg-white', 'border-gray-200', 'text-gray-600');
    } else {
      btn.classList.remove('is-active', 'bg-primary/10', 'text-primary', 'border-primary/20');
      btn.classList.add('bg-white', 'border-gray-200', 'text-gray-600');
    }
  });

  renderTasks();
}

// ===== 数据加载 =====
async function loadMeta() {
  try {
    const metaRes = await api('/api/meta');
    const meta = metaRes?.data || {};
    state.laborTypes = meta.laborTypes || [];
    state.workers = meta.workers || [];
    state.totalUsers = meta.totalUsers || 0;
    const profileRes = await api('/api/secondme/profile');
    const profile = profileRes?.data || {};
    setIntegrationView({
      connected: !!profile.connected,
      user: profile?.profile?.data || null
    });

    if (profile?.connected && profile?.profile?.data) {
      await loadMyWorker();
    }
  } catch (err) {
    console.error('loadMeta error:', err);
  }
}

async function loadMyWorker() {
  try {
    const res = await api('/api/me/labor-body');
    const payload = res?.data || {};
    state.meWorker = payload.worker || null;
    state.abilities = payload.abilities || [];
    renderWorkerProfile();
  } catch (err) {
    console.error('loadMyWorker error:', err);
  }
}

async function loadTasks() {
  try {
    const res = await api('/api/tasks');
    state.tasks = Array.isArray(res?.data) ? res.data : [];
    renderOverview();
    renderTasks();
    renderRanking();
    renderHireWorkbench();
  } catch (err) {
    console.error('loadTasks error:', err);
  }
}

async function refreshEverything() {
  await loadMeta();
  await loadTasks();
}

// ===== 初始化 =====
function bootstrap() {
  refreshEverything();
  // 默认加载技能大厅数据
  loadSkillHall();
}

// 事件绑定
loginButtons.forEach((btn) => btn.addEventListener('click', onLoginClick));
if (topLogout) topLogout.addEventListener('click', onLogoutClick);

if (statusFilters) {
  statusFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter');
    if (btn) setFilter(btn.dataset.status);
  });
}

if (taskList) {
  taskList.addEventListener('click', onTaskActionClick);
}

if (addAbilityBtn) addAbilityBtn.addEventListener('click', () => openAbilityModal());
if (closeAbilityModal) closeAbilityModal.addEventListener('click', closeAbilityModalFn);
if (cancelAbilityBtn) cancelAbilityBtn.addEventListener('click', closeAbilityModalFn);
if (abilityForm) abilityForm.addEventListener('submit', saveAbility);
if (deleteAbilityBtn) deleteAbilityBtn.addEventListener('click', deleteAbility);

if (skillsList) {
  skillsList.addEventListener('click', (e) => {
    const tag = e.target.closest('.ability-tag');
    if (tag) {
      const id = tag.dataset.abilityId;
      const ability = state.abilities.find((a) => a.id === id);
      if (ability) openAbilityModal(ability);
    }
  });
}

if (publishTaskBtn) publishTaskBtn.addEventListener('click', openPublishModal);
if (closePublishModal) closePublishModal.addEventListener('click', closePublishModalFn);
if (cancelPublishBtn) cancelPublishBtn.addEventListener('click', closePublishModalFn);
if (publishForm) publishForm.addEventListener('submit', onPublishSubmit);
initFileUpload();  // 初始化文件上传

// 点击弹窗外部关闭
if (abilityModal) {
  abilityModal.addEventListener('click', (e) => {
    if (e.target === abilityModal) closeAbilityModalFn();
  });
}
if (publishModal) {
  publishModal.addEventListener('click', (e) => {
    if (e.target === publishModal) closePublishModalFn();
  });
}

// 接单弹窗事件
if (closeTakeModal) closeTakeModal.addEventListener('click', closeTakeTaskModalFn);
if (cancelTakeBtn) cancelTakeBtn.addEventListener('click', closeTakeTaskModalFn);
if (takeTaskForm) takeTaskForm.addEventListener('submit', onTakeTaskSubmit);
if (takeTaskModal) {
  takeTaskModal.addEventListener('click', (e) => {
    if (e.target === takeTaskModal) closeTakeTaskModalFn();
  });
}

// ===== 主标签页切换 =====
function switchMainTab(tabName) {
  state.mainTab = tabName;

  const taskHallContent = document.querySelector('#task-hall-content');
  const skillHallContent = document.querySelector('#skill-hall-content');
  const mainTabs = document.querySelectorAll('.main-tab');

  // 更新标签页激活状态（pill toggle 样式）
  mainTabs.forEach(tab => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add('is-active', 'bg-gray-900', 'dark:bg-white', 'text-white', 'dark:text-black', 'shadow-md', 'font-bold');
      tab.classList.remove('text-subtext-light', 'dark:text-subtext-dark', 'font-medium');
    } else {
      tab.classList.remove('is-active', 'bg-gray-900', 'dark:bg-white', 'text-white', 'dark:text-black', 'shadow-md', 'font-bold');
      tab.classList.add('text-subtext-light', 'dark:text-subtext-dark', 'font-medium');
    }
  });

  // 切换内容显示
  if (tabName === 'task-hall') {
    taskHallContent?.classList.remove('hidden');
    skillHallContent?.classList.add('hidden');
  } else if (tabName === 'skill-hall') {
    taskHallContent?.classList.add('hidden');
    skillHallContent?.classList.remove('hidden');
    // 加载技能大厅数据
    loadSkillHall();
  }
}

// ===== 技能大厅相关 =====
async function loadSkillHall() {
  const skillLoading = document.querySelector('#skill-loading');
  const skillCategories = document.querySelector('#skill-categories');
  const skillEmpty = document.querySelector('#skill-empty');
  const now = Date.now();
  const hasFreshCache = state.skillsLoaded && (now - state.skillsLoadedAt) < SKILL_HALL_CACHE_TTL;

  if (hasFreshCache) {
    if (state.skills.length === 0) {
      skillLoading?.classList.add('hidden');
      skillCategories?.classList.add('hidden');
      skillEmpty?.classList.remove('hidden');
    } else {
      skillLoading?.classList.add('hidden');
      skillEmpty?.classList.add('hidden');
      skillCategories?.classList.remove('hidden');
      renderSkillCategories(state.skills);
    }
    return;
  }

  if (state.skillsLoadingPromise) {
    await state.skillsLoadingPromise;
    return;
  }

  // 显示加载状态
  skillLoading?.classList.remove('hidden');
  skillCategories?.classList.add('hidden');
  skillEmpty?.classList.add('hidden');

  state.skillsLoadingPromise = (async () => {
    try {
      // 从公开 API 获取所有用户的技能（无需登录）
      const res = await api('/api/skills/public');
      const skills = Array.isArray(res?.data) ? res.data : [];
      state.skills = skills;
      state.skillsLoaded = true;
      state.skillsLoadedAt = Date.now();

      // 隐藏加载状态
      skillLoading?.classList.add('hidden');

      if (skills.length === 0) {
        skillEmpty?.classList.remove('hidden');
      } else {
        skillCategories?.classList.remove('hidden');
        renderSkillCategories(skills);
      }
    } catch (err) {
      console.error('加载技能失败:', err);
      skillLoading?.classList.add('hidden');
      skillEmpty?.classList.remove('hidden');
    } finally {
      state.skillsLoadingPromise = null;
    }
  })();

  await state.skillsLoadingPromise;
}

// 技能分类定义
const SKILL_CATEGORIES = [
  { id: 'visual', name: '🎨 视觉设计', icon: '🎨' },
  { id: 'writing', name: '✍️ 文案创作', icon: '✍️' },
  { id: 'image', name: '🖼️ 图像处理', icon: '🖼️' },
  { id: 'design', name: '🎯 UI设计', icon: '🎯' },
  { id: 'other', name: '💡 其他技能', icon: '💡' }
];

// 将技能分配到分类
function categorizeSkill(skill) {
  const name = skill.name.toLowerCase();
  if (name.includes('设计') || name.includes('logo') || name.includes('海报')) {
    return 'visual';
  }
  if (name.includes('文案') || name.includes('写作') || name.includes('撰写')) {
    return 'writing';
  }
  if (name.includes('图') || name.includes('p图') || name.includes('修图') || name.includes('精修')) {
    return 'image';
  }
  if (name.includes('ui') || name.includes('界面')) {
    return 'design';
  }
  return 'other';
}

// 渲染技能列表（网格布局,固定比例）
function renderSkillCategories(skills) {
  const container = document.querySelector('#skill-categories');
  if (!container) return;

  // 根据当前筛选器过滤技能
  let filteredSkills = skills;
  if (state.skillCategoryFilter !== 'all') {
    filteredSkills = skills.filter(skill => categorizeSkill(skill) === state.skillCategoryFilter);
  }

  if (filteredSkills.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12">
        <span class="material-icons-round text-4xl text-gray-300 dark:text-gray-600 mb-3 block">extension_off</span>
        <p class="text-gray-400 dark:text-gray-500">当前分类暂无技能</p>
      </div>
    `;
    return;
  }

  // 网格布局渲染（技能大厅专用）
  container.innerHTML = `
    <div class="skill-grid pb-12">
      ${filteredSkills.map((s, i) => renderSkillCard(s, i)).join('')}
    </div>
  `;
}

// 技能封面图列表
const SKILL_COVER_IMAGES = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC0P0SSvUZo6srifGj-ww_RRElGYWAXJ4FcFZSm5rHCkYcbHOFjc6QNSnijKKnucytou0qIFY3D0nPf2dW-WMcudn6BVQzyGPU4M_sZixbEwQJpmLYjrlmVOTl0QYbittZmVV0OR0UAJ3BLngKHt7cUu0XUNQ-9N9WqoweRVBhJ_OFFlcm42V_AJHlZ_MFFfLmhPOl87dGa--mRbI1AIPSU-kwigylSHeCaD6DM0WFi02T8bKgbcGgFtgi1eghhfyXvyS8Oib1Y7pbU',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBH9cRv7ReWAcdCcBkmDMInDyGHd9GxpDneNmIXWPAoP9f2FkfTCz9qqsktI3m1EPzCZ3dtL8MBhVjzcH6iIqfWqsR00m-wUbc69WatakyLyeH_FmsMTWJDGhT324Gs2RUYuJCEsdQD9ou3jUuPKjjwniuFRB47Aayo5eoh9inDbZWHV-2JFaT3KLIaQmYyM36PtwV4BGld0bQsk4RVSL0o1Piw0KhhfNfZYUFjYCx1_NWB89KeUIP7Ix8_mbwDXmPNqTB8riNyf-YQ',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuApLeqfMTWrfgiwAnrZ8S9kMx4wQBWIhiog0wveE3m7R3Y4OgokllSADSKGhhQ1VUNfdkfPjEgAEpa8C7Zz-SvgVW7IOZWXAs9XFUp9oh_QFH1ESVWBygWqni4uxuoWYLr2Ythjp3I8DnDe5wR-HrviV-51UcVybRYkrTCP-NpkwHQv-iPpTRL0IdxeDtxqUqh_UX0-PH5xIyW33QocMBV8UgBAS9e3Uv66VeroVyFLPQNgY4ExC9zNGN-K-oJtkXUAL9HR1NroKinT'
];

// 渲染单个技能卡片（网格布局,固定4:3比例封面）
function renderSkillCard(skill, index) {
  const category = categorizeSkill(skill);
  const categoryInfo = SKILL_CATEGORIES.find(c => c.id === category) || SKILL_CATEGORIES[4];
  const categoryName = categoryInfo.name.replace(categoryInfo.icon, '').trim();
  const coverImg = skill.coverImage || SKILL_COVER_IMAGES[index % SKILL_COVER_IMAGES.length];

  return `
    <div class="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-border-dark hover:border-primary/30 shadow-sm hover:shadow-xl hover:shadow-orange-500/10 transition-all flex flex-col overflow-hidden group" data-skill-id="${skill.id}">
      <div class="relative m-2 skill-card-cover">
        <img alt="${escapeHtml(skill.name)}" class="transform group-hover:scale-110 transition-transform duration-700 ease-in-out" src="${coverImg}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80"></div>
        <span class="absolute top-2 left-2 px-2 py-1 rounded-lg text-[10px] font-bold bg-black/40 backdrop-blur-sm text-white border border-white/20">${skill.icon || '🔧'} ${categoryName}</span>
        <!-- 悬浮按钮 -->
        <div class="card-hover-gradient"></div>
        <div class="card-hover-buttons">
          <button class="flex-1 py-2 rounded-lg text-[11px] font-bold bg-white text-gray-800 hover:bg-gray-100 shadow-sm transition-all flex items-center justify-center gap-1">
            <span class="material-symbols-outlined text-[16px]">chat_bubble</span> 咨询
          </button>
          <button class="skill-hire-btn flex-1 py-2 bg-primary text-white rounded-lg text-[11px] font-bold shadow-sm hover:bg-amber-700 transition-all flex items-center justify-center gap-1" data-action="hire" data-skill-id="${skill.id}">
            <span class="material-symbols-outlined text-[16px]">touch_app</span> 雇佣
          </button>
        </div>
      </div>
      <div class="px-4 pb-4 pt-1 flex flex-col">
        <h3 class="font-bold text-gray-900 dark:text-white truncate group-hover:text-primary transition-colors text-base mb-2" title="${escapeHtml(skill.name)}">${escapeHtml(skill.name)}</h3>
        <p class="text-xs text-subtext-light dark:text-subtext-dark line-clamp-3 mb-3 leading-relaxed">${escapeHtml(skill.description || '这个 AI 分身很懒，还没写简介…')}</p>
        <div class="flex flex-wrap gap-1.5">
          <span class="px-2 py-0.5 bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-[10px] rounded border border-gray-100 dark:border-gray-600">${categoryName}</span>
        </div>
      </div>
    </div>
  `;
}

// 主标签页点击事件
const mainTabs = document.querySelectorAll('.main-tab');
mainTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    switchMainTab(tabName);
  });
});

// 技能分类筛选器点击事件
const skillCategoryFilters = document.querySelector('#skill-category-filters');
if (skillCategoryFilters) {
  skillCategoryFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.skill-category-filter');
    if (!btn) return;

    const category = btn.dataset.category;
    state.skillCategoryFilter = category;

    // 更新筛选按钮激活状态
    skillCategoryFilters.querySelectorAll('.skill-category-filter').forEach(filter => {
      if (filter.dataset.category === category) {
        filter.classList.add('is-active', 'bg-primary/10', 'text-primary', 'border-primary/20');
        filter.classList.remove('bg-white', 'border', 'border-gray-200', 'text-gray-600');
      } else {
        filter.classList.remove('is-active', 'bg-primary/10', 'text-primary', 'border-primary/20');
        filter.classList.add('bg-white', 'border', 'border-gray-200', 'text-gray-600');
      }
    });

    // 重新渲染技能列表
    renderSkillCategories(state.skills);
  });
}

// ===== 雇佣弹窗逻辑 =====
const hireModal = document.getElementById('hire-modal');
const hireFormView = document.getElementById('hire-form-view');
const hireLoadingView = document.getElementById('hire-loading-view');
const hireResultView = document.getElementById('hire-result-view');
const hireSkillIcon = document.getElementById('hire-skill-icon');
const hireSkillName = document.getElementById('hire-skill-name');
const hireSkillDesc = document.getElementById('hire-skill-desc');
const hireRequirement = document.getElementById('hire-requirement');
const hireStyleSection = document.getElementById('hire-style-section');
const hireStyleList = document.getElementById('hire-style-list');
const hireResultSkillName = document.getElementById('hire-result-skill-name');
const hireResultImages = document.getElementById('hire-result-images');
const hireResultText = document.getElementById('hire-result-text');
const hireFabWrapper = document.getElementById('hire-fab-wrapper');
const hireFabBtn = document.getElementById('hire-fab-btn');
const hireFabDot = document.getElementById('hire-fab-dot');
const hireFabChevron = document.getElementById('hire-fab-chevron');
const hireFloatingPanel = document.getElementById('hire-floating-panel');
const hirePanelStatus = document.getElementById('hire-panel-status');
const hirePanelSkill = document.getElementById('hire-panel-skill');
const hirePanelRequirement = document.getElementById('hire-panel-requirement');
const hireStatusTimeline = document.getElementById('hire-status-timeline');
const hirePanelResultBlock = document.getElementById('hire-panel-result-block');
const hirePanelResultImages = document.getElementById('hire-panel-result-images');
const hirePanelResultText = document.getElementById('hire-panel-result-text');
const hireSummaryList = document.getElementById('hire-summary-list');
const hireSummaryClearBtn = document.getElementById('hire-summary-clear-btn');
const hireStatTotal = document.getElementById('hire-stat-total');
const hireStatCompleted = document.getElementById('hire-stat-completed');
const hireStatProcessing = document.getElementById('hire-stat-processing');
const hireManageDemandsBtn = document.getElementById('hire-manage-demands-btn');

// 当前雇佣的技能信息
let currentHireSkill = null;
let currentHireStyleId = null;
let hireStatusTimers = [];
let hireSelectedSummaryId = null;

const HIRE_SUMMARY_STORAGE_KEY = 'hire_summary_v1';
const HIRE_SUMMARY_LIMIT = 30;
const PROCESSING_HIRE_STATUSES = new Set(['ACCEPTED', 'ANALYZING', 'THINKING', 'CALLING_SKILL', 'DELIVERING']);
const HIRE_STATUS_LABELS = {
  IDLE: '空闲中',
  ACCEPTED: 'AI 已接单',
  ANALYZING: '正在分析需求',
  THINKING: '正在思考中',
  CALLING_SKILL: '正在调用 skill',
  DELIVERING: '正在交付中',
  COMPLETED: '已完成',
  FAILED: '执行失败'
};

const currentHireJob = {
  id: '',
  status: 'IDLE',
  skillId: '',
  skillName: '',
  skillIcon: '🔧',
  requirement: '',
  selectedStyleId: '',
  timeline: [],
  result: null,
  createdAt: ''
};

let hireSummaryRecords = loadHireSummaryRecords();

function formatTimeLabel(iso) {
  if (!iso) return '';
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${hour}:${minute}:${second}`;
  } catch {
    return '';
  }
}

function loadHireSummaryRecords() {
  try {
    const raw = localStorage.getItem(HIRE_SUMMARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistHireSummaryRecords() {
  try {
    localStorage.setItem(HIRE_SUMMARY_STORAGE_KEY, JSON.stringify(hireSummaryRecords.slice(0, HIRE_SUMMARY_LIMIT)));
  } catch (error) {
    console.warn('persistHireSummaryRecords failed', error);
  }
}

function clearHireStatusTimers() {
  hireStatusTimers.forEach((timer) => clearTimeout(timer));
  hireStatusTimers = [];
}

function isHireProcessing() {
  return PROCESSING_HIRE_STATUSES.has(currentHireJob.status);
}

function getLatestTimelineText() {
  if (!currentHireJob.timeline.length) return HIRE_STATUS_LABELS[currentHireJob.status] || '空闲中';
  return currentHireJob.timeline[currentHireJob.timeline.length - 1].text;
}

function updateHireEntryVisibility() {
  if (hireFabWrapper) {
    hireFabWrapper.classList.remove('hidden');
  }
}

function updateHireFabDot() {
  hireFabDot?.classList.toggle('hidden', !isHireProcessing());
}

function openHireWorkbench() {
  hireFloatingPanel?.classList.remove('hidden');
  hireFabChevron?.classList.add('rotate-180');
}

function closeHireWorkbench() {
  hireFloatingPanel?.classList.add('hidden');
  hireFabChevron?.classList.remove('rotate-180');
}

function setHireStatus(status, text, type = 'info') {
  currentHireJob.status = status;
  currentHireJob.timeline.push({
    id: `timeline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text,
    type,
    at: new Date().toISOString()
  });
  renderHireWorkbench();
}

function buildTimelineDotClass(type) {
  if (type === 'success') return 'bg-green-500';
  if (type === 'error') return 'bg-red-500';
  if (type === 'running') return 'bg-blue-500';
  return 'bg-gray-400';
}

function getSummaryById(id) {
  return hireSummaryRecords.find((item) => item.id === id) || null;
}

function getRecordStatusLabel(status) {
  if (status === 'FAILED') return '失败';
  if (status === 'PROCESSING') return '进行中';
  return '已完成';
}

function getRecordStatusClass(status) {
  if (status === 'FAILED') return 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300';
  if (status === 'PROCESSING') return 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300';
  return 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300';
}

function renderHireStats() {
  const completedCount = hireSummaryRecords.filter((item) => item.status !== 'FAILED').length;
  const failedCount = hireSummaryRecords.filter((item) => item.status === 'FAILED').length;
  const processingCount = isHireProcessing() ? 1 : 0;
  const totalCount = hireSummaryRecords.length + processingCount;

  if (hireStatTotal) hireStatTotal.textContent = String(totalCount);
  if (hireStatCompleted) hireStatCompleted.textContent = String(completedCount);
  if (hireStatProcessing) hireStatProcessing.textContent = String(processingCount);

  if (hireManageDemandsBtn) {
    const hasDemands = state.tasks.some((task) => {
      const myIds = [
        state.me?.id,
        state.me?.userId,
        state.me?.user_id,
        state.me?.secondUserId,
        state.meWorker?.id,
        state.meWorker?.secondUserId
      ].filter(Boolean);
      return myIds.includes(task.publisherId);
    });
    hireManageDemandsBtn.disabled = !canOperate();
    hireManageDemandsBtn.classList.toggle('opacity-60', !canOperate());
    hireManageDemandsBtn.title = canOperate()
      ? (hasDemands ? '查看我提交的所有需求' : '你暂时还没有在任务大厅提交需求')
      : '请先登录后管理你的需求';
  }
  // failedCount 保留作为后续 UI 扩展使用，避免重复计算
  void failedCount;
}

function renderHireSummary() {
  if (!hireSummaryList) return;

  if (!hireSummaryRecords.length) {
    hireSummaryList.innerHTML = `
      <div class="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4 text-center text-xs text-gray-400 dark:text-gray-500">
        暂无汇总内容。提交需求后会自动沉淀在这里。
      </div>
    `;
    return;
  }

  hireSummaryList.innerHTML = hireSummaryRecords.map((item) => {
    const activeClass = hireSelectedSummaryId === item.id ? 'border-primary/40 bg-primary/5' : 'border-gray-100 dark:border-gray-700 hover:border-primary/30';
    const status = item.status || 'COMPLETED';
    return `
      <button type="button" class="hire-summary-item w-full text-left rounded-xl border ${activeClass} p-3 transition-colors" data-summary-id="${item.id}">
        <div class="flex items-center justify-between gap-2">
          <div class="font-semibold text-sm text-gray-900 dark:text-white truncate">${escapeHtml(item.skillName || '未命名技能')}</div>
          <span class="text-[11px] text-gray-400 whitespace-nowrap">${formatTimeLabel(item.completedAt || item.createdAt)}</span>
        </div>
        <div class="mt-1.5 flex items-center justify-between gap-2">
          <p class="text-xs text-subtext-light dark:text-subtext-dark line-clamp-2">${escapeHtml(item.requirement || '')}</p>
          <span class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${getRecordStatusClass(status)}">${getRecordStatusLabel(status)}</span>
        </div>
        <div class="mt-1 text-[10px] text-primary">查看交付内容</div>
      </button>
    `;
  }).join('');
}

function renderHireWorkbench() {
  updateHireEntryVisibility();
  updateHireFabDot();
  renderHireStats();

  const selectedSummary = getSummaryById(hireSelectedSummaryId);
  const hasCurrentJob = currentHireJob.status !== 'IDLE' && !!currentHireJob.id;
  const shouldForceCurrentJob = isHireProcessing() || currentHireJob.status === 'FAILED';
  const activeData = shouldForceCurrentJob
    ? currentHireJob
    : selectedSummary || (hasCurrentJob ? currentHireJob : hireSummaryRecords[0] || currentHireJob);
  const usingSummaryData = activeData !== currentHireJob;

  if (!activeData) return;

  if (hirePanelStatus) {
    hirePanelStatus.textContent = usingSummaryData
      ? `已完成 · ${formatTimeLabel(activeData.completedAt || activeData.createdAt)}`
      : getLatestTimelineText();
  }

  if (hirePanelSkill) {
    if (activeData.skillName) {
      hirePanelSkill.textContent = `${activeData.skillIcon || '🔧'} ${activeData.skillName}`;
    } else {
      hirePanelSkill.textContent = '暂无进行中的需求';
    }
  }

  if (hirePanelRequirement) {
    hirePanelRequirement.textContent = activeData.requirement || '';
  }

  if (hireStatusTimeline) {
    const timeline = Array.isArray(activeData.timeline) ? activeData.timeline : [];
    if (!timeline.length) {
      hireStatusTimeline.innerHTML = '<div class="text-xs text-gray-400">等待提交需求</div>';
    } else {
      hireStatusTimeline.innerHTML = timeline.map((item) => `
        <div class="flex items-start gap-2">
          <span class="w-2 h-2 rounded-full mt-1 ${buildTimelineDotClass(item.type)}"></span>
          <div class="min-w-0">
            <div class="text-xs text-gray-700 dark:text-gray-200">${escapeHtml(item.text)}</div>
            <div class="text-[10px] text-gray-400 mt-0.5">${formatTimeLabel(item.at)}</div>
          </div>
        </div>
      `).join('');
    }
  }

  const result = activeData.result || null;
  if (!result) {
    hirePanelResultBlock?.classList.add('hidden');
    return;
  }

  hirePanelResultBlock?.classList.remove('hidden');

  const images = Array.isArray(result.images) ? result.images : [];
  if (images.length > 0 && hirePanelResultImages) {
    hirePanelResultImages.classList.remove('hidden');
    hirePanelResultImages.innerHTML = images.map((src) => `
      <div class="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <img src="${escapeHtml(src)}" class="w-full h-auto" alt="交付图片" loading="lazy" />
      </div>
    `).join('');
  } else {
    hirePanelResultImages?.classList.add('hidden');
    if (hirePanelResultImages) hirePanelResultImages.innerHTML = '';
  }

  if (hirePanelResultText) {
    hirePanelResultText.textContent = result.content || '交付完成，但内容为空。';
  }
}

function appendHireSummary(record) {
  hireSummaryRecords = [record, ...hireSummaryRecords.filter((item) => item.id !== record.id)].slice(0, HIRE_SUMMARY_LIMIT);
  hireSelectedSummaryId = record.id;
  persistHireSummaryRecords();
  renderHireSummary();
  renderHireStats();
}

function resetHireResultView() {
  hireLoadingView?.classList.add('hidden');
  hireResultView?.classList.add('hidden');
  hireFormView?.classList.remove('hidden');
  if (hireResultImages) hireResultImages.innerHTML = '';
  if (hireResultText) hireResultText.textContent = '';
  if (hireResultSkillName) hireResultSkillName.textContent = '';
}

function normalizeImageSrc(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  const lower = url.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === '[object object]') return '';

  if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url) || /^blob:/i.test(url)) {
    return url;
  }
  if (url.startsWith('/')) {
    return url;
  }
  if (url.startsWith('./')) {
    return `/${url.slice(2)}`;
  }
  if (url.startsWith('uploads/')) {
    return `/${url}`;
  }
  return '';
}

function renderHireStyleOptions(skill) {
  if (!hireStyleSection || !hireStyleList) return;

  const styles = Array.isArray(skill?.styles) ? skill.styles.filter((style) => style?.id && style?.name) : [];

  if (!styles.length) {
    hireStyleSection.classList.add('hidden');
    hireStyleList.innerHTML = '';
    currentHireStyleId = null;
    return;
  }

  hireStyleSection.classList.remove('hidden');
  hireStyleList.innerHTML = styles.map((style) => {
    const selectedClass = currentHireStyleId === style.id
      ? 'border-primary bg-primary/5'
      : 'border-gray-200 dark:border-gray-600 hover:border-primary/50';
    const styleImage = normalizeImageSrc(style.image || style.coverImage || '');

    return `
      <button
        type="button"
        class="hire-style-option p-2 rounded-xl border text-left transition-colors ${selectedClass}"
        data-style-id="${escapeHtml(style.id)}"
        title="${escapeHtml(style.name)}"
      >
        <div class="w-full aspect-square rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden mb-1.5">
          ${styleImage
            ? `<img src="${escapeHtml(styleImage)}" alt="${escapeHtml(style.name)}" class="w-full h-full object-cover hire-style-image" loading="lazy" />`
            : '<span class="text-xl">🎨</span>'}
        </div>
        <div class="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">${escapeHtml(style.name)}</div>
      </button>
    `;
  }).join('');

  // 图片 URL 不可访问时回退到图标，避免显示破图占位符
  hireStyleList.querySelectorAll('.hire-style-image').forEach((imgEl) => {
    imgEl.addEventListener('error', () => {
      const wrapper = imgEl.parentElement;
      if (!wrapper) return;
      wrapper.innerHTML = '<span class="text-xl">🎨</span>';
    }, { once: true });
  });

  hireStyleList.querySelectorAll('.hire-style-option').forEach((button) => {
    button.addEventListener('click', () => {
      const styleId = button.dataset.styleId || '';
      currentHireStyleId = currentHireStyleId === styleId ? null : styleId;
      renderHireStyleOptions(skill);
    });
  });
}

// 打开雇佣弹窗
function openHireModal(skillId) {
  const skill = state.skills.find(s => s.id === skillId);
  if (!skill) {
    showToast('技能不存在');
    return;
  }
  currentHireSkill = skill;
  currentHireStyleId = null;

  // 填充技能信息
  if (hireSkillIcon) hireSkillIcon.textContent = skill.icon || '🔧';
  if (hireSkillName) hireSkillName.textContent = skill.name || '未命名技能';
  if (hireSkillDesc) hireSkillDesc.textContent = skill.description || '这个 AI 分身很懒，还没写简介…';
  if (hireRequirement) hireRequirement.value = '';
  renderHireStyleOptions(skill);

  // 显示表单视图，隐藏其他视图
  hireFormView?.classList.remove('hidden');
  hireLoadingView?.classList.add('hidden');
  hireResultView?.classList.add('hidden');

  hireModal?.classList.remove('hidden');
}

// 关闭雇佣弹窗
function closeHireModal() {
  hireModal?.classList.add('hidden');
  currentHireSkill = null;
  currentHireStyleId = null;
  resetHireResultView();
}

// 提交雇佣
async function submitHire() {
  if (!currentHireSkill) return;
  if (isHireProcessing()) {
    openHireWorkbench();
    showToast('已有需求正在处理中，可在右上角查看状态');
    return;
  }

  const requirement = hireRequirement?.value?.trim();
  if (!requirement) {
    showToast('请描述你的需求');
    return;
  }
  const skillId = currentHireSkill.id;
  const skillName = currentHireSkill.name || '未命名技能';
  const skillIcon = currentHireSkill.icon || '🔧';
  const selectedStyleId = currentHireStyleId || '';

  const now = new Date().toISOString();
  clearHireStatusTimers();
  hireSelectedSummaryId = null;
  Object.assign(currentHireJob, {
    id: `hire_${Date.now()}`,
    status: 'ACCEPTED',
    skillId,
    skillName,
    skillIcon,
    requirement,
    selectedStyleId,
    timeline: [],
    result: null,
    createdAt: now
  });

  setHireStatus('ACCEPTED', 'AI 已接单', 'info');
  openHireWorkbench();
  closeHireModal();
  showToast('需求已提交，可在右上角查看处理进度');

  hireStatusTimers.push(setTimeout(() => {
    if (isHireProcessing()) {
      setHireStatus('ANALYZING', '分析需求中', 'running');
    }
  }, 900));

  hireStatusTimers.push(setTimeout(() => {
    if (isHireProcessing()) {
      setHireStatus('THINKING', '思考方案中', 'running');
    }
  }, 2200));

  hireStatusTimers.push(setTimeout(() => {
    if (isHireProcessing()) {
      setHireStatus('CALLING_SKILL', `调用 skill：${currentHireJob.skillName}`, 'running');
    }
  }, 3200));

  hireStatusTimers.push(setTimeout(() => {
    if (isHireProcessing()) {
      setHireStatus('DELIVERING', '交付生成中', 'running');
    }
  }, 4600));

  try {
    const result = await api('/api/skills/hire', {
      method: 'POST',
      body: {
        skillId,
        requirement,
        selectedStyleId
      }
    });
    clearHireStatusTimers();

    const normalizedResult = {
      content: result?.data?.content || '交付完成，但内容为空。',
      images: result?.data?.images || []
    };

    currentHireJob.result = normalizedResult;
    setHireStatus('COMPLETED', '已完成', 'success');
    renderHireWorkbench();

    appendHireSummary({
      id: currentHireJob.id,
      skillId: currentHireJob.skillId,
      skillName: currentHireJob.skillName,
      skillIcon: currentHireJob.skillIcon,
      status: 'COMPLETED',
      requirement: currentHireJob.requirement,
      timeline: currentHireJob.timeline.slice(),
      result: normalizedResult,
      createdAt: currentHireJob.createdAt,
      completedAt: new Date().toISOString()
    });
    showToast('交付完成，结果已加入汇总');
  } catch (err) {
    clearHireStatusTimers();
    const message = err.message || '雇佣失败，请重试';
    currentHireJob.result = { content: message, images: [] };
    setHireStatus('FAILED', `执行失败：${message}`, 'error');
    appendHireSummary({
      id: currentHireJob.id,
      skillId: currentHireJob.skillId,
      skillName: currentHireJob.skillName,
      skillIcon: currentHireJob.skillIcon,
      status: 'FAILED',
      requirement: currentHireJob.requirement,
      timeline: currentHireJob.timeline.slice(),
      result: { content: message, images: [] },
      createdAt: currentHireJob.createdAt,
      completedAt: new Date().toISOString()
    });
    showToast(message);
  }
}

// 雇佣弹窗事件绑定
document.getElementById('close-hire-modal')?.addEventListener('click', closeHireModal);
document.getElementById('cancel-hire-btn')?.addEventListener('click', closeHireModal);
document.getElementById('submit-hire-btn')?.addEventListener('click', submitHire);
document.getElementById('hire-close-result-btn')?.addEventListener('click', closeHireModal);
document.getElementById('hire-retry-btn')?.addEventListener('click', () => {
  resetHireResultView();
  openHireWorkbench();
});

// 点击弹窗外部关闭
hireModal?.addEventListener('click', (e) => {
  if (e.target === hireModal) closeHireModal();
});

hireFabBtn?.addEventListener('click', () => {
  const isHidden = hireFloatingPanel?.classList.contains('hidden');
  if (isHidden) {
    openHireWorkbench();
  } else {
    closeHireWorkbench();
  }
  renderHireWorkbench();
});

hireSummaryList?.addEventListener('click', (e) => {
  const button = e.target.closest('.hire-summary-item');
  if (!button) return;
  const summaryId = button.dataset.summaryId || '';
  if (!summaryId) return;
  hireSelectedSummaryId = summaryId;
  openHireWorkbench();
  renderHireSummary();
  renderHireWorkbench();
});

hireSummaryClearBtn?.addEventListener('click', () => {
  hireSummaryRecords = [];
  hireSelectedSummaryId = null;
  persistHireSummaryRecords();
  renderHireSummary();
  renderHireWorkbench();
  showToast('汇总已清空');
});

hireManageDemandsBtn?.addEventListener('click', () => {
  if (!canOperate()) {
    showToast('请先登录');
    return;
  }
  switchMainTab('task-hall');
  setFilter('MY_PUBLISHED');
  closeHireWorkbench();
  showToast('已切换到“我的派发”，可管理你提交的全部需求');
});

renderHireSummary();
renderHireWorkbench();

// 技能大厅卡片点击事件委托（雇佣按钮）
const skillCategoriesContainer = document.querySelector('#skill-categories');
if (skillCategoriesContainer) {
  skillCategoriesContainer.addEventListener('click', (e) => {
    const hireBtn = e.target.closest('.skill-hire-btn');
    if (hireBtn) {
      e.stopPropagation();
      if (!canOperate()) {
        showToast('请先登录');
        return;
      }
      const skillId = hireBtn.dataset.skillId;
      if (skillId) openHireModal(skillId);
    }
  });
}

bootstrap();
