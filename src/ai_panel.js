// ============ SGL UI Designer - AI 助手面板 ============
// 聊天式交互界面，支持多轮对话、流式响应、截图输入
import { AppState, showToast, escapeHtml } from './app.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createWidgetDefaults } from './sgl_api.js';
import {
  buildSystemPrompt, buildGeneratePrompt, buildModifyPrompt,
  buildModifyPropsPrompt, buildAddWidgetsPrompt,
  buildExplainCodePrompt, buildImageToLayoutPrompt,
  serializeWidgetsForAI, parseAndValidateAIResponse, parseAndValidatePropsModification
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

const COMPRESS_CONFIG = {
  FULL_HISTORY_ROUNDS: 4,
  COMPRESS_THRESHOLD: 16,
};

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
let _appendMode = false;        // 当前是否为追加控件模式
let _modifyPropsMode = false;   // 当前是否为属性增量修改模式
let _lastWidgetsSnapshot = null; // 上一次控件快照，用于撤销

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
  // 创建侧边栏面板 DOM
  _panelEl = document.createElement('div');
  _panelEl.className = 'ai-panel';
  _panelEl.id = 'ai-panel';
  _panelEl.innerHTML = `
    <div class="ai-panel-header" id="ai-panel-header">
      <div class="ai-panel-title-row">
        <div class="ai-panel-avatar">🤖</div>
        <div>
          <div class="ai-panel-title">SGL AI 助手</div>
          <div class="ai-panel-subtitle">界面设计智能伙伴</div>
        </div>
      </div>
      <div class="ai-panel-header-actions">
        <button class="ai-btn ai-btn-icon" id="ai-btn-clear" title="清空对话">🗑</button>
        <button class="ai-btn ai-btn-icon" id="ai-btn-close" title="收起">✕</button>
      </div>
    </div>
    <div class="ai-panel-body" id="ai-panel-body">
      <div class="ai-messages" id="ai-messages">
        <div class="ai-welcome">
          <div class="ai-welcome-icon">✨</div>
          <h3>你好，我是 SGL UI 设计助手</h3>
          <p>我可以帮你快速生成和优化界面</p>
          <ul>
            <li>描述想要的界面，我来生成布局</li>
            <li>让我优化当前页面的布局</li>
            <li>📎 粘贴截图/草图，我来还原</li>
          </ul>
          <div class="ai-quick-actions">
            <button class="ai-quick-btn" data-action="generate">✨ 生成布局</button>
            <button class="ai-quick-btn" data-action="optimize">🎨 优化布局</button>
            <button class="ai-quick-btn" data-action="analyze">💡 分析建议</button>
            <button class="ai-quick-btn" data-action="explain">📖 解释代码</button>
          </div>
        </div>
      </div>
    </div>
    <div class="ai-panel-footer">
      <div class="ai-image-preview" id="ai-image-preview" style="display:none;">
        <img id="ai-preview-img" />
        <span class="ai-image-name" id="ai-image-name"></span>
        <button class="ai-btn ai-btn-remove-img" id="ai-btn-remove-img">✕</button>
      </div>
      <div class="ai-input-wrapper">
        <div class="ai-input-suggestions" id="ai-input-suggestions" style="display:none;"></div>
        <div class="ai-input-row">
          <button class="ai-btn ai-btn-attach" id="ai-btn-attach" title="粘贴或上传图片">📎</button>
          <input type="file" id="ai-file-input" accept="image/*" style="display:none;" />
          <input type="text" class="ai-input" id="ai-input" placeholder="描述你想要的界面..." autocomplete="off" />
          <button class="ai-btn ai-btn-send" id="ai-btn-send" title="发送">➤</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(_panelEl);

  // 创建侧边栏触发按钮（右侧垂直 tab）
  const triggerBtn = document.createElement('button');
  triggerBtn.className = 'ai-sidebar-toggle';
  triggerBtn.id = 'ai-sidebar-toggle';
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
  document.getElementById('ai-btn-close').addEventListener('click', () => togglePanel(false));
  document.getElementById('ai-btn-attach').addEventListener('click', () => _fileInput.click());
  document.getElementById('ai-btn-remove-img').addEventListener('click', removePendingImage);

  _fileInput.addEventListener('change', handleFileSelect);

  // 粘贴图片支持
  _inputEl.addEventListener('paste', handlePaste);

  // 拖拽上传图片
  _panelEl.addEventListener('dragover', handleDragOver);
  _panelEl.addEventListener('dragleave', handleDragLeave);
  _panelEl.addEventListener('drop', handleDrop);

  // 快捷按钮
  document.querySelectorAll('.ai-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => handleQuickAction(btn.dataset.action));
  });

  // 输入框快捷建议
  _inputEl.addEventListener('input', handleInputSuggestions);

  // 预加载配置
  loadLlmConfig().then(cfg => { _currentConfig = cfg; });

  // 加载当前项目的对话历史
  loadHistoryFromProject().then(() => rebuildMessagesUI());

  // 监听 AppState 变化，检测项目切换
  AppState.subscribe(async () => {
    const currentPath = AppState.projectPath;
    if (currentPath !== _lastProjectPath) {
      // 项目切换了：先保存旧项目的历史（已在 saveHistoryToProject 中实时更新）
      // 然后加载新项目的历史并重建 UI
      _lastProjectPath = currentPath;
      await loadHistoryFromProject();
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
  _panelEl.classList.toggle('visible', _panelVisible);
  const toggleBtn = document.getElementById('ai-sidebar-toggle');
  if (toggleBtn) {
    toggleBtn.style.display = _panelVisible ? 'none' : 'flex';
  }
  if (_panelVisible) setTimeout(() => _inputEl.focus(), 200);
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

    // 先重置所有模式标志
    _partialModifyMode = false;
    _modifyPropsMode = false;
    _appendMode = false;
    _partialSelectedIds = [];

    const page0 = page;
    const hasWidgets = page0 && page0.widgets.length > 0;

    // 检查是否有选中的控件（局部修改模式）
    const selectedIds = AppState.selectedWidgetIds ? [...AppState.selectedWidgetIds] : [];
    const hasSelection = selectedIds.length > 0;
    const selectedWidgets = hasSelection && page0
      ? page0.widgets.filter(w => selectedIds.includes(w.id))
      : [];

    // 意图分类：基于关键词互斥优先级匹配（add-resources > add-widgets > modify-props > optimize > generate > chat）
    const generateKeywords = ['生成', '创建', '设计', '画一个', '做一个', '界面布局', '帮我画', '帮我设计', '帮我生成', '新建页面', '新页面', '加一个页面'];
    const optimizeKeywords = ['优化布局', '改进布局', '美化布局', '调整布局', '重新布局', '重新排列', '重新设计', '优化', '改进', '美化', '调整', '重新'];
    const addWidgetKeywords = ['加一个', '再加一个', '放一个', '加上', '增加一个', '添加控件', '新增控件', '插入控件', '添加一个', '新增一个'];
    const addResourceKeywords = ['添加字体', '加字体', '添加图片', '加图片', '导入字体', '导入图片', '添加资源', '加资源'];
    const modifyPropKeywords = ['修改', '改一下', '改大', '改小', '改颜色', '改文字', '改字号', '改字体', '改大小', '改位置', '改宽', '改高', '设为', '改成', '换成', '删除', '去掉', '移除'];

    const isAddResources = addResourceKeywords.some(kw => userText.includes(kw));
    const isAddWidgets = !isAddResources && addWidgetKeywords.some(kw => userText.includes(kw));
    const isModifyProps = modifyPropKeywords.some(kw => userText.includes(kw));
    const isOptimize = !isAddResources && !isAddWidgets && !isModifyProps && optimizeKeywords.some(kw => userText.includes(kw));
    const isGenerate = !isAddResources && !isAddWidgets && !isModifyProps && !isOptimize && generateKeywords.some(kw => userText.includes(kw));

    let intent = 'chat';
    if (isAddResources) intent = 'add-resources';
    else if (isAddWidgets) intent = 'add-widgets';
    else if (isModifyProps) intent = 'modify-props';
    else if (isOptimize && hasWidgets) intent = 'optimize';
    else if (isGenerate) intent = 'generate';

    if (_pendingImage) {
      imageBase64 = _pendingImage;
      userPrompt = buildImageToLayoutPrompt(sw, sh, userText);
      removePendingImage();
    } else if (intent === 'modify-props' && hasSelection) {
      // 属性增量修改模式：有选中控件，只修改属性
      isPartialModify = true;
      _partialModifyMode = true;
      _modifyPropsMode = true;
      _appendMode = false;
      _partialSelectedIds = selectedIds.slice();
      const selectedSlim = serializeWidgetsForAI(selectedWidgets);
      userPrompt = buildModifyPropsPrompt(sw, sh, selectedSlim, userText, 'selected');
    } else if (intent === 'modify-props' && hasWidgets) {
      // 属性增量修改模式：无选中控件，修改所有控件的属性（如修改配色）
      isPartialModify = true;
      _partialModifyMode = false;
      _modifyPropsMode = true;
      _appendMode = false;
      _partialSelectedIds = page0.widgets.map(w => w.id);
      const allSlim = serializeWidgetsForAI(page0.widgets);
      userPrompt = buildModifyPropsPrompt(sw, sh, allSlim, userText, 'all');
    } else if (intent === 'add-widgets' && hasWidgets) {
      // 添加控件模式：追加到现有页面
      _partialModifyMode = false;
      _modifyPropsMode = false;
      _appendMode = true;
      _partialSelectedIds = [];
      const slim = serializeWidgetsForAI(page0.widgets);
      userPrompt = buildAddWidgetsPrompt(sw, sh, slim, userText);
    } else if (intent === 'optimize' && hasWidgets) {
      // 优化模式：输出完整布局
      _partialModifyMode = false;
      _modifyPropsMode = false;
      _appendMode = false;
      _partialSelectedIds = [];
      const slim = serializeWidgetsForAI(page0.widgets);
      userPrompt = buildModifyPrompt(sw, sh, slim, userText);
    } else if (intent === 'generate' || intent === 'add-resources' || intent === 'add-widgets') {
      // 生成模式 / 添加资源 / 添加控件（无现有控件时当生成处理）
      _partialModifyMode = false;
      _modifyPropsMode = false;
      _appendMode = false;
      _partialSelectedIds = [];
      userPrompt = buildGeneratePrompt(sw, sh, userText);
    } else {
      // 纯聊天模式：也给系统提示词，让 AI 知道可以输出 JSON 修改参数
      _partialModifyMode = false;
      _modifyPropsMode = false;
      _appendMode = false;
      _partialSelectedIds = [];
      userPrompt = userText;
    }
  }

  // 显示用户消息
  const userDisplayText = userText || (mode === 'analyze' ? '分析当前布局' : '解释生成的代码');
  let modeLabel = '';
  if (_modifyPropsMode) modeLabel = '<span class="ai-mode-tag">属性修改</span>';
  else if (_appendMode) modeLabel = '<span class="ai-mode-tag">添加控件</span>';
  else if (isPartialModify) modeLabel = '<span class="ai-mode-tag">局部修改</span>';
  addMessage('user', userDisplayText, null, modeLabel);

  // 检测用户消息中的本地文件路径（仅在普通聊天模式下检测）
  if (mode === 'chat' && userText) {
    const pathScanned = await detectAndScanPaths(userText);
    if (pathScanned) return;
  }

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

  // 添加用户消息到历史
  _chatHistory.push(userMsgForHistory);

  // 对话历史自动压缩：保留最近 4 轮完整对话，更早的压缩成摘要
  compressChatHistory();

  // 发送用的消息：系统消息 + 压缩后的历史 + 当前消息（带图）
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
  // 先清空 debounce 计时器，立即渲染最后的内容
  if (_streamDebounceTimer) {
    clearTimeout(_streamDebounceTimer);
    _streamDebounceTimer = null;
    // 立即同步渲染一次，避免流式响应末尾的 chunk 因 debounce 未及时显示
    const msgs = _messagesEl.querySelectorAll('.ai-msg.assistant');
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg) {
      const contentEl = lastMsg.querySelector('.ai-msg-content');
      if (contentEl) {
        let html = '';
        if (_reasoningBuffer && _reasoningBuffer.length > 0) {
          html += `<details class="ai-reasoning-block" open>
            <summary class="ai-reasoning-header">💭 思考过程 (已完成)</summary>
            <div class="ai-reasoning-content">${formatReasoningText(_reasoningBuffer)}</div>
          </details>`;
        }
        if (_streamBuffer) {
          html += `<div class="ai-response-content">${formatMessageText(_streamBuffer)}</div>`;
        }
        if (html) contentEl.innerHTML = html;
      }
    }
  }
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

async function finalizeAIResponse(content, reasoning) {
  // 将 AI 响应加入对话历史
  _chatHistory.push({ role: 'assistant', content });

  // 保存到独立文件（项目隔离，不影响项目文件大小）
  await saveHistoryToProject();

  const msgs = _messagesEl.querySelectorAll('.ai-msg.assistant');
  const lastMsg = msgs[msgs.length - 1];

  // 构建思考过程 HTML（如果有）
  const reasoningHtml = (reasoning && reasoning.length > 0)
    ? `<details class="ai-reasoning-block"><summary class="ai-reasoning-header">💭 思考过程 (已完成)</summary><div class="ai-reasoning-content">${formatReasoningText(reasoning)}</div></details>`
    : '';

  // 模式1：属性增量修改模式
  if (_modifyPropsMode && _partialSelectedIds.length > 0) {
    const propsResult = parseAndValidatePropsModification(content, _partialSelectedIds);
    if (propsResult.valid && Object.keys(propsResult.modifications).length > 0) {
      const count = Object.keys(propsResult.modifications).length;
      applyAIPropsModification(propsResult.modifications);
      if (lastMsg) {
        const contentEl = lastMsg.querySelector('.ai-msg-content');
        if (contentEl) {
          const detailHtml = Object.entries(propsResult.modifications).map(([id, props]) => {
            const propList = Object.keys(props).join(', ');
            return `<span class="ai-widget-count">${id}: ${propList}</span>`;
          }).join('');
          contentEl.innerHTML = reasoningHtml + `
            <div class="ai-result-summary">
              <div class="ai-result-title">✅ 已修改 ${count} 个控件的属性：</div>
              <div class="ai-result-detail">${detailHtml}</div>
            </div>
            <div class="ai-result-actions">
              <button class="ai-btn ai-btn-undo" data-action="undo">↩️ 撤销</button>
            </div>
          `;
          contentEl.querySelector('[data-action="undo"]').addEventListener('click', undoLastAIApply);
        }
      }
    } else if (propsResult.errors && propsResult.errors.length > 0) {
      if (lastMsg) {
        const contentEl = lastMsg.querySelector('.ai-msg-content');
        if (contentEl) {
          const errHtml = propsResult.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('');
          contentEl.innerHTML = reasoningHtml + `<div class="ai-response-content">${formatMessageText(content)}</div>` +
            `<div class="ai-result-errors"><strong>⚠️ 校验警告：</strong><ul>${errHtml}</ul></div>`;
        }
      }
    } else {
      // 没有有效修改，当纯文本处理
      if (lastMsg) {
        const contentEl = lastMsg.querySelector('.ai-msg-content');
        if (contentEl) {
          contentEl.innerHTML = reasoningHtml + `<div class="ai-response-content">${formatMessageText(content)}</div>`;
        }
      }
    }
  }
  // 模式2：普通控件 JSON（生成/优化/追加/局部修改）
  else {
    const result = parseAndValidateAIResponse(content, AppState.project.screen_width, AppState.project.screen_height);

    // 先处理页面参数和资源管理（无论是否有控件都处理）
    if (result.meta) {
      applyAIMeta(result.meta);
    }

    if (result.valid && result.widgets.length > 0) {
      
      // 自动应用到画布（追加模式用 append，局部修改用 partial-update，其他用 replace）
      const applyMode = _appendMode ? 'append' : (_partialModifyMode ? 'partial-update' : 'replace');
      applyAIWidgets(result.widgets, applyMode);
      
      // 显示控件摘要 + 操作按钮
      const summary = summarizeWidgets(result.widgets);
      if (lastMsg) {
        const contentEl = lastMsg.querySelector('.ai-msg-content');
        if (contentEl) {
          let actionButtons = `
            <button class="ai-btn ai-btn-undo" data-action="undo">↩️ 撤销</button>
          `;
          if (!_partialModifyMode && !_appendMode) {
            actionButtons += `<button class="ai-btn ai-btn-append" data-action="append">➕ 追加到页面</button>`;
          }
          actionButtons += `<button class="ai-btn ai-btn-preview-json" data-action="preview-json">📋 查看 JSON</button>`;

          let titleText = '';
          if (_appendMode) titleText = `已追加 ${result.widgets.length} 个控件`;
          else if (_partialModifyMode) titleText = `已更新选中控件 (${result.widgets.length} 个)`;
          else titleText = `已生成 ${result.widgets.length} 个控件`;

          contentEl.innerHTML = reasoningHtml + `
            <div class="ai-result-summary">
              <div class="ai-result-title">✅ ${titleText}：</div>
              <div class="ai-result-detail">${summary}</div>
            </div>
            <div class="ai-result-actions">
              ${actionButtons}
            </div>
          `;
          contentEl.querySelector('[data-action="undo"]').addEventListener('click', undoLastAIApply);
          if (!_partialModifyMode && !_appendMode) {
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
            const applyMode = _partialModifyMode ? 'partial-update' : 'replace';
            const label = _partialModifyMode
              ? `⚠️ 更新有效选中控件 (${result.widgets.length}个)`
              : `⚠️ 应用有效控件 (${result.widgets.length}个)`;
            contentEl.innerHTML += `
              <div class="ai-result-actions">
                <button class="ai-btn ai-btn-apply" data-action="apply">${label}</button>
              </div>
            `;
            contentEl.querySelector('[data-action="apply"]').addEventListener('click', () =>
              applyAIWidgets(result.widgets, applyMode)
            );
          }
        }
      }
    }
    // 否则是纯文本回复（分析/解释/闲聊）— 保留思考过程 + 正式内容
    else {
      if (lastMsg) {
        const contentEl = lastMsg.querySelector('.ai-msg-content');
        if (contentEl) {
          // 如果只有 meta 被处理了，显示成功提示
          if (result.meta && result.widgets.length === 0) {
            contentEl.innerHTML = reasoningHtml + '<div class="ai-result-title">✅ 已更新页面参数</div>';
          } else {
            contentEl.innerHTML = reasoningHtml + `<div class="ai-response-content">${formatMessageText(content)}</div>`;
          }
        }
      }
    }
  }

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

  // 保存快照用于撤销
  _lastWidgetsSnapshot = {
    widgets: JSON.parse(JSON.stringify(page.widgets)),
    selectedIds: new Set(AppState.selectedWidgetIds),
    mode
  };

  if (mode === 'replace') {
    page.widgets = [];
  }

  if (mode === 'partial-update') {
    let updatedCount = 0;
    widgets.forEach(w => {
      const idx = page.widgets.findIndex(pw => pw.id === w.id);
      if (idx !== -1) {
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

  widgets.forEach(w => {
    const defaults = createWidgetDefaults(w.type);
    if (defaults) {
      const merged = { ...defaults, ...w };
      // 文本类控件：如果 AI 未指定 bgColor 或为黑色，强制透明
      if (['label', 'textline', 'arc_label'].includes(w.type)) {
        if (!w.bgColor || w.bgColor === '#000000' || w.bgColor === '#000') {
          merged.bgColor = 'transparent';
        }
      }
      page.widgets.push(merged);
    } else {
      page.widgets.push(w);
    }
  });

  AppState.selectedWidgetIds.clear();
  AppState.notify();
  showToast(`已${mode === 'replace' ? '替换' : '追加'} ${widgets.length} 个控件`, 'success');
}

/**
 * 应用 AI 属性增量修改（只修改属性，不替换整个控件）
 * @param {Object} modifications - { widgetId: { propName: value, ... } }
 */
function applyAIPropsModification(modifications) {
  const page = AppState.getCurrentPage();
  if (!page) {
    showToast('请先选择一个页面', 'error');
    return;
  }

  // 保存快照用于撤销
  _lastWidgetsSnapshot = {
    widgets: JSON.parse(JSON.stringify(page.widgets)),
    selectedIds: new Set(AppState.selectedWidgetIds),
    mode: 'props-modify'
  };

  let updatedCount = 0;
  for (const [id, props] of Object.entries(modifications)) {
    const idx = page.widgets.findIndex(pw => pw.id === id);
    if (idx !== -1) {
      const widget = page.widgets[idx];
      // 合并属性（只覆盖传入的属性）
      for (const [key, value] of Object.entries(props)) {
        widget[key] = value;
      }
      updatedCount++;
    }
  }

  AppState.notify();
  showToast(`已修改 ${updatedCount} 个控件的属性`, 'success');
}

function undoLastAIApply() {
  if (!_lastWidgetsSnapshot) {
    showToast('没有可撤销的操作', 'error');
    return;
  }
  const page = AppState.getCurrentPage();
  if (!page) return;
  
  page.widgets = _lastWidgetsSnapshot.widgets;
  AppState.selectedWidgetIds = _lastWidgetsSnapshot.selectedIds;
  _lastWidgetsSnapshot = null;
  AppState.notify();
  showToast('已撤销', 'success');
}

function applyAIMeta(meta) {
  const project = AppState.project;
  if (!project) return;
  
  let changes = [];
  
  if (meta.screen_width !== undefined && meta.screen_width > 0) {
    project.screen_width = meta.screen_width;
    changes.push(`屏幕宽度: ${meta.screen_width}px`);
  }
  if (meta.screen_height !== undefined && meta.screen_height > 0) {
    project.screen_height = meta.screen_height;
    changes.push(`屏幕高度: ${meta.screen_height}px`);
  }
  if (meta.bg_color) {
    const page = AppState.getCurrentPage();
    if (page) {
      page.bg_color = meta.bg_color;
      changes.push(`背景色: ${meta.bg_color}`);
    }
  }
  
  if (meta.fonts && Array.isArray(meta.fonts)) {
    meta.fonts.forEach(font => {
      if (font.name) {
        const exists = project.resources.fonts.some(f => f.name === font.name);
        if (!exists) {
          project.resources.fonts.push({
            name: font.name,
            path: '',
            size: font.size || 16,
            bpp: font.bpp || 4
          });
          changes.push(`字体: ${font.name}`);
        }
      }
    });
  }
  
  if (meta.images && Array.isArray(meta.images)) {
    meta.images.forEach(img => {
      if (img.name) {
        const exists = project.resources.images.some(i => i.name === img.name);
        if (!exists) {
          project.resources.images.push({
            name: img.name,
            path: img.path || ''
          });
          changes.push(`图片: ${img.name}`);
        }
      }
    });
  }
  
  if (changes.length > 0) {
    project.pages.forEach(p => {
      p.width = project.screen_width;
      p.height = project.screen_height;
    });
    AppState.notify();
    showToast(`已更新页面参数: ${changes.join(', ')}`, 'success');
  }
}

// ============ UI 辅助函数 ============

let _streamDebounceTimer = null;

function addMessage(role, text, extraClass, prefixHtml) {
  const welcome = _messagesEl.querySelector('.ai-welcome');
  if (welcome) welcome.remove();

  const msgEl = document.createElement('div');
  msgEl.className = `ai-msg ${role}${extraClass ? ' ' + extraClass : ''}`;
  
  let actionsHtml = '';
  if (role === 'user') {
    actionsHtml = `
      <div class="ai-msg-actions">
        <button class="ai-msg-action-btn" title="复制">📋</button>
        <button class="ai-msg-action-btn" title="重试">🔄</button>
      </div>
    `;
  } else if (role === 'assistant') {
    actionsHtml = `
      <div class="ai-msg-actions">
        <button class="ai-msg-action-btn" title="复制">📋</button>
      </div>
    `;
  }

  const contentHtml = text ? formatMessageText(text) : '<span class="ai-typing"><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span></span>';
  msgEl.innerHTML = `${actionsHtml}<div class="ai-msg-content">${prefixHtml || ''}${contentHtml}</div>`;
  _messagesEl.appendChild(msgEl);

  const copyBtn = msgEl.querySelector('.ai-msg-action-btn[title="复制"]');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      // 流式响应时，优先从 _streamBuffer 读取最新内容
      let contentToCopy = text || '';
      if (!contentToCopy && role === 'assistant' && _streamBuffer) {
        contentToCopy = _streamBuffer;
      }
      if (!contentToCopy) {
        showToast('暂无内容可复制', 'error');
        return;
      }
      await navigator.clipboard.writeText(contentToCopy);
      showToast('已复制', 'success');
    });
  }

  const retryBtn = msgEl.querySelector('.ai-msg-action-btn[title="重试"]');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      if (_isStreaming) return;
      _inputEl.value = '';
      sendMessage('chat', text);
    });
  }

  scrollMessagesToBottom();
  return msgEl;
}

function updateStreamingMessage(msgEl, text, reasoning) {
  if (_streamDebounceTimer) clearTimeout(_streamDebounceTimer);
  
  _streamDebounceTimer = setTimeout(() => {
    const contentEl = msgEl.querySelector('.ai-msg-content');
    if (contentEl) {
      let html = '';
      if (reasoning && reasoning.length > 0) {
        html += `<details class="ai-reasoning-block" open>
          <summary class="ai-reasoning-header">💭 思考过程${text ? ' (已完成)' : '...'}</summary>
          <div class="ai-reasoning-content">${formatReasoningText(reasoning)}</div>
        </details>`;
      } else if (!text) {
        html += `<div class="ai-reasoning-indicator">💭 思考中<span class="ai-typing"><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span></span></div>`;
      }
      if (text) {
        html += `<div class="ai-response-content">${formatMessageText(text)}</div>`;
      }
      contentEl.innerHTML = html;
    }
    scrollMessagesToBottom();
  }, 30);
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

async function clearChat() {
  if (_isStreaming) {
    showToast('正在生成响应中，请稍后再清空', 'error');
    return;
  }
  _chatHistory = [];
  _streamBuffer = '';
  _reasoningBuffer = '';
  await saveHistoryToProject(); // 清空独立文件中的历史
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

/** 从当前项目加载 AI 对话历史（独立文件存储，不写入项目文件） */
async function loadHistoryFromProject() {
  _lastProjectPath = AppState.projectPath;
  const projectPath = AppState.projectPath;
  if (!projectPath) {
    _chatHistory = [];
    return;
  }
  try {
    const history = await invoke('load_ai_chat_history', { projectPath });
    if (Array.isArray(history)) {
      _chatHistory = history;
    } else {
      _chatHistory = [];
    }
  } catch (e) {
    console.warn('[AI] 加载对话历史失败:', e);
    _chatHistory = [];
  }
}

/** 将当前对话历史保存到独立文件（不写入项目文件） */
async function saveHistoryToProject() {
  const projectPath = AppState.projectPath;
  if (!projectPath) return;
  try {
    if (_chatHistory.length > 0) {
      await invoke('save_ai_chat_history', { projectPath, history: _chatHistory });
    } else {
      await invoke('clear_ai_chat_history', { projectPath });
    }
  } catch (e) {
    console.warn('[AI] 保存对话历史失败:', e);
  }
}

/**
 * 对话历史自动压缩：保留最近 FULL_HISTORY_ROUNDS 轮完整对话，更早的压缩成摘要
 * 防止对话过多导致内存和磁盘空间无限增长
 */
function compressChatHistory() {
  const { FULL_HISTORY_ROUNDS, COMPRESS_THRESHOLD } = COMPRESS_CONFIG;
  const fullMessagesCount = FULL_HISTORY_ROUNDS * 2;

  if (_chatHistory.length <= COMPRESS_THRESHOLD) {
    return;
  }

  const summaryIndex = _chatHistory.findIndex(msg => msg.isSummary);
  
  if (summaryIndex !== -1) {
    const existingSummary = _chatHistory[summaryIndex];
    const oldMessages = _chatHistory.slice(summaryIndex + 1, _chatHistory.length - fullMessagesCount);
    
    if (oldMessages.length > 0) {
      const newSummary = buildSummary(oldMessages);
      _chatHistory[summaryIndex] = {
        role: 'assistant',
        content: existingSummary.content + '\n\n' + newSummary,
        isSummary: true,
        compressedCount: (existingSummary.compressedCount || 0) + oldMessages.length
      };
      
      _chatHistory.splice(summaryIndex + 1, oldMessages.length);
    }
  } else {
    const messagesToCompress = _chatHistory.slice(0, _chatHistory.length - fullMessagesCount);
    
    if (messagesToCompress.length > 0) {
      const summary = buildSummary(messagesToCompress);
      const compressedHistory = [
        {
          role: 'assistant',
          content: summary,
          isSummary: true,
          compressedCount: messagesToCompress.length
        },
        ..._chatHistory.slice(_chatHistory.length - fullMessagesCount)
      ];
      
      _chatHistory = compressedHistory;
    }
  }
  
  console.log(`[AI] 对话历史已压缩，当前消息数: ${_chatHistory.length}`);
}

/**
 * 构建对话摘要文本
 */
function buildSummary(messages) {
  const userMsgs = messages.filter(m => m.role === 'user');
  const assistantMsgs = messages.filter(m => m.role === 'assistant');
  
  let summary = `--- 历史对话摘要 (${userMsgs.length}条) ---`;
  
  userMsgs.forEach((msg, idx) => {
    const content = typeof msg.content === 'string' ? msg.content : 
      (Array.isArray(msg.content) ? msg.content.find(p => p.type === 'text')?.text || '' : '');
    
    if (content.length > 50) {
      summary += `\n${idx + 1}. ${content.slice(0, 50)}...`;
    } else if (content.length > 0) {
      summary += `\n${idx + 1}. ${content}`;
    }
  });
  
  if (assistantMsgs.length > 0) {
    const lastResponse = typeof assistantMsgs[assistantMsgs.length - 1].content === 'string'
      ? assistantMsgs[assistantMsgs.length - 1].content
      : '';
    if (lastResponse.length > 30) {
      summary += `\n\n最后回复摘要: ${lastResponse.slice(0, 30)}...`;
    }
  }
  
  return summary;
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

  for (const msg of _chatHistory) {
    const role = msg.role === 'user' ? 'user' : 'assistant';
    let text = '';
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      const textPart = msg.content.find(p => p.type === 'text');
      text = textPart ? textPart.text : '[图片消息]';
    }
    
    const msgEl = document.createElement('div');
    if (msg.isSummary) {
      msgEl.className = `ai-msg assistant ai-msg-summary`;
      msgEl.innerHTML = `<div class="ai-msg-content"><div class="ai-summary-box">${formatMessageText(text)}</div></div>`;
    } else {
      msgEl.className = `ai-msg ${role}`;
      msgEl.innerHTML = `<div class="ai-msg-content">${formatMessageText(text)}</div>`;
    }
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

// ============ 拖拽上传图片 ============

let _dragCounter = 0;

function handleDragOver(e) {
  e.preventDefault();
  _dragCounter++;
  _panelEl.classList.add('ai-panel-drag-over');
}

function handleDragLeave(e) {
  e.preventDefault();
  _dragCounter--;
  if (_dragCounter <= 0) {
    _dragCounter = 0;
    _panelEl.classList.remove('ai-panel-drag-over');
  }
}

function handleDrop(e) {
  e.preventDefault();
  _dragCounter = 0;
  _panelEl.classList.remove('ai-panel-drag-over');
  
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;
  
  const file = files[0];
  if (file.type.startsWith('image/')) {
    compressAndReadFile(file);
  } else {
    showToast('仅支持图片文件', 'error');
  }
}

// ============ 图片压缩上传 ============

function compressAndReadFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxWidth = 800;
      const maxHeight = 600;
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      const dataUrl = canvas.toDataURL('image/png', 0.8);
      const base64 = dataUrl.split(',')[1];
      _pendingImage = base64;
      
      const previewEl = document.getElementById('ai-image-preview');
      const imgEl = document.getElementById('ai-preview-img');
      imgEl.src = dataUrl;
      previewEl.style.display = 'flex';
      
      showToast(`图片已压缩上传 (${width}×${height})`, 'success');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ============ 输入建议 ============

const INPUT_SUGGESTIONS = [
  '生成一个智能家居控制面板',
  '优化当前页面布局',
  '创建一个音乐播放器界面',
  '生成一个温度监控页面',
  '添加一个设置界面',
  '分析当前页面的设计问题',
  '解释生成的代码',
];

/**
 * 检测用户消息中的本地文件路径，扫描目录并列出文件供用户选择
 * @param {string} text - 用户消息
 * @returns {Promise<boolean>} - 是否检测到路径并已处理
 */
async function detectAndScanPaths(text) {
  // 匹配 Windows 路径：盘符:\xxx 或 盘符:/xxx，支持中文字符
  const pathRegex = /([A-Za-z]):[\\\/]([\w\-\.\\\/\u4e00-\u9fa5 ]+)/g;
  const matches = [];
  let match;
  while ((match = pathRegex.exec(text)) !== null) {
    const fullPath = match[0];
    // 至少要有两级目录才认为是路径（如 C:\x 不算，C:\x\y 才算）
    const sepCount = (fullPath.match(/[\\\/]/g) || []).length;
    if (sepCount >= 2 && fullPath.length > 6) {
      matches.push(fullPath);
    }
  }

  if (matches.length === 0) return false;

  for (const path of matches) {
    try {
      const result = await invoke('list_directory', { path });
      if (result && result.items) {
        const files = result.items.filter(i => i.isFile);
        const dirs = result.items.filter(i => i.isDir);

        const fontExts = ['ttf', 'otf', 'woff', 'woff2', 'fon'];
        const imgExts = ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'ico', 'svg'];
        const fonts = files.filter(f => fontExts.includes(f.extension));
        const images = files.filter(f => imgExts.includes(f.extension));
        const others = files.filter(f => !fontExts.includes(f.extension) && !imgExts.includes(f.extension));

        if (fonts.length === 0 && images.length === 0 && others.length === 0 && dirs.length === 0) {
          continue;
        }

        // 在聊天中显示文件选择列表
        showFileSelectionUI(path, fonts, images, others, dirs);
        return true;
      }
    } catch (e) {
      console.warn('[AI] 扫描路径失败:', path, e);
      // 路径不存在或无法访问，不拦截，让 AI 正常回复
    }
  }

  return false;
}

/**
 * 在聊天界面中显示文件选择列表
 */
function showFileSelectionUI(dirPath, fonts, images, others, dirs) {
  const msgEl = addMessage('assistant', '', '');
  const contentEl = msgEl.querySelector('.ai-msg-content');
  if (!contentEl) return;

  let html = `<div style="margin-bottom:8px;">📁 扫描到目录 <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:11px;">${escapeHtml(dirPath)}</code></div>`;

  // 字体文件
  if (fonts.length > 0) {
    html += `<div style="font-weight:600;margin:10px 0 6px;color:var(--accent-light);">🔤 字体文件 (${fonts.length})</div>`;
    html += '<div style="display:flex;flex-direction:column;gap:4px;">';
    fonts.forEach(f => {
      html += `<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-tertiary);border-radius:8px;cursor:pointer;font-size:12px;">
        <input type="checkbox" class="ai-file-check" data-type="font" data-name="${escapeHtml(f.name)}" data-path="${escapeHtml(f.path)}" checked>
        <span>${escapeHtml(f.name)}</span>
      </label>`;
    });
    html += '</div>';
  }

  // 图片文件
  if (images.length > 0) {
    html += `<div style="font-weight:600;margin:10px 0 6px;color:var(--accent-light);">🖼 图片文件 (${images.length})</div>`;
    html += '<div style="display:flex;flex-direction:column;gap:4px;">';
    images.forEach(f => {
      html += `<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-tertiary);border-radius:8px;cursor:pointer;font-size:12px;">
        <input type="checkbox" class="ai-file-check" data-type="image" data-name="${escapeHtml(f.name)}" data-path="${escapeHtml(f.path)}" checked>
        <span>${escapeHtml(f.name)}</span>
      </label>`;
    });
    html += '</div>';
  }

  // 其他文件
  if (others.length > 0 && others.length <= 30) {
    html += `<div style="font-weight:600;margin:10px 0 6px;color:var(--text-muted);">📄 其他文件 (${others.length})</div>`;
    html += '<div style="display:flex;flex-direction:column;gap:4px;">';
    others.forEach(f => {
      html += `<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-tertiary);border-radius:8px;cursor:pointer;font-size:12px;">
        <input type="checkbox" class="ai-file-check" data-type="other" data-name="${escapeHtml(f.name)}" data-path="${escapeHtml(f.path)}">
        <span>${escapeHtml(f.name)}</span>
      </label>`;
    });
    html += '</div>';
  }

  // 子目录提示
  if (dirs.length > 0) {
    html += `<div style="margin-top:10px;font-size:11px;color:var(--text-muted);">📁 子目录: ${dirs.map(d => escapeHtml(d.name)).join(', ')}</div>`;
  }

  // 操作按钮
  html += `<div style="display:flex;gap:8px;margin-top:14px;">
    <button class="ai-btn ai-btn-apply" id="ai-btn-add-files" style="flex:1;">➕ 添加选中的文件到资源</button>
    <button class="ai-btn" id="ai-btn-skip-files" style="flex:1;">跳过</button>
  </div>`;

  contentEl.innerHTML = html;

  // 绑定按钮事件
  const addBtn = contentEl.querySelector('#ai-btn-add-files');
  const skipBtn = contentEl.querySelector('#ai-btn-skip-files');

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const checked = contentEl.querySelectorAll('.ai-file-check:checked');
      if (checked.length === 0) {
        showToast('请至少选择一个文件', 'error');
        return;
      }

      const project = AppState.project;
      if (!project) return;

      const addedFonts = [];
      const addedImages = [];

      checked.forEach(cb => {
        const type = cb.dataset.type;
        const name = cb.dataset.name;
        const path = cb.dataset.path;

        if (type === 'font') {
          const exists = project.resources.fonts.some(f => f.name === name);
          if (!exists) {
            project.resources.fonts.push({ name, path, size: 16, bpp: 4 });
            addedFonts.push(name);
          }
        } else if (type === 'image' || type === 'other') {
          const exists = project.resources.images.some(i => i.name === name);
          if (!exists) {
            project.resources.images.push({ name, path });
            addedImages.push(name);
          }
        }
      });

      AppState.notify();

      // 替换消息内容为结果
      let resultHtml = '<div class="ai-result-title">✅ 资源添加完成</div>';
      if (addedFonts.length > 0) {
        resultHtml += `<div style="margin-top:6px;">🔤 字体: ${addedFonts.map(n => `<span class="ai-widget-count">${escapeHtml(n)}</span>`).join(' ')}</div>`;
      }
      if (addedImages.length > 0) {
        resultHtml += `<div style="margin-top:6px;">🖼 图片: ${addedImages.map(n => `<span class="ai-widget-count">${escapeHtml(n)}</span>`).join(' ')}</div>`;
      }
      if (addedFonts.length === 0 && addedImages.length === 0) {
        resultHtml += '<div style="margin-top:6px;color:var(--text-muted);">所选文件已存在，未重复添加</div>';
      }
      contentEl.innerHTML = resultHtml;

      if (addedFonts.length > 0 || addedImages.length > 0) {
        showToast(`已添加 ${addedFonts.length} 个字体, ${addedImages.length} 个图片`, 'success');
      }
    });
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      contentEl.innerHTML = '<div style="color:var(--text-muted);">已跳过文件添加</div>';
    });
  }

  scrollMessagesToBottom();
}

function handleInputSuggestions(e) {
  const value = e.target.value.toLowerCase().trim();
  const suggestionsEl = document.getElementById('ai-input-suggestions');
  
  if (value.length === 0) {
    if (suggestionsEl) suggestionsEl.remove();
    return;
  }
  
  const matches = INPUT_SUGGESTIONS.filter(s => 
    s.toLowerCase().includes(value)
  );
  
  if (suggestionsEl) suggestionsEl.remove();
  
  if (matches.length > 0) {
    const container = document.createElement('div');
    container.id = 'ai-input-suggestions';
    container.className = 'ai-input-suggestions';
    
    matches.forEach(suggestion => {
      const item = document.createElement('div');
      item.className = 'ai-input-suggestion-item';
      item.textContent = suggestion;
      item.addEventListener('click', () => {
        _inputEl.value = suggestion;
        container.remove();
        _inputEl.focus();
      });
      container.appendChild(item);
    });
    
    _inputEl.parentElement.appendChild(container);
  }
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
