import { AppState, navigate, initNav, setupUpdateChecker, setupWindowControls } from './app.js';

let _currentPage = 'index';
let _pageModules = {};
let _pageDestructors = {};

const PAGE_TEMPLATES = {
  index: `
    <div class="home-container">
      <div class="home-hero">
        <h1 class="home-title">SGL UI Designer</h1>
        <p class="home-subtitle">专为 SGL 图形库打造的视觉化界面设计工具</p>
        <div class="hero-buttons">
          <button class="btn btn-primary" id="btn-new-project">创建新项目</button>
          <button class="btn" id="btn-open-project">打开项目</button>
          <button class="btn" id="btn-repo">📦 设计器仓库</button>
          <button class="btn" id="btn-sgl-repo">📦 SGL 仓库</button>
        </div>
      </div>
      <div class="home-section">
        <h2 class="home-section-title">核心特性</h2>
        <div class="feature-grid">
          <div class="feature-card">
            <div class="feature-icon">🎨</div>
            <div class="feature-title">可视化拖拽</div>
            <div class="feature-desc">所见即所得的拖拽式界面设计体验</div>
          </div>
          <div class="feature-card">
            <div class="feature-icon">⚡</div>
            <div class="feature-title">一键生成代码</div>
            <div class="feature-desc">自动生成可编译的 SGL C 代码</div>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🧩</div>
            <div class="feature-title">丰富组件</div>
            <div class="feature-desc">按钮、标签、矩形、滑块等常用组件</div>
          </div>
        </div>
      </div>
      <div class="home-section">
        <h2 class="home-section-title">快速开始</h2>
        <div class="project-grid">
          <div class="project-card" id="card-new">
            <div class="project-card-icon">+</div>
            <div class="project-card-title">新建项目</div>
            <div class="project-card-desc">从空白开始设计 UI 界面</div>
          </div>
          <div class="project-card" id="card-open">
            <div class="project-card-icon">📂</div>
            <div class="project-card-title">打开项目</div>
            <div class="project-card-desc">从文件加载已保存的项目</div>
          </div>
          <div class="project-card" id="card-demo1">
            <div class="project-card-icon">D</div>
            <div class="project-card-title">仪表盘 Demo</div>
            <div class="project-card-desc">智能家居仪表盘示例</div>
          </div>
          <div class="project-card" id="card-demo2">
            <div class="project-card-icon">M</div>
            <div class="project-card-title">菜单 Demo</div>
            <div class="project-card-desc">设备控制菜单示例</div>
          </div>
          <div class="project-card" id="card-demo3">
            <div class="project-card-icon">K</div>
            <div class="project-card-title">键盘 Demo</div>
            <div class="project-card-desc">数字输入键盘示例</div>
          </div>
        </div>
      </div>
    </div>
  `,
  editor: `
    <aside class="sidebar-left" id="sidebar-left">
      <div class="panel" style="flex:1;min-height:0;display:flex;flex-direction:column;">
        <div class="panel-title-row">
          <div class="panel-title">📑 页面列表</div>
          <button class="btn btn-sm btn-icon" id="btn-new-page" title="新建页面">+</button>
        </div>
        <div class="page-tabs-mini" id="page-tabs-mini"></div>
      </div>
      <div class="panel" style="flex:1;min-height:0;display:flex;flex-direction:column;">
        <div class="panel-title">📋 控件结构树</div>
        <div class="layer-list" id="layer-list"></div>
      </div>
      <div class="panel" style="flex:0 0 auto;">
        <div class="panel-title">📁 资源管理</div>
        <div class="resource-tabs">
          <button class="resource-tab active" data-res-tab="fonts">字体</button>
          <button class="resource-tab" data-res-tab="images">图片</button>
        </div>
        <div class="resource-panel" id="resource-fonts">
          <button class="btn btn-sm btn-block" id="btn-add-font">+ 添加字体</button>
          <div class="resource-list" id="font-list"></div>
        </div>
        <div class="resource-panel" id="resource-images" style="display:none;">
          <button class="btn btn-sm btn-block" id="btn-add-image">+ 添加图片</button>
          <div class="resource-list" id="image-list"></div>
        </div>
      </div>
    </aside>
    <main class="canvas-area">
      <div class="canvas-toolbar">
        <div class="page-tabs" id="page-tabs"></div>
        <span style="flex:1;"></span>
        <button class="btn btn-sm" id="btn-zoom-out" title="缩小">−</button>
        <span id="zoom-label" style="min-width:48px;text-align:center;font-size:12px;color:var(--text-secondary);">100%</span>
        <button class="btn btn-sm" id="btn-zoom-in" title="放大">+</button>
        <button class="btn btn-sm" id="btn-zoom-fit" title="适应窗口">⊡</button>
      </div>
      <div class="canvas-container" id="canvas-container">
        <div class="ruler-corner" id="ruler-corner"></div>
        <canvas class="ruler-h" id="ruler-h" height="20"></canvas>
        <canvas class="ruler-v" id="ruler-v" width="20"></canvas>
        <div class="canvas-viewport" id="canvas-viewport">
          <div class="canvas" id="canvas" tabindex="0"></div>
        </div>
      </div>
      <div class="log-panel" id="log-panel">
        <div class="log-resizer" id="log-resizer"></div>
        <div class="log-header">
          <span class="log-title">Console</span>
          <div class="log-actions">
            <button class="btn btn-sm" id="btn-clear-log" title="清空">清空</button>
          </div>
        </div>
        <div class="log-content" id="log-content"></div>
      </div>
    </main>
    <aside class="sidebar-right" id="sidebar-right">
      <div class="panel" id="project-props">
        <div class="panel-title">🏷️ 项目信息</div>
        <div class="form-group">
          <label class="form-label">项目名称</label>
          <input type="text" class="form-input" id="prop-project-name" />
        </div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">宽度</label>
            <input type="number" class="form-input" id="prop-screen-w" min="80" />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">高度</label>
            <input type="number" class="form-input" id="prop-screen-h" min="80" />
          </div>
        </div>
        <div class="form-group" style="margin-top:12px;margin-bottom:0;">
          <label class="form-label">屏幕形状</label>
          <select class="form-select" id="prop-screen-shape">
            <option value="rect">矩形</option>
            <option value="circle">圆形</option>
          </select>
        </div>
        <div class="form-group" style="margin-top:12px;margin-bottom:0;">
          <label class="form-label">颜色深度</label>
          <select class="form-select" id="prop-color-depth">
            <option value="8bit">8 bit (256色)</option>
            <option value="16bit">16 bit (65K色)</option>
            <option value="24bit">24 bit (RGB)</option>
            <option value="32bit">32 bit (RGBA)</option>
          </select>
        </div>
      </div>
      <div class="panel" id="page-props">
        <div class="panel-title">📄 页面属性</div>
        <div class="form-group">
          <label class="form-label">页面名称</label>
          <input type="text" class="form-input" id="prop-page-name" />
        </div>
        <div class="form-group">
          <label class="form-label">背景图片</label>
          <select class="form-select" id="prop-page-pixmap">
            <option value="">无</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">填充色</label>
          <div style="display:flex;gap:6px;align-items:center;">
            <input type="color" id="prop-page-bgcolor" style="width:40px;height:32px;border:1px solid var(--border);border-radius:4px;cursor:pointer;padding:2px;background:var(--bg-primary);" />
            <input type="text" class="form-input color-text" id="prop-page-bgcolor-text" style="flex:1;" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">透明度</label>
          <input type="number" class="form-input" id="prop-page-alpha" min="0" max="255" />
        </div>
      </div>
      <div class="panel" id="widget-props-panel" style="display:none;">
        <div class="panel-title">⚙️ 组件属性 <span id="widget-type-label" style="font-size:10px;color:var(--accent);font-weight:400;"></span></div>
        <div id="widget-prop-content"></div>
        <div class="divider"></div>
        <button class="btn" id="btn-delete-widget" style="width:100%;border-color:var(--error);color:var(--error);">🗑 删除组件</button>
      </div>
      <div class="panel" id="empty-props">
        <div class="empty-state" style="padding:24px 0;">
          <div style="font-size:24px;margin-bottom:8px;opacity:0.3;">👈</div>
          <div style="font-size:12px;">从左侧拖入组件<br/>或在画布上点击选中</div>
        </div>
      </div>
    </aside>
  `,
  components: `
    <div class="code-container">
      <div class="code-toolbar">
        <span style="color:var(--text-secondary);font-size:13px;">自动生成的 SGL C 代码</span>
        <span style="flex:1;"></span>
        <span style="color:var(--text-muted);font-size:12px;" id="code-meta">项目: -</span>
      </div>
      <div class="canvas-container" style="padding:0;display:block;">
        <pre class="code-pre" id="code-output" style="padding:32px;background:#0a0a14;overflow:auto;height:100%;margin:0;"></pre>
      </div>
    </div>
  `,
  settings: `
    <div class="settings-container">
      <div class="settings-panel">
        <div class="panel-title" style="font-size:14px;font-weight:700;margin-bottom:4px;">SGL配置</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span>配置 SGL 宏（sgl_config.h）以及字体选项</span>
          <button class="btn btn-primary" id="btn-save-sgl-config" type="button">另存 sgl_config.h</button>
        </div>
        <div class="settings-subtitle">SGL 配置 (sgl_config.h)</div>
        <div class="settings-row">
          <div class="form-group">
            <label class="form-label">像素深度</label>
            <select class="form-select sgl-cfg" data-key="fbdev_pixel_depth">
              <option value="8">8</option>
              <option value="16">16</option>
              <option value="24">24</option>
              <option value="32">32</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">屏幕旋转</label>
            <select class="form-select sgl-cfg" data-key="fbdev_rotation">
              <option value="0">0°</option>
              <option value="90">90°</option>
              <option value="180">180°</option>
              <option value="270">270°</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">运行时旋转</label>
            <select class="form-select sgl-cfg" data-key="fbdev_runtime_rotation">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">偶数坐标 (QSPI)</label>
            <select class="form-select sgl-cfg" data-key="fbdev_even_coords">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">使用 VRAM</label>
            <select class="form-select sgl-cfg" data-key="use_fbdev_vram">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
        </div>
        <div class="settings-row">
          <div class="form-group">
            <label class="form-label">16位颜色交换</label>
            <select class="form-select sgl-cfg" data-key="color16_swap">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">系统滴答 (ms)</label>
            <input type="number" class="form-input sgl-cfg" data-key="systick_ms" />
          </div>
          <div class="form-group">
            <label class="form-label">事件队列大小</label>
            <input type="number" class="form-input sgl-cfg" data-key="event_queue_size" />
          </div>
        </div>
        <div class="settings-row">
          <div class="form-group">
            <label class="form-label">脏区最大数量</label>
            <input type="number" class="form-input sgl-cfg" data-key="dirty_area_num_max" />
          </div>
          <div class="form-group">
            <label class="form-label">脏区调试追踪</label>
            <select class="form-select sgl-cfg" data-key="dirty_area_trace">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">脏区追踪颜色</label>
            <input type="color" class="sgl-cfg" data-key="dirty_area_trace_color" style="width:100%;height:36px;padding:2px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;cursor:pointer;" />
          </div>
        </div>
        <div class="settings-row">
          <div class="form-group">
            <label class="form-label">动画</label>
            <select class="form-select sgl-cfg" data-key="animation">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">位图双线性插值</label>
            <select class="form-select sgl-cfg" data-key="pixmap_bilinear_interp">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">监视器追踪</label>
            <select class="form-select sgl-cfg" data-key="monitor_trace">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
        </div>
        <div class="settings-row">
          <div class="form-group">
            <label class="form-label">焦点颜色</label>
            <input type="color" class="sgl-cfg" data-key="focused_color" style="width:100%;height:36px;padding:2px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;cursor:pointer;" />
          </div>
          <div class="form-group">
            <label class="form-label">焦点宽度</label>
            <input type="number" class="form-input sgl-cfg" data-key="focused_width" min="1" />
          </div>
          <div class="form-group">
            <label class="form-label">调试</label>
            <select class="form-select sgl-cfg" data-key="debug">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
        </div>
        <div class="settings-row">
          <div class="form-group">
            <label class="form-label">日志颜色</label>
            <select class="form-select sgl-cfg" data-key="log_color">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">日志级别</label>
            <select class="form-select sgl-cfg" data-key="log_level">
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6">6</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">对象使用名称</label>
            <select class="form-select sgl-cfg" data-key="obj_use_name">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
        </div>
        <div class="settings-row">
          <div class="form-group">
            <label class="form-label">字体压缩</label>
            <select class="form-select sgl-cfg" data-key="font_compressed">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">小字体表</label>
            <select class="form-select sgl-cfg" data-key="font_small_table">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">启动 Logo</label>
            <select class="form-select sgl-cfg" data-key="boot_logo">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
        </div>
        <div class="settings-row">
          <div class="form-group">
            <label class="form-label">深色主题</label>
            <select class="form-select sgl-cfg" data-key="theme_dark">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
        </div>
        <div class="settings-row">
          <div class="form-group">
            <label class="form-label">堆算法</label>
            <select class="form-select sgl-cfg" data-key="heap_algo">
              <option value="lwmem">lwmem</option>
              <option value="tlsf">tlsf</option>
              <option value="bump">bump</option>
              <option value="other">other</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">堆内存大小</label>
            <input type="number" class="form-input sgl-cfg" data-key="heap_memory_size" />
          </div>
          <div class="form-group">
            <label class="form-label">标签旋转</label>
            <select class="form-select sgl-cfg" data-key="label_rotation">
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </div>
        </div>
        <div class="settings-subtitle">字体配置</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
          <label class="form-label" style="display:flex;align-items:center;gap:6px;font-weight:normal;">
            <input type="checkbox" class="sgl-cfg" data-key="font_song23" /> SONG23
          </label>
          <label class="form-label" style="display:flex;align-items:center;gap:6px;font-weight:normal;">
            <input type="checkbox" class="sgl-cfg" data-key="font_consolas14" /> CONSOLAS14
          </label>
          <label class="form-label" style="display:flex;align-items:center;gap:6px;font-weight:normal;">
            <input type="checkbox" class="sgl-cfg" data-key="font_consolas23" /> CONSOLAS23
          </label>
          <label class="form-label" style="display:flex;align-items:center;gap:6px;font-weight:normal;">
            <input type="checkbox" class="sgl-cfg" data-key="font_consolas24" /> CONSOLAS24
          </label>
          <label class="form-label" style="display:flex;align-items:center;gap:6px;font-weight:normal;">
            <input type="checkbox" class="sgl-cfg" data-key="font_consolas32" /> CONSOLAS32
          </label>
          <label class="form-label" style="display:flex;align-items:center;gap:6px;font-weight:normal;">
            <input type="checkbox" class="sgl-cfg" data-key="font_consolas24_compress" /> CONSOLAS24_COMPRESS
          </label>
        </div>
        <div class="settings-subtitle">ASCII 字模生成</div>
        <div id="ascii-font-config-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
          <span style="color:var(--text-muted);font-size:12px;font-weight:normal;">资源面板中暂无字体</span>
        </div>
        <button class="btn btn-sm" id="btn-add-ascii-font" type="button" style="margin-bottom:12px;">+ 添加字体配置</button>
        <span style="color:var(--text-muted);font-size:11px;font-weight:normal;">每项可独立配置字体、字号和抗锯齿 bpp，导出/运行时会按列表生成对应 ASCII 字模。</span>
        <div class="ai-config-section">
          <div class="settings-subtitle">🤖 AI 助手配置</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">配置大模型 API，启用 AI 辅助设计功能。API Key 仅存储在本地，不会上传任何服务器。</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;font-weight:600;">快捷选择服务商：</div>
          <div class="ai-provider-presets" id="ai-provider-presets">
            <button class="ai-provider-btn" data-provider="openai">OpenAI</button>
            <button class="ai-provider-btn" data-provider="deepseek">DeepSeek</button>
            <button class="ai-provider-btn" data-provider="zhipu">智谱 GLM</button>
            <button class="ai-provider-btn" data-provider="siliconflow">SiliconFlow</button>
            <button class="ai-provider-btn" data-provider="custom">自定义</button>
          </div>
          <div class="settings-row">
            <div class="form-group">
              <label class="form-label">API 地址 (Base URL)</label>
              <input type="text" class="form-input" id="ai-base-url" placeholder="https://api.openai.com/v1" />
            </div>
            <div class="form-group">
              <label class="form-label">模型名称</label>
              <div style="display:flex;gap:6px;">
                <input type="text" class="form-input" id="ai-model" placeholder="gpt-4o-mini" style="flex:1;" />
                <button class="btn btn-sm" id="ai-fetch-models" type="button" title="从 Provider 获取可用模型">📋 获取</button>
              </div>
              <select class="form-input" id="ai-model-select" style="display:none;margin-top:6px;" size="6"></select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">API Key</label>
            <div style="display:flex;gap:6px;">
              <input type="password" class="form-input" id="ai-api-key" placeholder="sk-..." style="flex:1;" />
              <button class="btn btn-sm" id="ai-toggle-key-vis" type="button" title="显示/隐藏">👁</button>
            </div>
          </div>
          <div class="settings-row">
            <div class="form-group">
              <label class="form-label">最大 Token 数</label>
              <input type="number" class="form-input" id="ai-max-tokens" value="8192" min="256" />
            </div>
            <div class="form-group">
              <label class="form-label">Temperature</label>
              <input type="number" class="form-input" id="ai-temperature" value="0.7" min="0" max="2" step="0.1" />
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button class="btn btn-sm" id="ai-btn-save" type="button">💾 保存配置</button>
            <button class="btn btn-sm" id="ai-btn-test" type="button">🔗 测试连接</button>
          </div>
          <div id="ai-config-status" style="margin-top:8px;font-size:12px;color:var(--text-muted);"></div>
        </div>
      </div>
    </div>
  `
};

