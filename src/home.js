import { AppState, navigate, showToast, initNav, setupUpdateChecker, setupWindowControls } from './app.js';
import { createWidgetDefaults } from './sgl_api.js';
import { open } from '@tauri-apps/plugin-shell';

const REPO_URL = 'https://github.com/jialiangbo/sgl-ui-designer';
const SGL_REPO_URL = 'https://github.com/sgl-org/sgl';

initNav('index');
setupWindowControls();
setupUpdateChecker();

document.getElementById('btn-repo').addEventListener('click', () => open(REPO_URL));
document.getElementById('btn-sgl-repo').addEventListener('click', () => open(SGL_REPO_URL));
document.getElementById('btn-new-project').addEventListener('click', () => {
  AppState.reset();
  navigate('editor');
});
document.getElementById('btn-open-project').addEventListener('click', async () => {
  const result = await AppState.openProject();
  if (result.ok) {
    showToast('项目已加载', 'success');
    setTimeout(() => navigate('editor'), 300);
  } else if (result.msg !== '取消打开') {
    showToast('打开失败: ' + result.msg, 'error');
  }
});

document.getElementById('card-new').addEventListener('click', () => {
  AppState.reset();
  navigate('editor');
});
document.getElementById('card-open').addEventListener('click', async () => {
  const result = await AppState.openProject();
  if (result.ok) {
    showToast('项目已加载', 'success');
    setTimeout(() => navigate('editor'), 300);
  } else if (result.msg !== '取消打开') {
    showToast('打开失败: ' + result.msg, 'error');
  }
});

document.getElementById('card-demo1').addEventListener('click', () => loadDemo('dashboard'));
document.getElementById('card-demo2').addEventListener('click', () => loadDemo('menu'));
document.getElementById('card-demo3').addEventListener('click', () => loadDemo('keypad'));

document.querySelectorAll('[data-nav]').forEach(tab => {
  tab.addEventListener('click', () => navigate(tab.dataset.nav));
});

function loadDemo(type) {
  AppState.reset();
  const demo = DEMOS[type];
  if (!demo) return;
  Object.assign(AppState.project, demo.project);
  AppState.project.pages = demo.pages;
  AppState.currentPageId = demo.pages[0].id;
  AppState.save();
  showToast('Demo 已加载', 'success');
  setTimeout(() => navigate('editor'), 300);
}

