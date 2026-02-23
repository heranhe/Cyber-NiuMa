// ===== AppBridge 安全距离适配 =====
// The Second Me 容器会注入 window.appBridge.SAFE_AREA_TOP/BOTTOM（单位: vw）
// 优先级： appBridge > env(safe-area-inset) > 0
(function applySafeArea() {
  const root = document.documentElement;
  function apply() {
    if (window.appBridge) {
      const top = window.appBridge.SAFE_AREA_TOP;
      const bottom = window.appBridge.SAFE_AREA_BOTTOM;
      if (typeof top === 'number') {
        root.style.setProperty('--safe-area-inset-top', `${top}vw`);
      }
      if (typeof bottom === 'number') {
        root.style.setProperty('--safe-area-inset-bottom', `${bottom}vw`);
      }
    }
  }
  // 立即尝试（部分容器同步注入）
  apply();
  // 延迟再试（部分容器异步注入）
  window.addEventListener('load', apply);
  // 监听自定义事件（如果 App 容器分发此事件）
  window.addEventListener('appBridgeReady', apply);
})();

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
  realtime: null,
  secondMeConnected: false,
  isAdmin: false,
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

// 接单弹窗元素（已移除弹窗，保留变量声明避免 ReferenceError）
const takeTaskModal = document.querySelector('#take-task-modal');
const closeTakeModal = document.querySelector('#close-take-modal');
const cancelTakeBtn = document.querySelector('#cancel-take-btn');
const takeTaskForm = document.querySelector('#take-task-form');
const takeTaskIdInput = document.querySelector('#take-task-id');
const takeTaskTitle = document.querySelector('#take-task-title');
const takeTaskNote = document.querySelector('#take-task-note');
const capabilityList = document.querySelector('#capability-list');

// 雇佣弹窗元素（已移除弹窗，保留变量声明避免 ReferenceError）
const hireModal = document.querySelector('#hire-modal');


// 对话模块元素
const chatModule = document.querySelector('#chat-module');
const chatToggleBtn = document.querySelector('#chat-toggle-btn');
const chatContent = document.querySelector('#chat-content');
const chatChevron = document.querySelector('#chat-chevron');
const chatStatusText = document.querySelector('#chat-status-text');
const chatUnreadDot = document.querySelector('#chat-unread-dot');
const chatListView = document.querySelector('#chat-list-view');
const chatListEl = document.querySelector('#chat-list');
const chatListEmpty = document.querySelector('#chat-list-empty');
const chatDialogView = document.querySelector('#chat-dialog-view');
const chatBackBtn = document.querySelector('#chat-back-btn');
const chatPeerAvatar = document.querySelector('#chat-peer-avatar');
const chatPeerName = document.querySelector('#chat-peer-name');
const chatRoleBadge = document.querySelector('#chat-role-badge');
const chatPeerTitle = document.querySelector('#chat-peer-title');
const chatMessagesEl = document.querySelector('#chat-messages');
const chatInput = document.querySelector('#chat-input');
const chatSendBtn = document.querySelector('#chat-send-btn');
const chatSkillSelector = document.querySelector('#chat-skill-selector');
const chatSkillLabel = document.querySelector('#chat-skill-label');
const chatSkillChevron = document.querySelector('#chat-skill-chevron');
const chatSkillDropdown = document.querySelector('#chat-skill-dropdown');
const chatSelectedSkillCapsule = document.querySelector('#chat-selected-skill-capsule');
const chatAutoSend = document.querySelector('#chat-auto-send');
const chatDeliveryHint = document.querySelector('#chat-delivery-hint');
const chatSubmitDemandBtn = document.querySelector('#chat-submit-demand-btn');

// 详情面板元素
const detailPanel = document.querySelector('#detail-panel');
const detailBackBtn = document.querySelector('#detail-back-btn');
const detailBody = document.querySelector('#detail-body');
const detailActions = document.querySelector('#detail-actions');
const detailStatusBadge = document.querySelector('#detail-status-badge');
const detailModal = document.querySelector('#detail-modal');
const detailModalOverlay = document.querySelector('#detail-modal-overlay');
const detailModalCloseBtn = document.querySelector('#detail-modal-close');
const detailModalBadge = document.querySelector('#detail-modal-badge');
const detailModalTitle = document.querySelector('#detail-modal-title');
const detailModalMeta = document.querySelector('#detail-modal-meta');
const detailModalImageWrap = document.querySelector('#detail-modal-image-wrap');
const detailModalImage = document.querySelector('#detail-modal-image');
const detailModalDesc = document.querySelector('#detail-modal-desc');
const detailModalPublisher = document.querySelector('#detail-modal-publisher');
const detailModalChat = document.querySelector('#detail-modal-chat');
const detailModalActions = document.querySelector('#detail-modal-actions');

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

