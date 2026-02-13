// ===== 状态管理 =====
const state = {
    task: null,
    me: null,
    meWorker: null,
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
function getCurrentActorIds() {
    return new Set(
        [
            state.me?.id,
            state.me?.userId,
            state.me?.user_id,
            state.me?.secondUserId,
            state.meWorker?.id,
            state.meWorker?.secondUserId
        ]
            .map((id) => String(id || '').trim())
            .filter(Boolean)
    );
}

function getPermissions() {
    const task = state.task;
    const me = state.me;
    const myIds = getCurrentActorIds();

    if (!task) return {};

    const isLoggedIn = !!me;
    const isPublisher = isLoggedIn && myIds.has(String(task.publisherId || '').trim());  // 是该任务的派活人
    const isWorker = isLoggedIn && myIds.has(String(task.assigneeId || '').trim());      // 是该任务的接单者

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

function renderActionButtons() {
    const container = document.querySelector('#action-buttons');
    if (!container) return;

    const permissions = getPermissions();
    const task = state.task;
    let buttons = [];

    // 接单按钮
    if (permissions.canTakeOrder) {
        buttons.push(`
          <button id="take-order-btn" class="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-all shadow-sm flex items-center gap-2">
            <span class="material-icons-round text-base">front_hand</span>
            我要接单
          </button>
        `);
    }

    // 交付按钮（接单者）
    if (permissions.canDeliver) {
        buttons.push(`
          <button id="deliver-btn" class="px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg text-sm font-bold hover:from-green-600 hover:to-emerald-700 transition-all shadow-sm flex items-center gap-2">
            <span class="material-icons-round text-base">rocket_launch</span>
            提交 AI 交付
          </button>
        `);
    }

    // 重新交付按钮
    if (permissions.canRedeliver) {
        buttons.push(`
          <button id="redeliver-btn" class="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-all shadow-sm flex items-center gap-2">
            <span class="material-icons-round text-base">refresh</span>
            重新交付
          </button>
        `);
    }

    // 编辑按钮（派活人）
    if (permissions.canEdit) {
        buttons.push(`
          <button id="edit-task-btn" class="px-4 py-2.5 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-200 hover:border-primary hover:text-primary transition-all flex items-center gap-2">
            <span class="material-icons-round text-base">edit</span>
            编辑
          </button>
        `);
    }

    // 取消按钮（派活人）
    if (permissions.canCancel) {
        buttons.push(`
          <button id="cancel-task-btn" class="px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-100 transition-all flex items-center gap-2">
            <span class="material-icons-round text-base">close</span>
            取消
          </button>
        `);
    }

    // 未登录时显示登录按钮
    if (!permissions.isLoggedIn) {
        buttons.push(`
          <button class="login-btn px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-all flex items-center gap-2">
            <span class="material-icons-round text-base">login</span>
            登录接单
          </button>
        `);
    }

    container.innerHTML = buttons.join('');

    // 绑定事件
    bindActionEvents();
}

function renderWorkerInfo() {
    const inlineCard = document.querySelector('#worker-info-inline');
    const task = state.task;

    if (!inlineCard || !task.assigneeId) {
        if (inlineCard) inlineCard.classList.add('hidden');
        return;
    }

    inlineCard.classList.remove('hidden');

    const workerName = task.assigneeName || 'AI 分身';

    // 更新内联接单者信息
    const nameEl = document.querySelector('#worker-name-inline');
    if (nameEl) nameEl.textContent = workerName;

    const avatarEl = document.querySelector('#worker-avatar-small');
    if (avatarEl) avatarEl.textContent = workerName.charAt(0).toUpperCase();
}

// 检测内容中的图片URL
function extractImagesFromContent(content) {
    if (!content) return { text: content, images: [] };

    const images = [];
    let processedContent = content;

    // 1. 匹配 Markdown 图片格式: ![alt](url)
    const mdImageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;
    let mdMatch;
    while ((mdMatch = mdImageRegex.exec(content)) !== null) {
        images.push(mdMatch[2]);
    }
    // 移除 Markdown 图片标记
    processedContent = processedContent.replace(mdImageRegex, '');

    // 2. 匹配裸图片 URL（带常见图片扩展名）
    const bareImageRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg)(?:\?[^\s]*)?)/gi;
    let bareMatch;
    while ((bareMatch = bareImageRegex.exec(processedContent)) !== null) {
        if (!images.includes(bareMatch[1])) {
            images.push(bareMatch[1]);
        }
    }
    processedContent = processedContent.replace(bareImageRegex, '');

    // 3. 匹配 data:image URI（base64 图片）
    const dataUriRegex = /(data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+)/g;
    let dataMatch;
    while ((dataMatch = dataUriRegex.exec(content)) !== null) {
        if (!images.includes(dataMatch[1])) {
            images.push(dataMatch[1]);
        }
    }
    processedContent = processedContent.replace(dataUriRegex, '');

    const text = processedContent.trim();
    return { text, images };
}

