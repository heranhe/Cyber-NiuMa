// ===== 状态管理 =====
const state = {
    task: null,
    me: null,
    secondMeConnected: false,
    abilities: [],
    deliveries: [],
    discussions: []
};

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

function getTaskIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

function formatTime(dateStr) {
    if (!dateStr) return '刚刚';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = (now - date) / 1000;

    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
    return date.toLocaleDateString('zh-CN');
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

// ===== 权限判断 =====
// 角色是针对具体任务判定的，同一用户可以同时是派活人和接单者
function getPermissions() {
    const task = state.task;
    const me = state.me;

    if (!task) return {};

    const isLoggedIn = !!me;
    const isPublisher = isLoggedIn && task.publisherId === me.id;  // 是该任务的派活人
    const isWorker = isLoggedIn && task.assigneeId === me.id;      // 是该任务的接单者

    return {
        // 角色标识（可同时拥有多个）
        isLoggedIn,
        isPublisher,
        isWorker,

        // 查看权限
        canView: true,
        canViewDiscussions: true,
        canViewDeliveryList: true,
        canViewDeliveryContent: isPublisher || task.deliveryVisibility === 'public',

        // 交互权限
        canDiscuss: isLoggedIn,
        canTakeOrder: isLoggedIn && task.status === 'OPEN' && !task.assigneeId,

        // 派活人权限
        canEdit: isPublisher && task.status === 'OPEN',
        canCancel: isPublisher && task.status !== 'DELIVERED',
        canDelete: isPublisher && task.status === 'OPEN',
        canAdopt: isPublisher && task.status === 'DELIVERED',

        // 接单者权限
        canDeliver: isWorker && task.status === 'IN_PROGRESS',
        canRedeliver: isWorker && task.status === 'DELIVERED'
    };
}

// ===== 状态样式 =====
function getStatusInfo(status) {
    switch (status) {
        case 'OPEN':
            return { label: '待接单', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', dot: 'bg-blue-500' };
        case 'IN_PROGRESS':
            return { label: '进行中', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', dot: 'bg-yellow-500' };
        case 'DELIVERED':
            return { label: '已交付', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', dot: 'bg-green-500' };
        default:
            return { label: status, color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-500' };
    }
}

// ===== 渲染函数 =====
function renderTaskInfo() {
    const task = state.task;
    if (!task) return;

    // 状态徽章
    const statusInfo = getStatusInfo(task.status);
    const statusBadge = document.querySelector('#task-status-badge');
    if (statusBadge) {
        statusBadge.className = `inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${statusInfo.color}`;
        statusBadge.innerHTML = `<span class="w-2 h-2 ${statusInfo.dot} rounded-full mr-2"></span>${statusInfo.label}`;
    }

    // 任务ID
    const taskIdEl = document.querySelector('#task-id');
    if (taskIdEl) {
        taskIdEl.textContent = `ID: ${task.id?.slice(0, 8) || 'N/A'}`;
        taskIdEl.onclick = () => {
            navigator.clipboard.writeText(task.id);
            showToast('已复制任务ID');
        };
    }

    // 标题和描述
    document.querySelector('#task-title').textContent = task.title || '未命名任务';
    document.querySelector('#task-description').textContent = task.description || '暂无描述';

    // 标签
    const typeTag = document.querySelector('#task-type-tag');
    if (typeTag && task.laborType) {
        typeTag.querySelector('span:last-child') || typeTag.appendChild(document.createElement('span'));
        typeTag.innerHTML = `<span class="material-icons-round text-sm mr-1 align-middle">category</span>${escapeHtml(task.laborType)}`;
    }

    const budgetTag = document.querySelector('#task-budget-tag');
    if (budgetTag && task.budget) {
        budgetTag.classList.remove('hidden');
        budgetTag.querySelector('.budget-value').textContent = task.budget;
    }

    const deadlineTag = document.querySelector('#task-deadline-tag');
    if (deadlineTag && task.deadline) {
        deadlineTag.classList.remove('hidden');
        deadlineTag.querySelector('.deadline-value').textContent = task.deadline;
    }

    const visibilityTag = document.querySelector('#task-visibility-tag');
    if (visibilityTag) {
        const isPublic = task.deliveryVisibility !== 'private';
        visibilityTag.querySelector('.visibility-value').textContent = isPublic ? '所有人可见' : '仅派活人可见';
    }

    // 派活人信息
    const publisherName = task.publisherName || '匿名发布者';
    const publisherAvatar = (task.publisherAvatar || publisherName.charAt(0)).toUpperCase();

    document.querySelector('#publisher-name').textContent = publisherName;
    document.querySelector('#publish-time').textContent = formatTime(task.createdAt);

    const avatarEl = document.querySelector('#publisher-avatar');
    if (avatarEl) {
        if (task.publisherAvatar && task.publisherAvatar.startsWith('http')) {
            avatarEl.innerHTML = `<img src="${escapeHtml(task.publisherAvatar)}" class="w-full h-full rounded-full object-cover" alt="" />`;
        } else {
            avatarEl.textContent = publisherAvatar.slice(0, 1);
        }
    }

    // 更新页面标题
    document.title = `${task.title} · 赛博牛马`;
}

function renderActionPanel() {
    const panel = document.querySelector('#action-panel');
    if (!panel) return;

    const permissions = getPermissions();
    const task = state.task;
    let html = '';

    // 派活人视角的管理选项
    if (permissions.isPublisher) {
        html += `
      <div class="mb-6">
        <h3 class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <span class="material-icons-round text-primary text-base">verified_user</span>
          任务管理
          <span class="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">派活人</span>
        </h3>
        ${permissions.canEdit ? `<button id="edit-task-btn" class="w-full py-2.5 mb-2 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-200 hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2">
          <span class="material-icons-round text-base">edit</span>
          编辑任务
        </button>` : ''}
        ${permissions.canCancel ? `<button id="cancel-task-btn" class="w-full py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all flex items-center justify-center gap-2">
          <span class="material-icons-round text-base">close</span>
          取消任务
        </button>` : ''}
      </div>
    `;
    }

    // 接单者视角（如果已接单）
    if (permissions.isWorker) {
        html += `
      <div class="mb-6">
        <h3 class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <span class="material-icons-round text-orange-500 text-base">work</span>
          我的接单
          <span class="text-[10px] bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full">接单者</span>
        </h3>
        ${permissions.canDeliver ? `<button id="deliver-btn" class="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg text-sm font-bold hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg shadow-green-200 dark:shadow-none flex items-center justify-center gap-2">
          <span class="material-icons-round text-base">rocket_launch</span>
          提交 AI 交付
        </button>` : ''}
        ${permissions.canRedeliver ? `<button id="redeliver-btn" class="w-full py-3 bg-primary text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-all shadow-lg flex items-center justify-center gap-2">
          <span class="material-icons-round text-base">refresh</span>
          重新交付
        </button>` : ''}
      </div>
    `;
    }

    // 接单按钮（未接单时显示给所有登录用户）
    if (permissions.canTakeOrder) {
        html += `
      <div class="mb-6">
        <h3 class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">加入任务</h3>
        <button id="take-order-btn" class="w-full py-3 bg-primary text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-all shadow-lg shadow-orange-200 dark:shadow-none flex items-center justify-center gap-2">
          <span class="material-icons-round text-base">front_hand</span>
          我要接单
        </button>
      </div>
    `;
    }

    // 未登录提示
    if (!permissions.isLoggedIn) {
        html += `
      <div class="text-center py-4">
        <span class="material-icons-round text-4xl text-gray-300 dark:text-gray-600 mb-3 block">lock</span>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">登录后可接单或参与讨论</p>
        <button class="login-btn w-full py-3 bg-primary text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-all">
          使用 SecondMe 登录
        </button>
      </div>
    `;
    }

    // 已交付状态提示
    if (task.status === 'DELIVERED' && !permissions.isPublisher && !permissions.isWorker) {
        html += `
      <div class="text-center py-4">
        <span class="material-icons-round text-4xl text-green-400 mb-3 block">verified</span>
        <p class="text-sm text-gray-500 dark:text-gray-400">此任务已完成交付</p>
      </div>
    `;
    }

    // 进行中状态提示（非接单者）
    if (task.status === 'IN_PROGRESS' && !permissions.isWorker && !permissions.isPublisher) {
        html += `
      <div class="text-center py-4">
        <span class="material-icons-round text-4xl text-yellow-400 mb-3 block animate-pulse">hourglass_top</span>
        <p class="text-sm text-gray-500 dark:text-gray-400">任务进行中，等待交付...</p>
      </div>
    `;
    }

    panel.innerHTML = html || '<div class="text-center py-4 text-gray-400">暂无可用操作</div>';

    // 绑定事件
    bindActionEvents();
}

function renderWorkerInfo() {
    const card = document.querySelector('#worker-info-card');
    const task = state.task;

    if (!card || !task.assigneeId) {
        if (card) card.classList.add('hidden');
        return;
    }

    card.classList.remove('hidden');

    const workerName = task.assigneeName || 'AI 分身';
    document.querySelector('#worker-name').textContent = workerName;
    document.querySelector('#worker-ability').textContent = task.assigneeAbility ? `使用能力: ${task.assigneeAbility}` : '';
    document.querySelector('#take-time').textContent = `接单时间：${formatTime(task.takenAt)}`;

    const avatarEl = document.querySelector('#worker-avatar');
    if (avatarEl) {
        avatarEl.textContent = workerName.charAt(0).toUpperCase();
    }
}

function renderDeliveries() {
    const list = document.querySelector('#deliveries-list');
    const countEl = document.querySelector('#delivery-count');
    const permissions = getPermissions();

    if (!list) return;

    const deliveries = state.deliveries || [];
    countEl.textContent = deliveries.length;

    if (deliveries.length === 0) {
        list.innerHTML = `
      <div class="text-center py-8 text-gray-400 dark:text-gray-500">
        <span class="material-icons-round text-4xl mb-2 block">inbox</span>
        <p>暂无交付记录</p>
      </div>
    `;
        return;
    }

    list.innerHTML = deliveries.map(delivery => {
        const canViewContent = permissions.canViewDeliveryContent;
        return `
      <div class="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-400 to-pink-400 flex items-center justify-center text-white font-bold text-sm">
            ${escapeHtml((delivery.workerName || 'AI').charAt(0).toUpperCase())}
          </div>
          <div class="flex-1">
            <p class="font-bold text-gray-900 dark:text-white text-sm">${escapeHtml(delivery.workerName || 'AI 分身')}</p>
            <p class="text-xs text-gray-400">${formatTime(delivery.createdAt)}</p>
          </div>
          ${delivery.abilityName ? `<span class="text-xs bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-2 py-1 rounded-full">${escapeHtml(delivery.abilityName)}</span>` : ''}
        </div>
        ${canViewContent ? `
          <div class="bg-white dark:bg-surface-dark rounded-lg p-4 border border-gray-100 dark:border-gray-600">
            <pre class="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">${escapeHtml(delivery.content)}</pre>
          </div>
        ` : `
          <div class="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 text-center">
            <span class="material-icons-round text-gray-400 dark:text-gray-500 mb-1 block">lock</span>
            <p class="text-sm text-gray-500 dark:text-gray-400">交付内容仅派活人可见</p>
          </div>
        `}
      </div>
    `;
    }).join('');
}

function renderDiscussions() {
    const list = document.querySelector('#discussions-list');
    const countEl = document.querySelector('#discussion-count');
    const formContainer = document.querySelector('#discussion-form-container');
    const loginHint = document.querySelector('#login-to-discuss');
    const permissions = getPermissions();

    if (!list) return;

    // 显示/隐藏讨论表单
    if (formContainer && loginHint) {
        if (permissions.canDiscuss) {
            formContainer.classList.remove('hidden');
            loginHint.classList.add('hidden');
        } else {
            formContainer.classList.add('hidden');
            loginHint.classList.remove('hidden');
        }
    }

    const discussions = state.discussions || [];
    countEl.textContent = discussions.length;

    if (discussions.length === 0) {
        list.innerHTML = `
      <div class="text-center py-8 text-gray-400 dark:text-gray-500">
        <span class="material-icons-round text-4xl mb-2 block">chat_bubble_outline</span>
        <p>暂无讨论，快来抢沙发！</p>
      </div>
    `;
        return;
    }

    list.innerHTML = discussions.map(comment => `
    <div class="flex gap-3">
      <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
        ${escapeHtml((comment.userName || '匿').charAt(0).toUpperCase())}
      </div>
      <div class="flex-1 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="font-bold text-gray-900 dark:text-white text-sm">${escapeHtml(comment.userName || '匿名用户')}</span>
          <span class="text-xs text-gray-400">${formatTime(comment.createdAt)}</span>
        </div>
        <p class="text-sm text-gray-700 dark:text-gray-300">${escapeHtml(comment.content)}</p>
      </div>
    </div>
  `).join('');
}

function renderLoginState() {
    const topLogout = document.querySelector('#top-logout');
    const topLogin = document.querySelector('.top-login');

    if (state.secondMeConnected && state.me) {
        if (topLogout) topLogout.hidden = false;
        if (topLogin) topLogin.hidden = true;

        // 更新我的头像
        const myAvatar = document.querySelector('#my-avatar');
        if (myAvatar && state.me.name) {
            myAvatar.textContent = state.me.name.charAt(0).toUpperCase();
        }
    } else {
        if (topLogout) topLogout.hidden = true;
        if (topLogin) topLogin.hidden = false;
    }
}

// ===== Tab 切换 =====
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = `tab-${tab.dataset.tab}`;

            // 更新 tab 样式
            tabs.forEach(t => {
                t.classList.remove('active', 'border-primary', 'text-primary');
                t.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400');
            });
            tab.classList.add('active', 'border-primary', 'text-primary');
            tab.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400');

            // 切换内容
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            document.querySelector(`#${targetId}`)?.classList.remove('hidden');
        });
    });
}