function isAdminMode() {
  return !!state.secondMeConnected && !!state.isAdmin;
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
// 从 sessionStorage 读取 Access Token（OAuth 登录成功后由回调页注入）
// 用于在 WKWebView 环境中 Cookie 无法传递时，改用 Authorization header 认证
function getStoredToken() {
  try { return sessionStorage.getItem('niuma_access_token') || ''; } catch { return ''; }
}

async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  // WKWebView 中 Cookie 可能无法传递，将 Token 同时附加到 Authorization header
  const token = getStoredToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const body = options.body ? JSON.stringify(options.body) : undefined;

  try {
    const response = await fetch(path, { method, headers, body, credentials: 'include' });
    const data = await response.json();
    if (!response.ok) {
      const details = data?.details || {};
      const nested = details?.imageGenerationError?.body
        || details?.responsesGenerationError?.body
        || details?.response
        || '';
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

function renderCardUserMeta(name, avatar, trailingHtml = '') {
  const rawName = String(name || '').trim();
  const rawAvatar = String(avatar || '').trim();
  const extraMeta = String(trailingHtml || '').trim();
  if (!rawName && !rawAvatar && !extraMeta) {
    return '';
  }

  const safeName = escapeHtml(rawName);
  const generatedAvatar = rawName
    ? `https://ui-avatars.com/api/?name=${encodeURIComponent(rawName)}&background=random&rounded=true&size=64`
    : '';
  const avatarUrl = escapeHtml(rawAvatar || generatedAvatar);
  const fallbackInitial = escapeHtml((rawName || 'U').charAt(0).toUpperCase());

  const avatarNode = avatarUrl
    ? `<img src="${avatarUrl}" alt="${safeName}" class="w-full h-full object-cover" loading="lazy" referrerpolicy="no-referrer" />`
    : `<span class="text-[11px] font-bold text-gray-600 dark:text-gray-200">${fallbackInitial}</span>`;

  return `
    <div class="flex items-center gap-2.5 mt-3">
      <div class="w-7 h-7 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center flex-shrink-0">
        ${avatarNode}
      </div>
      <div class="min-w-0 flex items-center gap-1.5 flex-1">
        <span class="text-sm text-gray-700 dark:text-gray-300 font-medium truncate">${safeName}</span>
        ${extraMeta}
      </div>
    </div>
  `;
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

// 封面图长宽比列表（随机分配，营造瀑布流错落感；竖屏最高 4:3，避免过长）
const ASPECT_RATIOS = ['aspect-[4/3]', 'aspect-[3/4]', 'aspect-[16/9]', 'aspect-[1/1]', 'aspect-[4/3]'];

function renderTaskCard(task, index) {
  const coverImg = String(task.coverImage || '').trim();
  const hasCover = Boolean(coverImg);
  const publisherName = task.publisherName || task.requesterAi || '';
  const publisherAvatar = task.publisherAvatar ? task.publisherAvatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(publisherName || 'U')}&background=random&size=64`;
  const rewardPoints = Number.isFinite(Number(task?.budget))
    ? Math.max(0, Number(task.budget))
    : (Number.isFinite(Number(task?.price)) ? Math.max(0, Number(task.price)) : 0);
  const adminControls = isAdminMode() ? `
    <div class="absolute top-3 right-3 z-10 flex items-center gap-1.5" data-admin-toolbar="task">
      <button type="button" class="task-action w-7 h-7 rounded-full bg-white/90 text-gray-700 shadow-sm hover:bg-white" data-action="admin-up" data-task-id="${task.id}" title="上移">
        <span class="material-icons-round text-[16px]">keyboard_arrow_up</span>
      </button>
      <button type="button" class="task-action w-7 h-7 rounded-full bg-white/90 text-gray-700 shadow-sm hover:bg-white" data-action="admin-down" data-task-id="${task.id}" title="下移">
        <span class="material-icons-round text-[16px]">keyboard_arrow_down</span>
      </button>
      <button type="button" class="task-action w-7 h-7 rounded-full bg-white/90 text-red-600 shadow-sm hover:bg-white" data-action="admin-delete" data-task-id="${task.id}" title="删除">
        <span class="material-icons-round text-[15px]">delete</span>
      </button>
    </div>
  ` : '';

  return `
    <div class="masonry-item mb-4 group cursor-pointer task-card" data-task-id="${task.id}">
      <div class="bg-white dark:bg-surface-dark rounded-[24px] shadow-sm border border-border-light dark:border-border-dark overflow-hidden flex flex-col relative transition-all duration-300 hover:shadow-lg">
        ${adminControls}
        ${hasCover ? `
          <!-- 左上角徽章 (Lv.9专家等模拟数据) -->
          <div class="absolute top-3 left-3 z-10 flex gap-1.5">
            <span class="px-2.5 py-1 rounded-[8px] bg-black/60 backdrop-blur-md text-white text-[10px] font-bold">Lv. ${8 + (index % 2)}</span>
            <span class="px-2.5 py-1 text-primary text-[10px] font-bold shadow-sm rounded-[8px] ${index % 2 === 0 ? 'bg-white/80 backdrop-blur-md' : 'hidden'}">官方认证</span>
          </div>

          <!-- 封面图 -->
          <div class="aspect-[4/3] w-full relative overflow-hidden bg-gray-100 dark:bg-gray-800" data-detail-trigger="task-cover">
            <img src="${coverImg}" class="w-full h-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-105" alt="Cover" loading="lazy">
          </div>
        ` : ''}
        
        <div class="p-3.5 flex flex-col flex-1 divide-y divide-gray-100 dark:divide-border-dark/50">
          <!-- 上半部：内容与用户信息 -->
          <div class="pb-3 px-0.5">
            <h3 class="text-[15px] font-black leading-[1.3] text-gray-900 dark:text-white line-clamp-2 mb-2" data-detail-trigger="task-title">
              ${escapeHtml(task.title)}
            </h3>
            
            <div class="flex items-center gap-2 mt-2">
              <img src="${publisherAvatar}" class="w-[18px] h-[18px] rounded-full object-cover border border-gray-100 dark:border-border-dark">
              <span class="text-[12px] text-subtext-light dark:text-subtext-dark font-medium line-clamp-1">${escapeHtml(publisherName || 'Anonymous')}</span>
            </div>
          </div>

          <!-- 下半部：价格与操作 -->
          <div class="pt-2.5 px-0.5 flex justify-between items-end mt-auto">
             <div>
                <div class="text-[10px] text-gray-500 dark:text-gray-400 font-bold mb-0.5 tracking-wide">报酬</div>
                <div class="text-[16px] font-black text-gray-900 dark:text-white tracking-tight">
                  <span class="text-[14px] font-black text-primary">${rewardPoints}</span><span class="text-[12px] font-bold ml-[1px] text-primary">积分</span>
                </div>
             </div>
             
             <!-- 发布方/接单方 的按钮区分 -->
             <button class="task-action w-8 h-8 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-primary hover:text-white transition-colors" data-action="view" data-task-id="${task.id}">
                <span class="material-icons-round text-[18px]">${state.filter === 'MY_PUBLISHED' ? 'arrow_forward' : 'add'}</span>
             </button>
          </div>
        </div>
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
  renderMobileMePage(); // Render the new mobile Me tab
}

function renderMobileMePage() {
  const mAvatar = document.querySelector('#m-me-avatar');
  const mName = document.querySelector('#m-me-name');
  const capList = document.querySelector('#m-active-capabilities-list');
  const emptyHint = document.querySelector('#m-capabilities-empty');
  const statSkills = document.querySelector('#m-stat-skills');
  const statProjects = document.querySelector('#m-stat-projects');

  if (!state.me) {
    // Not logged in fallback
    if (mName) mName.textContent = '游客访客';
    if (emptyHint) emptyHint.classList.remove('hidden');
    if (capList) capList.innerHTML = '';
    return;
  }

  // Populate Header
  if (mAvatar) mAvatar.src = state.me.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(state.me.name || 'User')}&background=random`;
  if (mName) mName.textContent = state.me.name || '小布 AI';

  // Populate Stats (using existing completed orders as projects, abilities length as skills)
  if (statSkills) statSkills.textContent = state.abilities.length;
  if (statProjects) statProjects.textContent = state.meWorker?.completedOrders || 0;

  // Render Capabilities with toggle switches
  if (capList) {
    if (state.abilities.length === 0) {
      emptyHint?.classList.remove('hidden');
      capList.innerHTML = '';
    } else {
      emptyHint?.classList.add('hidden');
      capList.innerHTML = state.abilities.map((ability, idx) => {
        // Mock icons and sub-data if absent to match the rich design
        const bgColors = ['bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600', 'bg-green-50 dark:bg-green-900/20 text-green-600', 'bg-pink-50 dark:bg-pink-900/20 text-pink-500'];
        const iconBg = bgColors[idx % bgColors.length];
        const isLegacy = idx % 3 === 2; // Arbitrary condition to show mock 'legacy' styling for variance

        return `
        <div class="flex items-center p-3 bg-white dark:bg-surface-dark rounded-2xl shadow-sm border border-border-light dark:border-border-dark ${isLegacy ? 'opacity-60' : ''}">
          <div class="w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0">
            <span class="text-xl">${ability.icon || '🤖'}</span>
          </div>
          <div class="ml-3 flex-1 min-w-0">
            <div class="text-sm font-bold text-gray-900 dark:text-white truncate">${escapeHtml(ability.name)}</div>
            <div class="text-[11px] text-subtext-light dark:text-subtext-dark mt-0.5 truncate">
              ${isLegacy ? 'Deprecated model' : `v3.12 • ${(90 + (idx * 2))}% Success`}
            </div>
          </div>
          <div class="flex items-center gap-3 pl-2">
            <button
              type="button"
              class="text-gray-400 hover:text-primary transition-colors cursor-pointer inline-flex items-center"
              data-action="edit-mobile-ability"
              data-ability-id="${escapeHtml(ability.id)}"
              aria-label="编辑技能"
            >
              <span class="material-icons-round text-sm">edit</span>
            </button>
            <label class="ios-toggle">
              <input type="checkbox" onchange="toggleAbilityStatus('${ability.id}', this.checked)" ${!isLegacy ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      `}).join('');
    }
  }
}

// Dummy handler for the toggles in mobile UI
window.toggleAbilityStatus = function (abilityId, isEnabled) {
  showToast(isEnabled ? '核心能力已挂载' : '处理节点已休眠');
};

function setIntegrationView(sessionInfo) {
  state.secondMeConnected = !!sessionInfo?.connected;
  state.isAdmin = !!sessionInfo?.isAdmin;
  state.me = sessionInfo?.user || null;

  // 桌面端登录/退出按钮
  loginButtons.forEach((btn) => {
    btn.hidden = state.secondMeConnected;
  });

  if (topLogout) {
    topLogout.hidden = !state.secondMeConnected;
  }

  // 移动端「我的」页面的登录/退出按钮
  const mLoginBtn = document.querySelector('#m-me-login-btn');
  const mLogoutBtn = document.querySelector('#m-me-logout-btn');
  if (mLoginBtn) mLoginBtn.classList.toggle('hidden', state.secondMeConnected);
  if (mLogoutBtn) mLogoutBtn.classList.toggle('hidden', !state.secondMeConnected);

  renderWorkerProfile();
  renderTasks();
  if (state.skillsLoaded) renderSkillCategories(state.skills);
  renderHireWorkbench();
  ensureChatRealtime();
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
    state.skillsLoaded = false;
    state.skillsLoadedAt = 0;
    if (state.mainTab === 'skill-hall') {
      loadSkillHall();
    }
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
    state.skillsLoaded = false;
    state.skillsLoadedAt = 0;
    if (state.mainTab === 'skill-hall') {
      loadSkillHall();
    }
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

// ===== 详情面板 =====
const leftMainArea = document.querySelector('.lg\\:col-span-9.space-y-6');
let detailModalCloseTimer = null;

function openDetailPanel(type, data) {
  if (!data) return;
  // 旧侧栏详情面板保留，当前统一走独立弹窗
  if (detailPanel && leftMainArea) {
    detailPanel.classList.add('hidden');
    leftMainArea.classList.remove('hidden');
  }
  if (!detailModal) return;
  if (detailModalCloseTimer) {
    clearTimeout(detailModalCloseTimer);
    detailModalCloseTimer = null;
  }
  detailModal.classList.remove('hidden');
  detailModal.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => detailModal.classList.add('is-open'));
  document.body.classList.add('overflow-hidden');
  if (type === 'task') renderTaskDetail(data);
  else if (type === 'skill') renderSkillDetail(data);
}

function closeDetailPanel() {
  closeDetailModal();
}

detailBackBtn?.addEventListener('click', closeDetailPanel);

function closeDetailModal() {
  if (!detailModal) return;
  detailModal.classList.remove('is-open');
  detailModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('overflow-hidden');
  detailModalCloseTimer = setTimeout(() => {
    detailModal.classList.add('hidden');
    detailModalCloseTimer = null;
  }, 180);
}

detailModalCloseBtn?.addEventListener('click', closeDetailModal);
detailModalOverlay?.addEventListener('click', closeDetailModal);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && detailModal && !detailModal.classList.contains('hidden')) {
    closeDetailModal();
  }
});

function formatDateTime(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString('zh-CN', { hour12: false });
}

function normalizePointsLabel(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/[积分]/.test(text)) return text;
  return `${text} 积分`;
}

function getWorkerProfileByAnyId(id) {
  const target = String(id || '').trim();
  if (!target) return null;
  return state.workers.find((w) => {
    const wid = String(w?.id || '').trim();
    const sid = String(w?.secondUserId || '').trim();
    return wid === target || sid === target;
  }) || null;
}

function buildDetailPublisherProfile(type, data) {
  const isTask = type === 'task';
  const userId = String(isTask ? (data.publisherId || '') : (data.ownerId || '')).trim();
  const worker = getWorkerProfileByAnyId(userId);
  return {
    label: isTask ? '发布者个人信息' : '技能提供者个人信息',
    name: worker?.name || worker?.displayName || (isTask ? (data.publisherName || data.requesterAi || '匿名发布者') : (data.ownerName || '匿名提供者')),
    avatar: worker?.avatar || worker?.profileImageUrl || (isTask ? data.publisherAvatar : data.ownerAvatar) || '',
    title: worker?.title || (isTask ? '任务发布者' : 'AI 技能提供者'),
    bio: worker?.persona || worker?.bio || '',
    userId: worker?.secondUserId || userId || '',
    workerId: worker?.id || '',
    specialties: Array.isArray(worker?.specialties) ? worker.specialties.filter(Boolean) : []
  };
}

function getDetailRelatedConversations(type, data) {
  const refId = String(data?.id || '').trim();
  if (!refId) return [];
  const role = type === 'task' ? 'worker' : 'demand';
  return chatState.conversations
    .filter((conv) => String(conv?.refId || '').trim() === refId && conv.role === role)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

function renderDetailChatMessage(msg) {
  if (!msg) return '';
  if (msg.type === 'loading') {
    return `<div class="detail-chat-msg detail-chat-msg-system"><div class="detail-chat-msg-label">系统</div><div class="detail-chat-msg-text">AI 处理中...</div></div>`;
  }
  if (msg.type === 'delivery') {
    const images = (Array.isArray(msg.images) ? msg.images : []).map(normalizeImageSrc).filter(Boolean);
    return `
      <div class="detail-chat-msg detail-chat-msg-delivery">
        <div class="detail-chat-msg-label">交付结果${msg.time ? ` · ${escapeHtml(formatDateTime(msg.time))}` : ''}${msg.skillName ? ` · ${escapeHtml(msg.skillName)}` : ''}</div>
        <div class="detail-chat-msg-text">${escapeHtml(msg.content || '')}</div>
        ${images.length ? `<div class="detail-chat-images">${images.map((src) => `<img src="${escapeHtml(src)}" alt="交付图片" loading="lazy" referrerpolicy="no-referrer" />`).join('')}</div>` : ''}
      </div>
    `;
  }
  const label = msg.type === 'self' ? '我' : (msg.type === 'peer' ? '对方' : '系统');
  const cls = msg.type === 'self'
    ? 'detail-chat-msg-self'
    : (msg.type === 'peer' ? 'detail-chat-msg-peer' : 'detail-chat-msg-system');
  return `
    <div class="detail-chat-msg ${cls}">
      <div class="detail-chat-msg-label">${label}${msg.time ? ` · ${escapeHtml(formatDateTime(msg.time))}` : ''}</div>
      <div class="detail-chat-msg-text">${escapeHtml(msg.text || '')}</div>
    </div>
  `;
}

function renderDetailPublisherSection(type, data) {
  if (!detailModalPublisher) return;
  const profile = buildDetailPublisherProfile(type, data);
  const avatar = profile.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent((profile.name || 'U').charAt(0))}&background=random&rounded=true&size=96`;
  detailModalPublisher.innerHTML = `
    <section class="detail-section-card">
      <h3 class="detail-section-title">${escapeHtml(profile.label)}</h3>
      <div class="detail-publisher-card">
        <img class="detail-publisher-avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(profile.name)}" loading="lazy" referrerpolicy="no-referrer" />
        <div class="min-w-0 flex-1">
          <div class="detail-publisher-name">${escapeHtml(profile.name)}</div>
          <div class="detail-publisher-title">${escapeHtml(profile.title || '')}</div>
          ${profile.userId ? `<div class="detail-publisher-id">用户ID：${escapeHtml(profile.userId)}</div>` : ''}
          ${profile.workerId && profile.workerId !== profile.userId ? `<div class="detail-publisher-id">劳务体ID：${escapeHtml(profile.workerId)}</div>` : ''}
          ${profile.bio ? `<p class="detail-publisher-bio">${escapeHtml(profile.bio)}</p>` : ''}
          ${profile.specialties.length ? `<div class="detail-publisher-tags">${profile.specialties.slice(0, 8).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    </section>
  `;
}

function renderDetailChatSection(type, data) {
  if (!detailModalChat) return;
  const convs = getDetailRelatedConversations(type, data);
  if (!convs.length) {
    detailModalChat.innerHTML = `
      <section class="detail-section-card">
        <h3 class="detail-section-title">聊天记录</h3>
        <div class="detail-empty-state">当前还没有与该${type === 'task' ? '任务' : '技能'}相关的聊天记录。</div>
      </section>
    `;
    return;
  }

  detailModalChat.innerHTML = `
    <section class="detail-section-card">
      <h3 class="detail-section-title">聊天记录</h3>
      <div class="space-y-4">
        ${convs.map((conv) => {
          const avatar = conv.peerAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent((conv.peerName || 'A').charAt(0))}&background=random&rounded=true&size=64`;
          const messages = Array.isArray(conv.messages) ? conv.messages : [];
          return `
            <div class="detail-chat-thread">
              <div class="detail-chat-thread-head">
                <img class="detail-chat-thread-avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(conv.peerName || '对方')}" loading="lazy" referrerpolicy="no-referrer" />
                <div class="min-w-0">
                  <div class="detail-chat-thread-title">${escapeHtml(conv.title || '对话')}</div>
                  <div class="detail-chat-thread-meta">${escapeHtml(conv.peerName || '对方')} · ${escapeHtml(formatDateTime(conv.updatedAt || conv.createdAt))}</div>
                </div>
              </div>
              <div class="detail-chat-thread-body">
                ${messages.length ? messages.map(renderDetailChatMessage).join('') : `<div class="detail-chat-msg detail-chat-msg-system"><div class="detail-chat-msg-text">暂无消息</div></div>`}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderDetailModalCommon(config) {
  if (!detailModal) return;
  const {
    type,
    data,
    badgeText,
    badgeClass,
    title,
    metaHtml,
    description,
    coverImage,
    extraHtml,
    actionsHtml
  } = config || {};

  if (detailModalBadge) {
    detailModalBadge.textContent = badgeText || '';
    detailModalBadge.className = `detail-modal-badge ${badgeClass || ''}`.trim();
  }
  if (detailModalTitle) detailModalTitle.textContent = title || '';
  if (detailModalMeta) detailModalMeta.innerHTML = metaHtml || '';

  const img = normalizeImageSrc(coverImage || '');
  if (detailModalImageWrap && detailModalImage) {
    if (img) {
      detailModalImageWrap.classList.remove('hidden');
      detailModalImage.src = img;
      detailModalImage.alt = title || '详情图片';
    } else {
      detailModalImageWrap.classList.add('hidden');
      detailModalImage.removeAttribute('src');
    }
  }

  if (detailModalDesc) {
    detailModalDesc.innerHTML = `
      <section class="detail-section-card">
        <h3 class="detail-section-title">${type === 'task' ? '完整需求内容' : '完整技能内容'}</h3>
        <div class="detail-fulltext">${escapeHtml(description || '')}</div>
        ${extraHtml || ''}
      </section>
    `;
  }

  renderDetailPublisherSection(type, data);
  renderDetailChatSection(type, data);
  if (detailModalActions) detailModalActions.innerHTML = actionsHtml || '';
}

function renderTaskDetail(task) {
  const statusLabel = statusText(task.status);
  const statusBg = task.status === 'DELIVERED' ? 'is-success' : task.status === 'IN_PROGRESS' ? 'is-info' : 'is-muted';
  if (detailStatusBadge) {
    detailStatusBadge.textContent = statusLabel;
  }
  let actionsHtml = '';
  if ((task.status === 'OPEN' || task.status === 'IN_PROGRESS') && canOperate()) {
    actionsHtml = `<button class="detail-action-btn px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-amber-700 transition-colors flex items-center gap-1.5" data-action="join-chat" data-task-id="${task.id}"><span class="material-icons-round text-sm">forum</span> 加入对话</button>`;
  }
  const deliveryImages = (Array.isArray(task?.delivery?.images) ? task.delivery.images : []).map(normalizeImageSrc).filter(Boolean);
  const deliveryHtml = task.delivery ? `
    <div class="detail-delivery-card">
      <div class="detail-delivery-head"><span class="material-icons-round text-base">verified</span> 交付结果</div>
      <div class="detail-delivery-text">${escapeHtml(task.delivery?.content || '')}</div>
      ${deliveryImages.length ? `<div class="detail-chat-images">${deliveryImages.map((src) => `<img src="${escapeHtml(src)}" alt="交付图片" loading="lazy" referrerpolicy="no-referrer" />`).join('')}</div>` : ''}
    </div>
  ` : '';
  renderDetailModalCommon({
    type: 'task',
    data: task,
    badgeText: statusLabel,
    badgeClass: statusBg,
    title: task.title || '未命名任务',
    metaHtml: `
      <span>${escapeHtml(task.publisherName || task.requesterAi || '匿名发布者')}</span>
      ${normalizePointsLabel(task.budget || task.price) ? `<span class="detail-modal-dot">•</span><span class="detail-price-chip">${escapeHtml(normalizePointsLabel(task.budget || task.price))}</span>` : ''}
      ${task.deadline ? `<span class="detail-modal-dot">•</span><span>截止：${escapeHtml(String(task.deadline))}</span>` : ''}
      ${task.createdAt ? `<span class="detail-modal-dot">•</span><span>${escapeHtml(formatDateTime(task.createdAt))}</span>` : ''}
    `,
    description: task.description || '',
    coverImage: task.coverImage || '',
    extraHtml: deliveryHtml,
    actionsHtml
  });
}

function renderSkillDetail(skill) {
  if (detailStatusBadge) {
    detailStatusBadge.textContent = '技能';
  }
  let actionsHtml = '';
  if (canOperate()) {
    actionsHtml = `<button class="detail-action-btn px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-amber-700 transition-colors flex items-center gap-1.5" data-action="join-chat" data-skill-id="${skill.id}"><span class="material-icons-round text-sm">forum</span> 加入对话</button>`;
  }
  const styles = Array.isArray(skill.styles) ? skill.styles : [];
  const styleHtml = styles
    .map((s) => ({ ...s, _img: normalizeImageSrc(s.image || s.coverImage || '') }))
    .filter((s) => s._img)
    .slice(0, 8);
  renderDetailModalCommon({
    type: 'skill',
    data: skill,
    badgeText: '技能',
    badgeClass: 'is-skill',
    title: `${skill.icon || '🔧'} ${skill.name || '未命名技能'}`,
    metaHtml: `
      <span>${escapeHtml(skill.ownerName || '匿名提供者')}</span>
      ${skill.createdAt ? `<span class="detail-modal-dot">•</span><span>${escapeHtml(formatDateTime(skill.createdAt))}</span>` : ''}
    `,
    description: skill.description || '这个 AI 分身很懒，还没写简介…',
    coverImage: skill.coverImage || '',
    extraHtml: styleHtml.length ? `
      <div class="detail-section-subtitle">风格样例</div>
      <div class="detail-style-grid">
        ${styleHtml.map((s) => `
          <figure class="detail-style-card">
            <img src="${escapeHtml(s._img)}" alt="${escapeHtml(s.name || '风格样例')}" loading="lazy" referrerpolicy="no-referrer" />
            <figcaption>${escapeHtml(s.name || '未命名风格')}</figcaption>
          </figure>
        `).join('')}
      </div>
    ` : '',
    actionsHtml
  });
}

// 详情面板操作按钮事件委托
detailActions?.addEventListener('click', (e) => {
  const btn = e.target.closest('.detail-action-btn');
  if (!btn) return;
  const action = btn.dataset.action;
  const taskId = btn.dataset.taskId;
  const skillId = btn.dataset.skillId;
  if (action === 'join-chat' && taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) openConversation('worker', task, { sourceEl: btn });
  } else if (action === 'join-chat' && skillId) {
    const skill = state.skills.find(s => s.id === skillId);
    if (skill) openConversation('demand', skill, { sourceEl: btn });
  }
});

detailModalActions?.addEventListener('click', (e) => {
  const btn = e.target.closest('.detail-action-btn');
  if (!btn) return;
  const action = btn.dataset.action;
  const taskId = btn.dataset.taskId;
  const skillId = btn.dataset.skillId;
  if (action === 'join-chat' && taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
      closeDetailModal();
      openConversation('worker', task, { sourceEl: btn });
    }
  } else if (action === 'join-chat' && skillId) {
    const skill = state.skills.find(s => s.id === skillId);
    if (skill) {
      closeDetailModal();
      openConversation('demand', skill, { sourceEl: btn });
    }
  }
});

// ===== 任务操作 =====
async function adminReorderTask(taskId, direction) {
  if (!isAdminMode()) {
    showToast('仅管理员可操作');
    return;
  }
  await api('/api/admin/tasks/reorder', {
    method: 'POST',
    body: { taskId, direction }
  });
  await loadTasks();
}

async function adminDeleteTask(taskId) {
  if (!isAdminMode()) {
    showToast('仅管理员可操作');
    return;
  }
  if (!confirm('确定删除这个任务卡片吗？')) return;
  await api(`/api/admin/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  await loadTasks();
}

async function onTaskActionClick(event) {
  const button = event.target.closest('.task-action');
  const taskCard = event.target.closest('[data-task-id].task-card, article[data-task-id]');

  // 如果点击的是操作按钮，处理按钮操作
  if (button) {
    event.stopPropagation();  // 阻止跳转到详情页

    const action = button.dataset.action;
    const taskId = button.dataset.taskId;

    if (action !== 'view' && !canOperate()) {
      showToast('请先登录');
      return;
    }

    try {
      if (action === 'admin-up') {
        await adminReorderTask(taskId, 'up');
      } else if (action === 'admin-down') {
        await adminReorderTask(taskId, 'down');
      } else if (action === 'admin-delete') {
        await adminDeleteTask(taskId);
      } else if (action === 'take' || action === 'join-chat') {
        // 打开对话（接单方角色）
        const task = state.tasks.find(t => t.id === taskId);
        if (task) openConversation('worker', task, { sourceEl: button });
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
      const task = state.tasks.find(t => t.id === taskId);
      if (task) openDetailPanel('task', task);
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
  openDetailPanel('task', task);
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
    const [metaRes, profileRes] = await Promise.all([
      api('/api/meta').catch(e => { console.error('meta error', e); return null; }),
      api('/api/secondme/profile').catch(e => { console.error('profile error', e); return null; })
    ]);

    const meta = metaRes?.data || {};
    state.laborTypes = meta.laborTypes || [];
    state.workers = meta.workers || [];
    state.totalUsers = meta.totalUsers || 0;
    state.realtime = meta.realtime || null;

    const profile = profileRes?.data || {};
    setIntegrationView({
      connected: !!profile.connected,
      user: profile?.profile?.data || null,
      isAdmin: !!profile?.isAdmin
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
let chatPollTimer = null;
async function bootstrap() {
  // 全部并行化，去除首屏的阻塞串行请求
  refreshEverything();
  loadSkillHall();
  // 登录后同步后端对话
  syncConversationsFromServer();
  // 轮询新消息（未启用 realtime 时兜底轮询）
  if (chatPollTimer) clearInterval(chatPollTimer);
  chatPollTimer = setInterval(async () => {
    if (!canOperate()) return;
    if (chatRealtimeReady) return;
    await syncConversationsFromServer();
    let activeConvChanged = false;
    for (const conv of chatState.conversations) {
      const result = await fetchServerMessages(conv);
      if (conv.id === chatState.activeConversationId && (result?.added || 0) > 0) {
        activeConvChanged = true;
      }
    }
    const activeConv = chatState.conversations.find(c => c.id === chatState.activeConversationId);
    if (activeConv && activeConvChanged) {
      markConversationRead(activeConv);
      renderChatMessages(activeConv);
    }
    renderChatList();
  }, CHAT_POLL_INTERVAL_MS);
}

// 事件绑定
loginButtons.forEach((btn) => btn.addEventListener('click', onLoginClick));
if (topLogout) topLogout.addEventListener('click', onLogoutClick);

// 移动端「我的」页面退出按钮
const mMeLogoutBtn = document.querySelector('#m-me-logout-btn');
if (mMeLogoutBtn) mMeLogoutBtn.addEventListener('click', onLogoutClick);

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

const mobileCapabilitiesList = document.querySelector('#m-active-capabilities-list');
if (mobileCapabilitiesList) {
  mobileCapabilitiesList.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-action="edit-mobile-ability"]');
    if (!editBtn) return;

    e.preventDefault();
    const id = editBtn.dataset.abilityId;
    const ability = state.abilities.find((a) => a.id === id);
    if (ability) openAbilityModal(ability);
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
    tab.classList.toggle('is-active', tab.dataset.tab === tabName);
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

// 渲染单个技能卡片（网格布局,固定4:3比例封面）
function renderSkillCard(skill, index) {
  const category = categorizeSkill(skill);
  const categoryInfo = SKILL_CATEGORIES.find(c => c.id === category) || SKILL_CATEGORIES[4];
  const categoryName = categoryInfo.name.replace(categoryInfo.icon, '').trim();
  const coverImg = String(skill.coverImage || '').trim();
  const hasCover = Boolean(coverImg);
  const ownerName = skill.ownerName || '';
  const pricePoints = Math.max(0, Number.parseInt(String(skill?.pricePoints ?? '0'), 10) || 0);
  const ownerMeta = renderCardUserMeta(
    ownerName,
    skill.ownerAvatar,
    `
      <span class="px-2 py-0.5 bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-[10px] rounded border border-gray-100 dark:border-gray-600 flex-shrink-0">${escapeHtml(categoryName)}</span>
      <span class="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] rounded border border-amber-100 flex-shrink-0">报价 ${pricePoints}积分</span>
    `
  );
  const adminControls = isAdminMode() ? `
    <div class="absolute top-2 right-2 z-20 flex items-center gap-1.5">
      <button type="button" class="skill-admin-action w-7 h-7 rounded-full bg-white/90 text-gray-700 shadow-sm hover:bg-white" data-action="admin-up" data-skill-id="${skill.id}" data-owner-id="${skill.ownerId}" title="上移">
        <span class="material-icons-round text-[16px]">keyboard_arrow_up</span>
      </button>
      <button type="button" class="skill-admin-action w-7 h-7 rounded-full bg-white/90 text-gray-700 shadow-sm hover:bg-white" data-action="admin-down" data-skill-id="${skill.id}" data-owner-id="${skill.ownerId}" title="下移">
        <span class="material-icons-round text-[16px]">keyboard_arrow_down</span>
      </button>
      <button type="button" class="skill-admin-action w-7 h-7 rounded-full bg-white/90 text-red-600 shadow-sm hover:bg-white" data-action="admin-delete" data-skill-id="${skill.id}" data-owner-id="${skill.ownerId}" title="删除">
        <span class="material-icons-round text-[15px]">delete</span>
      </button>
    </div>
  ` : '';

  return `
    <div class="bg-white dark:bg-surface-dark rounded-2xl border border-gray-100 dark:border-border-dark hover:border-primary/30 shadow-sm hover:shadow-xl hover:shadow-orange-500/10 transition-all flex flex-col overflow-hidden group cursor-pointer relative" data-skill-id="${skill.id}" data-owner-id="${skill.ownerId}">
      ${adminControls}
      ${hasCover ? `
        <div class="relative m-2 skill-card-cover" data-detail-trigger="skill-cover">
          <img alt="${escapeHtml(skill.name)}" class="transform group-hover:scale-110 transition-transform duration-700 ease-in-out" src="${coverImg}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80"></div>
          <span class="absolute top-2 left-2 px-2 py-1 rounded-lg text-[10px] font-bold bg-black/40 backdrop-blur-sm text-white border border-white/20">${skill.icon || '🔧'} ${categoryName}</span>
          <!-- 悬浮按钮 -->
          <div class="card-hover-gradient"></div>
          <div class="card-hover-buttons">
            <button class="skill-join-chat-btn flex-1 py-2 bg-primary text-white rounded-lg text-[11px] font-bold shadow-sm hover:bg-amber-700 transition-all flex items-center justify-center gap-1" data-action="join-chat" data-skill-id="${skill.id}">
              <span class="material-symbols-outlined text-[16px]">forum</span> 加入对话
            </button>
          </div>
        </div>
      ` : ''}
      <div class="px-4 pb-4 ${hasCover ? 'pt-1' : 'pt-4'} flex flex-col">
        <h3 class="font-bold text-gray-900 dark:text-white truncate group-hover:text-primary transition-colors text-base mb-2" data-detail-trigger="skill-title" title="${escapeHtml(skill.name)}">${escapeHtml(skill.name)}</h3>
        <p class="text-xs text-subtext-light dark:text-subtext-dark line-clamp-3 mb-3 leading-relaxed">${escapeHtml(skill.description || '这个 AI 分身很懒，还没写简介…')}</p>
        ${ownerMeta}
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
  if (hireSkillDesc) {
    const baseDesc = skill.description || '这个 AI 分身很懒，还没写简介…';
    const pricePoints = Math.max(0, Number.parseInt(String(skill?.pricePoints ?? '0'), 10) || 0);
    hireSkillDesc.textContent = `${baseDesc} · ${pricePoints} 积分/次`;
  }
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

    if (state.me) {
      loadMyWorker().catch((e) => console.error('refresh me after hire error:', e));
    }

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
    const paidPoints = Math.max(0, Number.parseInt(String(result?.data?.settlement?.amount ?? '0'), 10) || 0);
    const didCharge = !!result?.data?.settlement?.charged;
    showToast(didCharge ? `交付完成，已支付 ${paidPoints} 积分` : '交付完成，结果已加入汇总');
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

async function adminReorderSkill(ownerId, skillId, direction) {
  if (!isAdminMode()) {
    showToast('仅管理员可操作');
    return;
  }
  await api('/api/admin/skills/reorder', {
    method: 'POST',
    body: { ownerId, skillId, direction }
  });
  state.skillsLoaded = false;
  state.skillsLoadedAt = 0;
  await loadSkillHall();
}

async function adminDeleteSkill(ownerId, skillId) {
  if (!isAdminMode()) {
    showToast('仅管理员可操作');
    return;
  }
  if (!confirm('确定删除这个技能卡片吗？')) return;
  await api(`/api/admin/skills/${encodeURIComponent(ownerId)}/${encodeURIComponent(skillId)}`, {
    method: 'DELETE'
  });
  state.skillsLoaded = false;
  state.skillsLoadedAt = 0;
  await loadSkillHall();
}

// 技能大厅卡片点击事件委托（加入对话按钮）
const skillCategoriesContainer = document.querySelector('#skill-categories');
if (skillCategoriesContainer) {
  skillCategoriesContainer.addEventListener('click', (e) => {
    const adminBtn = e.target.closest('.skill-admin-action');
    if (adminBtn) {
      e.stopPropagation();
      const action = adminBtn.dataset.action;
      const skillId = adminBtn.dataset.skillId;
      const ownerId = adminBtn.dataset.ownerId;
      if (!skillId || !ownerId) return;
      (async () => {
        try {
          if (action === 'admin-up') {
            await adminReorderSkill(ownerId, skillId, 'up');
          } else if (action === 'admin-down') {
            await adminReorderSkill(ownerId, skillId, 'down');
          } else if (action === 'admin-delete') {
            await adminDeleteSkill(ownerId, skillId);
          }
        } catch (err) {
          showToast(err.message || '操作失败');
        }
      })();
      return;
    }

    const joinBtn = e.target.closest('.skill-join-chat-btn');
    if (joinBtn) {
      e.stopPropagation();
      if (!canOperate()) {
        showToast('请先登录');
        return;
      }
      const skillId = joinBtn.dataset.skillId;
      if (skillId) {
        const skill = state.skills.find(s => s.id === skillId);
        if (skill) openConversation('demand', skill, { sourceEl: joinBtn });
      }
      return;
    }

    const skillCard = e.target.closest('[data-skill-id]');
    if (skillCard) {
      const skillId = skillCard.dataset.skillId;
      const ownerId = skillCard.dataset.ownerId;
      const skill = state.skills.find(s => s.id === skillId && (!ownerId || s.ownerId === ownerId));
      if (skill) openDetailPanel('skill', skill);
    }
  });
}

// ===== 对话模块 =====
const CHAT_STORAGE_KEY = 'chat_conversations_v1';
const CHAT_CACHE_RESET_ONCE_KEY = 'chat_cache_reset_once_v1';
const chatState = {
  conversations: [],       // [{id, role, peerId, peerName, peerAvatar, title, desc, messages[], skillId?, createdAt, updatedAt}]
  activeConversationId: null,
  selectedSkill: null,     // {id, name, icon, description}
  skillDropdownOpen: false,
  collapsed: false
};

let chatRealtimeClient = null;
let chatRealtimeChannels = [];
let chatRealtimeUserId = '';
let chatRealtimeReady = false;
let chatRealtimeFlushTimer = null;
const chatRealtimePendingServerConvIds = new Set();
const CHAT_POLL_INTERVAL_MS = 3000;

// 持久化
function loadConversations() {
  try {
    // 一次性清理聊天本地缓存（用于修复历史版本遗留的重复消息/方向错误）
    if (!localStorage.getItem(CHAT_CACHE_RESET_ONCE_KEY)) {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      localStorage.setItem(CHAT_CACHE_RESET_ONCE_KEY, new Date().toISOString());
    }
    const data = localStorage.getItem(CHAT_STORAGE_KEY);
    if (data) chatState.conversations = JSON.parse(data);
  } catch { chatState.conversations = []; }
}

function persistConversations() {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatState.conversations));
  } catch (e) { console.warn('对话持久化失败', e); }
}

loadConversations();

function getMyChatUserId() {
  return String(state.me?.userId || state.me?.id || '').trim();
}

function canUseSupabaseRealtime() {
  const cfg = state.realtime || {};
  return Boolean(
    canOperate()
    && cfg.enabled
    && cfg.supabaseUrl
    && cfg.supabaseAnonKey
    && window.supabase?.createClient
  );
}

function teardownChatRealtime() {
  if (chatRealtimeFlushTimer) {
    clearTimeout(chatRealtimeFlushTimer);
    chatRealtimeFlushTimer = null;
  }
  chatRealtimePendingServerConvIds.clear();
  chatRealtimeReady = false;
  chatRealtimeUserId = '';
  if (chatRealtimeClient && chatRealtimeChannels.length) {
    for (const ch of chatRealtimeChannels) {
      try { chatRealtimeClient.removeChannel(ch); } catch (e) { console.warn('移除 realtime channel 失败', e); }
    }
  }
  chatRealtimeChannels = [];
  chatRealtimeClient = null;
}

async function flushChatRealtimeEvents() {
  chatRealtimeFlushTimer = null;
  if (!canOperate()) return;
  const targetIds = Array.from(chatRealtimePendingServerConvIds);
  chatRealtimePendingServerConvIds.clear();
  if (!targetIds.length) return;

  await syncConversationsFromServer();

  let activeConvChanged = false;
  for (const serverConvId of targetIds) {
    const conv = chatState.conversations.find((c) => c.serverConvId === serverConvId);
    if (!conv) continue;
    const result = await fetchServerMessages(conv);
    if (conv.id === chatState.activeConversationId && (result?.added || 0) > 0) {
      activeConvChanged = true;
    }
  }

  const activeConv = chatState.conversations.find((c) => c.id === chatState.activeConversationId);
  if (activeConv && activeConvChanged) {
    markConversationRead(activeConv);
    renderChatMessages(activeConv);
  }
  renderChatList();
}

function queueChatRealtimeConversationRefresh(serverConvId) {
  if (!serverConvId) return;
  chatRealtimePendingServerConvIds.add(String(serverConvId));
  if (chatRealtimeFlushTimer) return;
  chatRealtimeFlushTimer = setTimeout(() => {
    flushChatRealtimeEvents().catch((e) => {
      console.warn('处理 realtime 消息事件失败', e);
    });
  }, 250);
}

function ensureChatRealtime() {
  if (!canUseSupabaseRealtime()) {
    if (chatRealtimeClient || chatRealtimeChannels.length) teardownChatRealtime();
    return;
  }

  const myId = getMyChatUserId();
  if (!myId) return;
  if (chatRealtimeReady && chatRealtimeUserId === myId && chatRealtimeChannels.length) return;

  teardownChatRealtime();

  const cfg = state.realtime || {};
  try {
    chatRealtimeClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  } catch (e) {
    console.warn('初始化 Supabase Realtime 失败', e);
    teardownChatRealtime();
    return;
  }

  const onConversationEvent = (payload) => {
    const row = payload?.new || payload?.old || null;
    const serverConvId = row?.id;
    if (!serverConvId) return;
    queueChatRealtimeConversationRefresh(serverConvId);
  };

  const filters = [
    `initiator_id=eq.${myId}`,
    `receiver_id=eq.${myId}`
  ];

  chatRealtimeChannels = filters.map((filter, index) => chatRealtimeClient
    .channel(`chat-conversations-${myId}-${index}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'conversations',
      filter
    }, onConversationEvent)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        chatRealtimeReady = true;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        chatRealtimeReady = false;
      }
    }));

  chatRealtimeUserId = myId;
}

// 从后端拉取对话列表并合并到本地
async function syncConversationsFromServer() {
  if (!canOperate()) return;
  try {
    const res = await api('/api/conversations');
    const serverConvs = res.data || [];
    for (const sc of serverConvs) {
      const myId = String(state.me?.userId || state.me?.id || '');
      const iAmInitiator = String(sc.initiator_id || '') === myId;
      const refType = String(sc.ref_type || '').trim().toLowerCase();
      const derivedRole = refType === 'task'
        ? (iAmInitiator ? 'worker' : 'demand')
        : (iAmInitiator ? 'demand' : 'worker');
      const derivedPeerId = iAmInitiator ? sc.receiver_id : sc.initiator_id;
      const derivedPeerName = iAmInitiator ? sc.receiver_name : sc.initiator_name;
      const derivedPeerAvatar = iAmInitiator ? (sc.receiver_avatar || '') : (sc.initiator_avatar || '');

      // 用 serverConvId 或 ref_id 匹配本地对话
      let local = chatState.conversations.find(c => c.serverConvId === sc.id)
        || chatState.conversations.find(c =>
          String(c?.refId || '') === String(sc.ref_id || '')
          && String(c?.peerId || '') === String(derivedPeerId || '')
          && String(c?.role || '') === derivedRole
        );
      if (local) {
        local.serverConvId = sc.id;
        local.role = derivedRole;
        local.peerId = derivedPeerId;
        local.peerName = derivedPeerName || local.peerName;
        local.peerAvatar = derivedPeerAvatar || local.peerAvatar || '';
        local.title = sc.title || local.title || '对话';
        local.updatedAt = sc.updated_at || local.updatedAt;
        if (typeof local.unreadCount !== 'number') local.unreadCount = Number(local.unreadCount) || 0;
      } else {
        // 后端有但本地没有 — 是对方发起的对话，创建本地记录
        chatState.conversations.unshift({
          id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          serverConvId: sc.id,
          role: derivedRole,
          refId: sc.ref_id,
          peerId: derivedPeerId,
          peerName: derivedPeerName,
          peerAvatar: derivedPeerAvatar,
          title: sc.title || '对话',
          desc: '',
          messages: [],
          unreadCount: 0,
          createdAt: sc.created_at,
          updatedAt: sc.updated_at
        });
      }
    }
    persistConversations();
    renderChatList();
  } catch (e) { console.warn('拉取后端对话失败', e); }
}

// 从后端拉取对话消息并合并
async function fetchServerMessages(conv) {
  if (!conv.serverConvId || !canOperate()) return;
  try {
    const res = await api(`/api/conversations/${conv.serverConvId}/messages`);
    const serverMsgs = res.data || [];
    if (!serverMsgs.length) return { added: 0, addedPeer: 0 };
    const myId = String(state.me?.userId || state.me?.id || '');
    // 转换后端消息格式为本地格式
    const converted = serverMsgs.map(m => ({
      type: m.type === 'system' ? 'system' : (String(m.sender_id || '') === myId ? 'self' : 'peer'),
      text: m.content,
      time: m.created_at,
      serverId: m.id
    }));
    // 合并：优先按 serverId 去重；其次把本地乐观消息与后端回写消息进行配对，避免出现“我发一条显示两条”
    const existingServerIds = new Set(conv.messages.filter(m => m.serverId).map(m => m.serverId));
    const existingByServerId = new Map(conv.messages.filter(m => m.serverId).map(m => [m.serverId, m]));
    const newMsgs = [];
    const optimisticMatchWindowMs = 15000;
    let mutatedExisting = false;

    for (const sm of converted) {
      if (existingServerIds.has(sm.serverId)) {
        const localMsg = existingByServerId.get(sm.serverId);
        if (localMsg) {
          // 用服务端数据纠正本地缓存中的旧错误类型（例如历史版本把 self/peer 判反）
          if (localMsg.type !== sm.type) {
            localMsg.type = sm.type;
            mutatedExisting = true;
          }
          if ((localMsg.text || '') !== (sm.text || '')) {
            localMsg.text = sm.text;
            mutatedExisting = true;
          }
          if ((localMsg.time || '') !== (sm.time || '')) {
            localMsg.time = sm.time;
            mutatedExisting = true;
          }
        }
        continue;
      }

      const smTime = sm.time ? new Date(sm.time).getTime() : NaN;
      const optimisticIdx = conv.messages.findIndex((lm) => {
        if (!lm || lm.serverId || lm.type !== sm.type) return false;
        if ((lm.text || '') !== (sm.text || '')) return false;
        const lmTime = lm.time ? new Date(lm.time).getTime() : NaN;
        if (Number.isNaN(lmTime) || Number.isNaN(smTime)) return true;
        return Math.abs(lmTime - smTime) <= optimisticMatchWindowMs;
      });

      if (optimisticIdx >= 0) {
        // 回写 serverId 到本地乐观消息，后续同步时不会再重复插入
        conv.messages[optimisticIdx].serverId = sm.serverId;
        if (sm.time) conv.messages[optimisticIdx].time = sm.time;
        if (conv.messages[optimisticIdx].type !== sm.type) conv.messages[optimisticIdx].type = sm.type;
        existingServerIds.add(sm.serverId);
        existingByServerId.set(sm.serverId, conv.messages[optimisticIdx]);
        mutatedExisting = true;
        continue;
      }

      newMsgs.push(sm);
      existingServerIds.add(sm.serverId);
      existingByServerId.set(sm.serverId, sm);
    }

    // 清理历史版本遗留的“本地乐观消息 + 服务端已同步消息”重复项
    // 常见症状：自己发一条消息后，本地出现两条完全相同内容（例如两个“你好”）
    const dedupeWindowMs = 15000;
    const dedupedMessages = [];
    let removedOptimisticDup = false;
    for (const msg of conv.messages) {
      if (!msg || msg.serverId) {
        dedupedMessages.push(msg);
        continue;
      }
      const msgText = String(msg.text || '');
      if (!msgText) {
        dedupedMessages.push(msg);
        continue;
      }
      const msgTime = msg.time ? new Date(msg.time).getTime() : NaN;
      const matchedServerMsg = dedupedMessages.find((existing) => {
        if (!existing?.serverId) return false;
        if (String(existing.text || '') !== msgText) return false;
        const existingTime = existing.time ? new Date(existing.time).getTime() : NaN;
        if (!Number.isNaN(existingTime) && !Number.isNaN(msgTime) && Math.abs(existingTime - msgTime) > dedupeWindowMs) {
          return false;
        }
        const a = String(existing.type || '');
        const b = String(msg.type || '');
        if (a === b) return true;
        return (a === 'self' || a === 'peer') && (b === 'self' || b === 'peer');
      });
      if (matchedServerMsg) {
        removedOptimisticDup = true;
        mutatedExisting = true;
        continue;
      }
      dedupedMessages.push(msg);
    }
    if (removedOptimisticDup) {
      conv.messages = dedupedMessages;
    }

    if (newMsgs.length) {
      const newPeerCount = newMsgs.filter(m => m.type === 'peer').length;
      conv.messages.push(...newMsgs);
      conv.messages.sort((a, b) => new Date(a.time) - new Date(b.time));
      conv.updatedAt = new Date().toISOString();
      if (chatState.activeConversationId === conv.id) {
        conv.unreadCount = 0;
      } else if (newPeerCount > 0) {
        conv.unreadCount = (Number(conv.unreadCount) || 0) + newPeerCount;
      }
      persistConversations();
      return { added: newMsgs.length, addedPeer: newPeerCount };
    }
    if (mutatedExisting) {
      conv.messages.sort((a, b) => new Date(a.time) - new Date(b.time));
    }
    // 仅发生了 serverId 回填（无新增消息）时，也持久化一次，避免下次再重复配对
    persistConversations();
    return { added: 0, addedPeer: 0 };
  } catch (e) { console.warn('拉取消息失败', e); }
  return { added: 0, addedPeer: 0 };
}

// 折叠/展开
function toggleChatModule() {
  chatState.collapsed = !chatState.collapsed;
  if (chatState.collapsed) {
    chatContent?.classList.add('collapsed');
    chatChevron?.classList.add('collapsed');
  } else {
    chatContent?.classList.remove('collapsed');
    chatChevron?.classList.remove('collapsed');
  }
}

chatToggleBtn?.addEventListener('click', toggleChatModule);

// 时间格式
function chatTimeLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ========== 聊天列表过滤状态 ==========
chatState.roleFilter = 'demand'; // 默认查看需求对话

function updateChatUnreadIndicators() {
  const hasUnread = chatState.conversations.some((c) => (Number(c.unreadCount) || 0) > 0);
  chatUnreadDot?.classList.toggle('hidden', !hasUnread);
}

function markConversationRead(conv) {
  if (!conv) return;
  if ((Number(conv.unreadCount) || 0) === 0) return;
  conv.unreadCount = 0;
  persistConversations();
}

// 渲染聊天列表
function renderChatList() {
  if (!chatListEl) return;

  // 过滤当前在移动端选择的对话类型
  const convs = chatState.conversations.filter(c => c.role === chatState.roleFilter);
  const statusCount = convs.length;

  // 更新状态文字
  if (chatStatusText) {
    chatStatusText.textContent = statusCount > 0 ? `${statusCount} 个对话` : '暂无对话';
  }
  updateChatUnreadIndicators();

  if (convs.length === 0) {
    if (chatListEmpty) chatListEmpty.classList.remove('hidden');
    // 清除非空状态的列表项
    const items = chatListEl.querySelectorAll('.chat-list-item');
    items.forEach(i => i.remove());
    return;
  }

  if (chatListEmpty) chatListEmpty.classList.add('hidden');

  // 按最后消息时间排序（最新在前）
  const sorted = [...convs].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  let html = '';
  for (const conv of sorted) {
    const lastMsg = conv.messages[conv.messages.length - 1];
    const preview = lastMsg ? (lastMsg.type === 'delivery' ? '🎉 交付结果' : (lastMsg.text || '').slice(0, 30)) : '暂无消息';
    const time = chatTimeLabel(conv.updatedAt || conv.createdAt);
    const isActive = conv.id === chatState.activeConversationId;
    const shortId = `#${conv.id.substring(0, 4).toUpperCase()}`;
    const avatarFallback = conv.peerAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(conv.peerName?.[0] || 'AI')}&background=random&rounded=true&size=48`;
    const unreadCount = Number(conv.unreadCount) || 0;
    const hasUnread = !isActive && unreadCount > 0;
    const activeClass = isActive ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-100 dark:border-primary/20' : 'border-transparent';
    const roleBadgeClass = conv.role === 'demand'
      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    const roleLabel = conv.role === 'demand' ? 'BUYER' : 'SELLER';
    html += `<div class="chat-list-item flex items-center p-3 mb-2 bg-white dark:bg-surface-dark rounded-2xl border ${activeClass} hover:border-gray-100 dark:hover:border-border-dark shadow-sm transition-all cursor-pointer" data-conv-id="${conv.id}" data-role="${conv.role}"><div class="relative w-12 h-12 flex-shrink-0"><img src="${avatarFallback}" alt="${escapeHtml(conv.peerName)}" class="w-full h-full rounded-full object-cover border border-gray-100 dark:border-border-dark" />${hasUnread ? '<span class="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-white dark:border-surface-dark rounded-full"></span>' : ''}</div><div class="ml-3 flex-1 min-w-0 flex flex-col justify-center"><div class="flex items-center justify-between mb-0.5"><div class="flex items-center gap-1.5 min-w-0"><span class="text-[15px] font-black text-gray-900 dark:text-white truncate">${escapeHtml(conv.title || '未命名任务')}</span><span class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-subtext-light dark:text-gray-400 text-[9px] font-bold rounded flex-shrink-0">${shortId}</span></div><span class="text-[11px] font-medium text-gray-400 whitespace-nowrap ml-2">${time}</span></div><div class="flex items-center gap-1.5"><span class="text-[10px] font-bold px-1.5 rounded ${roleBadgeClass}">${roleLabel}</span><span class="text-[12px] text-subtext-light dark:text-subtext-dark truncate flex-1">${escapeHtml(preview)}</span></div></div></div>`;
  }

  // 统一渲染到 chatListEl（移动端通过 DOM 挂载共享同一节点）
  if (chatListEl) {
    chatListEl.innerHTML = html;
  }
}

// 绑定移动端子 Tab 切换事件
document.addEventListener('DOMContentLoaded', () => {
  const subTabs = document.querySelectorAll('.chat-sub-tab');
  subTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      subTabs.forEach(t => t.classList.remove('is-active'));
      const target = e.currentTarget;
      target.classList.add('is-active');

      chatState.roleFilter = target.getAttribute('data-role');
      renderChatList();
    });
  });
});