// 检测内容是否需要折叠（超过4行或超过300字符）
function shouldCollapse(content) {
    if (!content) return false;
    const lineCount = (content.match(/\n/g) || []).length + 1;
    return lineCount > 4 || content.length > 300;
}

// 截取预览内容（前4行或前300字符）
function getPreviewContent(content) {
    if (!content) return '';
    const lines = content.split('\n');
    if (lines.length > 4) {
        return lines.slice(0, 4).join('\n') + '...';
    }
    if (content.length > 300) {
        return content.slice(0, 300) + '...';
    }
    return content;
}

function renderDeliveries() {
    const list = document.querySelector('#deliveries-list');
    const countEl = document.querySelector('#delivery-count');
    const permissions = getPermissions();

    if (!list) return;

    const deliveries = state.deliveries || [];
    if (countEl) countEl.textContent = deliveries.length;

    if (deliveries.length === 0) {
        list.innerHTML = `
      <div class="text-center py-12 text-gray-400 dark:text-gray-500">
        <span class="material-icons-round text-5xl mb-3 block">inbox</span>
        <p class="text-sm">暂无交付记录</p>
      </div>
    `;
        return;
    }

    list.innerHTML = deliveries.map((delivery, index) => {
        const canViewContent = permissions.canViewDeliveryContent;
        const { text, images } = extractImagesFromContent(delivery.content || '');
        const needsCollapse = shouldCollapse(text);
        const previewText = needsCollapse ? getPreviewContent(text) : text;
        const deliveryId = `delivery-${index}`;

        // 获取头像显示，支持URL头像
        const workerName = delivery.workerName || 'AI 分身';
        const avatarChar = workerName.charAt(0).toUpperCase();
        const hasAvatarUrl = delivery.workerAvatar && delivery.workerAvatar.startsWith('http');

        return `
      <div class="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-surface-dark rounded-xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
        <div class="flex items-center gap-3 mb-4">
          ${hasAvatarUrl
                ? `<img src="${escapeHtml(delivery.workerAvatar)}" alt="${escapeHtml(workerName)}" class="w-12 h-12 rounded-full object-cover border-2 border-orange-200 dark:border-orange-800 shadow-md" />`
                : `<div class="w-12 h-12 rounded-full bg-gradient-to-tr from-orange-400 to-pink-400 flex items-center justify-center text-white font-bold text-lg shadow-md">${escapeHtml(avatarChar)}</div>`
            }
          <div class="flex-1">
            <p class="font-bold text-gray-900 dark:text-white">${escapeHtml(workerName)}</p>
            <p class="text-xs text-gray-400">${formatTime(delivery.createdAt)}</p>
          </div>
          ${delivery.abilityName ? `<span class="text-xs bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-3 py-1 rounded-full font-medium">${escapeHtml(delivery.abilityName)}</span>` : ''}
        </div>
        ${canViewContent ? `
          <div class="bg-white dark:bg-surface-dark rounded-lg p-4 border border-gray-100 dark:border-gray-600">
            ${images.length > 0 ? `
              <div class="mb-3 flex flex-wrap gap-3">
                ${images.map(imgUrl => `
                  <a href="${escapeHtml(imgUrl)}" target="_blank" rel="noopener noreferrer" class="block">
                    <img src="${escapeHtml(imgUrl)}" alt="交付图片" class="max-h-64 max-w-full rounded-xl border border-gray-200 dark:border-gray-600 hover:opacity-90 hover:shadow-lg transition-all object-contain cursor-zoom-in" loading="lazy" />
                  </a>
                `).join('')}
              </div>
            ` : ''}
            ${text ? `
              <div id="${deliveryId}-content">
                <pre id="${deliveryId}-preview" class="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 leading-relaxed ${needsCollapse ? '' : 'hidden'}">${escapeHtml(previewText)}</pre>
                <pre id="${deliveryId}-full" class="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 leading-relaxed ${needsCollapse ? 'hidden' : ''}">${escapeHtml(text)}</pre>
              </div>
              ${needsCollapse ? `
                <button onclick="toggleDeliveryContent('${deliveryId}')" id="${deliveryId}-toggle" class="mt-2 text-xs text-primary hover:text-amber-700 font-medium flex items-center gap-1 transition-colors">
                  <span class="material-icons-round text-sm">expand_more</span>
                  <span class="toggle-text">展开全部</span>
                </button>
              ` : ''}
            ` : ''}
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

// 交付内容展开/收起切换
window.toggleDeliveryContent = function (deliveryId) {
    const preview = document.querySelector(`#${deliveryId}-preview`);
    const full = document.querySelector(`#${deliveryId}-full`);
    const toggle = document.querySelector(`#${deliveryId}-toggle`);

    if (!preview || !full || !toggle) return;

    const isExpanded = full.classList.contains('hidden');

    if (isExpanded) {
        // 展开
        preview.classList.add('hidden');
        full.classList.remove('hidden');
        toggle.querySelector('.toggle-text').textContent = '收起';
        toggle.querySelector('.material-icons-round').textContent = 'expand_less';
    } else {
        // 收起
        preview.classList.remove('hidden');
        full.classList.add('hidden');
        toggle.querySelector('.toggle-text').textContent = '展开全部';
        toggle.querySelector('.material-icons-round').textContent = 'expand_more';
    }
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

// ===== AI 自动回复 =====
async function handleAIAutoReply() {
    const btn = document.querySelector('#ai-auto-reply-btn');
    if (!btn) return;

    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round text-sm animate-spin">sync</span> AI 思考中...';

    try {
        // 调用 SecondMe API 生成自动回复
        const res = await api(`/api/tasks/${state.task.id}/ai-reply`, {
            method: 'POST',
            body: { taskId: state.task.id }
        });

        // 将 AI 回复填入输入框或直接发送
        const input = document.querySelector('#discussion-input');
        if (input && res.reply) {
            input.value = res.reply;
            showToast('AI 已生成回复，请确认后发送');
        } else if (res.reply) {
            // 直接发送
            await api(`/api/tasks/${state.task.id}/comments`, {
                method: 'POST',
                body: { content: res.reply, isAI: true }
            });
            showToast('AI 回复已发送');
            await loadDiscussions();
        }
    } catch (err) {
        showToast(err.message || 'AI 回复失败');
    } finally {
        btn.innerHTML = original;
        btn.disabled = false;
    }
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

    // AI 自动回复
    document.querySelector('#ai-auto-reply-btn')?.addEventListener('click', handleAIAutoReply);
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

    // 图像生成可能耗时较长，显示额外提示
    let tipTimer = setTimeout(() => {
        btn.innerHTML = '<span class="material-icons-round text-base animate-spin">sync</span> 图像生成中，请稍候...';
    }, 5000);

    try {
        await api(`/api/tasks/${state.task.id}/deliver`, { method: 'POST' });
        showToast('交付成功！');
        await loadTask();
    } catch (err) {
        showToast(err.message || '交付失败');
        btn.innerHTML = original;
        btn.disabled = false;
    } finally {
        clearTimeout(tipTimer);
    }
}

async function handleEditTask() {
    showToast('编辑功能开发中');
}

// ===== 自定义确认弹窗 =====
function showConfirmModal(options = {}) {
    const modal = document.querySelector('#confirm-modal');
    const overlay = document.querySelector('#confirm-overlay');
    const dialog = document.querySelector('#confirm-dialog');
    const iconContainer = document.querySelector('#confirm-icon');
    const titleEl = document.querySelector('#confirm-title');
    const messageEl = document.querySelector('#confirm-message');
    const cancelBtn = document.querySelector('#confirm-cancel-btn');
    const okBtn = document.querySelector('#confirm-ok-btn');

    if (!modal) return Promise.resolve(false);

    // 配置弹窗内容
    const {
        title = '确认操作？',
        message = '此操作无法撤销',
        icon = 'warning',
        iconColor = 'red',
        cancelText = '取消',
        confirmText = '确认',
        confirmColor = 'red'
    } = options;

    // 更新内容
    titleEl.textContent = title;
    messageEl.textContent = message;
    cancelBtn.textContent = cancelText;
    okBtn.innerHTML = `<span class="material-icons-round text-lg">check</span>${confirmText}`;

    // 更新图标颜色
    iconContainer.className = `w-16 h-16 mx-auto mb-4 rounded-full bg-${iconColor}-100 dark:bg-${iconColor}-900/30 flex items-center justify-center`;
    iconContainer.innerHTML = `<span class="material-icons-round text-3xl text-${iconColor}-500">${icon}</span>`;

    // 更新确认按钮颜色
    okBtn.className = `flex-1 px-4 py-3 bg-${confirmColor}-500 text-white rounded-xl font-bold hover:bg-${confirmColor}-600 transition-colors flex items-center justify-center gap-2`;

    return new Promise((resolve) => {
        // 显示弹窗
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        // 动画效果
        requestAnimationFrame(() => {
            overlay.classList.add('opacity-100');
            dialog.classList.remove('scale-95', 'opacity-0');
            dialog.classList.add('scale-100', 'opacity-100');
        });

        // 关闭弹窗函数
        const closeModal = (result) => {
            dialog.classList.remove('scale-100', 'opacity-100');
            dialog.classList.add('scale-95', 'opacity-0');
            overlay.classList.remove('opacity-100');

            setTimeout(() => {
                modal.classList.remove('flex');
                modal.classList.add('hidden');
                resolve(result);
            }, 200);

            // 清理事件监听
            cancelBtn.removeEventListener('click', handleCancel);
            okBtn.removeEventListener('click', handleOk);
            overlay.removeEventListener('click', handleOverlayClick);
            document.removeEventListener('keydown', handleKeydown);
        };

        // 事件处理
        const handleCancel = () => closeModal(false);
        const handleOk = () => closeModal(true);
        const handleOverlayClick = () => closeModal(false);
        const handleKeydown = (e) => {
            if (e.key === 'Escape') closeModal(false);
            if (e.key === 'Enter') closeModal(true);
        };

        // 绑定事件
        cancelBtn.addEventListener('click', handleCancel);
        okBtn.addEventListener('click', handleOk);
        overlay.addEventListener('click', handleOverlayClick);
        document.addEventListener('keydown', handleKeydown);
    });
}

async function handleCancelTask() {
    const confirmed = await showConfirmModal({
        title: '确认取消任务？',
        message: '取消后任务将被关闭，此操作无法撤销。',
        icon: 'warning',
        iconColor: 'red',
        cancelText: '再想想',
        confirmText: '确认取消',
        confirmColor: 'red'
    });

    if (!confirmed) return;

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
        renderActionButtons();
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
        const res = await api('/api/secondme/profile');
        const profile = res?.data || {};
        state.secondMeConnected = !!profile.connected;
        state.me = profile?.profile?.data || null;
        state.meWorker = profile?.worker || null;
        state.abilities = [];

        // 如果已登录，加载劳务体能力
        if (state.me) {
            try {
                const workerRes = await api('/api/me/labor-body');
                const payload = workerRes?.data || {};
                state.meWorker = payload.worker || state.meWorker;
                state.abilities = payload.abilities || [];
            } catch {
                // 忽略错误
            }
        }

        renderLoginState();
    } catch {
        state.secondMeConnected = false;
        state.me = null;
        state.meWorker = null;
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

    // 重新渲染操作按钮（因为登录状态可能影响权限）
    renderActionButtons();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