const HEADER_ACTIONS = {
  index: '',
  editor: `
    <button class="btn btn-sm btn-action" id="btn-open" title="打开项目">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <span>打开</span>
    </button>
    <button class="btn btn-sm btn-action" id="btn-save" title="保存项目">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
      <span>保存</span>
    </button>
    <div class="toolbar-divider"></div>
    <button class="btn btn-sm btn-action btn-export" id="btn-export-code" title="导出C代码到项目目录">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span>导出</span>
    </button>
    <button class="btn btn-sm btn-action btn-run" id="btn-build-run" title="编译并运行模拟器">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      <span>运行</span>
    </button>
  `,
  components: `
    <button class="btn btn-sm" id="btn-copy">复制代码</button>
    <button class="btn btn-primary btn-sm" id="btn-download" title="导出C代码到项目目录">导出</button>
  `,
  settings: ''
};

const STATUS_BARS = {
  index: '',
  editor: `
    <span id="status-project">项目: -</span>
    <span id="status-size">屏幕: -</span>
    <span id="status-widgets">组件: 0</span>
    <span id="status-selection">未选中</span>
    <span id="status-font" style="color: var(--error);"></span>
    <span style="margin-left:auto;" id="status-api">API: SGL v2.0</span>
  `,
  components: `
    <span id="status-project">项目: -</span>
    <span id="status-pages">页面: 0</span>
    <span id="status-total">组件总数: 0</span>
  `,
  settings: `
    <span id="status-project">项目: -</span>
    <span id="status-screen">屏幕: -</span>
  `
};

