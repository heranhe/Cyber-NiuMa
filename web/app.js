// ===== 状态管理 =====
const state = {
  laborTypes: [],
  workers: [],
  tasks: [],
  filter: 'ALL',
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
            <!-- 查看详情按钮 -->
            <button class="task-action w-full py-2.5 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-200 hover:text-primary hover:border-primary/50 transition-all flex items-center justify-center gap-1.5" data-action="view" data-task-id="${task.id}">
              <span class="material-icons-round text-[14px]">visibility</span>
              查看详情
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

  const filtered = state.filter === 'ALL'
    ? state.tasks
    : state.tasks.filter((t) => t.status === state.filter);

  if (filtered.length === 0) {
    taskList.innerHTML = `
      <div class="bg-white dark:bg-surface-dark rounded-2xl p-12 text-center border border-gray-100 dark:border-border-dark">
        <span class="material-icons-round text-5xl text-gray-300 dark:text-gray-600 mb-4 block">inbox</span>
        <p class="text-gray-500 dark:text-gray-400">暂无任务</p>
      </div>
    `;
    return;
  }

  taskList.innerHTML = filtered.map(renderTaskCard).join('');
}

function renderSkillsList() {
  if (!skillsList) return;

  if (state.abilities.length === 0) {
    skillsList.hidden = true;
    if (skillsActions) skillsActions.hidden = true;
    if (workerProfileHint) workerProfileHint.hidden = false;
    return;
  }

  skillsList.hidden = false;
  if (skillsActions) skillsActions.hidden = false;
  if (workerProfileHint) workerProfileHint.hidden = true;

  // 以标签形式显示技能
  skillsList.innerHTML = `
    <div class="flex flex-wrap gap-2">
      ${state.abilities.map((ability) => `
        <button class="ability-tag group relative px-3 py-1.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium rounded-lg border border-orange-200 dark:border-orange-800 hover:bg-orange-200 dark:hover:bg-orange-800/50 transition-colors flex items-center gap-1.5" data-ability-id="${ability.id}">
          <span class="text-sm">${ability.icon || '🔧'}</span>
          <span>${escapeHtml(ability.name)}</span>
          <span class="tooltip hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-10">
            ${escapeHtml(ability.description || ability.name)}
          </span>
        </button>
      `).join('')}
    </div>
  `;

  if (workerCount) workerCount.textContent = `${state.abilities.length}个`;
}

// 渲染 AI 分身容器
function renderAIAvatar() {
  const avatarContainer = document.querySelector('#ai-avatar-container');
  const userAvatar = document.querySelector('#user-avatar');
  const aiName = document.querySelector('#ai-name');
  const capabilityTags = document.querySelector('#capability-tags');

  if (!avatarContainer || !state.me) {
    if (avatarContainer) avatarContainer.classList.add('hidden');
    return;
  }

  // 如果用户已登录且有能力，显示 AI 分身容器
  if (state.abilities.length > 0) {
    avatarContainer.classList.remove('hidden');

    // 设置用户头像
    const avatar = state.me.avatar || state.me.profileImageUrl || '';
    if (userAvatar) {
      userAvatar.src = avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(state.me.displayName || '游客')}&background=random`;
    }

    // 设置 AI 分身名称
    const username = state.me.displayName || state.me.username || '游客';
    if (aiName) {
      aiName.textContent = `${username}的AI分身`;
    }

    // 渲染技能标签（胶囊样式）
    if (capabilityTags) {
      capabilityTags.innerHTML = state.abilities.map((ability) => `
        <span class="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-black dark:text-white rounded-full text-sm font-medium transition-all hover:bg-gray-200 dark:hover:bg-gray-700">
          <span>${ability.icon || '🔧'}</span>
          <span>${escapeHtml(ability.name)}</span>
        </span>
      `).join('');
    }
  } else {
    avatarContainer.classList.add('hidden');
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
    renderAbilities();
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
    renderAbilities();
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
}

async function onPublishSubmit(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const data = {
    title: formData.get('title')?.trim(),
    description: formData.get('description')?.trim()
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
  if (!button) return;

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
      // TODO: 实现交付逻辑（选择能力后调用 chat/stream）
      showToast('交付功能开发中');
    } else if (action === 'discuss') {
      // TODO: 实现讨论功能
      showToast('讨论功能开发中');
    } else if (action === 'view') {
      // TODO: 查看详情
      showToast('详情页开发中');
    }
  } catch (err) {
    showToast(err.message || '操作失败');
  }
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
