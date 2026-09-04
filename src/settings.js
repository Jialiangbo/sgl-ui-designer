import { AppState, navigate, showToast, setupWindowControls, setupUpdateChecker, initNav } from './app.js';
import { invoke } from '@tauri-apps/api/core';
import { PROVIDER_PRESETS, DEFAULT_LLM_CONFIG } from './llm/llm_config.js';

const _comboBoxDropLists = new Map();
let _comboDocClickListener = null;

function _ensureComboDocListener() {
  if (_comboDocClickListener) return;
  _comboDocClickListener = (e) => {
    _comboBoxDropLists.forEach((dropList, comboWrap) => {
      if (!comboWrap.contains(e.target)) {
        dropList.style.display = 'none';
      }
    });
  };
  document.addEventListener('click', _comboDocClickListener);
}

function registerComboClickClose(comboWrap, dropList) {
  _ensureComboDocListener();
  _comboBoxDropLists.set(comboWrap, dropList);
}

function unregisterComboClickClose(comboWrap) {
  _comboBoxDropLists.delete(comboWrap);
}

const $ = id => document.getElementById(id);

function ensureSglConfig() {
  if (!AppState.project.sgl_config) {
    AppState.project.sgl_config = {
      fbdev_pixel_depth: 16,
      fbdev_rotation: 0,
      fbdev_runtime_rotation: 0,
      fbdev_even_coords: 0,
      use_fbdev_vram: 0,
      systick_ms: 10,
      event_queue_size: 16,
      dirty_area_num_max: 16,
      color16_swap: 0,
      focused_color: '#00FF00',
      focused_width: 1,
      dirty_area_trace: 0,
      dirty_area_trace_color: '#000000',
      monitor_trace: 0,
      pixmap_bilinear_interp: 0,
      animation: 1,
      debug: 1,
      log_color: 1,
      log_level: 0,
      obj_use_name: 0,
      font_compressed: 0,
      font_small_table: 0,
      flash_font: 0,
      flash_font_glyph_buf_size: 512,
      flash_font_base_addr: '0x00100000',
      boot_logo: 0,
      theme_dark: 0,
      heap_algo: 'lwmem',
      heap_memory_size: 10240,
      label_rotation: 0,
      font_song23: 0,
      font_consolas14: 1,
      font_consolas23: 0,
      font_consolas24: 0,
      font_consolas32: 0,
      font_consolas24_compress: 0
    };
  } else {
    const cfg = AppState.project.sgl_config;
    if (cfg.fbdev_even_coords == null) cfg.fbdev_even_coords = 0;
    if (cfg.focused_color == null) cfg.focused_color = '#00FF00';
    if (cfg.focused_width == null) cfg.focused_width = 1;
    if (cfg.dirty_area_trace == null) cfg.dirty_area_trace = 0;
    if (cfg.dirty_area_trace_color == null) cfg.dirty_area_trace_color = '#000000';
    if (cfg.monitor_trace == null) cfg.monitor_trace = 0;
    if (cfg.pixmap_bilinear_interp == null) cfg.pixmap_bilinear_interp = 0;
    if (cfg.font_small_table == null) cfg.font_small_table = 0;
    if (cfg.flash_font == null) cfg.flash_font = 0;
    if (cfg.flash_font_glyph_buf_size == null) cfg.flash_font_glyph_buf_size = 512;
    if (cfg.flash_font_base_addr == null || cfg.flash_font_base_addr === '') cfg.flash_font_base_addr = '0x00100000';
  }
}

async function syncConfigFromFile() {
  if (!AppState.projectPath) return false;
  try {
    const config = await invoke('read_sgl_config_from_file', { projectPath: AppState.projectPath });
    if (config) {
      AppState.project.sgl_config = config;
      AppState.save();
      return true;
    }
  } catch (e) {
    console.log('读取 sgl_config.h 失败:', e);
  }
  return false;
}

function refresh() {
  $('status-project').textContent = '项目: ' + (AppState.project.name || '未命名');
  $('status-screen').textContent = '屏幕: ' + AppState.project.screen_width + '×' + AppState.project.screen_height;

  ensureSglConfig();
  document.querySelectorAll('.sgl-cfg').forEach(el => {
    const key = el.dataset.key;
    const val = AppState.project.sgl_config[key];
    if (el.type === 'checkbox') {
      el.checked = !!val;
    } else if (el.type === 'color') {
      el.value = (val && typeof val === 'string') ? val : '#000000';
    } else {
      el.value = val;
    }
  });
}

let _aiConfig = { ...DEFAULT_LLM_CONFIG };

