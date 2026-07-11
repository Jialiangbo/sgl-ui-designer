import { AppState, navigate, showToast, initNav, setupUpdateChecker, setupWindowControls } from './app.js';
import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';

initNav('settings');
setupWindowControls();
setupUpdateChecker();
AppState.init();

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
    // 补充新增字段默认值（兼容旧项目数据）
    const cfg = AppState.project.sgl_config;
    if (cfg.fbdev_even_coords == null) cfg.fbdev_even_coords = 0;
    if (cfg.focused_color == null) cfg.focused_color = '#00FF00';
    if (cfg.focused_width == null) cfg.focused_width = 1;
    if (cfg.dirty_area_trace == null) cfg.dirty_area_trace = 0;
    if (cfg.dirty_area_trace_color == null) cfg.dirty_area_trace_color = '#000000';
    if (cfg.monitor_trace == null) cfg.monitor_trace = 0;
    if (cfg.pixmap_bilinear_interp == null) cfg.pixmap_bilinear_interp = 0;
    if (cfg.font_small_table == null) cfg.font_small_table = 0;
  }
}

// 从 sgl-port-windows-vscode/demo/sgl_config.h 读取配置同步到当前项目
// 这样用户在 sgl_config.h 中手动修改的参数会被同步到 SGL 配置页面
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
    // 文件不存在或解析失败时静默处理（如未克隆 sgl-port 项目）
    console.log('读取 sgl_config.h 失败:', e);
  }
  return false;
}

function refresh() {
  $('status-project').textContent = '项目: ' + AppState.project.name;
  $('status-screen').textContent = '屏幕: ' + AppState.project.screen_width + '×' + AppState.project.screen_height;

  ensureSglConfig();
  document.querySelectorAll('.sgl-cfg').forEach(el => {
    const key = el.dataset.key;
    const val = AppState.project.sgl_config[key];
    if (el.type === 'checkbox') {
      el.checked = !!val;
    } else if (el.type === 'color') {
      // 颜色输入框需要 #RRGGBB 格式
      el.value = (val && typeof val === 'string') ? val : '#000000';
    } else {
      el.value = val;
    }
  });
  renderAsciiFontList();
}

function bindChange(id, key, parser = v => v) {
  $(id).addEventListener('change', e => {
    AppState.project[key] = parser(e.target.value);
    if (key === 'screen_width' || key === 'screen_height') {
      const page = AppState.getCurrentPage();
      if (page) { page.width = AppState.project.screen_width; page.height = AppState.project.screen_height; }
    }
    AppState.save();
    showToast('已保存', 'success');
  });
}

// SGL 配置绑定：用户修改后立即写入 sgl_config.h 文件
document.querySelectorAll('.sgl-cfg').forEach(el => {
  el.addEventListener('change', () => {
    ensureSglConfig();
    const key = el.dataset.key;
    if (el.type === 'checkbox') {
      AppState.project.sgl_config[key] = el.checked ? 1 : 0;
    } else if (el.type === 'color') {
      // 颜色选择器值已经是 #RRGGBB 格式，直接存储
      AppState.project.sgl_config[key] = el.value;
    } else if (el.tagName === 'SELECT' && el.dataset.key === 'heap_algo') {
      AppState.project.sgl_config[key] = el.value;
    } else {
      AppState.project.sgl_config[key] = parseInt(el.value) || 0;
    }
    AppState.save();
    // 写入 sgl_config.h 文件，保证页面与文件一致
    if (AppState.projectPath) {
      invoke('write_sgl_config_to_file', {
        projectPath: AppState.projectPath,
        config: AppState.project.sgl_config
      }).catch(e => console.log('写入 sgl_config.h 失败:', e));
    }
  });
});

