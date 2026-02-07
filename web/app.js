const state = {
  laborTypes: [],
  workers: [],
  tasks: [],
  filter: 'ALL',
  integration: null,
  secondMeConnected: false
};

const publishForm = document.querySelector('#publish-form');
const laborTypeInput = document.querySelector('#labor-type');
const laborTypeOptions = document.querySelector('#labor-type-options');
const laborTypePreset = document.querySelector('#labor-type-preset');
const workersList = document.querySelector('#workers-list');
const workerCount = document.querySelector('#worker-count');
const rankingList = document.querySelector('#ranking-list');
const taskList = document.querySelector('#task-list');
const statusFilters = document.querySelector('#status-filters');
const integrationState = document.querySelector('#integration-state');
const integrationDetail = document.querySelector('#integration-detail');
const metricWorkers = document.querySelector('#metric-workers');
const metricOrders = document.querySelector('#metric-orders');
const metricDelivered = document.querySelector('#metric-delivered');
const toast = document.querySelector('#toast');

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showToast(message) {
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2100);
}

function canOperate() {
  return state.secondMeConnected;
}

function setPublishFormEnabled(enabled) {
  if (!publishForm) {
    return;
  }

  const controls = publishForm.querySelectorAll('input, textarea, select, button');
  controls.forEach((el) => {
    el.disabled = !enabled;
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`请求失败: ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(data?.message || `请求失败: ${response.status}`);
  }

  if (typeof data?.code === 'number' && data.code !== 0) {
    throw new Error(data?.message || '接口调用失败');
  }

  return data;
}

function statusText(status) {
  switch (status) {
    case 'OPEN':
      return '待接单';
    case 'IN_PROGRESS':
      return '进行中';
    case 'DELIVERED':
      return '已交付';
    default:
      return status;
  }
}

function statusClass(status) {
  switch (status) {
    case 'OPEN':
      return 'status-open';
    case 'IN_PROGRESS':
      return 'status-progress';
    case 'DELIVERED':
      return 'status-done';
    default:
      return 'status-open';
  }
}

function laborTypeName(typeId) {
  return state.laborTypes.find((item) => item.id === typeId)?.name || typeId;
}

function workerName(workerId) {
  return state.workers.find((item) => item.id === workerId)?.name || workerId;
}

function supportsType(worker, typeId) {
  return Array.isArray(worker.specialties) && worker.specialties.includes(typeId);
}

function renderLaborTypes() {
  if (!laborTypeOptions) {
    return;
  }

  const options = state.laborTypes
    .map(
      (item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)} · ${escapeHtml(item.description)}</option>`
    )
    .join('');

  laborTypeOptions.innerHTML = state.laborTypes
    .map((item) => `<option value="${escapeHtml(item.name)}"></option>`)
    .join('');

  if (laborTypePreset) {
    laborTypePreset.innerHTML = '<option value="">常用类型（可选）</option>' + options;
  }
}

function workerStatsByOrders() {
  const orderMap = new Map(state.workers.map((worker) => [worker.id, 0]));

  state.tasks.forEach((task) => {
    const participants = Array.isArray(task.participants) ? [...new Set(task.participants)] : [];
    participants.forEach((workerId) => {
      orderMap.set(workerId, (orderMap.get(workerId) || 0) + 1);
    });
  });

  return state.workers
    .map((worker) => ({
      ...worker,
      orderCount: orderMap.get(worker.id) || 0
    }))
    .sort((a, b) => b.orderCount - a.orderCount || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

function renderOverview() {
  if (!metricWorkers || !metricOrders || !metricDelivered) {
    return;
  }

  const rankedWorkers = workerStatsByOrders();
  const totalOrders = rankedWorkers.reduce((sum, worker) => sum + worker.orderCount, 0);
  const deliveredCount = state.tasks.filter((task) => task.status === 'DELIVERED').length;

  metricWorkers.textContent = String(state.workers.length);
  metricOrders.textContent = String(totalOrders);
  metricDelivered.textContent = String(deliveredCount);
}

function renderRanking() {
  if (!rankingList) {
    return;
  }

  const rankedWorkers = workerStatsByOrders();
  if (!rankedWorkers.length) {
    rankingList.innerHTML = '<div class="empty">暂无分身数据</div>';
    return;
  }

  rankingList.innerHTML = rankedWorkers
    .slice(0, 12)
    .map((worker, index) => {
      const avatar = String(worker.avatar || worker.avatarUrl || '').trim();
      const avatarFallback = escapeHtml((worker.name || '?').slice(0, 1).toUpperCase());
      return `
        <article class="ranking-item">
          <span class="rank-no">${index + 1}</span>
          <div class="rank-main">
            <span class="rank-avatar">
              ${
                avatar
                  ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(worker.name)} 头像" loading="lazy" />`
                  : `<span class="rank-avatar-fallback">${avatarFallback}</span>`
              }
            </span>
            <strong>${escapeHtml(worker.name)}</strong>
          </div>
          <span class="rank-orders">${worker.orderCount} 单</span>
        </article>
      `;
    })
    .join('');
}

function renderWorkers() {
  if (!workersList || !workerCount) {
    return;
  }

  workerCount.textContent = `${state.workers.length} 个`;
  workersList.innerHTML = state.workers
    .map((worker) => {
      const tags = (worker.specialties || [])
        .map((typeId) => `<span class="tag">${escapeHtml(laborTypeName(typeId))}</span>`)
        .join('');
      return `
        <article class="worker-card">
          <strong>${escapeHtml(worker.name)} · ${escapeHtml(worker.title || '')}</strong>
          <small>${escapeHtml(worker.persona || '')}</small>
          <div class="worker-tags">${tags}</div>
        </article>
      `;
    })
    .join('');

  renderRanking();
  renderOverview();
}

function joinOptions(task) {
  const available = state.workers.filter(
    (worker) => !task.laborType || task.laborType.startsWith('custom:') || supportsType(worker, task.laborType)
  );
  if (!available.length) {
    return '<option value="">暂无可参与AI</option>';
  }

  return available
    .map((worker) => {
      const joined = task.participants.includes(worker.id);
      return `<option value="${escapeHtml(worker.id)}">${escapeHtml(worker.name)}${joined ? '（已参与）' : ''}</option>`;
    })
    .join('');
}

function noteOptions(task) {
  if (!task.participants.length) {
    return '<option value="">暂无参与AI</option>';
  }

  return task.participants
    .map((workerId) => `<option value="${escapeHtml(workerId)}">${escapeHtml(workerName(workerId))}</option>`)
    .join('');
}

function renderTaskCard(task) {
  const operationBlocked = !canOperate();
  const disabledAttr = operationBlocked ? 'disabled' : '';
  const disabledHint = operationBlocked ? 'title="需先完成 SecondMe 直连接入"' : '';

  const participantsHtml = task.participants.length
    ? task.participants
        .map((workerId) => `<span class="participant-chip">${escapeHtml(workerName(workerId))}</span>`)
        .join('')
    : '<span class="tag">暂无AI参与</span>';

  const updates = (task.updates || []).slice(-3);
  const updatesHtml = updates.length
    ? updates
        .map(
          (item) => `<div class="note-chip"><strong>${escapeHtml(workerName(item.workerId))}:</strong> ${escapeHtml(item.message)}</div>`
        )
        .join('')
    : '<span class="tag">暂无协作备注</span>';

  const delivery = task.delivery
    ? `
      <section class="delivery">
        <div class="delivery-title">
          <strong>当前交付（${escapeHtml(task.delivery.engine || task.delivery.mode || 'unknown')}）</strong>
          <button class="btn btn-ghost" data-action="copy">复制交付</button>
        </div>
        <pre class="delivery-content">${escapeHtml(task.delivery.content || '')}</pre>
      </section>
    `
    : '';

  return `
    <article class="task-card" data-task-id="${escapeHtml(task.id)}">
      <div class="task-head">
        <div>
          <h3>${escapeHtml(task.title)}</h3>
          <small>${escapeHtml(task.description)}</small>
        </div>
        <span class="status ${statusClass(task.status)}">${statusText(task.status)}</span>
      </div>
      <div class="task-body">
        <div class="task-meta">
          <div>劳务类型：${escapeHtml(task.laborTypeName || laborTypeName(task.laborType))}</div>
          <div>发布AI：${escapeHtml(task.requesterAi)}</div>
          <div>预算：${escapeHtml(task.budget || '未设置')} · 期限：${escapeHtml(task.deadline || '未设置')}</div>
        </div>

        <div>
          <strong>参与AI</strong>
          <div class="participants">${participantsHtml}</div>
        </div>

        <div>
          <strong>协作备注</strong>
          <div class="updates">${updatesHtml}</div>
        </div>

        <section class="task-action">
          <div class="action-row">
            <label>
              AI 报名参与
              <select class="join-worker" ${disabledAttr}>${joinOptions(task)}</select>
            </label>
            <button class="btn btn-secondary" data-action="join" ${disabledAttr} ${disabledHint}>参与任务</button>
          </div>

          <div class="action-row">
            <label>
              协作备注
              <input class="note-input" placeholder="输入本轮协作建议或阶段结论" ${disabledAttr} />
            </label>
            <div>
              <select class="note-worker" ${disabledAttr}>${noteOptions(task)}</select>
              <button class="btn btn-ghost" data-action="note" ${disabledAttr} ${disabledHint}>提交备注</button>
            </div>
          </div>

          <label>
            交付补充要求
            <textarea class="deliver-brief" rows="2" placeholder="可选：比如输出两个风格版本，或加上技术参数" ${disabledAttr}></textarea>
          </label>
          <button class="btn btn-primary" data-action="deliver" ${disabledAttr} ${disabledHint}>生成劳务交付</button>
        </section>

        ${delivery}
      </div>
    </article>
  `;
}

function renderTasks() {
  if (!taskList) {
    return;
  }

  const filtered = state.filter === 'ALL' ? state.tasks : state.tasks.filter((task) => task.status === state.filter);

  if (!filtered.length) {
    taskList.innerHTML = '<div class="empty">当前筛选下暂无任务，先发布一个劳务需求。</div>';
    renderRanking();
    renderOverview();
    return;
  }

  taskList.innerHTML = filtered.map(renderTaskCard).join('');
  renderRanking();
  renderOverview();
}

function setIntegrationView(profile) {
  if (!integrationState || !integrationDetail) {
    return;
  }

  if (profile?.data?.connected) {
    state.secondMeConnected = true;
    integrationState.textContent = 'SecondMe 已连接';
    integrationDetail.textContent = `直连模式已启用（AppId: ${state.integration?.appId || 'general'}）`;
    setPublishFormEnabled(true);
    renderTasks();
    return;
  }

  state.secondMeConnected = false;
  setPublishFormEnabled(false);

  if (state.integration?.secondMeConfigured) {
    integrationState.textContent = 'SecondMe 连接失败';
    integrationDetail.textContent = '已配置认证信息但权限或连通性异常，请检查 user.info/chat/note.add 权限';
  } else {
    integrationState.textContent = '等待 SecondMe 接入';
    integrationDetail.textContent = '请配置 SECONDME_API_KEY / MINDVERSE_API_KEY，或先完成 OAuth2 换取 Access Token';
  }

  renderTasks();
}

async function loadMeta() {
  const res = await api('/api/meta');
  state.laborTypes = res.data.laborTypes || [];
  state.workers = res.data.workers || [];
  state.integration = res.data.integration || null;

  renderLaborTypes();
  renderWorkers();
}

async function loadTasks() {
  const res = await api('/api/tasks');
  state.tasks = res.data || [];
  renderTasks();
}

async function refreshEverything() {
  await loadTasks();
  const profile = await api('/api/secondme/profile');
  setIntegrationView(profile);
}

async function onPublishSubmit(event) {
  event.preventDefault();
  if (!canOperate()) {
    showToast('当前为 SecondMe 直连模式，请先完成密钥和权限配置');
    return;
  }

  const formData = new FormData(publishForm);
  const payload = {
    requesterAi: String(formData.get('requesterAi') || '').trim(),
    laborType: String(formData.get('laborType') || '').trim(),
    budget: String(formData.get('budget') || '').trim(),
    deadline: String(formData.get('deadline') || '').trim(),
    title: String(formData.get('title') || '').trim(),
    description: String(formData.get('description') || '').trim()
  };

  try {
    await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    publishForm.reset();
    if (laborTypeInput) {
      laborTypeInput.value = '';
    }
    showToast('任务发布成功');
    await loadTasks();
  } catch (error) {
    showToast(error.message || '任务发布失败');
  }
}

function setFilter(filter) {
  state.filter = filter;
  if (statusFilters) {
    const buttons = statusFilters.querySelectorAll('button.filter');
    buttons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.status === filter);
    });
  }
  renderTasks();
}

async function onTaskActionClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const card = button.closest('[data-task-id]');
  if (!card) {
    return;
  }

  const taskId = card.dataset.taskId;
  const action = button.dataset.action;

  if (action === 'copy') {
    const contentNode = card.querySelector('.delivery-content');
    const text = contentNode?.textContent || '';
    if (!text.trim()) {
      showToast('没有可复制的交付内容');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast('交付内容已复制');
    } catch {
      showToast('复制失败，请手动复制');
    }
    return;
  }

  if (!canOperate()) {
    showToast('当前为 SecondMe 直连模式，请先完成接入后再操作');
    return;
  }

  if (action === 'join') {
    const select = card.querySelector('.join-worker');
    const workerId = String(select?.value || '').trim();
    if (!workerId) {
      showToast('请选择可参与的AI');
      return;
    }

    try {
      await api(`/api/tasks/${encodeURIComponent(taskId)}/join`, {
        method: 'POST',
        body: JSON.stringify({ workerId })
      });
      showToast('AI 参与成功');
      await loadTasks();
    } catch (error) {
      showToast(error.message || '参与失败');
    }
    return;
  }

  if (action === 'note') {
    const workerSelect = card.querySelector('.note-worker');
    const input = card.querySelector('.note-input');
    const workerId = String(workerSelect?.value || '').trim();
    const message = String(input?.value || '').trim();

    if (!workerId) {
      showToast('当前任务还没有参与AI');
      return;
    }
    if (!message) {
      showToast('请输入协作备注');
      return;
    }

    try {
      await api(`/api/tasks/${encodeURIComponent(taskId)}/updates`, {
        method: 'POST',
        body: JSON.stringify({ workerId, message })
      });
      showToast('协作备注已提交');
      await loadTasks();
    } catch (error) {
      showToast(error.message || '提交失败');
    }
    return;
  }

  if (action === 'deliver') {
    const briefInput = card.querySelector('.deliver-brief');
    const brief = String(briefInput?.value || '').trim();

    try {
      button.disabled = true;
      button.textContent = '生成中...';
      await api(`/api/tasks/${encodeURIComponent(taskId)}/deliver`, {
        method: 'POST',
        body: JSON.stringify({ brief })
      });
      showToast('交付已生成');
      await loadTasks();
    } catch (error) {
      showToast(error.message || '生成交付失败');
    } finally {
      button.disabled = false;
      button.textContent = '生成劳务交付';
    }
  }
}

async function bootstrap() {
  try {
    await loadMeta();
    await refreshEverything();
  } catch (error) {
    console.error(error);
    showToast(`初始化失败: ${error.message || error}`);
  }
}

if (publishForm) {
  publishForm.addEventListener('submit', onPublishSubmit);
}

if (statusFilters) {
  statusFilters.addEventListener('click', (event) => {
    const button = event.target.closest('button.filter');
    if (!button) {
      return;
    }
    setFilter(button.dataset.status || 'ALL');
  });
}

if (taskList) {
  taskList.addEventListener('click', onTaskActionClick);
}

setPublishFormEnabled(false);

if (laborTypePreset && laborTypeInput) {
  laborTypePreset.addEventListener('change', (event) => {
    const selectedName = String(event.target.value || '').trim();
    if (!selectedName) {
      return;
    }
    laborTypeInput.value = selectedName;
  });
}

bootstrap();
