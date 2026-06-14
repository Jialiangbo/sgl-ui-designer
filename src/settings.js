import { AppState, navigate, showToast, initNav, downloadFile } from './app.js';

initNav('settings');
AppState.init();

const $ = id => document.getElementById(id);

function refresh() {
  $('s-project-name').value = AppState.project.name;
  $('s-screen-w').value = AppState.project.screen_width;
  $('s-screen-h').value = AppState.project.screen_height;
  $('s-color-depth').value = AppState.project.color_depth;
  $('s-version').value = AppState.project.version || '0.1.0';
  $('status-project').textContent = '项目: ' + AppState.project.name;
  $('status-screen').textContent = '屏幕: ' + AppState.project.screen_width + '×' + AppState.project.screen_height;
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

bindChange('s-project-name', 'name');
bindChange('s-screen-w', 'screen_width', v => parseInt(v) || 480);
bindChange('s-screen-h', 'screen_height', v => parseInt(v) || 320);
bindChange('s-color-depth', 'color_depth');
bindChange('s-version', 'version');

document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const [w, h] = btn.dataset.preset.split('x').map(Number);
    AppState.updateProject({ screen_width: w, screen_height: h });
    refresh();
    showToast('已应用 ' + w + '×' + h, 'success');
  });
});

$('btn-export').addEventListener('click', () => {
  downloadFile(AppState.project.name + '.json', JSON.stringify(AppState.project, null, 2));
  showToast('已导出', 'success');
});

$('btn-import').addEventListener('click', () => $('file-import').click());
$('file-import').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const json = JSON.parse(evt.target.result);
      if (!json.pages || !Array.isArray(json.pages)) throw new Error('格式错误');
      AppState.project = json;
      if (!AppState.project.screen_width) AppState.project.screen_width = AppState.project.screenWidth || 480;
      if (!AppState.project.screen_height) AppState.project.screen_height = AppState.project.screenHeight || 320;
      // 兼容旧格式
      if (AppState.project.screenWidth) {
        AppState.project.screen_width = AppState.project.screenWidth;
        AppState.project.screen_height = AppState.project.screenHeight;
      }
      if (AppState.project.pages.length > 0) AppState.currentPageId = AppState.project.pages[0].id;
      AppState.selectedWidgetId = null;
      AppState.save();
      refresh();
      showToast('导入成功', 'success');
    } catch (err) {
      showToast('导入失败: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

$('btn-reset').addEventListener('click', () => {
  if (confirm('确定要重置整个项目吗？此操作无法撤销。')) {
    AppState.reset();
    refresh();
    showToast('已重置', 'success');
  }
});

document.querySelectorAll('[data-nav]').forEach(tab => {
  tab.addEventListener('click', () => navigate(tab.dataset.nav));
});

refresh();
