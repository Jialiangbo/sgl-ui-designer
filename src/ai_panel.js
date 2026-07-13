// ============ SGL UI Designer - AI 助手面板 ============
// 聊天式交互界面，支持多轮对话、流式响应、截图输入
import { AppState, showToast, escapeHtml } from './app.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createWidgetDefaults } from './sgl_api.js';
import {
  buildSystemPrompt, buildGeneratePrompt, buildModifyPrompt, buildPartialModifyPrompt,
  buildAnalyzePrompt, buildExplainCodePrompt, buildImageToLayoutPrompt,
  serializeWidgetsForAI, parseAndValidateAIResponse
} from './llm/llm_prompts.js';
import { PROVIDER_PRESETS, DEFAULT_LLM_CONFIG } from './llm/llm_config.js';

// ============ 配置管理 ============

const LLM_CONFIG_KEY = 'sgl_llm_config_cache';

/** 加载 AI 配置（优先从 Rust 后端文件读取，fallback 到 localStorage 缓存） */
export async function loadLlmConfig() {
  try {
    const config = await invoke('load_llm_config');
    if (config && config.api_key) {
      localStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(config));
      return config;
    }
  } catch (e) {
    console.warn('load_llm_config from Rust failed:', e);
  }
  // fallback
  try {
    const cached = localStorage.getItem(LLM_CONFIG_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}
  return { ...DEFAULT_LLM_CONFIG };
}

/** 保存 AI 配置到 Rust 后端 + 本地缓存 */
export async function saveLlmConfig(config) {
  localStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(config));
  try {
    await invoke('save_llm_config', { config });
  } catch (e) {
    console.warn('save_llm_config to Rust failed:', e);
  }
}

// ============ AI 面板 UI ============

let _panelEl = null;
let _messagesEl = null;
let _inputEl = null;
let _sendBtn = null;
let _fileInput = null;
let _pendingImage = null; // base64 截图数据
let _chatHistory = [];     // 多轮对话消息历史
let _isStreaming = false;
let _currentConfig = null;
let _lastProjectPath = null; // 跟踪当前项目路径，用于检测项目切换
let _partialModifyMode = false; // 当前是否为局部修改模式
let _partialSelectedIds = [];   // 局部修改模式下选中的控件ID

/**
 * 初始化 AI 面板（在编辑器页面调用）
 */