// ===== 事件绑定 =====
function bindActionEvents() {
    // 接单按钮
    document.querySelector('#take-order-btn')?.addEventListener('click', handleTakeOrder);

    // 交付按钮
    document.querySelector('#deliver-btn')?.addEventListener('click', handleDeliver);
    document.querySelector('#redeliver-btn')?.addEventListener('click', handleDeliver);

    // 编辑按钮
    document.querySelector('#edit-task-btn')?.addEventListener('click', handleEditTask);

    // 取消按钮
    document.querySelector('#cancel-task-btn')?.addEventListener('click', handleCancelTask);

    // 登录按钮
    document.querySelectorAll('.login-btn').forEach(btn => {
        btn.addEventListener('click', handleLogin);
    });
}

function bindGlobalEvents() {
    // 退出登录
    document.querySelector('#top-logout')?.addEventListener('click', handleLogout);

    // 顶部登录按钮
    document.querySelector('.top-login')?.addEventListener('click', handleLogin);

    // 发送讨论
    document.querySelector('#submit-discussion-btn')?.addEventListener('click', handleSubmitDiscussion);

    // Tab 切换
    setupTabs();
}

// ===== 事件处理 =====
async function handleTakeOrder() {
    if (!state.me) {
        showToast('请先登录');
        return;
    }

    // TODO: 打开接单弹窗选择能力
    try {
        await api(`/api/tasks/${state.task.id}/take`, { method: 'POST' });
        showToast('接单成功！');
        await loadTask();
    } catch (err) {
        showToast(err.message || '接单失败');
    }
}

