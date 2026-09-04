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

function loadDemo(type) {
  AppState.reset();
  const demo = DEMOS[type];
  if (!demo) return;
  Object.assign(AppState.project, demo.project);
  AppState.project.pages = demo.pages;
  AppState.currentPageId = demo.pages[0].id;
  AppState.migrateProject();
  AppState.save();
  showToast('Demo 已加载', 'success');
  setTimeout(() => navigate('editor'), 300);
}

/** 构造控件：合并默认属性；有 parentId 时坐标为相对父对象 */
function w(id, type, x, y, width, height, props = {}) {
  return { id, name: props.name || id, x, y, width, height, ...createWidgetDefaults(type), ...props };
}

const DEMOS = {
  dashboard: {
    project: {
      name: 'Smart Dashboard',
      version: '0.1.7',
      screen_width: 480,
      screen_height: 320,
      color_depth: '16bit',
      screen_shape: 'rect',
    },
    pages: [{
      id: 'page_dashboard',
      name: '仪表盘',
      width: 480,
      height: 320,
      bg_color: '#1e1e2e',
      widgets: [
        w('title', 'label', 20, 16, 320, 36, {
          text: '智能家居控制台',
          textColor: '#e4e4e7',
          fontSize: 22,
          align: 'LEFT_MID',
        }),
        // 温度卡片：子标签相对父 rect
        w('card_temp', 'rect', 20, 70, 200, 100, {
          color: '#313149',
          borderColor: '#8b5cf6',
          borderWidth: 2,
          radius: 8,
        }),
        w('lbl_temp_cap', 'label', 12, 10, 160, 20, {
          parentId: 'card_temp',
          text: '温度',
          textColor: '#a1a1aa',
          fontSize: 12,
          align: 'LEFT_MID',
        }),
        w('lbl_temp_val', 'label', 12, 38, 160, 40, {
          parentId: 'card_temp',
          text: '23C',
          textColor: '#8b5cf6',
          fontSize: 28,
          align: 'LEFT_MID',
        }),
        // 湿度卡片
        w('card_humi', 'rect', 240, 70, 200, 100, {
          color: '#313149',
          borderColor: '#22c55e',
          borderWidth: 2,
          radius: 8,
        }),
        w('lbl_humi_cap', 'label', 12, 10, 160, 20, {
          parentId: 'card_humi',
          text: '湿度',
          textColor: '#a1a1aa',
          fontSize: 12,
          align: 'LEFT_MID',
        }),
        w('lbl_humi_val', 'label', 12, 38, 160, 40, {
          parentId: 'card_humi',
          text: '55%',
          textColor: '#22c55e',
          fontSize: 28,
          align: 'LEFT_MID',
        }),
        w('btn_light', 'button', 20, 200, 140, 44, {
          text: '开灯',
          color: '#f59e0b',
          textColor: '#ffffff',
          borderColor: '#d97706',
          borderWidth: 1,
          radius: 8,
        }),
        w('btn_ac', 'button', 170, 200, 140, 44, {
          text: '启动空调',
          color: '#8b5cf6',
          textColor: '#ffffff',
          borderColor: '#7c3aed',
          borderWidth: 1,
          radius: 8,
        }),
        w('btn_off', 'button', 320, 200, 140, 44, {
          text: '全部关闭',
          color: '#ef4444',
          textColor: '#ffffff',
          borderColor: '#dc2626',
          borderWidth: 1,
          radius: 8,
        }),
        w('prog_power', 'progress', 20, 270, 440, 24, {
          value: 75,
          fillColor: '#22c55e',
          trackColor: '#313149',
          borderColor: '#3d3d5c',
          radius: 4,
        }),
      ],
    }],
  },
  menu: {
    project: {
      name: 'Device Menu',
      version: '0.1.7',
      screen_width: 320,
      screen_height: 480,
      color_depth: '16bit',
      screen_shape: 'rect',
    },
    pages: [{
      id: 'page_menu',
      name: '菜单',
      width: 320,
      height: 480,
      bg_color: '#1e1e2e',
      widgets: [
        w('header', 'rect', 0, 0, 320, 60, {
          color: '#8b5cf6',
          borderWidth: 0,
          radius: 0,
        }),
        w('header_title', 'label', 16, 14, 240, 32, {
          parentId: 'header',
          text: '设备菜单',
          textColor: '#ffffff',
          fontSize: 20,
          align: 'LEFT_MID',
        }),
        w('btn_settings', 'button', 20, 80, 280, 50, {
          text: '系统设置',
          color: '#313149',
          textColor: '#e4e4e7',
          borderColor: '#8b5cf6',
          borderWidth: 1,
          radius: 8,
          align: 'LEFT_MID',
          fontSize: 16,
        }),
        w('btn_network', 'button', 20, 145, 280, 50, {
          text: '网络配置',
          color: '#313149',
          textColor: '#e4e4e7',
          borderColor: '#8b5cf6',
          borderWidth: 1,
          radius: 8,
          align: 'LEFT_MID',
          fontSize: 16,
        }),
        w('btn_stats', 'button', 20, 210, 280, 50, {
          text: '数据统计',
          color: '#313149',
          textColor: '#e4e4e7',
          borderColor: '#8b5cf6',
          borderWidth: 1,
          radius: 8,
          align: 'LEFT_MID',
          fontSize: 16,
        }),
        w('btn_storage', 'button', 20, 275, 280, 50, {
          text: '存储管理',
          color: '#313149',
          textColor: '#e4e4e7',
          borderColor: '#8b5cf6',
          borderWidth: 1,
          radius: 8,
          align: 'LEFT_MID',
          fontSize: 16,
        }),
        w('btn_about', 'button', 20, 340, 280, 50, {
          text: '关于设备',
          color: '#313149',
          textColor: '#e4e4e7',
          borderColor: '#8b5cf6',
          borderWidth: 1,
          radius: 8,
          align: 'LEFT_MID',
          fontSize: 16,
        }),
        w('btn_back', 'button', 20, 420, 280, 44, {
          text: '返回',
          color: '#ef4444',
          textColor: '#ffffff',
          borderColor: '#dc2626',
          borderWidth: 1,
          radius: 8,
        }),
      ],
    }],
  },
  keypad: {
    project: {
      name: 'Keypad Demo',
      version: '0.1.7',
      screen_width: 320,
      screen_height: 480,
      color_depth: '16bit',
      screen_shape: 'rect',
    },
    pages: [{
      id: 'page_keypad',
      name: '键盘',
      width: 320,
      height: 480,
      bg_color: '#1e1e2e',
      widgets: [
        w('lbl_hint', 'label', 20, 30, 280, 28, {
          text: '请输入密码',
          textColor: '#a1a1aa',
          fontSize: 16,
          align: 'LEFT_MID',
        }),
        w('tb_pin', 'textbox', 20, 68, 280, 44, {
          text: '',
          textColor: '#e4e4e7',
          bgColor: '#313149',
          borderColor: '#8b5cf6',
          borderWidth: 2,
          radius: 6,
        }),
        // 数字键父容器：按键相对坐标，拖动面板整体移动
        w('kbd_panel', 'rect', 20, 130, 280, 250, {
          color: '#252536',
          borderColor: '#3d3d5c',
          borderWidth: 1,
          radius: 8,
        }),
        ...(() => {
          const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
          const out = [];
          keys.forEach((ch, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            out.push(w(`key_${ch === '*' ? 'star' : ch === '#' ? 'hash' : ch}`, 'button',
              8 + col * 90, 8 + row * 60, 84, 52, {
                parentId: 'kbd_panel',
                text: ch,
                color: '#313149',
                textColor: '#e4e4e7',
                borderColor: '#3d3d5c',
                borderWidth: 1,
                radius: 8,
                fontSize: 20,
              }));
          });
          return out;
        })(),
        w('btn_cancel', 'button', 20, 400, 130, 50, {
          text: '取消',
          color: '#313149',
          textColor: '#e4e4e7',
          borderColor: '#3d3d5c',
          borderWidth: 1,
          radius: 8,
        }),
        w('btn_ok', 'button', 170, 400, 130, 50, {
          text: '确认',
          color: '#22c55e',
          textColor: '#ffffff',
          borderColor: '#16a34a',
          borderWidth: 1,
          radius: 8,
        }),
      ],
    }],
  },
};