const MAIN_STYLES = {
  index: '',
  editor: '',
  components: 'background:#0f0f1a;',
  settings: 'background:#0f0f1a;'
};

async function loadPageModule(page) {
  if (_pageModules[page]) return _pageModules[page];
  const modules = {
    index: () => import('./home.js'),
    editor: () => import('./sgl_renderer.js').then(() => import('./editor.js')),
    components: () => import('./components.js'),
    settings: () => import('./settings.js')
  };
  const mod = await modules[page]();
  _pageModules[page] = mod;
  return mod;
}

async function switchPage(page) {
  if (_currentPage === page) return;
  
  if (_pageDestructors[_currentPage]) {
    _pageDestructors[_currentPage]();
    _pageDestructors[_currentPage] = null;
  }
  
  const appMain = document.getElementById('app-main');
  const headerActions = document.getElementById('header-actions');
  const statusBar = document.getElementById('status-bar');
  
  appMain.innerHTML = PAGE_TEMPLATES[page] || '';
  headerActions.innerHTML = HEADER_ACTIONS[page] || '';
  statusBar.innerHTML = STATUS_BARS[page] || '';
  appMain.style.cssText = MAIN_STYLES[page] || '';
  
  document.querySelectorAll('[data-nav]').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.nav === page);
  });
  
  _currentPage = page;
  
  const mod = await loadPageModule(page);
  if (mod.init) {
    try {
      const destructor = await mod.init();
      if (typeof destructor === 'function') {
        _pageDestructors[page] = destructor;
      }
    } catch (e) {
      console.error(`[${page}] init error:`, e);
    }
  }
}

function setupNavigation() {
  document.querySelectorAll('[data-nav]').forEach(tab => {
    tab.addEventListener('click', () => {
      const page = tab.dataset.nav;
      switchPage(page);
    });
  });
}

window.navigate = function(page) {
  switchPage(page);
};

async function initApp() {
  initNav('index');
  setupUpdateChecker();
  setupWindowControls();
  AppState.init();
  
  await import('./sgl_renderer.js');
  
  setupNavigation();
  await switchPage('index');
}

initApp();