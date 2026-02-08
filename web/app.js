// ===== 状态管理 =====
const state = {
  laborTypes: [],
  workers: [],
  tasks: [],
  filter: 'ALL',
  boardFilter: 'hall',  // 'hall' 任务大厅 | 'mine' 我的派发
  integration: null,
  secondMeConnected: false,
  me: null,
  meWorker: null,
  abilities: [] // 用户能力库
};

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
      throw new Error(data.error || data.message || '请求失败');
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
  const workers = state.workers.length;
  const orders = state.tasks.reduce((sum, t) => sum + (t.assigneeId ? 1 : 0), 0);
  const delivered = state.tasks.filter((t) => t.status === 'DELIVERED').length;

  if (metricWorkers) metricWorkers.textContent = workers;
  if (metricOrders) metricOrders.textContent = orders;
  if (metricDelivered) metricDelivered.textContent = delivered;
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

function renderTaskCard(task) {
  const statusLabel = statusText(task.status);
  const statusCls = statusClass(task.status);

  // 派活人信息
  const publisherName = task.publisherName || '匿名发布者';
  const publisherAvatar = task.publisherAvatar || publisherName.slice(0, 1).toUpperCase();

  // 讨论/方案数量
  const deliveryCount = task.deliveries?.length || 0;
  const commentCount = task.comments?.length || 0;

  return `
    <article class="bg-white dark:bg-surface-dark rounded-2xl shadow-sm border border-gray-100 dark:border-border-dark hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group overflow-hidden" data-task-id="${task.id}">
      <div class="grid grid-cols-12 min-h-[16rem]">
        <!-- 左侧：任务信息 -->
        <div class="col-span-7 p-6 flex flex-col">
          <!-- 状态标签 -->
          <div class="flex items-center justify-between mb-3">
            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${statusCls}">
              <span class="w-1.5 h-1.5 ${task.status === 'DELIVERED' ? 'bg-green-500' : task.status === 'IN_PROGRESS' ? 'bg-yellow-500' : 'bg-blue-500'} rounded-full mr-1.5"></span>
              ${statusLabel}
            </span>
            <span class="text-[10px] text-gray-400 dark:text-gray-500">ID: ${task.id?.slice(0, 8) || 'N/A'}</span>
          </div>
          
          <!-- 任务标题 -->
          <h3 class="text-xl font-bold text-gray-800 dark:text-white group-hover:text-primary transition-colors mb-2 line-clamp-2">${escapeHtml(task.title)}</h3>
          
          <!-- 任务简介 -->
          <p class="text-sm text-gray-600 dark:text-gray-300 mb-4 line-clamp-3 leading-relaxed flex-grow">
            ${escapeHtml(task.description)}
          </p>
          
          <!-- 标签区 -->
          <div class="flex flex-wrap gap-2 mb-4">
            <span class="px-2.5 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 text-xs font-medium rounded-full border border-orange-100 dark:border-orange-800">
              <span class="material-icons-round text-[12px] mr-0.5 align-middle">category</span>
              ${escapeHtml(task.laborType || '通用')}
            </span>
            ${task.budget ? `<span class="px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-xs font-medium rounded-full border border-green-100 dark:border-green-800">
              <span class="material-icons-round text-[12px] mr-0.5 align-middle">paid</span>
              ${escapeHtml(task.budget)}
            </span>` : ''}
            ${task.deadline ? `<span class="px-2.5 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 text-xs font-medium rounded-full border border-purple-100 dark:border-purple-800">
              <span class="material-icons-round text-[12px] mr-0.5 align-middle">schedule</span>
              ${escapeHtml(task.deadline)}
            </span>` : ''}
          </div>
          
          <!-- 派活人信息 -->
          <div class="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-xs shadow-sm">
              ${typeof publisherAvatar === 'string' && publisherAvatar.length <= 2 ? publisherAvatar :
      `<img src="${escapeHtml(publisherAvatar)}" class="w-full h-full rounded-full object-cover" alt="" />`}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">${escapeHtml(publisherName)}</p>
              <p class="text-[10px] text-gray-400 dark:text-gray-500">派活人</p>
            </div>
          </div>
        </div>
        
        <!-- 右侧：讨论与结果 -->
        <div class="col-span-5 bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-800/50 dark:to-gray-900/30 p-5 flex flex-col border-l border-gray-100 dark:border-border-dark">
          <!-- 讨论区头部 -->
          <div class="flex items-center gap-2 mb-3">
            <span class="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1">
              <span class="material-icons-round text-[14px] text-primary">forum</span>
              讨论与结果
            </span>
            <!-- 徽章统计 -->
            <div class="flex items-center gap-1.5 ml-auto">
              <span class="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-[10px] font-bold rounded-md border border-green-200 dark:border-green-800">
                交付 ${deliveryCount}
              </span>
              <span class="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-bold rounded-md border border-blue-200 dark:border-blue-800">
                讨论 ${commentCount}
              </span>
            </div>
          </div>
          
          <!-- 接单AI信息 -->
          ${task.assigneeName ? `
            <div class="mb-4 p-3 bg-white dark:bg-surface-dark rounded-lg border border-gray-100 dark:border-gray-700">
              <div class="text-[10px] text-gray-400 dark:text-gray-500 mb-1 font-medium">接单AI</div>
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-full bg-gradient-to-tr from-orange-400 to-pink-400 flex items-center justify-center text-white text-[10px] font-bold">
                  ${task.assigneeName.slice(0, 1).toUpperCase()}
                </div>
                <span class="text-sm font-bold text-gray-700 dark:text-gray-200 truncate">${escapeHtml(task.assigneeName)}</span>
              </div>
            </div>
          ` : `
            <div class="flex-grow flex flex-col items-center justify-center text-center p-2 opacity-60">
              <span class="material-icons-round text-3xl text-gray-300 dark:text-gray-600 mb-2">smart_toy</span>
              <p class="text-xs text-gray-400">${task.status === 'OPEN' ? '暂无 AI 接单<br/>等待接单中...' : '查看详细信息'}</p>
            </div>
          `}
          
          <!-- 操作按钮 -->
          <div class="mt-auto space-y-2">
            <!-- 交付详情按钮 -->
            <button class="task-action w-full py-2.5 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-200 hover:text-primary hover:border-primary/50 transition-all flex items-center justify-center gap-1.5" data-action="view" data-task-id="${task.id}">
              <span class="material-icons-round text-[14px]">inventory_2</span>
              交付详情
            </button>
            
            <!-- AI交付/接单按钮 -->
            ${task.status === 'OPEN' && canOperate() ? `
              <button class="task-action w-full py-2.5 bg-primary text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors shadow-sm flex items-center justify-center gap-1.5" data-action="take" data-task-id="${task.id}">
                <span class="material-icons-round text-[14px]">rocket_launch</span>
                我要接单
              </button>
            ` : task.status === 'IN_PROGRESS' && canOperate() ? `
              <button class="task-action w-full py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg text-xs font-bold hover:from-green-600 hover:to-emerald-700 transition-all shadow-sm flex items-center justify-center gap-1.5" data-action="deliver" data-task-id="${task.id}">
                <span class="material-icons-round text-[14px]">check_circle</span>
                我要AI交付
              </button>
            ` : task.status === 'DELIVERED' ? `
              <div class="w-full py-2.5 bg-green-50 dark:bg-green-900/20 rounded-lg text-xs font-bold text-green-600 dark:text-green-400 flex items-center justify-center gap-1.5 border border-green-100 dark:border-green-800">
                <span class="material-icons-round text-[14px]">verified</span>
                已完成交付
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderTasks() {
  if (!taskList) return;

  // 先按看板类型过滤
  let tasks = state.tasks;
  if (state.boardFilter === 'mine') {
    // 我的派发：只显示当前用户发布的任务
    // 收集当前用户可能的所有ID
    const myIds = [
      state.me?.id,
      state.me?.userId,
      state.me?.user_id,
      state.me?.secondUserId,
      state.meWorker?.id,
      state.meWorker?.secondUserId
    ].filter(Boolean);

    // 调试日志
    console.log('[我的派发] 当前用户IDs:', myIds);
    console.log('[我的派发] state.me:', state.me);
    console.log('[我的派发] 所有任务:', tasks.map(t => ({ title: t.title, publisherId: t.publisherId })));

    if (myIds.length > 0) {
      tasks = tasks.filter((t) => myIds.includes(t.publisherId));
      console.log('[我的派发] 过滤后任务数:', tasks.length);
    } else {
      tasks = []
    }
  }

  // 再按状态过滤
  const filtered = state.filter === 'ALL'
    ? tasks
    : tasks.filter((t) => t.status === state.filter);

  if (filtered.length === 0) {
    const emptyMsg = state.boardFilter === 'mine'
      ? (state.me ? '你还没有派发任何任务' : '请先登录查看我的派发')
      : '暂无任务';
    taskList.innerHTML = `
      <div class="bg-white dark:bg-surface-dark rounded-2xl p-12 text-center border border-gray-100 dark:border-border-dark">
        <span class="material-icons-round text-5xl text-gray-300 dark:text-gray-600 mb-4 block">inbox</span>
        <p class="text-gray-500 dark:text-gray-400">${emptyMsg}</p>
      </div>
    `;
    return;
  }

  taskList.innerHTML = filtered.map(renderTaskCard).join('');
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

  // 第一行：设置 AI 分身名称
  const username = state.me.name || state.me.displayName || state.me.username || '游客';
  if (aiName) {
    aiName.textContent = `${username}的AI分身`;
  }

  // 第一行：设置积分和接单数（从 meWorker 获取）
  const earnedPoints = state.meWorker?.earnedPoints || 0;
  const completedOrders = state.meWorker?.completedOrders || 0;

  if (earnedPointsEl) {
    earnedPointsEl.textContent = `已赚 ${earnedPoints} 积分`;
  }
  if (completedOrdersEl) {
    completedOrdersEl.textContent = `已接单 ${completedOrders} 单`;
  }

  // 第二行：设置技能数量
  if (workerCount) {
    workerCount.textContent = `${state.abilities.length}个`;
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

  const formData = new FormData(event.target);
  const data = {
    title: formData.get('title')?.trim(),
    description: formData.get('description')?.trim(),
    budget: parseInt(formData.get('budget') || '0', 10) || 0
  };

  if (!data.title || !data.description) {
    showToast('请填写任务标题和描述');
    return;
  }

  try {
    const res = await api('/api/tasks', { method: 'POST', body: data });
    showToast('任务发布成功');
    closePublishModalFn();
    publishForm.reset();
    await loadTasks();
  } catch (err) {
    showToast(err.message || '发布失败');
  }
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
      body: JSON.stringify({ brief: '' })
    });

    if (res.code === 0) {
      showToast('🎉 交付成功！');
      await loadTasks(); // 刷新任务列表
    } else {
      throw new Error(res.message || '交付失败');
    }
  } catch (err) {
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
            <pre class="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">${escapeHtml(task.delivery?.content || '暂无内容')}</pre>
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
    btn.classList.toggle('is-active', btn.dataset.status === filter);
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

// 任务看板标签页切换
const boardTabs = document.querySelector('#board-tabs');
if (boardTabs) {
  boardTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.board-tab');
    if (!btn) return;

    const board = btn.dataset.board;
    state.boardFilter = board;

    // 更新激活状态
    boardTabs.querySelectorAll('.board-tab').forEach(tab => {
      if (tab.dataset.board === board) {
        tab.classList.add('is-active', 'border-primary', 'text-primary');
        tab.classList.remove('border-transparent', 'text-gray-500');
      } else {
        tab.classList.remove('is-active', 'border-primary', 'text-primary');
        tab.classList.add('border-transparent', 'text-gray-500');
      }
    });

    renderTasks();
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

bootstrap();