async function handleDeliver() {
    const btn = document.querySelector('#deliver-btn') || document.querySelector('#redeliver-btn');
    if (!btn) return;

    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round text-base animate-spin">sync</span> AI 交付中...';

    try {
        await api(`/api/tasks/${state.task.id}/deliver`, { method: 'POST' });
        showToast('交付成功！');
        await loadTask();
    } catch (err) {
        showToast(err.message || '交付失败');
        btn.innerHTML = original;
        btn.disabled = false;
    }
}

async function handleEditTask() {
    showToast('编辑功能开发中');
}

async function handleCancelTask() {
    if (!confirm('确定要取消此任务吗？')) return;

    try {
        await api(`/api/tasks/${state.task.id}/cancel`, { method: 'POST' });
        showToast('任务已取消');
        window.location.href = '/';
    } catch (err) {
        showToast(err.message || '取消失败');
    }
}

async function handleSubmitDiscussion() {
    const input = document.querySelector('#discussion-input');
    const content = input?.value?.trim();

    if (!content) {
        showToast('请输入讨论内容');
        return;
    }

    try {
        await api(`/api/tasks/${state.task.id}/comments`, {
            method: 'POST',
            body: { content }
        });
        input.value = '';
        showToast('发送成功');
        await loadDiscussions();
    } catch (err) {
        showToast(err.message || '发送失败');
    }
}