function applyAiConfigToForm() {
  const baseUrl = $('ai-base-url');
  const model = $('ai-model');
  const apiKey = $('ai-api-key');
  const maxTokens = $('ai-max-tokens');
  const temperature = $('ai-temperature');
  if (baseUrl) baseUrl.value = _aiConfig.base_url || '';
  if (model) model.value = _aiConfig.model || '';
  if (apiKey) apiKey.value = _aiConfig.api_key || '';
  if (maxTokens) maxTokens.value = _aiConfig.max_tokens || DEFAULT_LLM_CONFIG.max_tokens;
  if (temperature) {
    const t = _aiConfig.temperature;
    temperature.value = Number.isFinite(t) ? t : 0.7;
  }
  document.querySelectorAll('.ai-provider-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === _aiConfig.provider);
  });
}

function readAiConfigFromForm() {
  _aiConfig.base_url = ($('ai-base-url')?.value || '').trim();
  _aiConfig.model = ($('ai-model')?.value || '').trim();
  _aiConfig.api_key = ($('ai-api-key')?.value || '').trim();
  _aiConfig.max_tokens = parseInt($('ai-max-tokens')?.value) || DEFAULT_LLM_CONFIG.max_tokens;
  const tempVal = parseFloat($('ai-temperature')?.value);
  _aiConfig.temperature = Number.isFinite(tempVal) ? tempVal : 0.7;
  return _aiConfig;
}

async function initAiConfig() {
  try {
    const cfg = await invoke('load_llm_config');
    if (cfg) {
      _aiConfig = cfg;
    }
  } catch (e) {}
  applyAiConfigToForm();
}

export async function init() {
  await _init();
}