// 渲染对话
function renderChatDialog() {
  const conv = chatState.conversations.find(c => c.id === chatState.activeConversationId);
  if (!conv) return;

  // 头部信息
  const avatarFallback = conv.peerAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(conv.peerName?.[0] || 'AI')}&background=random&rounded=true&size=36`;
  if (chatPeerAvatar) chatPeerAvatar.src = avatarFallback;
  if (chatPeerName) chatPeerName.textContent = conv.peerName || '对方';
  if (chatPeerTitle) chatPeerTitle.textContent = conv.title || '';

  // 角色标识（新版: 显示对方角色标签）
  if (chatRoleBadge) {
    if (conv.role === 'demand') {
      // 我是需求方 → 对方是 SELLER（接单方）
      chatRoleBadge.textContent = 'SELLER';
      chatRoleBadge.className = 'px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    } else {
      // 我是接单方 → 对方是 BUYER（需求方）
      chatRoleBadge.textContent = 'BUYER';
      chatRoleBadge.className = 'px-2 py-0.5 rounded text-[10px] font-black bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    }
  }

  // 消息流
  renderChatMessages(conv);

  // 技能选择器状态
  if (chatState.selectedSkill) {
    renderSelectedSkillCapsule(chatState.selectedSkill);
  } else {
    if (chatSelectedSkillCapsule) {
      chatSelectedSkillCapsule.classList.add('hidden');
      chatSelectedSkillCapsule.innerHTML = '';
    }
    if (chatSkillLabel) chatSkillLabel.textContent = '选择我的技能';
  }

  // 根据角色显示不同操作
  if (conv.role === 'demand') {
    // 需求方（BUYER）：隐藏技能选择器，显示需求书按钮
    if (chatSkillSelector) chatSkillSelector.closest('#chat-skill-selector-wrapper')?.classList.add('hidden');
    if (chatDeliveryHint) chatDeliveryHint.classList.add('hidden');
    if (chatSubmitDemandBtn) chatSubmitDemandBtn.classList.remove('hidden');
    // 隐藏技能快捷栏
    const skillsStrip = document.querySelector('#available-skills-strip');
    if (skillsStrip) skillsStrip.classList.add('hidden');
    // 需求方输入提示
    if (chatInput) chatInput.placeholder = '描述你的需求…';
  } else {
    // 接单方（SELLER）：显示技能选择器，隐藏需求书按钮
    if (chatSkillSelector) chatSkillSelector.closest('#chat-skill-selector-wrapper')?.classList.remove('hidden');
    if (chatDeliveryHint) {
      chatDeliveryHint.classList.toggle('hidden', !chatState.selectedSkill);
    }
    if (chatSubmitDemandBtn) chatSubmitDemandBtn.classList.add('hidden');
    // 显示技能快捷栏
    renderAvailableSkillsStrip();
    // 接单方输入提示
    if (chatInput) chatInput.placeholder = '选择技能后发送交付，或输入消息…';
  }
}

// 渲染可用技能快捷栏
function renderAvailableSkillsStrip() {
  const strip = document.querySelector('#available-skills-strip');
  if (!strip) return;

  if (!state.abilities || state.abilities.length === 0) {
    strip.classList.add('hidden');
    return;
  }

  strip.classList.remove('hidden');
  strip.innerHTML = state.abilities.slice(0, 6).map(ability => `
    <button onclick="openDeliverySheet('${escapeHtml(ability.id)}')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-surface-dark border border-gray-200 dark:border-border-dark text-[11px] font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap hover:border-primary/50 hover:text-primary transition-colors shadow-sm flex-shrink-0">
      <span class="text-sm">${ability.icon || '🤖'}</span>
      ${escapeHtml(ability.name)}
    </button>
  `).join('');
}

// 打开交付控制面板 (Bottom Sheet)
window.openDeliverySheet = function (abilityId) {
  const ability = state.abilities?.find(a => a.id === abilityId);
  if (!ability) {
    showToast('请先选择一个技能');
    return;
  }

  // 加载内容到 Sheet
  const sheetContent = document.querySelector('#delivery-sheet-content');
  if (sheetContent) {
    const conv = chatState.conversations.find(c => c.id === chatState.activeConversationId);
    const msgContext = conv?.messages.slice(-5).map(m => m.text).filter(Boolean).join(' ');

    // 模拟自动生成的 Prompt 标签
    const autoTags = ['#FilmLook', '#瀑动色调', '#肖像清晰', '#躺景居中'];

    sheetContent.innerHTML = `
      <div class="p-5">
        <!-- 技能头部 -->
        <div class="flex items-center justify-between mb-5">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center text-2xl">${ability.icon || '🤖'}</div>
            <div>
              <div class="text-[16px] font-black text-gray-900 dark:text-white">${escapeHtml(ability.name)}</div>
              <div class="text-[11px] text-subtext-light dark:text-subtext-dark font-medium">AI 技能调用</div>
            </div>
          </div>
          <button class="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2.5 py-1 rounded-lg hover:opacity-80 transition-opacity">换一个</button>
        </div>

        <!-- PROMPT POLISH 区块 -->
        <div class="prompt-polish-card mb-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Prompt Polish</span>
            <button class="text-gray-400 hover:text-primary transition-colors">
              <span class="material-icons-round text-[16px]">refresh</span>
            </button>
          </div>
          <div class="flex flex-wrap gap-1.5 mb-2">
            ${autoTags.map(tag => `<span class="tag-pill">${tag}</span>`).join('')}
          </div>
          <textarea class="w-full text-[13px] text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none resize-none" rows="3" placeholder="描述您想要的效果...">${msgContext ? msgContext.substring(0, 120) : '用户要求：' + escapeHtml(ability.description || '')}</textarea>
        </div>

        <!-- 参数配置 -->
        <div class="flex gap-3 mb-6">
          <div class="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
            <div class="text-[9px] font-black uppercase tracking-wider text-gray-400 mb-1">强度</div>
            <div class="flex items-center gap-2">
              <input type="range" min="0" max="100" value="85" class="flex-1 accent-[#D97706]">
              <span class="text-[13px] font-black text-gray-900 dark:text-white w-8">85%</span>
            </div>
          </div>
          <div class="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
            <div class="text-[9px] font-black uppercase tracking-wider text-gray-400 mb-1">参考图</div>
            <div class="flex items-center gap-2">
              <span class="text-[22px] font-black text-gray-900 dark:text-white">3</span>
              <div class="flex flex-col">
                <button class="text-gray-400 text-lg leading-none">&#9650;</button>
                <button class="text-gray-400 text-lg leading-none">&#9660;</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Run AI 主按钮 -->
        <button onclick="window.dispatchEvent(new CustomEvent('run-ai-deliver', {detail: {abilityId: '${escapeHtml(abilityId)}'}}))" class="w-full h-14 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl text-[15px] font-black flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-lg">
          <span class="material-icons-round">bolt</span>
          Run AI &amp; Deliver
        </button>
      </div>
    `;
  }

  const overlay = document.querySelector('#delivery-sheet-overlay');
  const sheet = document.querySelector('#delivery-bottom-sheet');
  overlay?.classList.add('show');
  sheet?.classList.add('show');
};

// 关闭 Bottom Sheet
window.closeDeliverySheet = function () {
  const overlay = document.querySelector('#delivery-sheet-overlay');
  const sheet = document.querySelector('#delivery-bottom-sheet');
  overlay?.classList.remove('show');
  sheet?.classList.remove('show');
};

// 监听 Run AI 事件
window.addEventListener('run-ai-deliver', (e) => {
  const { abilityId } = e.detail;
  const ability = state.abilities?.find(a => a.id === abilityId);

  // 关闭窗口
  window.closeDeliverySheet();

  // 在聊天流中插入加载状态
  const conv = chatState.conversations.find(c => c.id === chatState.activeConversationId);
  if (conv) {
    conv.messages.push({ type: 'loading', time: new Date().toISOString() });
    renderChatMessages(conv);

    // 模拟 AI 运行延迟 (3s)
    setTimeout(() => {
      conv.messages.pop(); // 移除 loading
      conv.messages.push({
        type: 'delivery',
        skillName: ability?.name || 'AI 技能',
        content: `已根据您的要求完成出图，请查收！`,
        images: [],
        time: new Date().toISOString()
      });
      persistConversations();
      renderChatMessages(conv);
      showToast('🎉 AI 运行完成！成果已发送给客户');
    }, 3000);
  }
});

// 渲染消息流
function renderChatMessages(conv) {
  if (!chatMessagesEl || !conv) return;

  let html = '';
  // 系统消息：对话创建
  html += `<div class="chat-bubble chat-bubble-system">对话已创建 · ${chatTimeLabel(conv.createdAt)}</div>`;

  for (const msg of conv.messages) {
    if (msg.type === 'system') {
      html += `<div class="chat-bubble chat-bubble-system">${escapeHtml(msg.text)}</div>`;
    } else if (msg.type === 'self') {
      const skillTag = msg.skillName ? `<div class="mt-1"><span class="skill-capsule">${msg.skillIcon || '🔧'} ${escapeHtml(msg.skillName)}</span></div>` : '';
      html += `
        <div class="chat-bubble chat-bubble-self">
          ${escapeHtml(msg.text)}${skillTag}
        </div>
      `;
    } else if (msg.type === 'peer') {
      html += `<div class="chat-bubble chat-bubble-peer">${escapeHtml(msg.text)}</div>`;
    } else if (msg.type === 'delivery') {
      const imgHtml = (msg.images && msg.images.length > 0) ? `
        <div class="delivery-images">
          ${msg.images.map(img => `<img src="${normalizeImageSrc(img)}" alt="交付图片" loading="lazy" />`).join('')}
        </div>
      ` : '';
      html += `
        <div class="chat-bubble-delivery">
          <div class="delivery-header">
            <span class="material-icons-round text-sm">check_circle</span>
            交付结果 · ${msg.skillName || ''}
          </div>
          <div class="delivery-content">${escapeHtml(msg.content || '')}</div>
          ${imgHtml}
        </div>
      `;
    } else if (msg.type === 'loading') {
      html += `
        <div class="chat-bubble-loading">
          <span></span><span></span><span></span>
        </div>
      `;
    }
  }

  chatMessagesEl.innerHTML = html;
  // 滚动到底部
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// 选中技能胶囊
function renderSelectedSkillCapsule(skill) {
  if (!chatSelectedSkillCapsule || !skill) return;
  chatSelectedSkillCapsule.classList.remove('hidden');
  chatSelectedSkillCapsule.innerHTML = `
    <span class="skill-capsule">
      ${skill.icon || '🔧'} ${escapeHtml(skill.name)}
      <span class="skill-capsule-remove" data-action="remove-skill">✕</span>
    </span>
  `;
  if (chatSkillLabel) chatSkillLabel.textContent = skill.name;
  if (chatDeliveryHint) chatDeliveryHint.classList.remove('hidden');
}

// 技能下拉列表
function renderSkillDropdown() {
  if (!chatSkillDropdown) return;
  const dropdownContent = chatSkillDropdown.querySelector('div');
  if (!dropdownContent) return;

  const abilities = state.abilities || [];
  if (abilities.length === 0) {
    dropdownContent.innerHTML = `
      <div class="px-3 py-4 text-center text-xs text-gray-400">
        暂无技能，请先在「AI分身 → 管理」中添加
      </div>
    `;
    return;
  }

  dropdownContent.innerHTML = abilities.map(a => `
    <div class="chat-skill-option ${chatState.selectedSkill?.id === a.id ? 'selected' : ''}" data-skill-id="${a.id}">
      <span class="text-lg">${a.icon || '🔧'}</span>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(a.name)}</div>
        <div class="text-[11px] text-gray-500 dark:text-gray-400 truncate">${escapeHtml(a.description || '')}</div>
      </div>
    </div>
  `).join('');
}

// 切换技能下拉
function toggleSkillDropdown() {
  chatState.skillDropdownOpen = !chatState.skillDropdownOpen;
  chatSkillDropdown?.classList.toggle('hidden', !chatState.skillDropdownOpen);
  if (chatSkillChevron) {
    chatSkillChevron.style.transform = chatState.skillDropdownOpen ? 'rotate(180deg)' : '';
  }
  if (chatState.skillDropdownOpen) renderSkillDropdown();
}

chatSkillSelector?.addEventListener('click', toggleSkillDropdown);

// 选择技能
chatSkillDropdown?.addEventListener('click', (e) => {
  const option = e.target.closest('.chat-skill-option');
  if (!option) return;
  const skillId = option.dataset.skillId;
  const ability = state.abilities.find(a => a.id === skillId);
  if (ability) {
    chatState.selectedSkill = { id: ability.id, name: ability.name, icon: ability.icon || '🔧', description: ability.description || '' };
    renderSelectedSkillCapsule(chatState.selectedSkill);
  }
  // 关闭下拉
  chatState.skillDropdownOpen = false;
  chatSkillDropdown?.classList.add('hidden');
  if (chatSkillChevron) chatSkillChevron.style.transform = '';
});

// 移除已选技能
chatSelectedSkillCapsule?.addEventListener('click', (e) => {
  if (e.target.closest('.skill-capsule-remove')) {
    chatState.selectedSkill = null;
    chatSelectedSkillCapsule.classList.add('hidden');
    chatSelectedSkillCapsule.innerHTML = '';
    if (chatSkillLabel) chatSkillLabel.textContent = '选择我的技能';
    if (chatDeliveryHint) chatDeliveryHint.classList.add('hidden');
  }
});

// 切换对话
function switchConversation(convId) {
  chatState.activeConversationId = convId;
  chatState.selectedSkill = null;
  chatState.skillDropdownOpen = false;
  const conv = chatState.conversations.find(c => c.id === convId);
  markConversationRead(conv);

  // 切换视图：隐藏列表，显示对话详情
  if (chatListView) chatListView.classList.add('hidden');
  if (chatDialogView) {
    chatDialogView.classList.remove('hidden');
    chatDialogView.style.removeProperty('display');
  }

  renderChatDialog();
  renderChatList();

  // 异步拉取后端消息
  if (conv) {
    fetchServerMessages(conv).then(() => {
      if (chatState.activeConversationId === convId) {
        markConversationRead(conv);
        renderChatMessages(conv);
      }
      renderChatList();
    });
  }
}

// 返回列表
function backToChatList() {
  chatState.activeConversationId = null;
  chatState.selectedSkill = null;
  chatState.skillDropdownOpen = false;
  chatSkillDropdown?.classList.add('hidden');
  if (chatSubmitDemandBtn) chatSubmitDemandBtn.classList.add('hidden');

  if (chatDialogView) {
    chatDialogView.classList.add('hidden');
    chatDialogView.style.setProperty('display', 'none'); // 确保隐藏
  }
  if (chatListView) chatListView.classList.remove('hidden');

  renderChatList();
}

chatBackBtn?.addEventListener('click', backToChatList);

// 列表点击切换
chatListEl?.addEventListener('click', (e) => {
  const item = e.target.closest('.chat-list-item');
  if (!item) return;
  const convId = item.dataset.convId;
  if (convId) switchConversation(convId);
});

function getRectCenter(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const rect = el.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function getDesktopChatAnimationTarget() {
  return document.querySelector('#chat-peer-avatar')
    || document.querySelector('#chat-toggle-btn')
    || document.querySelector('#chat-module');
}

function getMobileChatAnimationTarget() {
  return document.querySelector('[data-mobile-tab="chat"] .tab-icon')
    || document.querySelector('[data-mobile-tab="chat"]')
    || document.querySelector('#m-chat-unread');
}

function pulseJoinChatTarget(targetEl) {
  if (!targetEl) return;
  targetEl.classList.remove('join-chat-target-pulse');
  void targetEl.offsetWidth;
  targetEl.classList.add('join-chat-target-pulse');
  setTimeout(() => targetEl.classList.remove('join-chat-target-pulse'), 700);
}

function animateJoinToChat(sourceEl, targetEl) {
  const start = getRectCenter(sourceEl);
  const end = getRectCenter(targetEl);
  if (!end) return;
  if (!start) {
    pulseJoinChatTarget(targetEl);
    return;
  }

  const orb = document.createElement('div');
  orb.className = 'join-chat-orb';
  orb.style.left = `${start.x}px`;
  orb.style.top = `${start.y}px`;
  document.body.appendChild(orb);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const curveLift = Math.max(24, Math.min(120, Math.abs(dx) * 0.12 + 36));

  orb.animate([
    { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0.25 },
    { transform: `translate(calc(-50% + ${dx * 0.45}px), calc(-50% + ${dy * 0.45 - curveLift}px)) scale(1.1)`, opacity: 1, offset: 0.55 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.5)`, opacity: 0.1 }
  ], {
    duration: 680,
    easing: 'cubic-bezier(0.22, 0.8, 0.2, 1)',
    fill: 'forwards'
  }).finished
    .catch(() => {})
    .finally(() => {
      orb.remove();
      pulseJoinChatTarget(targetEl);
    });
}