const DEMOS = {
  dashboard: {
    project: { name: 'Smart Dashboard', screen_width: 480, screen_height: 320, color_depth: '16bit' },
    pages: [{
      id: 'page_dashboard', name: '仪表盘', width: 480, height: 320, bg_color: '#1e1e2e',
      widgets: [
        { id: 'w1', x: 20, y: 16, width: 280, height: 36, ...createWidgetDefaults('label'), text: '🏠 智能家居控制台', textColor: '#e4e4e7', fontSize: 22, align: 'LEFT_MID' },
        { id: 'w2', x: 20, y: 70, width: 200, height: 100, ...createWidgetDefaults('rect'), color: '#313149', bgColor: '#313149', borderColor: '#8b5cf6', borderWidth: 2, radius: 8 },
        { id: 'w3', x: 32, y: 80, width: 80, height: 20, ...createWidgetDefaults('label'), text: '温度', textColor: '#a1a1aa', fontSize: 12 },
        { id: 'w4', x: 32, y: 108, width: 120, height: 40, ...createWidgetDefaults('label'), text: '23°C', textColor: '#8b5cf6', fontSize: 28 },
        { id: 'w5', x: 240, y: 70, width: 200, height: 100, ...createWidgetDefaults('rect'), color: '#313149', bgColor: '#313149', borderColor: '#22c55e', borderWidth: 2, radius: 8 },
        { id: 'w6', x: 252, y: 80, width: 80, height: 20, ...createWidgetDefaults('label'), text: '湿度', textColor: '#a1a1aa', fontSize: 12 },
        { id: 'w7', x: 252, y: 108, width: 100, height: 40, ...createWidgetDefaults('label'), text: '55%', textColor: '#22c55e', fontSize: 28 },
        { id: 'w8', x: 20, y: 200, width: 140, height: 44, ...createWidgetDefaults('button'), text: '💡 开灯', bgColor: '#f59e0b', borderColor: '#d97706', radius: 8 },
        { id: 'w9', x: 170, y: 200, width: 140, height: 44, ...createWidgetDefaults('button'), text: '❄ 启动空调', bgColor: '#8b5cf6', borderColor: '#7c3aed', radius: 8 },
        { id: 'w10', x: 320, y: 200, width: 140, height: 44, ...createWidgetDefaults('button'), text: '⏻ 全部关闭', bgColor: '#ef4444', borderColor: '#dc2626', radius: 8 },
        { id: 'w11', x: 20, y: 270, width: 440, height: 24, ...createWidgetDefaults('progress'), value: 75, fillColor: '#22c55e', trackColor: '#313149', borderColor: '#3d3d5c' }
      ]
    }]
  },
  menu: {
    project: { name: 'Device Menu', screen_width: 320, screen_height: 480, color_depth: '16bit' },
    pages: [{
      id: 'page_menu', name: '菜单', width: 320, height: 480, bg_color: '#1e1e2e',
      widgets: [
        { id: 'm0', x: 0, y: 0, width: 320, height: 60, ...createWidgetDefaults('rect'), bgColor: '#8b5cf6', borderWidth: 0, radius: 0 },
        { id: 'm1', x: 16, y: 16, width: 200, height: 32, ...createWidgetDefaults('label'), text: '设备菜单', textColor: '#ffffff', fontSize: 20 },
        { id: 'm2', x: 20, y: 80, width: 280, height: 50, ...createWidgetDefaults('button'), text: '⚙  系统设置', bgColor: '#313149', borderColor: '#8b5cf6', borderWidth: 1, radius: 8, align: 'LEFT_MID', fontSize: 16 },
        { id: 'm3', x: 20, y: 145, width: 280, height: 50, ...createWidgetDefaults('button'), text: '🌐 网络配置', bgColor: '#313149', borderColor: '#8b5cf6', borderWidth: 1, radius: 8, align: 'LEFT_MID', fontSize: 16 },
        { id: 'm4', x: 20, y: 210, width: 280, height: 50, ...createWidgetDefaults('button'), text: '📊 数据统计', bgColor: '#313149', borderColor: '#8b5cf6', borderWidth: 1, radius: 8, align: 'LEFT_MID', fontSize: 16 },
        { id: 'm5', x: 20, y: 275, width: 280, height: 50, ...createWidgetDefaults('button'), text: '💾 存储管理', bgColor: '#313149', borderColor: '#8b5cf6', borderWidth: 1, radius: 8, align: 'LEFT_MID', fontSize: 16 },
        { id: 'm6', x: 20, y: 340, width: 280, height: 50, ...createWidgetDefaults('button'), text: '❓ 关于设备', bgColor: '#313149', borderColor: '#8b5cf6', borderWidth: 1, radius: 8, align: 'LEFT_MID', fontSize: 16 },
        { id: 'm7', x: 20, y: 420, width: 280, height: 44, ...createWidgetDefaults('button'), text: '↩ 返回', bgColor: '#ef4444', borderColor: '#dc2626', radius: 8 }
      ]
    }]
  },
  keypad: {
    project: { name: 'Keypad Demo', screen_width: 320, screen_height: 480, color_depth: '16bit' },
    pages: [{
      id: 'page_keypad', name: '键盘', width: 320, height: 480, bg_color: '#1e1e2e',
      widgets: [
        { id: 'k1', x: 20, y: 30, width: 280, height: 28, ...createWidgetDefaults('label'), text: '请输入密码', textColor: '#a1a1aa', fontSize: 16 },
        { id: 'k2', x: 20, y: 68, width: 280, height: 44, ...createWidgetDefaults('textbox'), textColor: '#e4e4e7', bgColor: '#313149', borderColor: '#8b5cf6', borderWidth: 2, radius: 6 },
        { id: 'k3', x: 20, y: 130, width: 88, height: 58, ...createWidgetDefaults('button'), text: '1', bgColor: '#313149', borderColor: '#3d3d5c', radius: 8, fontSize: 20 },
        { id: 'k4', x: 116, y: 130, width: 88, height: 58, ...createWidgetDefaults('button'), text: '2', bgColor: '#313149', borderColor: '#3d3d5c', radius: 8, fontSize: 20 },
        { id: 'k5', x: 212, y: 130, width: 88, height: 58, ...createWidgetDefaults('button'), text: '3', bgColor: '#313149', borderColor: '#3d3d5c', radius: 8, fontSize: 20 },
        { id: 'k6', x: 20, y: 196, width: 88, height: 58, ...createWidgetDefaults('button'), text: '4', bgColor: '#313149', borderColor: '#3d3d5c', radius: 8, fontSize: 20 },
        { id: 'k7', x: 116, y: 196, width: 88, height: 58, ...createWidgetDefaults('button'), text: '5', bgColor: '#313149', borderColor: '#3d3d5c', radius: 8, fontSize: 20 },
        { id: 'k8', x: 212, y: 196, width: 88, height: 58, ...createWidgetDefaults('button'), text: '6', bgColor: '#313149', borderColor: '#3d3d5c', radius: 8, fontSize: 20 },
        { id: 'k9', x: 20, y: 262, width: 88, height: 58, ...createWidgetDefaults('button'), text: '7', bgColor: '#313149', borderColor: '#3d3d5c', radius: 8, fontSize: 20 },
        { id: 'k10', x: 116, y: 262, width: 88, height: 58, ...createWidgetDefaults('button'), text: '8', bgColor: '#313149', borderColor: '#3d3d5c', radius: 8, fontSize: 20 },
        { id: 'k11', x: 212, y: 262, width: 88, height: 58, ...createWidgetDefaults('button'), text: '9', bgColor: '#313149', borderColor: '#3d3d5c', radius: 8, fontSize: 20 },
        { id: 'k12', x: 20, y: 328, width: 88, height: 58, ...createWidgetDefaults('button'), text: '*', bgColor: '#313149', borderColor: '#3d3d5c', radius: 8, fontSize: 20 },
        { id: 'k13', x: 116, y: 328, width: 88, height: 58, ...createWidgetDefaults('button'), text: '0', bgColor: '#313149', borderColor: '#3d3d5c', radius: 8, fontSize: 20 },
        { id: 'k14', x: 212, y: 328, width: 88, height: 58, ...createWidgetDefaults('button'), text: '#', bgColor: '#313149', borderColor: '#3d3d5c', radius: 8, fontSize: 20 },
        { id: 'k15', x: 20, y: 400, width: 130, height: 50, ...createWidgetDefaults('button'), text: '❌ 取消', bgColor: '#313149', borderColor: '#3d3d5c', radius: 8 },
        { id: 'k16', x: 170, y: 400, width: 130, height: 50, ...createWidgetDefaults('button'), text: '✅ 确认', bgColor: '#22c55e', borderColor: '#16a34a', radius: 8 }
      ]
    }]
  }
};