async function _init() {
  try {
    // 窗口控制 + 更新检查 + 导航绑定（MPA 模式下每个页面入口执行一次）
    setupWindowControls();
    setupUpdateChecker();
    initNav('settings');
  } catch (e) {
    console.warn('settings: setupWindowControls/setupUpdateChecker/initNav warn:', e);
  }
  AppState.init();

  document.querySelectorAll('.sgl-cfg').forEach(el => {
    el.addEventListener('change', () => {
      ensureSglConfig();
      const key = el.dataset.key;
      if (el.type === 'checkbox') {
        AppState.project.sgl_config[key] = el.checked ? 1 : 0;
      } else if (el.type === 'color') {
        AppState.project.sgl_config[key] = el.value;
      } else if (el.tagName === 'SELECT') {
        // 下拉框：heap_algo 为字符串，其余为整数（含合法的 0，如旋转 0°、开关关闭）
        if (key === 'heap_algo') {
          AppState.project.sgl_config[key] = el.value;
        } else {
          const parsed = parseInt(el.value, 10);
          AppState.project.sgl_config[key] = Number.isFinite(parsed) ? parsed : 0;
        }
      } else if (key === 'flash_font_base_addr' || el.type === 'text') {
        AppState.project.sgl_config[key] = (el.value || '').trim() || '0x00100000';
      } else {
        // number 输入：须为非负整数；尺寸类字段须 > 0
        const raw = el.value.trim();
        const parsed = parseInt(raw, 10);
        const mustPositive = ['systick_ms', 'event_queue_size', 'dirty_area_num_max', 'heap_memory_size', 'focused_width', 'flash_font_glyph_buf_size'].includes(key);
        const invalid = raw === '' || !Number.isFinite(parsed) || parsed < 0 || (mustPositive && parsed < 1);
        if (invalid) {
          showToast(`配置项 ${key} 须为${mustPositive ? '大于 0 的' : '非负'}整数`, 'error');
          el.value = AppState.project.sgl_config[key] ?? (mustPositive ? 1 : 0);
          return;
        }
        AppState.project.sgl_config[key] = parsed;
      }
      AppState.save();
      if (AppState.projectPath) {
        invoke('write_sgl_config_to_file', {
          projectPath: AppState.projectPath,
          config: AppState.project.sgl_config
        }).catch(e => console.log('写入 sgl_config.h 失败:', e));
      }
    });
  });

  const saveSglConfigBtn = $('btn-save-sgl-config');
  if (saveSglConfigBtn) {
    saveSglConfigBtn.addEventListener('click', async () => {
      ensureSglConfig();
      let defaultPath = 'sgl_config.h';
      if (AppState.projectPath) {
        const projDir = AppState.projectPath.replace(/[\\/][^\\/]*$/, '');
        const candidate = projDir + '\\sgl-port-windows-vscode\\demo\\sgl_config.h';
        defaultPath = candidate;
      }
      let targetPath = null;
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        targetPath = await save({
          title: '保存 sgl_config.h',
          defaultPath,
          filters: [{ name: 'C Header File', extensions: ['h'] }]
        });
      } catch (e) {
        showToast('打开保存对话框失败: ' + e, 'error');
        return;
      }
      if (!targetPath) return;
      try {
        await invoke('write_sgl_config_to_custom_path', {
          config: AppState.project.sgl_config,
          targetPath
        });
        showToast('已保存 sgl_config.h 到: ' + targetPath, 'success');
      } catch (e) {
        showToast('保存失败: ' + e, 'error');
      }
    });
  }


  document.querySelectorAll('.ai-provider-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const provider = btn.dataset.provider;
      const preset = PROVIDER_PRESETS[provider];
      if (!preset) return;
      _aiConfig.provider = provider;
      _aiConfig.base_url = preset.base_url;
      _aiConfig.model = preset.model;
      applyAiConfigToForm();
      document.querySelectorAll('.ai-provider-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const toggleKeyBtn = $('ai-toggle-key-vis');
  if (toggleKeyBtn) {
    toggleKeyBtn.addEventListener('click', () => {
      const input = $('ai-api-key');
      if (input.type === 'password') {
        input.type = 'text';
        toggleKeyBtn.textContent = '🔒';
      } else {
        input.type = 'password';
        toggleKeyBtn.textContent = '👁';
      }
    });
  }

  const saveBtn = $('ai-btn-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const config = readAiConfigFromForm();
      const status = $('ai-config-status');
      try {
        await invoke('save_llm_config', { config });
        _aiConfig = config;
        try {
          localStorage.setItem('sgl_llm_config_cache', JSON.stringify(config));
        } catch {}
        status.textContent = '✅ 配置已保存';
        status.style.color = 'var(--success)';
      } catch (e) {
        status.textContent = '❌ 保存失败: ' + e;
        status.style.color = 'var(--error)';
      }
      setTimeout(() => { status.textContent = ''; }, 3000);
    });
  }

  const testBtn = $('ai-btn-test');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const config = readAiConfigFromForm();
      const status = $('ai-config-status');
      if (!config.api_key) {
        status.textContent = '⚠️ 请先填写 API Key';
        status.style.color = 'var(--warning)';
        return;
      }
      if (!config.base_url) {
        status.textContent = '⚠️ 请先填写 API 地址';
        status.style.color = 'var(--warning)';
        return;
      }
      status.textContent = '⏳ 正在测试连接...';
      status.style.color = 'var(--text-muted)';
      testBtn.disabled = true;
      try {
        const result = await invoke('llm_test_connection', { config });
        status.textContent = '✅ ' + result;
        status.style.color = 'var(--success)';
      } catch (e) {
        status.textContent = '❌ ' + e;
        status.style.color = 'var(--error)';
      }
      testBtn.disabled = false;
      setTimeout(() => { status.textContent = ''; }, 5000);
    });
  }

  const fetchModelsBtn = $('ai-fetch-models');
  const modelSelect = $('ai-model-select');
  if (fetchModelsBtn && modelSelect) {
    fetchModelsBtn.addEventListener('click', async () => {
      const config = readAiConfigFromForm();
      const status = $('ai-config-status');
      if (!config.api_key) {
        status.textContent = '⚠️ 请先填写 API Key';
        status.style.color = 'var(--warning)';
        return;
      }
      if (!config.base_url) {
        status.textContent = '⚠️ 请先填写 API 地址';
        status.style.color = 'var(--warning)';
        return;
      }
      status.textContent = '⏳ 正在获取模型列表...';
      status.style.color = 'var(--text-muted)';
      fetchModelsBtn.disabled = true;
      try {
        const models = await invoke('llm_list_models', { config });
        if (!models || models.length === 0) {
          status.textContent = '⚠️ 未获取到模型';
          status.style.color = 'var(--warning)';
          return;
        }
        modelSelect.innerHTML = '';
        models.sort().forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          modelSelect.appendChild(opt);
        });
        modelSelect.style.display = 'block';
        status.textContent = `✅ 获取到 ${models.length} 个模型，点击选择：`;
        status.style.color = 'var(--success)';
      } catch (e) {
        status.textContent = '❌ ' + e;
        status.style.color = 'var(--error)';
        modelSelect.style.display = 'none';
      }
      fetchModelsBtn.disabled = false;
      setTimeout(() => { status.textContent = ''; }, 5000);
    });

    modelSelect.addEventListener('change', () => {
      const modelInput = $('ai-model');
      if (modelInput && modelSelect.value) {
        modelInput.value = modelSelect.value;
      }
    });
  }

  try {
    await initAiConfig();
  } catch (e) {
    console.warn('settings initAiConfig warn:', e);
  }

  if (!AppState.projectPath) {
    // 不弹模态对话框（会阻塞主窗口导致导航/关闭按钮失效），改用非阻塞提示
    showToast('当前项目尚未保存，将显示默认配置。保存项目后可读取 sgl_config.h', 'info');
    try { refresh(); } catch (_) {}
    return;
  }
  try {
    await syncConfigFromFile();
  } catch (e) {
    console.warn('settings syncConfigFromFile warn:', e);
  }
  try {
    refresh();
  } catch (e) {
    console.warn('settings refresh error:', e);
  }
}

// 模块加载时自动执行初始化（settings.html 通过 <script type="module"> 加载本文件）
_init().catch(e => console.error('settings init error:', e));