function triggerJoinConversationFeedback(sourceEl) {
  if (window.innerWidth < 1024) {
    animateJoinToChat(sourceEl, getMobileChatAnimationTarget());
    setTimeout(() => {
      pulseJoinChatTarget(document.querySelector('#chat-peer-avatar') || document.querySelector('#chat-module'));
    }, 220);
    return;
  }
  animateJoinToChat(sourceEl, getDesktopChatAnimationTarget());
}

// 打开/创建对话（统一入口）
async function openConversation(role, data, options = {}) {
  // role: 'demand' | 'worker'
  // data: skill 或 task 对象
  const sourceEl = options?.sourceEl || null;

  const isDemand = role === 'demand';
  const peerId = isDemand ? (data.ownerId || data.id) : (data.publisherId || data.id);
  const peerName = isDemand ? (data.ownerName || data.name || '技能提供者') : (data.publisherName || data.title || '任务发布者');
  const title = isDemand ? (data.name || '技能对话') : (data.title || '任务对话');
  const desc = isDemand ? (data.description || '') : (data.description || '');
  const peerAvatar = data.avatar || '';
  const refId = data.id; // 技能 ID 或 任务 ID

  // 查找是否已有对应对话（同一对象 + 同一对方），避免不同人使用相同技能 ID 时串会话
  let conv = chatState.conversations.find(c =>
    String(c?.refId || '') === String(refId || '')
    && String(c?.role || '') === String(role || '')
    && String(c?.peerId || '') === String(peerId || '')
  );

  if (!conv) {
    // 创建新对话
    const newId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    conv = {
      id: newId,
      role,
      refId,
      peerId,
      peerName,
      peerAvatar,
      title,
      desc,
      messages: [
        { type: 'system', text: isDemand ? `你向「${peerName}」发起了需求对话` : `你对任务「${title}」发起了接活对话`, time: new Date().toISOString() }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    chatState.conversations.unshift(conv);
    persistConversations();
  }

  // 同步到后端（已登录时）
  if (canOperate() && !conv.serverConvId) {
    try {
      const result = await api('/api/conversations', {
        method: 'POST',
        body: {
          refId, refType: isDemand ? 'skill' : 'task',
          receiverId: peerId, receiverName: peerName,
          receiverAvatar: peerAvatar, title
        }
      });
      if (result.data?.id) {
        conv.serverConvId = result.data.id;
        persistConversations();
      }
    } catch (e) { console.warn('同步对话到后端失败', e); }
  }

  // 确保模块展开
  if (chatState.collapsed) toggleChatModule();

  // 打开对话
  switchConversation(conv.id);
  triggerJoinConversationFeedback(sourceEl);

  showToast(`💬 已进入对话`);

  // 手机端导航：优先切换到对话 Tab（App 模式）；回退到 scrollIntoView（旧逻辑）
  if (window.innerWidth < 1024) {
    if (typeof window._mobileTabSwitchToChat === 'function') {
      // App 化模式：直接切换到对话 Tab
      setTimeout(() => window._mobileTabSwitchToChat(), 80);
    } else {
      // 回退：滚动到对话模块并高亮
      setTimeout(() => {
        const chatEl = document.querySelector('#chat-module');
        if (chatEl) {
          chatEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          chatEl.style.transition = 'box-shadow 0.3s ease';
          chatEl.style.boxShadow = '0 0 0 3px rgba(217, 119, 6, 0.5)';
          setTimeout(() => { chatEl.style.boxShadow = ''; }, 1800);
        }
      }, 150);
    }
  }
}

// 发送消息
async function sendChatMessage() {
  const conv = chatState.conversations.find(c => c.id === chatState.activeConversationId);
  if (!conv) return;

  const text = chatInput?.value?.trim();
  if (!text && !chatState.selectedSkill) {
    showToast('请输入消息');
    return;
  }

  const skill = chatState.selectedSkill;

  // 添加用户消息
  const userMsg = {
    type: 'self',
    text: text || (skill ? `请使用「${skill.name}」生成交付` : ''),
    skillId: skill?.id || null,
    skillName: skill?.name || null,
    skillIcon: skill?.icon || null,
    time: new Date().toISOString()
  };
  conv.messages.push(userMsg);
  conv.updatedAt = new Date().toISOString();

  // 清空输入框
  if (chatInput) chatInput.value = '';

  renderChatMessages(conv);
  persistConversations();

  // 同步消息到后端
  if (canOperate() && conv.serverConvId) {
    api(`/api/conversations/${conv.serverConvId}/messages`, {
      method: 'POST',
      body: { content: userMsg.text, type: skill ? 'skill_request' : 'text' }
    })
      .then((res) => {
        const saved = res?.data;
        if (!saved) return;
        if (saved.id) userMsg.serverId = saved.id;
        if (saved.created_at) userMsg.time = saved.created_at;
        persistConversations();
      })
      .catch((e) => {
        console.warn('同步消息失败', e);
        showToast(e?.message || '消息发送失败（未同步到对方）');
      });
  } else if (canOperate() && !conv.serverConvId) {
    // 理论上 openConversation 会先创建后端会话；这里兜底提示，避免用户误以为已送达
    showToast('消息未发送到对方：对话尚未同步完成，请稍后重试');
  }

  // 如果选择了技能，调用 API 生成交付
  if (skill && conv.role === 'worker') {
    // 添加加载状态
    conv.messages.push({ type: 'loading' });
    renderChatMessages(conv);

    // 更新工作台状态
    clearHireStatusTimers();
    const now = new Date().toISOString();
    Object.assign(currentHireJob, {
      id: `hire_${Date.now()}`,
      status: 'ACCEPTED',
      skillId: skill.id,
      skillName: skill.name,
      skillIcon: skill.icon,
      requirement: text || '',
      selectedStyleId: '',
      timeline: [],
      result: null,
      createdAt: now
    });
    setHireStatus('ACCEPTED', 'AI 已接单', 'info');
    openHireWorkbench();

    hireStatusTimers.push(setTimeout(() => {
      if (isHireProcessing()) setHireStatus('ANALYZING', '分析需求中', 'running');
    }, 900));
    hireStatusTimers.push(setTimeout(() => {
      if (isHireProcessing()) setHireStatus('THINKING', '思考方案中', 'running');
    }, 2200));
    hireStatusTimers.push(setTimeout(() => {
      if (isHireProcessing()) setHireStatus('DELIVERING', '交付生成中', 'running');
    }, 3500));

    try {
      const result = await api('/api/skills/hire', {
        method: 'POST',
        body: {
          skillId: skill.id,
          requirement: text || '',
          selectedStyleId: ''
        }
      });

      clearHireStatusTimers();

      // 移除 loading 消息
      conv.messages = conv.messages.filter(m => m.type !== 'loading');

      const normalizedResult = {
        content: result?.data?.content || '交付完成，但内容为空。',
        images: result?.data?.images || []
      };

      // 添加交付结果消息
      conv.messages.push({
        type: 'delivery',
        content: normalizedResult.content,
        images: normalizedResult.images,
        skillName: skill.name,
        time: new Date().toISOString()
      });
      conv.updatedAt = new Date().toISOString();

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

      showToast('🎉 交付完成！');
    } catch (err) {
      clearHireStatusTimers();
      conv.messages = conv.messages.filter(m => m.type !== 'loading');

      const message = err.message || '交付失败，请重试';
      conv.messages.push({
        type: 'system',
        text: `❌ 交付失败：${message}`,
        time: new Date().toISOString()
      });
      conv.updatedAt = new Date().toISOString();

      currentHireJob.result = { content: message, images: [] };
      setHireStatus('FAILED', `执行失败：${message}`, 'error');
      showToast(message);
    }

    renderChatMessages(conv);
    persistConversations();
    renderChatList();

    // 清除已选技能
    chatState.selectedSkill = null;
    if (chatSelectedSkillCapsule) {
      chatSelectedSkillCapsule.classList.add('hidden');
      chatSelectedSkillCapsule.innerHTML = '';
    }
    if (chatSkillLabel) chatSkillLabel.textContent = '选择我的技能';
    if (chatDeliveryHint) chatDeliveryHint.classList.add('hidden');

  } else if (skill && conv.role === 'demand') {
    // 需求方选择了技能：暂存为普通消息
    renderChatList();
  } else {
    // 纯文本消息
    renderChatList();
  }
}

chatSendBtn?.addEventListener('click', sendChatMessage);

// 提交需求（需求方将聊天内容作为正式需求发送给技能方）
chatSubmitDemandBtn?.addEventListener('click', async () => {
  const conv = chatState.conversations.find(c => c.id === chatState.activeConversationId);
  if (!conv || conv.role !== 'demand') return;
  if (!canOperate()) { showToast('请先登录'); return; }

  const chatTexts = conv.messages
    .filter(m => m.type === 'self' || m.type === 'peer')
    .map(m => m.text).filter(Boolean);
  const requirement = chatTexts.length > 0 ? chatTexts.join('\n') : '（通过技能对话提交的需求）';

  chatSubmitDemandBtn.disabled = true;
  chatSubmitDemandBtn.textContent = '提交中...';

  try {
    // 通过后端对话 API 创建/获取对话并发送需求消息给技能方
    const convResult = await api('/api/conversations', {
      method: 'POST',
      body: {
        refId: conv.refId, refType: 'skill',
        receiverId: conv.peerId, receiverName: conv.peerName,
        receiverAvatar: conv.peerAvatar || '', title: conv.title || ''
      }
    });
    const serverConvId = convResult.data?.id;
    if (serverConvId) {
      await api(`/api/conversations/${serverConvId}/messages`, {
        method: 'POST',
        body: { content: `📋 【正式需求】\n${requirement}`, type: 'demand' }
      });
    }

    conv.messages.push({
      type: 'system',
      text: '✅ 需求已提交给对方，等待对方使用技能生成交付',
      time: new Date().toISOString()
    });
    conv.demandSubmitted = true;
    conv.updatedAt = new Date().toISOString();
    persistConversations();
    renderChatMessages(conv);
    renderChatList();
    showToast('需求已发送给对方！');
  } catch (err) {
    showToast(err.message || '提交失败');
  } finally {
    chatSubmitDemandBtn.disabled = false;
    chatSubmitDemandBtn.innerHTML = '<span class="material-icons-round text-sm">send</span> 提交需求给对方';
  }
});

// Enter 发送（Shift+Enter 换行）
chatInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// ===== 手机端搜索框展开/关闭 =====
(function initMobileSearch() {
  const toggleBtn = document.querySelector('#mobile-search-toggle');
  const searchBar = document.querySelector('#mobile-search-bar');
  const closeBtn = document.querySelector('#mobile-search-close');
  const mobileInput = document.querySelector('#search-input-mobile');
  const desktopInput = document.querySelector('#search-input');

  if (!toggleBtn || !searchBar) return;

  // 点击放大镜图标展开搜索框
  toggleBtn.addEventListener('click', () => {
    searchBar.classList.remove('hidden');
    toggleBtn.classList.add('hidden');
    mobileInput?.focus();
  });

  // 点击关闭按钮收起搜索框
  closeBtn?.addEventListener('click', () => {
    searchBar.classList.add('hidden');
    toggleBtn.classList.remove('hidden');
    if (mobileInput) mobileInput.value = '';
    // 清空桌面搜索框并触发重新渲染
    if (desktopInput) {
      desktopInput.value = '';
      desktopInput.dispatchEvent(new Event('input'));
    }
  });

  // 手机搜索框 input 同步到桌面搜索框（共享过滤逻辑）
  mobileInput?.addEventListener('input', () => {
    if (desktopInput) {
      desktopInput.value = mobileInput.value;
      desktopInput.dispatchEvent(new Event('input'));
    }
  });
})();


// 点击外部关闭技能下拉
document.addEventListener('click', (e) => {
  if (chatState.skillDropdownOpen && !e.target.closest('#chat-skill-selector') && !e.target.closest('#chat-skill-dropdown')) {
    chatState.skillDropdownOpen = false;
    chatSkillDropdown?.classList.add('hidden');
    if (chatSkillChevron) chatSkillChevron.style.transform = '';
  }
});

// 初始化聊天列表
renderChatList();

bootstrap();

// ============================================================
// 手机端 App 化 Tab Bar 初始化
// 在手机端将侧边栏模块迁移到对应 Tab 面板；桌面端不执行任何操作
// ============================================================
function initMobileTabBar() {
  if (window.innerWidth >= 1024) return; // 桌面端跳过

  // ---- 1. DOM 迁移：将侧边栏各模块 appendChild 到对应 Tab 面板 ----
  const moveEl = (id, targetId) => {
    const el = document.getElementById(id);
    const target = document.getElementById(targetId);
    if (el && target) target.appendChild(el);
  };

  // 排行 Tab：手机端单列展示排行榜卡片
  const rankingInner = document.getElementById('m-ranking-inner');
  const skillCard = document.getElementById('skill-leaderboard-card');
  const userCard = document.getElementById('user-leaderboard-card');
  if (rankingInner && skillCard) rankingInner.appendChild(skillCard);
  if (rankingInner && userCard) rankingInner.appendChild(userCard);

  // 对话 Tab：chat-module 移到 m-chat-container
  const chatContainer = document.getElementById('m-chat-container');
  const chatModule = document.getElementById('chat-module');
  if (chatContainer && chatModule) chatContainer.appendChild(chatModule);

  // 我的 Tab：AI 分身卡、工作台依次移入（发布需求仅保留底部 + 按钮）
  const meTab = document.getElementById('m-tab-me');
  const aiCard = document.getElementById('ai-profile-card');
  const workbench = document.getElementById('hire-fab-wrapper');
  if (meTab) {
    if (aiCard) meTab.appendChild(aiCard);
    if (workbench) meTab.appendChild(workbench);
  }

  // ---- 2. Tab 切换逻辑 ----
  const hallPanel = document.getElementById('hall-panel');
  const detailPanel = document.getElementById('detail-panel');
  const tabPanels = {
    ranking: document.getElementById('m-tab-ranking'),
    hall: null, // 大厅复用 hallPanel
    chat: document.getElementById('m-tab-chat'),
    me: document.getElementById('m-tab-me'),
  };
  let currentTab = 'hall';

  function switchMobileTab(tab) {
    if (tab === currentTab) return;
    currentTab = tab;

    // 更新底部 Tab 按钮激活状态
    document.querySelectorAll('[data-mobile-tab]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.mobileTab === tab);
    });

    // 控制大厅面板显隐
    const isHall = tab === 'hall';
    hallPanel?.classList.toggle('mobile-tab-hidden', !isHall);
    detailPanel?.classList.toggle('mobile-tab-hidden', !isHall);

    // 非大厅 Tab 时隐藏 main 元素（消除顶部空白占位）
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.classList.toggle('mobile-tab-hidden', !isHall);

    // 控制排行/对话/我的 面板显隐
    Object.entries(tabPanels).forEach(([key, el]) => {
      if (!el) return; // hall 的 el 为 null，由 hallPanel 控制
      el.classList.toggle('hidden', key !== tab);
    });

    // 切换到对话 Tab 时：隐藏桌面端折叠标题、展开内容、刷新渲染
    if (tab === 'chat') {
      // chat-module 已在 initMobileTabBar 中整体移动到 m-chat-container
      // 隐藏桌面端专用的折叠标题栏（移动端不需要）
      const toggleBtn = document.getElementById('chat-toggle-btn');
      if (toggleBtn) toggleBtn.style.display = 'none';
      // 确保内容区域始终展开（移动端不可折叠）
      const chatContentEl = document.getElementById('chat-content');
      if (chatContentEl) {
        chatContentEl.classList.remove('collapsed');
        chatContentEl.style.maxHeight = 'none';
        chatContentEl.style.opacity = '1';
      }
      // 确保视图状态正确
      const listView = document.getElementById('chat-list-view');
      const dialogView = document.getElementById('chat-dialog-view');
      if (chatState.activeConversationId) {
        listView?.classList.add('hidden');
        if (dialogView) {
          dialogView.classList.remove('hidden');
          dialogView.style.removeProperty('display');
        }
      } else {
        listView?.classList.remove('hidden');
        if (dialogView) {
          dialogView.classList.add('hidden');
          dialogView.style.setProperty('display', 'none');
        }
      }
      renderChatList();
      syncChatSubTab();
    }
    // 切换到我的 Tab 时刷新 AI 分身
    if (tab === 'me') {
      renderAIAvatar?.();
    }
  }

  // 绑定 Tab Bar 按钮点击
  document.querySelectorAll('[data-mobile-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchMobileTab(btn.dataset.mobileTab));
  });

  // 中间 FAB 点击 = 发布需求
  document.getElementById('mobile-publish-fab')?.addEventListener('click', () => {
    openPublishModal();
  });

  // ---- 3. 对话子 Tab（需求对话 / 接单对话）过滤 ----
  let chatSubRole = document.querySelector('.chat-sub-tab.is-active')?.dataset.role || 'demand'; // 当前过滤的 role

  function syncChatSubTab() {
    // 同步 chatState 的 roleFilter 与移动端子 Tab
    chatState.roleFilter = chatSubRole;
    // 重新渲染列表（renderChatList 已根据 roleFilter 过滤）
    renderChatList();
  }

  document.querySelectorAll('.chat-sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      chatSubRole = btn.dataset.role;
      // 更新激活样式
      document.querySelectorAll('.chat-sub-tab').forEach(b => {
        b.classList.toggle('is-active', b === btn);
      });
      syncChatSubTab();
    });
  });

  // ---- 4. 未读红点同步 ----
  function updateMobileChatUnread() {
    const hasUnread = document.getElementById('chat-unread-dot')?.classList.contains('hidden') === false;
    const dot = document.getElementById('m-chat-unread');
    if (dot) dot.classList.toggle('visible', hasUnread);
  }

  // 监听 chat-unread-dot 变化
  const unreadDot = document.getElementById('chat-unread-dot');
  if (unreadDot) {
    new MutationObserver(updateMobileChatUnread).observe(unreadDot, { attributes: true });
  }

  // ---- 5. openConversation 手机端改为切换 Tab ----
  // 覆盖之前添加的 scrollIntoView 行为
  window._mobileTabSwitchToChat = () => {
    switchMobileTab('chat');
    // 高亮 chat module 边框
    const chatEl = document.getElementById('chat-module');
    if (chatEl) {
      chatEl.style.transition = 'box-shadow 0.3s ease';
      chatEl.style.boxShadow = '0 0 0 3px rgba(217, 119, 6, 0.5)';
      setTimeout(() => { chatEl.style.boxShadow = ''; }, 1800);
    }
  };

  // 默认激活大厅 Tab（hall-panel 显示）
  hallPanel?.classList.remove('mobile-tab-hidden');
  tabPanels.ranking?.classList.add('hidden');
  tabPanels.chat?.classList.add('hidden');
  tabPanels.me?.classList.add('hidden');
}

// 在 DOM 加载完毕后的下一个 tick 运行（确保所有渲染函数已注册）
setTimeout(initMobileTabBar, 0);