export function initAIPanel() {
  console.log('[AI] initAIPanel 开始');
  // 防止重复初始化
  if (document.getElementById('ai-panel')) {
    console.warn('[AI] AI 面板已存在，跳过重复初始化');
    return;
  }
  // 创建浮动面板 DOM
  _panelEl = document.createElement('div');
  _panelEl.className = 'ai-panel';
  _panelEl.id = 'ai-panel';
  _panelEl.innerHTML = `
    <div class="ai-panel-header" id="ai-panel-header">
      <span class="ai-panel-title">🤖 AI 助手</span>
      <div class="ai-panel-header-actions">
        <button class="ai-btn ai-btn-icon" id="ai-btn-clear" title="清空对话">🗑</button>
        <button class="ai-btn ai-btn-icon" id="ai-btn-minimize" title="最小化">−</button>
      </div>
    </div>
    <div class="ai-panel-body" id="ai-panel-body">
      <div class="ai-messages" id="ai-messages">
        <div class="ai-welcome">
          <p>👋 你好！我是 SGL UI 设计助手。</p>
          <p>你可以：</p>
          <ul>
            <li>描述想要的界面，我来生成布局</li>
            <li>让我优化当前页面的布局</li>
            <li>📎 粘贴截图/草图，我来还原</li>
          </ul>
          <div class="ai-quick-actions">
            <button class="ai-quick-btn" data-action="generate">生成布局</button>
            <button class="ai-quick-btn" data-action="optimize">优化布局</button>
            <button class="ai-quick-btn" data-action="analyze">分析建议</button>
            <button class="ai-quick-btn" data-action="explain">解释代码</button>
          </div>
        </div>
      </div>
    </div>
    <div class="ai-panel-footer">
      <div class="ai-image-preview" id="ai-image-preview" style="display:none;">
        <img id="ai-preview-img" />
        <button class="ai-btn ai-btn-remove-img" id="ai-btn-remove-img">✕</button>
      </div>
      <div class="ai-input-row">
        <button class="ai-btn ai-btn-attach" id="ai-btn-attach" title="粘贴或上传图片">📎</button>
        <input type="file" id="ai-file-input" accept="image/*" style="display:none;" />
        <input type="text" class="ai-input" id="ai-input" placeholder="描述你想要的界面..." autocomplete="off" />
        <button class="ai-btn ai-btn-send" id="ai-btn-send" title="发送">➤</button>
      </div>
    </div>
  `;
  document.body.appendChild(_panelEl);

  // 创建触发按钮（编辑器右下角）
  const triggerBtn = document.createElement('button');
  triggerBtn.className = 'ai-trigger-btn';
  triggerBtn.id = 'ai-trigger-btn';
  triggerBtn.innerHTML = '🤖';
  triggerBtn.title = 'AI 助手';
  triggerBtn.addEventListener('click', togglePanel);
  document.body.appendChild(triggerBtn);

  // 绑定事件
  _messagesEl = document.getElementById('ai-messages');
  _inputEl = document.getElementById('ai-input');
  _sendBtn = document.getElementById('ai-btn-send');
  _fileInput = document.getElementById('ai-file-input');

  _sendBtn.addEventListener('click', handleSend);
  _inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  document.getElementById('ai-btn-clear').addEventListener('click', clearChat);
  document.getElementById('ai-btn-minimize').addEventListener('click', () => togglePanel(false));
  document.getElementById('ai-btn-attach').addEventListener('click', () => _fileInput.click());
  document.getElementById('ai-btn-remove-img').addEventListener('click', removePendingImage);

  _fileInput.addEventListener('change', handleFileSelect);

  // 粘贴图片支持
  _inputEl.addEventListener('paste', handlePaste);

  // 快捷按钮
  document.querySelectorAll('.ai-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => handleQuickAction(btn.dataset.action));
  });

  // 面板拖拽
  makeDraggable(_panelEl, document.getElementById('ai-panel-header'));

  // 预加载配置
  loadLlmConfig().then(cfg => { _currentConfig = cfg; });

  // 加载当前项目的对话历史
  loadHistoryFromProject();

  // 监听 AppState 变化，检测项目切换
  AppState.subscribe(() => {
    const currentPath = AppState.projectPath;
    if (currentPath !== _lastProjectPath) {
      // 项目切换了：先保存旧项目的历史（已在 saveHistoryToProject 中实时更新）
      // 然后加载新项目的历史并重建 UI
      _lastProjectPath = currentPath;
      loadHistoryFromProject();
      rebuildMessagesUI();
    }
  });

  // 监听流式事件
  listen('llm-chunk', (event) => handleStreamChunk(event.payload));
  listen('llm-reasoning', (event) => handleStreamReasoning(event.payload));
  listen('llm-done', (event) => handleStreamDone(event.payload));
  listen('llm-error', (event) => handleStreamError(event.payload));
}

// ============ 面板控制 ============

let _panelVisible = false;

function togglePanel(force) {
  _panelVisible = force !== undefined ? force : !_panelVisible;
  _panelEl.style.display = _panelVisible ? 'flex' : 'none';
  if (_panelVisible) _inputEl.focus();
}

// ============ 快捷操作 ============

function handleQuickAction(action) {
  const project = AppState.project;
  const page = AppState.getCurrentPage();
  if (!page) {
    showToast('请先选择一个页面', 'error');
    return;
  }

  switch (action) {
    case 'generate':
      _inputEl.value = '';
      _inputEl.placeholder = '描述你想生成的界面，如"智能家居控制面板"...';
      _inputEl.focus();
      break;
    case 'optimize':
      if (page.widgets.length === 0) {
        showToast('当前页面没有控件，无法优化', 'error');
        return;
      }
      _inputEl.value = '请优化当前页面的布局，改善间距、对齐和视觉层次';
      _inputEl.focus();
      break;
    case 'analyze':
      if (page.widgets.length === 0) {
        showToast('当前页面没有控件', 'error');
        return;
      }
      sendMessage('analyze');
      break;
    case 'explain':
      sendMessage('explain');
      break;
  }
}