function ensureAsciiFonts() {
  if (!Array.isArray(AppState.project.ascii_fonts)) {
    AppState.project.ascii_fonts = [];
  }
  // 兼容旧数据：字符串数组转成对象数组，补充缺失的 compress 字段
  AppState.project.ascii_fonts = AppState.project.ascii_fonts
    .map(item => {
      if (typeof item === 'string') {
        return { name: item, size: 16, bpp: AppState.project.ascii_font_bpp || 4, compress: 0 };
      }
      if (item.compress === undefined) item.compress = 0;
      return item;
    })
    .filter(item => item && typeof item === 'object');
}

function renderAsciiFontList() {
  const container = $('ascii-font-config-list');
  if (!container) return;
  const fonts = AppState.project.resources?.fonts || [];
  ensureAsciiFonts();
  const list = AppState.project.ascii_fonts;
  container.innerHTML = '';
  if (fonts.length === 0) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:12px;font-weight:normal;">资源面板中暂无字体</span>';
    return;
  }
  if (list.length === 0) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:12px;font-weight:normal;">点击“添加字体配置”生成 ASCII 字模</span>';
  }

  list.forEach((cfg, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 80px 130px 70px 32px;gap:8px;align-items:end;background:var(--bg-primary);padding:10px;border:1px solid var(--border);border-radius:6px;';

    const fontGroup = document.createElement('div');
    fontGroup.className = 'form-group';
    fontGroup.innerHTML = '<label class="form-label">字体</label>';
    const fontSelect = document.createElement('select');
    fontSelect.className = 'form-select';
    fonts.forEach(font => {
      const opt = document.createElement('option');
      opt.value = font.path || font.name;
      opt.textContent = font.name || '未命名字体';
      fontSelect.appendChild(opt);
    });
    fontSelect.value = cfg.name || '';
    fontSelect.addEventListener('change', () => {
      cfg.name = fontSelect.value;
      AppState.save();
    });
    fontGroup.appendChild(fontSelect);

    const sizeOptions = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64];

    const sizeGroup = document.createElement('div');
    sizeGroup.className = 'form-group';
    sizeGroup.innerHTML = '<label class="form-label">字号</label>';

    const comboWrap = document.createElement('div');
    comboWrap.style.cssText = 'position:relative;display:flex;align-items:center;';

    const sizeInput = document.createElement('input');
    sizeInput.type = 'number';
    sizeInput.className = 'form-input';
    sizeInput.value = cfg.size || 16;
    sizeInput.min = 8;
    sizeInput.style.cssText = 'width:100%;padding-right:28px;';

    const dropBtn = document.createElement('button');
    dropBtn.type = 'button';
    dropBtn.className = 'btn btn-sm';
    dropBtn.textContent = '▼';
    dropBtn.style.cssText = 'position:absolute;right:2px;top:2px;bottom:2px;width:24px;padding:0;background:transparent;border:none;color:var(--text-muted);cursor:pointer;';

    const dropList = document.createElement('div');
    dropList.style.cssText = 'position:absolute;left:0;right:0;top:100%;margin-top:2px;max-height:160px;overflow:auto;background:var(--bg-secondary);border:1px solid var(--border);border-radius:4px;z-index:10;display:none;';
    sizeOptions.forEach(sz => {
      const item = document.createElement('div');
      item.textContent = sz;
      item.style.cssText = 'padding:6px 10px;cursor:pointer;font-size:13px;color:var(--text-primary);';
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--bg-hover, rgba(255,255,255,0.06))'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      item.addEventListener('click', () => {
        sizeInput.value = sz;
        cfg.size = sz;
        dropList.style.display = 'none';
        AppState.save();
      });
      dropList.appendChild(item);
    });

    function toggleList(show) {
      dropList.style.display = show ? 'block' : 'none';
    }

    dropBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleList(dropList.style.display === 'none');
    });

    sizeInput.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleList(true);
    });

    sizeInput.addEventListener('change', () => {
      cfg.size = parseInt(sizeInput.value) || 16;
      AppState.save();
    });

    document.addEventListener('click', (e) => {
      if (!comboWrap.contains(e.target)) {
        toggleList(false);
      }
    });

    comboWrap.appendChild(sizeInput);
    comboWrap.appendChild(dropBtn);
    comboWrap.appendChild(dropList);
    sizeGroup.appendChild(comboWrap);

    const bppGroup = document.createElement('div');
    bppGroup.className = 'form-group';
    bppGroup.innerHTML = '<label class="form-label">抗锯齿</label>';
    const bppSelect = document.createElement('select');
    bppSelect.className = 'form-select';
    [1, 2, 4, 8].forEach(bpp => {
      const opt = document.createElement('option');
      opt.value = bpp;
      opt.textContent = bpp + ' bit' + (bpp === 1 ? '（无抗锯齿）' : '');
      bppSelect.appendChild(opt);
    });
    bppSelect.value = String(cfg.bpp || 4);
    bppSelect.addEventListener('change', () => {
      cfg.bpp = parseInt(bppSelect.value) || 4;
      AppState.save();
    });
    bppGroup.appendChild(bppSelect);

    // RLE 压缩选项
    const compressGroup = document.createElement('div');
    compressGroup.className = 'form-group';
    compressGroup.innerHTML = '<label class="form-label">RLE压缩</label>';
    const compressSelect = document.createElement('select');
    compressSelect.className = 'form-select';
    [
      { v: 0, t: '否' },
      { v: 1, t: '是' }
    ].forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.v;
      opt.textContent = o.t;
      compressSelect.appendChild(opt);
    });
    compressSelect.value = String(cfg.compress || 0);
    compressSelect.addEventListener('change', () => {
      cfg.compress = parseInt(compressSelect.value) || 0;
      AppState.save();
    });
    compressGroup.appendChild(compressSelect);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-sm';
    delBtn.textContent = '×';
    delBtn.title = '删除';
    delBtn.style.cssText = 'height:36px;background:#ef4444;color:#fff;border:none;';
    delBtn.addEventListener('click', () => {
      list.splice(idx, 1);
      AppState.project.ascii_fonts = list;
      AppState.save();
      renderAsciiFontList();
    });

    row.appendChild(fontGroup);
    row.appendChild(sizeGroup);
    row.appendChild(bppGroup);
    row.appendChild(compressGroup);
    row.appendChild(delBtn);
    container.appendChild(row);
  });
}