async function handleLogin() {
    try {
        const res = await api('/api/oauth/authorize-url');
        const url = res?.data?.url || res?.url;
        if (url) {
            window.location.href = url;
        } else {
            showToast('获取登录链接失败');
        }
    } catch {
        showToast('登录失败');
    }
}

async function handleLogout() {
    try {
        await api('/api/oauth/logout', { method: 'POST' });
        showToast('已退出登录');
        setTimeout(() => window.location.reload(), 500);
    } catch {
        showToast('退出失败');
    }
}

// ===== 数据加载 =====
async function loadTask() {
    const taskId = getTaskIdFromUrl();
    if (!taskId) {
        showError('任务ID无效');
        return;
    }

    try {
        const res = await api(`/api/tasks/${taskId}`);
        state.task = res.task || res;
        state.deliveries = res.deliveries || state.task.deliveries || [];
        state.discussions = res.comments || state.task.comments || [];

        // 渲染页面
        renderTaskInfo();
        renderActionPanel();
        renderWorkerInfo();
        renderDeliveries();
        renderDiscussions();

        // 显示内容
        document.querySelector('#loading-state')?.classList.add('hidden');
        document.querySelector('#task-content')?.classList.remove('hidden');
    } catch (err) {
        showError(err.message || '加载任务失败');
    }
}

async function loadDiscussions() {
    try {
        const res = await api(`/api/tasks/${state.task.id}/comments`);
        state.discussions = res.comments || [];
        renderDiscussions();
    } catch (err) {
        console.error('加载讨论失败:', err);
    }
}

async function loadSessionInfo() {
    try {
        const res = await api('/api/session');
        state.secondMeConnected = res?.connected;
        state.me = res?.user || null;
        state.abilities = res?.abilities || [];
        renderLoginState();
    } catch {
        state.secondMeConnected = false;
        state.me = null;
    }
}

function showError(message) {
    document.querySelector('#loading-state')?.classList.add('hidden');
    document.querySelector('#error-state')?.classList.remove('hidden');
    document.querySelector('#error-state')?.classList.add('flex');
    document.querySelector('#error-message').textContent = message;
}

// ===== 初始化 =====
async function init() {
    bindGlobalEvents();
    await loadSessionInfo();
    await loadTask();

    // 重新渲染操作面板（因为登录状态可能影响权限）
    renderActionPanel();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