// ============ 消息发送 ============

async function handleSend() {
  console.log('[AI] handleSend 触发');
  const text = _inputEl.value.trim();
  console.log('[AI] 输入内容:', text, '图片:', !!_pendingImage, 'streaming:', _isStreaming);
  if (!text && !_pendingImage) return;
  if (_isStreaming) return;

  // 清空输入
  _inputEl.value = '';
  _inputEl.placeholder = '描述你想要的界面...';

  try {
    await sendMessage('chat', text);
  } catch (e) {
    console.error('[AI] sendMessage 异常:', e);
    _isStreaming = false;
    _sendBtn.disabled = false;
    _sendBtn.textContent = '➤';
    addMessage('assistant', `❌ 发送失败: ${e}`, 'error');
  }
}

/**
 * 发送消息给 LLM
 * @param {'chat'|'analyze'|'explain'} mode
 * @param {string} [userText]
 */
async function sendMessage(mode, userText) {
  console.log('[AI] sendMessage 开始, mode:', mode, 'userText:', userText);
  const config = _currentConfig || await loadLlmConfig();
  console.log('[AI] 配置:', { provider: config.provider, base_url: config.base_url, model: config.model, hasKey: !!config.api_key });
  if (!config.api_key) {
    addMessage('assistant', '⚠️ API Key 未配置。请在 AI 配置中填写 API Key 后再使用。', 'error');
    return;
  }
  if (!config.base_url) {
    addMessage('assistant', '⚠️ API 地址未配置。请选择 Provider 或手动填写 Base URL。', 'error');
    return;
  }

  const project = AppState.project;
  const page = AppState.getCurrentPage();
  const sw = project.screen_width || 480;
  const sh = project.screen_height || 320;

  let userPrompt = '';
  let imageBase64 = null;
  let isPartialModify = false; // 是否为局部修改模式（只改选中控件）

  if (mode === 'analyze' && page) {
    const slim = serializeWidgetsForAI(page.widgets);
    userPrompt = `屏幕尺寸：${sw} x ${sh} px\n\n当前页面控件列表（JSON）：\n${JSON.stringify(slim, null, 2)}\n\n请分析这个界面布局，指出可以改进的地方（配色、间距、层次感等），并给出具体建议。`;
  } else if (mode === 'explain') {
    const code = AppState.generateCode();
    userPrompt = buildExplainCodePrompt(code);
  } else {
    // 普通聊天模式
    if (!userText) return;

    const page0 = page;
    const hasWidgets = page0 && page0.widgets.length > 0;

    // 检查是否有选中的控件（局部修改模式）
    const selectedIds = AppState.selectedWidgetIds ? [...AppState.selectedWidgetIds] : [];
    const hasSelection = selectedIds.length > 0;
    const selectedWidgets = hasSelection && page0
      ? page0.widgets.filter(w => selectedIds.includes(w.id))
      : [];

    // 判断意图：是修改现有布局还是全新生成
    const modifyKeywords = ['修改', '改一下', '调整', '优化', '改变', '移动', '删除', '去掉', '替换', '换成', '增大', '缩小', '改大', '改小', '加一个', '添加', '移除'];
    const isModify = hasWidgets && modifyKeywords.some(kw => userText.includes(kw));

    if (_pendingImage) {
      imageBase64 = _pendingImage;
      userPrompt = buildImageToLayoutPrompt(sw, sh, userText);
      removePendingImage();
    } else if (hasSelection && selectedWidgets.length > 0 && (isModify || userText.length > 0)) {
      // 局部修改模式：有选中控件时，默认只修改选中的
      isPartialModify = true;
      _partialModifyMode = true;
      _partialSelectedIds = selectedIds.slice();
      const allSlim = serializeWidgetsForAI(page0.widgets);
      const selectedSlim = serializeWidgetsForAI(selectedWidgets);
      userPrompt = buildPartialModifyPrompt(sw, sh, allSlim, selectedSlim, userText);
    } else if (isModify) {
      _partialModifyMode = false;
      _partialSelectedIds = [];
      const slim = serializeWidgetsForAI(page0.widgets);
      userPrompt = buildModifyPrompt(sw, sh, slim, userText);
    } else {
      _partialModifyMode = false;
      _partialSelectedIds = [];
      userPrompt = buildGeneratePrompt(sw, sh, userText);
    }
  }

  // 显示用户消息（带模式标签）
  const userDisplayText = userText || (mode === 'analyze' ? '分析当前布局' : '解释生成的代码');
  const modeLabel = isPartialModify ? '<span class="ai-mode-tag">局部修改</span>' : '';
  addMessage('user', userDisplayText, null, modeLabel);

  // 构建消息历史
  const systemMsg = { role: 'system', content: buildSystemPrompt() };

  // 构建本次用户消息（用于发送）
  let userMsgForSend;
  if (imageBase64) {
    userMsgForSend = {
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}`, detail: 'high' } }
      ]
    };
  } else {
    userMsgForSend = { role: 'user', content: userPrompt };
  }

  // 构建存入历史的消息（总是纯文本，避免图片数据导致 Token 爆炸）
  const userMsgForHistory = { role: 'user', content: userPrompt };

  // 多轮对话：保持历史（限制最近 10 轮 = 20 条消息）
  _chatHistory.push(userMsgForHistory);
  const maxHistory = 20;
  if (_chatHistory.length > maxHistory) {
    _chatHistory = _chatHistory.slice(-maxHistory);
  }

  // 发送用的消息：系统消息 + 历史 + 当前消息（带图）
  // 注意：历史中不带图，只有当前这轮带图，避免图片数据重复占用 Token
  const messages = [systemMsg, ..._chatHistory.slice(0, -1), userMsgForSend];

  // 调用 LLM（使用流式）
  _isStreaming = true;
  _sendBtn.disabled = true;
  _sendBtn.textContent = '⏳';

  // 添加 AI 消息占位
  const aiMsgEl = addMessage('assistant', '', 'streaming');

  // 超时保护：如果 60 秒内没有收到 done/error 事件，自动重置
  _streamTimeoutHandle = setTimeout(() => {
    if (_isStreaming) {
      console.warn('[AI] 流式响应超时');
      handleStreamError('响应超时（60秒），请检查网络或 API 配置');
    }
  }, 60000);

  try {
    console.log('[AI] 调用 llm_stream_chat, 消息数:', messages.length);
    await invoke('llm_stream_chat', { config, messages });
    // 流式结果通过事件推送，在 handleStreamChunk/Done 中处理
    // invoke 返回后，如果 _isStreaming 仍为 true，说明事件可能未被正确接收
    // 给事件循环一点时间处理待处理的事件
    setTimeout(() => {
      if (_isStreaming) {
        // 事件未被正确接收，手动处理
        if (_streamTimeoutHandle) clearTimeout(_streamTimeoutHandle);
        if (_streamBuffer) {
          // 有内容但没收到 done 事件，手动完成
          handleStreamDone(null);
        } else {
          // 完全没有收到任何事件，尝试非流式调用
          invoke('llm_chat', { config, messages }).then(result => {
            const content = result.content || '';
            updateStreamingMessage(aiMsgEl, content);
            finalizeAIResponse(content);
          }).catch(e2 => {
            updateStreamingMessage(aiMsgEl, `❌ 调用失败: ${e2}`, 'error');
            _isStreaming = false;
            _sendBtn.disabled = false;
            _sendBtn.textContent = '➤';
          });
        }
      }
    }, 500);
  } catch (e) {
    if (_streamTimeoutHandle) clearTimeout(_streamTimeoutHandle);
    console.warn('[AI] 流式调用失败，尝试非流式:', e);
    // 流式失败，尝试非流式 fallback
    try {
      const result = await invoke('llm_chat', { config, messages });
      const content = result.content || '';
      updateStreamingMessage(aiMsgEl, content);
      finalizeAIResponse(content);
    } catch (e2) {
      updateStreamingMessage(aiMsgEl, `❌ 调用失败: ${e2}`, 'error');
      _isStreaming = false;
      _sendBtn.disabled = false;
      _sendBtn.textContent = '➤';
    }
  }
}

// ============ 流式响应处理 ============

let _streamBuffer = '';
let _reasoningBuffer = '';  // 思考过程缓冲
let _streamMsgEl = null;
let _streamTimeoutHandle = null; // 超时定时器句柄

function handleStreamChunk(text) {
  _streamBuffer += text;
  // 找到最后一条 streaming 消息并更新
  const msgs = _messagesEl.querySelectorAll('.ai-msg.assistant');
  const lastMsg = msgs[msgs.length - 1];
  if (lastMsg) {
    _streamMsgEl = lastMsg;
    updateStreamingMessage(lastMsg, _streamBuffer, _reasoningBuffer);
  }
}

function handleStreamReasoning(text) {
  _reasoningBuffer += text;
  // 更新 UI 显示思考过程
  const msgs = _messagesEl.querySelectorAll('.ai-msg.assistant');
  const lastMsg = msgs[msgs.length - 1];
  if (lastMsg) {
    _streamMsgEl = lastMsg;
    updateStreamingMessage(lastMsg, _streamBuffer, _reasoningBuffer);
  }
}

function handleStreamDone(payload) {
  if (_streamTimeoutHandle) { clearTimeout(_streamTimeoutHandle); _streamTimeoutHandle = null; }
  const content = _streamBuffer;
  const reasoning = _reasoningBuffer;
  _streamBuffer = '';
  _reasoningBuffer = '';
  finalizeAIResponse(content, reasoning);

  // 显示 Token 使用量
  if (payload && payload.usage) {
    const usageEl = document.createElement('div');
    usageEl.className = 'ai-usage-info';
    usageEl.textContent = `Token: ${payload.usage.prompt_tokens} + ${payload.usage.completion_tokens} = ${payload.usage.total_tokens}`;
    _messagesEl.appendChild(usageEl);
  }
}

function handleStreamError(error) {
  if (_streamTimeoutHandle) { clearTimeout(_streamTimeoutHandle); _streamTimeoutHandle = null; }
  _streamBuffer = '';
  _reasoningBuffer = '';
  const msgs = _messagesEl.querySelectorAll('.ai-msg.assistant');
  const lastMsg = msgs[msgs.length - 1];
  if (lastMsg) {
    updateStreamingMessage(lastMsg, `❌ ${error}`, 'error');
  }
  _isStreaming = false;
  _sendBtn.disabled = false;
  _sendBtn.textContent = '➤';
}

function finalizeAIResponse(content, reasoning) {
  // 将 AI 响应加入对话历史
  _chatHistory.push({ role: 'assistant', content });

  // 保存到项目（项目隔离）
  saveHistoryToProject();

  // 尝试解析 JSON 控件布局
  const result = parseAndValidateAIResponse(content, AppState.project.screen_width, AppState.project.screen_height);

  const msgs = _messagesEl.querySelectorAll('.ai-msg.assistant');
  const lastMsg = msgs[msgs.length - 1];

  // 构建思考过程 HTML（如果有）
  const reasoningHtml = (reasoning && reasoning.length > 0)
    ? `<details class="ai-reasoning-block"><summary class="ai-reasoning-header">💭 思考过程 (已完成)</summary><div class="ai-reasoning-content">${formatReasoningText(reasoning)}</div></details>`
    : '';

  if (result.valid && result.widgets.length > 0) {
    // 显示控件摘要 + 操作按钮
    const summary = summarizeWidgets(result.widgets);
    if (lastMsg) {
      const contentEl = lastMsg.querySelector('.ai-msg-content');
      if (contentEl) {
        let actionButtons = '';
        if (_partialModifyMode) {
          // 局部修改模式：只更新选中的控件
          actionButtons = `
            <button class="ai-btn ai-btn-apply" data-action="apply-partial-update">✅ 更新选中控件 (${result.widgets.length}个)</button>
            <button class="ai-btn ai-btn-preview-json" data-action="preview-json">📋 查看 JSON</button>
          `;
        } else {
          actionButtons = `
            <button class="ai-btn ai-btn-apply" data-action="apply">✅ 应用到页面</button>
            <button class="ai-btn ai-btn-append" data-action="append">➕ 追加到页面</button>
            <button class="ai-btn ai-btn-preview-json" data-action="preview-json">📋 查看 JSON</button>
          `;
        }
        contentEl.innerHTML = reasoningHtml + `
          <div class="ai-result-summary">
            <div class="ai-result-title">✅ ${_partialModifyMode ? '已生成修改方案' : '已生成 ' + result.widgets.length + ' 个控件'}：</div>
            <div class="ai-result-detail">${summary}</div>
          </div>
          <div class="ai-result-actions">
            ${actionButtons}
          </div>
        `;
        // 绑定操作按钮
        if (_partialModifyMode) {
          contentEl.querySelector('[data-action="apply-partial-update"]').addEventListener('click', () => applyAIWidgets(result.widgets, 'partial-update'));
        } else {
          contentEl.querySelector('[data-action="apply"]').addEventListener('click', () => applyAIWidgets(result.widgets, 'replace'));
          contentEl.querySelector('[data-action="append"]').addEventListener('click', () => applyAIWidgets(result.widgets, 'append'));
        }
        contentEl.querySelector('[data-action="preview-json"]').addEventListener('click', () => showJsonPreview(result.widgets));
      }
    }
  } else if (result.errors && result.errors.length > 0) {
    // 有校验错误
    if (lastMsg) {
      const contentEl = lastMsg.querySelector('.ai-msg-content');
      if (contentEl) {
        const errHtml = result.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('');
        contentEl.innerHTML = reasoningHtml + `<div class="ai-response-content">${formatMessageText(content)}</div>` +
          `<div class="ai-result-errors"><strong>⚠️ 校验警告：</strong><ul>${errHtml}</ul></div>`;
        if (result.widgets && result.widgets.length > 0) {
          const action = _partialModifyMode ? 'apply-partial-update' : 'apply-partial';
          const label = _partialModifyMode
            ? `⚠️ 更新有效选中控件 (${result.widgets.length}个)`
            : `⚠️ 应用有效控件 (${result.widgets.length}个)`;
          contentEl.innerHTML += `
            <div class="ai-result-actions">
              <button class="ai-btn ai-btn-apply" data-action="${action}">${label}</button>
            </div>
          `;
          contentEl.querySelector(`[data-action="${action}"]`).addEventListener('click', () =>
            applyAIWidgets(result.widgets, _partialModifyMode ? 'partial-update' : 'replace')
          );
        }
      }
    }
  }
  // 否则是纯文本回复（分析/解释）— 保留思考过程 + 正式内容
  else {
    if (lastMsg && reasoningHtml) {
      const contentEl = lastMsg.querySelector('.ai-msg-content');
      if (contentEl) {
        contentEl.innerHTML = reasoningHtml + `<div class="ai-response-content">${formatMessageText(content)}</div>`;
      }
    }
  }
  // 否则是纯文本回复（分析/解释），已在流式中显示完毕

  _isStreaming = false;
  _sendBtn.disabled = false;
  _sendBtn.textContent = '➤';
  scrollMessagesToBottom();
}

// ============ 应用 AI 生成的控件 ============

function applyAIWidgets(widgets, mode) {
  const page = AppState.getCurrentPage();
  if (!page) {
    showToast('请先选择一个页面', 'error');
    return;
  }

  if (mode === 'replace') {
    // 替换：清空当前页面控件
    page.widgets = [];
  }

  if (mode === 'partial-update') {
    // 局部更新：根据 id 匹配并更新选中的控件
    let updatedCount = 0;
    widgets.forEach(w => {
      const idx = page.widgets.findIndex(pw => pw.id === w.id);
      if (idx !== -1) {
        // 保留原有控件的内部状态，只更新属性
        const original = page.widgets[idx];
        const merged = { ...original, ...w };
        page.widgets[idx] = merged;
        updatedCount++;
      }
    });
    AppState.notify();
    showToast(`已更新 ${updatedCount} 个控件`, 'success');
    return;
  }

  // 添加控件（合并默认属性）
  widgets.forEach(w => {
    const defaults = createWidgetDefaults(w.type);
    if (defaults) {
      // 先填充默认值，再用 AI 的值覆盖
      const merged = { ...defaults, ...w };
      page.widgets.push(merged);
    } else {
      page.widgets.push(w);
    }
  });

  AppState.selectedWidgetIds.clear();
  AppState.notify();
  showToast(`已${mode === 'replace' ? '替换' : '追加'} ${widgets.length} 个控件`, 'success');
}

// ============ UI 辅助函数 ============

function addMessage(role, text, extraClass, prefixHtml) {
  // 移除欢迎消息
  const welcome = _messagesEl.querySelector('.ai-welcome');
  if (welcome) welcome.remove();

  const msgEl = document.createElement('div');
  msgEl.className = `ai-msg ${role}${extraClass ? ' ' + extraClass : ''}`;
  const contentHtml = text ? formatMessageText(text) : '<span class="ai-typing">...</span>';
  msgEl.innerHTML = `<div class="ai-msg-content">${prefixHtml || ''}${contentHtml}</div>`;
  _messagesEl.appendChild(msgEl);
  scrollMessagesToBottom();
  return msgEl;
}

function updateStreamingMessage(msgEl, text, reasoning) {
  const contentEl = msgEl.querySelector('.ai-msg-content');
  if (contentEl) {
    let html = '';
    // 显示思考过程（可折叠）
    if (reasoning && reasoning.length > 0) {
      html += `<details class="ai-reasoning-block" open>
        <summary class="ai-reasoning-header">💭 思考过程${text ? ' (已完成)' : '...'}</summary>
        <div class="ai-reasoning-content">${formatReasoningText(reasoning)}</div>
      </details>`;
    } else if (!text) {
      html += `<div class="ai-reasoning-indicator">💭 思考中<span class="ai-typing">...</span></div>`;
    }
    // 显示正式内容
    if (text) {
      html += `<div class="ai-response-content">${formatMessageText(text)}</div>`;
    }
    contentEl.innerHTML = html;
  }
  scrollMessagesToBottom();
}

function formatReasoningText(text) {
  let html = escapeHtml(text);
  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="ai-code-block"><code>$2</code></pre>');
  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
  // 换行
  html = html.replace(/\n/g, '<br>');
  return html;
}

function formatMessageText(text) {
  // 简单的 Markdown 格式化
  let html = escapeHtml(text);
  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="ai-code-block"><code>$2</code></pre>');
  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
  // 加粗
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // 换行
  html = html.replace(/\n/g, '<br>');
  return html;
}

function scrollMessagesToBottom() {
  if (_messagesEl) {
    _messagesEl.scrollTop = _messagesEl.scrollHeight;
  }
}

function clearChat() {
  _chatHistory = [];
  _streamBuffer = '';
  saveHistoryToProject(); // 清空项目中的历史
  _messagesEl.innerHTML = `
    <div class="ai-welcome">
      <p>👋 对话已清空，重新开始吧！</p>
      <div class="ai-quick-actions">
        <button class="ai-quick-btn" data-action="generate">生成布局</button>
        <button class="ai-quick-btn" data-action="optimize">优化布局</button>
        <button class="ai-quick-btn" data-action="analyze">分析建议</button>
        <button class="ai-quick-btn" data-action="explain">解释代码</button>
      </div>
    </div>
  `;
  document.querySelectorAll('.ai-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => handleQuickAction(btn.dataset.action));
  });
}

function summarizeWidgets(widgets) {
  const counts = {};
  widgets.forEach(w => { counts[w.type] = (counts[w.type] || 0) + 1; });
  return Object.entries(counts)
    .map(([type, count]) => `<span class="ai-widget-count">${type} × ${count}</span>`)
    .join(' ');
}

function showJsonPreview(widgets) {
  const json = JSON.stringify(widgets, null, 2);
  const modal = document.createElement('div');
  modal.className = 'ai-json-modal-overlay';
  modal.innerHTML = `
    <div class="ai-json-modal">
      <div class="ai-json-modal-header">
        <span>控件 JSON 预览</span>
        <button class="ai-btn ai-btn-icon" id="ai-close-json-modal">✕</button>
      </div>
      <pre class="ai-json-content">${escapeHtml(json)}</pre>
      <div class="ai-json-modal-footer">
        <button class="ai-btn" id="ai-copy-json">📋 复制</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('ai-close-json-modal').addEventListener('click', () => modal.remove());
  document.getElementById('ai-copy-json').addEventListener('click', async () => {
    await navigator.clipboard.writeText(json);
    showToast('JSON 已复制', 'success');
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ============ 项目级对话历史管理 ============

/** 从当前项目加载 AI 对话历史 */
function loadHistoryFromProject() {
  const project = AppState.project;
  _lastProjectPath = AppState.projectPath;
  if (project && Array.isArray(project.ai_chat_history)) {
    _chatHistory = project.ai_chat_history.slice();
  } else {
    _chatHistory = [];
  }
}

/** 将当前对话历史保存到项目（随项目文件一起保存，实现项目间隔离） */
function saveHistoryToProject() {
  const project = AppState.project;
  if (!project) return;
  if (_chatHistory.length > 0) {
    project.ai_chat_history = _chatHistory.slice();
  } else {
    delete project.ai_chat_history;
  }
}

/** 根据 _chatHistory 重建消息 UI（项目切换时调用） */
function rebuildMessagesUI() {
  if (!_messagesEl) return;
  _messagesEl.innerHTML = '';

  if (_chatHistory.length === 0) {
    _messagesEl.innerHTML = `
      <div class="ai-welcome">
        <p>👋 你好！我是 SGL UI 设计助手。</p>
        <p>你可以：</p>
        <ul>
          <li>描述想要的界面，我来生成布局</li>
          <li>让我优化当前页面的布局</li>
          <li>📎 粘贴截图/草图，我来还原</li>
        </ul>
        <div class="ai-quick-actions">
          <button class="ai-quick-btn" data-action="generate">生成布局</button>
          <button class="ai-quick-btn" data-action="optimize">优化布局</button>
          <button class="ai-quick-btn" data-action="analyze">分析建议</button>
          <button class="ai-quick-btn" data-action="explain">解释代码</button>
        </div>
      </div>
    `;
    _messagesEl.querySelectorAll('.ai-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => handleQuickAction(btn.dataset.action));
    });
    return;
  }

  // 重建历史消息
  for (const msg of _chatHistory) {
    const role = msg.role === 'user' ? 'user' : 'assistant';
    let text = '';
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      // 多模态消息（带图片）：只取文本部分显示
      const textPart = msg.content.find(p => p.type === 'text');
      text = textPart ? textPart.text : '[图片消息]';
    }
    const msgEl = document.createElement('div');
    msgEl.className = `ai-msg ${role}`;
    msgEl.innerHTML = `<div class="ai-msg-content">${formatMessageText(text)}</div>`;
    _messagesEl.appendChild(msgEl);
  }
  scrollMessagesToBottom();
}

// ============ 图片输入 ============

function handlePaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) readFileAsBase64(file);
      return;
    }
  }
}

function handleFileSelect(e) {
  const file = e.target.files?.[0];
  if (file) readFileAsBase64(file);
  e.target.value = '';
}

function readFileAsBase64(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    // 提取 base64 部分
    const base64 = dataUrl.split(',')[1];
    _pendingImage = base64;
    // 显示预览
    const previewEl = document.getElementById('ai-image-preview');
    const imgEl = document.getElementById('ai-preview-img');
    imgEl.src = dataUrl;
    previewEl.style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

function removePendingImage() {
  _pendingImage = null;
  document.getElementById('ai-image-preview').style.display = 'none';
}

// ============ 面板拖拽 ============

function makeDraggable(panel, handle) {
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    panel.style.left = (startLeft + dx) + 'px';
    panel.style.top = (startTop + dy) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => { isDragging = false; });
}

// ============ 导出供 Settings 页面使用 ============
export { PROVIDER_PRESETS };