const addBtn = $('btn-add-ascii-font');
if (addBtn) {
  addBtn.addEventListener('click', () => {
    ensureAsciiFonts();
    const fonts = AppState.project.resources?.fonts || [];
    const first = fonts.length > 0 ? (fonts[0].path || fonts[0].name) : '';
    AppState.project.ascii_fonts.push({ name: first, size: 16, bpp: 4, compress: 0 });
    AppState.save();
    renderAsciiFontList();
  });
}

document.querySelectorAll('[data-nav]').forEach(tab => {
  tab.addEventListener('click', () => navigate(tab.dataset.nav));
});

// 进入 SGL 配置页面时：
// 1. 若项目未保存，提示用户是否保存项目（保存后才能定位 sgl_config.h）
// 2. 保存后（或已保存）读取 sgl_config.h 同步外部修改，再刷新页面
(async () => {
  if (!AppState.projectPath) {
    const ok = await confirm('当前项目尚未保存，是否保存项目以读取 SGL 配置文件？', {
      title: '提示',
      kind: 'info',
      okLabel: '保存项目',
      cancelLabel: '暂不保存'
    });
    if (ok) {
      const result = await AppState.saveProject();
      if (!result.ok) {
        // 用户取消保存或保存失败，显示默认值
        refresh();
        return;
      }
      showToast('项目已保存', 'success');
    } else {
      // 用户选择不保存，显示默认值
      refresh();
      return;
    }
  }
  await syncConfigFromFile();
  refresh();
})();
