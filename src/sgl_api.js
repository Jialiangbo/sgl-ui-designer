/**
 * SGL API 真实接口定义
 * 
 * SGL 使用 parent-based 对象模型:
 * - 每个组件通过 sgl_<type>_create(parent) 创建
 * - 位置/尺寸通过 sgl_obj_set_pos/size 设置
 * - 组件特定属性通过 sgl_<type>_set_<property> 设置
 * - 颜色使用 sgl_color_t 类型 (RGB565格式)
 */

// ============ 对齐方式 ============
export const SGL_ALIGN = {
  LEFT: 'LEFT',
  CENTER: 'CENTER',
  RIGHT: 'RIGHT',
  TOP: 'TOP',
  BOTTOM: 'BOTTOM'
};

// ============ 方向 ============
export const SGL_DIRECT = {
  HORIZONTAL: 0,
  VERTICAL: 1
};

// ============ 组件类型定义 ============
// 每个组件定义包含:
// - type: SGL API 中的组件类型名
// - name: 中文显示名
// - icon: 图标
// - category: 分组 (basic/advanced/input/display/special)
// - defaultSize: 默认尺寸 [w, h]
// - properties: 可配置属性列表

export const SGL_WIDGET_TYPES = [
  // ============ 基础组件 ============
  {
    type: 'rect',
    name: '矩形',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>',
    category: 'basic',
    defaultSize: [120, 80],
    properties: ['color', 'bgColor', 'borderColor', 'borderAlpha', 'borderWidth', 'radius', 'mainAlpha', 'alpha', 'pixmap', 'locked']
  },
  {
    type: 'circle',
    name: '圆形',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>',
    category: 'basic',
    defaultSize: [60, 60],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'alpha', 'xOffset', 'yOffset', 'locked']
  },
  {
    type: 'ring',
    name: '圆环',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></svg>',
    category: 'basic',
    defaultSize: [60, 60],
    properties: ['color', 'borderWidth', 'alpha', 'locked']
  },
  {
    type: 'arc',
    name: '弧形',
    icon: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 1 9 9"/></svg>',
    category: 'basic',
    defaultSize: [60, 60],
    properties: ['color', 'borderWidth', 'alpha', 'locked']
  },
  {
    type: 'line',
    name: '直线',
    icon: '<svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/></svg>',
    category: 'basic',
    defaultSize: [120, 4],
    properties: ['color', 'borderWidth', 'alpha', 'dashed', 'dashLen', 'gapLen', 'locked']
  },
  {
    type: 'polygon',
    name: '多边形',
    icon: '<svg viewBox="0 0 24 24"><polygon points="12,2 22,9 18,21 6,21 2,9"/></svg>',
    category: 'basic',
    defaultSize: [80, 80],
    properties: ['color', 'borderColor', 'borderWidth', 'alpha', 'locked']
  },

  // ============ 按钮与交互 ============
  {
    type: 'button',
    name: '按钮',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="3"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    category: 'interactive',
    defaultSize: [120, 40],
    properties: ['text', 'color', 'textColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'align', 'fontSize', 'fontFamily', 'fontBpp', 'locked']
  },
  {
    type: 'switch',
    name: '开关',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3"/></svg>',
    category: 'interactive',
    defaultSize: [60, 30],
    properties: ['status', 'color', 'bgColor', 'knobColor', 'borderColor', 'borderWidth', 'radius', 'knobRadius', 'knobMargin', 'alpha', 'locked']
  },
  {
    type: 'checkbox',
    name: '复选框',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1"/><polyline points="5,7 7,9 11,4"/></svg>',
    category: 'interactive',
    defaultSize: [120, 24],
    properties: ['text', 'color', 'textColor', 'bgColor', 'borderColor', 'borderWidth', 'status', 'radius', 'alpha', 'align', 'fontSize', 'fontFamily', 'fontBpp', 'locked']
  },
  {
    type: 'slider',
    name: '滑块',
    icon: '<svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><circle cx="14" cy="12" r="3"/></svg>',
    category: 'interactive',
    defaultSize: [160, 30],
    properties: ['value', 'direct', 'fillColor', 'trackColor', 'knobColor', 'borderWidth', 'radius', 'thickness', 'alpha', 'locked']
  },
  {
    type: 'numberkbd',
    name: '数字键盘',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="10" y="3" width="5" height="5" rx="1"/><rect x="17" y="3" width="5" height="5" rx="1"/><rect x="3" y="10" width="5" height="5" rx="1"/><rect x="10" y="10" width="5" height="5" rx="1"/><rect x="17" y="10" width="5" height="5" rx="1"/><rect x="3" y="17" width="5" height="5" rx="1"/><rect x="10" y="17" width="12" height="5" rx="1"/></svg>',
    category: 'interactive',
    defaultSize: [200, 240],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'fontSize', 'fontFamily', 'fontBpp', 'locked']
  },
  {
    type: 'keyboard',
    name: '键盘',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10.01"/><line x1="10" y1="10" x2="10" y2="10.01"/><line x1="14" y1="10" x2="14" y2="10.01"/><line x1="18" y1="10" x2="18" y2="10.01"/><line x1="8" y1="14" x2="16" y2="14"/></svg>',
    category: 'interactive',
    defaultSize: [320, 180],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'fontSize', 'fontFamily', 'fontBpp', 'locked']
  },

  // ============ 文本相关 ============
  {
    type: 'label',
    name: '标签',
    icon: '<svg viewBox="0 0 24 24"><text x="4" y="17" font-size="14" font-weight="bold" fill="currentColor" stroke="none">Aa</text></svg>',
    category: 'text',
    defaultSize: [120, 24],
    properties: ['text', 'color', 'textColor', 'bgColor', 'align', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'textOffsetX', 'textOffsetY', 'textRotation', 'radius', 'locked']
  },
  {
    type: 'textbox',
    name: '文本框',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="13" y2="13"/></svg>',
    category: 'text',
    defaultSize: [160, 36],
    properties: ['text', 'textColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'fontSize', 'fontFamily', 'fontBpp', 'lineMargin', 'alpha', 'locked']
  },
  {
    type: 'textline',
    name: '文本行',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>',
    category: 'text',
    defaultSize: [160, 30],
    properties: ['text', 'color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'align', 'locked']
  },
  {
    type: 'textlist',
    name: '文本列表',
    icon: '<svg viewBox="0 0 24 24"><line x1="5" y1="7" x2="19" y2="7"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/></svg>',
    category: 'text',
    defaultSize: [160, 120],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'fontSize', 'fontFamily', 'fontBpp', 'lineMargin', 'alpha', 'locked']
  },

  // ============ 显示/进度 ============
  {
    type: 'progress',
    name: '进度条',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="9" width="20" height="6" rx="3"/><rect x="2" y="9" width="13" height="6" rx="3"/></svg>',
    category: 'display',
    defaultSize: [180, 20],
    properties: ['value', 'fillColor', 'trackColor', 'borderColor', 'borderWidth', 'radius', 'fillGap', 'fillRadius', 'fillWidth', 'alpha', 'locked']
  },
  {
    type: 'bar',
    name: '柱状条',
    icon: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="16" rx="1"/><rect x="14" y="10" width="6" height="10" rx="1"/></svg>',
    category: 'display',
    defaultSize: [60, 100],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'value', 'locked']
  },
  {
    type: 'gauge',
    name: '仪表盘',
    icon: '<svg viewBox="0 0 24 24"><path d="M4 17a8 8 0 0 1 16 0"/><line x1="12" y1="14" x2="15" y2="8"/><circle cx="12" cy="14" r="1"/></svg>',
    category: 'display',
    defaultSize: [100, 100],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'alpha', 'value', 'locked']
  },
  {
    type: 'spectrum',
    name: '频谱',
    icon: '<svg viewBox="0 0 24 24"><line x1="4" y1="18" x2="4" y2="10"/><line x1="8" y1="18" x2="8" y2="6"/><line x1="12" y1="18" x2="12" y2="8"/><line x1="16" y1="18" x2="16" y2="4"/><line x1="20" y1="18" x2="20" y2="12"/></svg>',
    category: 'display',
    defaultSize: [160, 60],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'alpha', 'locked']
  },
  {
    type: 'battery',
    name: '电池',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="18" height="10" rx="2"/><rect x="5" y="9" width="10" height="6" rx="1"/><line x1="22" y1="10" x2="22" y2="14"/></svg>',
    category: 'display',
    defaultSize: [60, 30],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'value', 'locked']
  },

  // ============ 图像/视图 ============
  {
    type: 'icon',
    name: '图标',
    icon: '<svg viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9"/></svg>',
    category: 'image',
    defaultSize: [40, 40],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'locked']
  },
  {
    type: 'led',
    name: 'LED指示灯',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="5.5" fill="currentColor" opacity="0.9"/><circle cx="10" cy="10" r="1.5" fill="#fff" opacity="0.5"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="1" opacity="0.5"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="1" opacity="0.5"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="1" opacity="0.5"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="1" opacity="0.5"/></svg>',
    category: 'display',
    defaultSize: [20, 20],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'alpha', 'status', 'locked']
  },
  {
    type: 'msgbox',
    name: '消息框',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="7" y1="7" x2="7" y2="7.01"/></svg>',
    category: 'special',
    defaultSize: [200, 120],
    properties: ['text', 'color', 'textColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'fontSize', 'fontFamily', 'fontBpp', 'locked']
  },
  {
    type: 'viewlist',
    name: '视图列表',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="6" rx="1"/><rect x="3" y="11" width="18" height="6" rx="1"/><rect x="3" y="19" width="18" height="2" rx="1"/></svg>',
    category: 'display',
    defaultSize: [160, 120],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'fontSize', 'fontFamily', 'fontBpp', 'lineMargin', 'alpha', 'locked']
  },
  {
    type: 'dropdown',
    name: '下拉框',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="8,11 12,15 16,11"/></svg>',
    category: 'interactive',
    defaultSize: [160, 36],
    properties: ['text', 'color', 'textColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'fontSize', 'fontFamily', 'fontBpp', 'locked']
  },
  {
    type: 'scroll',
    name: '滚动容器',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="19" y1="7" x2="19" y2="17"/><line x1="17" y1="9" x2="17" y2="15"/></svg>',
    category: 'special',
    defaultSize: [160, 120],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'locked']
  },
  {
    type: 'box',
    name: '容器盒',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
    category: 'special',
    defaultSize: [160, 120],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'locked']
  },
  {
    type: 'win',
    name: '窗口',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="8" x2="21" y2="8"/><circle cx="7" cy="5.5" r="1"/><circle cx="11" cy="5.5" r="1"/><circle cx="15" cy="5.5" r="1"/></svg>',
    category: 'special',
    defaultSize: [200, 150],
    properties: ['text', 'color', 'textColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'fontSize', 'fontFamily', 'fontBpp', 'locked']
  },
  {
    type: 'qrcode',
    name: '二维码',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/></svg>',
    category: 'image',
    defaultSize: [80, 80],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'alpha', 'locked']
  },
  {
    type: 'scope',
    name: '示波器',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="5,12 8,8 11,14 14,10 17,12 20,12"/></svg>',
    category: 'display',
    defaultSize: [160, 100],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'locked']
  },
  {
    type: 'chart',
    name: '图表',
    icon: '<svg viewBox="0 0 24 24"><polyline points="4,18 8,10 12,14 16,6 20,12"/></svg>',
    category: 'display',
    defaultSize: [200, 120],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'locked']
  },
  {
    type: 'canvas',
    name: '画布',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="7" x2="17" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="17" x2="12" y2="17"/></svg>',
    category: 'special',
    defaultSize: [160, 120],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'locked']
  },
  {
    type: '2dball',
    name: '2D弹球',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><line x1="8" y1="8" x2="12" y2="12"/></svg>',
    category: 'special',
    defaultSize: [120, 80],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'locked']
  },
  {
    type: 'sprite',
    name: '精灵动画',
    icon: '<svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg>',
    category: 'special',
    defaultSize: [48, 48],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'locked']
  },
  {
    type: 'analogclock',
    name: '模拟时钟',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="12" y1="12" x2="12" y2="7"/><line x1="12" y1="12" x2="16" y2="12"/></svg>',
    category: 'display',
    defaultSize: [80, 80],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'alpha', 'locked']
  },
  {
    type: 'ext_img',
    name: '外部图片',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><polyline points="4,18 9,13 13,17 17,12 20,15"/></svg>',
    category: 'image',
    defaultSize: [100, 100],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'locked']
  }
];

// ============ 属性元数据：中文名 + 输入类型 ============
// type: 'text' | 'number' | 'color' | 'bool' | 'select'
export const PROP_META = {
  text: { label: '文本内容', type: 'text' },
  color: { label: '主色', type: 'color' },
  textColor: { label: '文字颜色', type: 'color' },
  bgColor: { label: '背景色', type: 'color' },
  borderColor: { label: '边框颜色', type: 'color' },
  knobColor: { label: '旋钮颜色', type: 'color' },
  fillColor: { label: '填充色', type: 'color' },
  trackColor: { label: '轨道颜色', type: 'color' },
  borderWidth: { label: '边框宽度', type: 'number', min: 0, max: 20 },
  radius: { label: '圆角半径', type: 'number', min: 0, max: 100 },
  alpha: { label: '透明度', type: 'number', min: 0, max: 255 },
  mainAlpha: { label: '填充透明度', type: 'number', min: 0, max: 255 },
  borderAlpha: { label: '边框透明度', type: 'number', min: 0, max: 255 },
  pixmap: { label: '图片', type: 'select' },
  align: { label: '对齐方式', type: 'select', options: [['LEFT', '左'], ['CENTER', '居中'], ['RIGHT', '右']] },
  fontSize: { label: '字体大小', type: 'number', min: 8, max: 72 },
  fontFamily: { label: '字体文件', type: 'select', options: [['simsun.ttc', '宋体'], ['simhei.ttf', '黑体'], ['simkai.ttf', '楷体'], ['simsunb.ttf', '宋体加粗'], ['msyh.ttf', '微软雅黑'], ['arial.ttf', 'Arial'], ['DejaVuSans.ttf', 'DejaVu Sans'], ['sourcehansans.ttf', '思源黑体'], ['notosanscjk.ttf', 'Noto Sans CJK'], ['default', '默认字体']] },
  fontBpp: { label: '抗锯齿', type: 'select', options: [[1, '1'], [2, '2'], [4, '4']] },
  status: { label: '开关状态', type: 'bool' },
  knobRadius: { label: '旋钮半径', type: 'number', min: 2, max: 50 },
  knobMargin: { label: '旋钮边距', type: 'number', min: 0, max: 20 },
  value: { label: '值 (0-100)', type: 'number', min: 0, max: 100 },
  direct: { label: '方向', type: 'select', options: [[0, '水平'], [1, '垂直']] },
  thickness: { label: '厚度', type: 'number', min: 2, max: 30 },
  xOffset: { label: 'X 偏移', type: 'number', min: -50, max: 50 },
  yOffset: { label: 'Y 偏移', type: 'number', min: -50, max: 50 },
  textOffsetX: { label: '文本 X 偏移', type: 'number', min: -50, max: 50 },
  textOffsetY: { label: '文本 Y 偏移', type: 'number', min: -50, max: 50 },
  textRotation: { label: '文本旋转 (°)', type: 'number', min: -180, max: 180 },
  dashed: { label: '虚线', type: 'bool' },
  dashLen: { label: '虚线长度', type: 'number', min: 1, max: 50 },
  gapLen: { label: '虚线间隔', type: 'number', min: 1, max: 50 },
  lineMargin: { label: '行间距', type: 'number', min: 0, max: 30 },
  fillGap: { label: '填充间隔', type: 'number', min: 0, max: 20 },
  fillRadius: { label: '填充圆角', type: 'number', min: 0, max: 20 },
  fillWidth: { label: '填充宽度', type: 'number', min: 0, max: 20 },
  locked: { label: '锁定控件', type: 'bool' },
  eventCb: { label: '事件回调函数', type: 'text' },
  parentId: { label: '父对象', type: 'parentSelect' },

  // 事件回调属性（按 SGL 事件类型）
  onPressed: { label: 'PRESSED 按下', type: 'text', event: 'SGL_EVENT_PRESSED' },
  onReleased: { label: 'RELEASED 释放', type: 'text', event: 'SGL_EVENT_RELEASED' },
  onClicked: { label: 'CLICKED 点击', type: 'text', event: 'SGL_EVENT_CLICKED' },
  onLongClicked: { label: 'LONG_CLICKED 长按', type: 'text', event: 'SGL_EVENT_LONG_CLICKED' },
  onLongPressed: { label: 'LONG_PRESSED 长按触发', type: 'text', event: 'SGL_EVENT_LONG_PRESSED' },
  onMotion: { label: 'MOTION 滑动', type: 'text', event: 'SGL_EVENT_MOTION' },
  onMoveUp: { label: 'MOVE_UP 上移', type: 'text', event: 'SGL_EVENT_MOVE_UP' },
  onMoveDown: { label: 'MOVE_DOWN 下移', type: 'text', event: 'SGL_EVENT_MOVE_DOWN' },
  onMoveLeft: { label: 'MOVE_LEFT 左移', type: 'text', event: 'SGL_EVENT_MOVE_LEFT' },
  onMoveRight: { label: 'MOVE_RIGHT 右移', type: 'text', event: 'SGL_EVENT_MOVE_RIGHT' },
  onFocused: { label: 'FOCUSED 获得焦点', type: 'text', event: 'SGL_EVENT_FOCUSED' },
  onUnfocused: { label: 'UNFOCUSED 失去焦点', type: 'text', event: 'SGL_EVENT_UNFOCUSED' },
  onKeyUp: { label: 'KEY_UP 上键', type: 'text', event: 'SGL_EVENT_KEY_UP' },
  onKeyDown: { label: 'KEY_DOWN 下键', type: 'text', event: 'SGL_EVENT_KEY_DOWN' },
  onKeyLeft: { label: 'KEY_LEFT 左键', type: 'text', event: 'SGL_EVENT_KEY_LEFT' },
  onKeyRight: { label: 'KEY_RIGHT 右键', type: 'text', event: 'SGL_EVENT_KEY_RIGHT' },
  onKeyEnter: { label: 'KEY_ENTER 确认键', type: 'text', event: 'SGL_EVENT_KEY_ENTER' },
  onKeyEsc: { label: 'KEY_ESC 取消键', type: 'text', event: 'SGL_EVENT_KEY_ESC' },
};

// ============ 各控件类型支持的事件列表 ============
export const WIDGET_EVENTS = {
  // 基础图形：支持按下/释放（可点击）
  rect: ['onPressed', 'onReleased'],
  circle: [],
  ring: [],
  arc: [],
  line: [],
  polygon: [],
  // 交互组件
  button: ['onPressed', 'onReleased', 'onClicked', 'onLongClicked'],
  switch: ['onPressed', 'onClicked'],
  checkbox: ['onPressed', 'onClicked'],
  slider: ['onPressed', 'onReleased', 'onMotion', 'onMoveUp', 'onMoveDown', 'onMoveLeft', 'onMoveRight'],
  numberkbd: ['onPressed', 'onReleased'],
  keyboard: ['onPressed', 'onReleased', 'onKeyRight', 'onKeyEnter'],
  dropdown: ['onClicked', 'onReleased', 'onMoveUp', 'onMoveDown', 'onKeyEnter'],
  // 文本组件
  label: [],
  textbox: ['onPressed', 'onReleased', 'onFocused', 'onUnfocused', 'onMoveUp', 'onMoveDown'],
  textline: [],
  textlist: ['onClicked', 'onReleased', 'onMoveUp', 'onMoveDown', 'onKeyEnter', 'onKeyDown', 'onKeyUp'],
  // 显示组件
  progress: [],
  bar: ['onPressed', 'onReleased', 'onMotion', 'onMoveUp', 'onMoveDown', 'onMoveLeft', 'onMoveRight'],
  gauge: [],
  spectrum: [],
  battery: [],
  led: [],
  viewlist: ['onMoveUp', 'onMoveDown', 'onReleased', 'onClicked'],
  qrcode: [],
  scope: [],
  chart: [],
  analogclock: [],
  // 特殊组件
  msgbox: ['onPressed', 'onReleased', 'onKeyLeft', 'onKeyRight', 'onKeyEnter'],
  scroll: ['onMoveUp', 'onMoveDown', 'onMoveLeft', 'onMoveRight'],
  box: ['onPressed', 'onReleased', 'onMoveUp', 'onMoveDown', 'onMoveLeft', 'onMoveRight'],
  win: ['onPressed', 'onClicked'],
  canvas: [],
  '2dball': [],
  sprite: [],
  // 图像组件
  icon: [],
  ext_img: ['onPressed', 'onReleased'],
};

// ============ 组件分类 ============
export const WIDGET_CATEGORIES = [
  { id: 'basic', name: '基础图形', types: ['rect', 'circle', 'ring', 'arc', 'line', 'polygon'] },
  { id: 'interactive', name: '交互组件', types: ['button', 'switch', 'checkbox', 'slider', 'numberkbd', 'keyboard', 'dropdown'] },
  { id: 'text', name: '文本组件', types: ['label', 'textbox', 'textline', 'textlist'] },
  { id: 'display', name: '显示组件', types: ['progress', 'bar', 'gauge', 'spectrum', 'battery', 'led', 'viewlist', 'qrcode', 'scope', 'chart', 'analogclock'] },
  { id: 'special', name: '特殊组件', types: ['msgbox', 'scroll', 'box', 'win', 'canvas', '2dball', 'sprite'] },
  { id: 'image', name: '图像组件', types: ['icon', 'ext_img'] }
];

// ============ 组件默认值工厂 ============
export function createWidgetDefaults(type) {
  const base = {
    type,
    alpha: 255,
    zIndex: 0,
    locked: false,
    parentId: null,
    events: []
  };

  switch (type) {
    case 'rect':
      return { ...base, color: '#8b5cf6', bgColor: '#313149', borderColor: '#7c3aed', borderWidth: 2, borderAlpha: 255, radius: 6, mainAlpha: 255, pixmap: '' };
    case 'circle':
      return { ...base, color: '#8b5cf6', bgColor: 'transparent', borderColor: '#7c3aed', borderWidth: 2, xOffset: 0, yOffset: 0 };
    case 'ring':
      return { ...base, color: '#8b5cf6', borderWidth: 4 };
    case 'arc':
      return { ...base, color: '#8b5cf6', borderWidth: 4 };
    case 'line':
      return { ...base, color: '#8b5cf6', borderWidth: 2, dashed: false, dashLen: 10, gapLen: 5 };
    case 'polygon':
      return { ...base, color: '#8b5cf6', borderColor: '#7c3aed', borderWidth: 2 };
    case 'button':
      return { ...base, text: '按钮', color: '#8b5cf6', textColor: '#ffffff', bgColor: '#8b5cf6', borderColor: '#7c3aed', borderWidth: 1, radius: 8, align: 'CENTER', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'switch':
      return { ...base, status: false, color: '#8b5cf6', bgColor: '#313149', knobColor: '#ffffff', borderColor: '#3d3d5c', borderWidth: 1, radius: 15, knobRadius: 10, knobMargin: 2 };
    case 'checkbox':
      return { ...base, text: '选项', color: '#8b5cf6', textColor: '#e4e4e7', bgColor: 'transparent', borderColor: 'transparent', borderWidth: 0, status: true, radius: 4, align: 'LEFT', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'slider':
      return { ...base, value: 50, direct: 0, fillColor: '#8b5cf6', trackColor: '#313149', knobColor: '#ffffff', borderWidth: 0, radius: 4, thickness: 8 };
    case 'numberkbd':
      return { ...base, color: '#313149', bgColor: '#1e1e2e', borderColor: '#8b5cf6', borderWidth: 2, radius: 8, fontSize: 18, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'keyboard':
      return { ...base, color: '#313149', bgColor: '#1e1e2e', borderColor: '#8b5cf6', borderWidth: 2, radius: 6, fontSize: 16, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'label':
      return { ...base, text: '标签文本', color: '#e4e4e7', textColor: '#e4e4e7', bgColor: 'transparent', align: 'LEFT', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, textOffsetX: 0, textOffsetY: 0, textRotation: 0, radius: 0 };
    case 'textbox':
      return { ...base, text: '', textColor: '#e4e4e7', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 2, radius: 6, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, lineMargin: 0 };
    case 'textline':
      return { ...base, text: '', color: '#e4e4e7', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, align: 'LEFT' };
    case 'textlist':
      return { ...base, color: '#313149', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fontSize: 12, fontFamily: 'simsun.ttc', fontBpp: 4, lineMargin: 4 };
    case 'progress':
      return { ...base, value: 60, fillColor: '#22c55e', trackColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fillGap: 2, fillRadius: 2, fillWidth: 0 };
    case 'bar':
      return { ...base, color: '#8b5cf6', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, radius: 2, value: 50 };
    case 'gauge':
      return { ...base, color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 2, value: 50 };
    case 'spectrum':
      return { ...base, color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1 };
    case 'battery':
      return { ...base, color: '#22c55e', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, radius: 2, value: 80 };
    case 'icon':
      return { ...base, color: '#8b5cf6', bgColor: 'transparent', borderColor: 'transparent', borderWidth: 0, radius: 4 };
    case 'led':
      return { ...base, color: '#22c55e', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, status: true };
    case 'msgbox':
      return { ...base, text: '提示信息', color: '#8b5cf6', textColor: '#ffffff', bgColor: '#313149', borderColor: '#8b5cf6', borderWidth: 2, radius: 8, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'viewlist':
      return { ...base, color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fontSize: 12, fontFamily: 'simsun.ttc', fontBpp: 4, lineMargin: 4 };
    case 'dropdown':
      return { ...base, text: '请选择', color: '#e4e4e7', textColor: '#e4e4e7', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'scroll':
      return { ...base, color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4 };
    case 'box':
      return { ...base, color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#8b5cf6', borderWidth: 2, radius: 4 };
    case 'win':
      return { ...base, text: '窗口标题', color: '#8b5cf6', textColor: '#ffffff', bgColor: '#2a2a3e', borderColor: '#8b5cf6', borderWidth: 2, radius: 8, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'qrcode':
      return { ...base, color: '#000000', bgColor: '#ffffff', borderColor: '#3d3d5c', borderWidth: 0 };
    case 'scope':
      return { ...base, color: '#22c55e', bgColor: '#0f1a0f', borderColor: '#3d3d5c', borderWidth: 1, radius: 4 };
    case 'chart':
      return { ...base, color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4 };
    case 'canvas':
      return { ...base, color: '#ffffff', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4 };
    case '2dball':
      return { ...base, color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4 };
    case 'sprite':
      return { ...base, color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4 };
    case 'analogclock':
      return { ...base, color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 2 };
    case 'ext_img':
      return { ...base, color: '#ffffff', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, radius: 4 };
    default:
      return { ...base, color: '#8b5cf6', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, radius: 4 };
  }
}

// ============ SGL 代码生成器 ============
export function generateSGLCode(project) {
  const fonts = collectFonts(project);

  let code = `/* ============================================\n`;
  code += ` * SGL UI Designer - Auto Generated Code\n`;
  code += ` * Project: ${project.name}\n`;
  code += ` * Screen: ${project.screen_width}x${project.screen_height}\n`;
  code += ` * Color Depth: ${project.color_depth}\n`;
  code += ` * Generated: ${new Date().toLocaleString()}\n`;
  code += ` * ============================================ */\n\n`;
  code += `#include "sgl.h"\n`;

  if (fonts.length > 0) {
    code += `\n/* ============================================\n`;
    code += ` * 字体字模声明（由 sgl_font_conv.exe 生成对应 C 文件）\n`;
    code += ` * 在导出目录下运行以下命令生成字体字模：\n`;
    fonts.forEach(f => {
      const fontC = `font_${f.family.replace(/[^\w]/g, '_')}_${f.size}_bpp${f.bpp}.c`;
      // 如果有完整路径则使用路径，否则使用文件名
      const fontPath = f.path || f.family;
      code += ` *   sgl_font_conv.exe --font ${fontPath} --size ${f.size} --bpp ${f.bpp} --output ${fontC}\n`;
    });
    code += ` * ============================================ */\n`;
    fonts.forEach(f => {
      const fontC = `font_${f.family.replace(/[^\w]/g, '_')}_${f.size}_bpp${f.bpp}.c`;
      code += `#include "${fontC}"\n`;
    });
  }

  code += `\n`;

  // 收集所有事件回调函数名，生成前向声明（基于 events 数组）
  const eventCbs = new Set();
  const eventWrappers = [];
  project.pages.forEach(page => {
    if (!Array.isArray(page.widgets)) return;
    page.widgets.forEach(w => {
      const events = (w.events || []).filter(e => e.callback && e.callback.trim());
      if (events.length > 0) {
        events.forEach(e => eventCbs.add(e.callback.trim()));
        eventWrappers.push({ widget: w, events });
      }
    });
  });

  if (eventCbs.size > 0) {
    code += `/* === 事件回调函数（弱定义，用户可覆盖实现） === */\n`;
    eventCbs.forEach(cb => {
      code += `sgl_weak_fn void ${cb}(sgl_event_t *e) { (void)e; }\n`;
    });
    code += `\n`;
  }

  // 生成事件分发包装函数
  if (eventWrappers.length > 0) {
    code += `/* === 事件分发包装函数 === */\n`;
    eventWrappers.forEach(({ widget, events }) => {
      const wrapperName = `_${sanitizeId(widget.id)}_event_handler`;
      code += `static void ${wrapperName}(sgl_event_t *e)\n{\n`;
      code += `    switch (e->type) {\n`;
      events.forEach(evt => {
        const eventType = PROP_META[evt.type]?.event;
        if (eventType) {
          code += `        case ${eventType}:\n`;
          code += `            ${evt.callback.trim()}(e);\n`;
          code += `            break;\n`;
        }
      });
      code += `        default: break;\n`;
      code += `    }\n`;
      code += `}\n\n`;
    });
  }

  // 按父子层级排序控件的辅助函数：父控件在前，子控件在后
  function sortWidgetsByHierarchy(widgets) {
    const widgetMap = new Map();
    widgets.forEach(w => widgetMap.set(w.id, w));
    const depthMap = new Map();
    function getDepth(w) {
      if (depthMap.has(w.id)) return depthMap.get(w.id);
      if (!w.parentId || !widgetMap.has(w.parentId)) {
        depthMap.set(w.id, 0);
        return 0;
      }
      const parent = widgetMap.get(w.parentId);
      const depth = getDepth(parent) + 1;
      depthMap.set(w.id, depth);
      return depth;
    }
    widgets.forEach(w => getDepth(w));
    return [...widgets].sort((a, b) => depthMap.get(a.id) - depthMap.get(b.id));
  }

  project.pages.forEach(page => {
    const pageId = sanitizeId(page.id);
    code += `/* === Page: ${page.name} === */\n`;
    code += `void ui_page_${pageId}_init(void)\n{\n`;
    code += `    sgl_obj_t *page_${pageId} = sgl_screen_act();\n`;
    if (page.bg_color) {
      code += `    sgl_page_set_color(page_${pageId}, ${hexToSglColor(page.bg_color)});\n`;
    }
    code += `\n`;

    // 按层级排序：父控件先创建，子控件后创建
    const sortedWidgets = sortWidgetsByHierarchy(page.widgets);

    sortedWidgets.forEach(w => {
      const objId = sanitizeId(w.id);
      const createFn = getSglCreateFn(w.type);
      // 父对象：如果有 parentId 则使用父控件对象，否则使用页面对象
      const parentObjId = w.parentId ? sanitizeId(w.parentId) : `page_${pageId}`;
      code += `    /* ${getWidgetDisplayName(w.type)} */\n`;
      code += `    sgl_obj_t *${objId} = ${createFn}(${parentObjId});\n`;
      code += `    sgl_obj_set_pos(${objId}, ${w.x}, ${w.y});\n`;
      code += `    sgl_obj_set_size(${objId}, ${w.width}, ${w.height});\n`;

      // 组件特定属性设置
      const setters = getSglSetters(w);
      setters.forEach(setter => {
        code += `    ${setter}\n`;
      });

      // 事件回调绑定：如果有事件，绑定包装函数
      const widgetEvents = (w.events || []).filter(e => e.callback && e.callback.trim());
      if (widgetEvents.length > 0) {
        const wrapperName = `_${objId}_event_handler`;
        code += `    sgl_obj_set_event_cb(${objId}, ${wrapperName}, NULL);\n`;
      }

      code += `\n`;
    });

    code += `}\n\n`;
  });

  code += `/* === UI Initialization === */\n`;
  code += `void ui_init(void)\n{\n`;
  project.pages.forEach(page => {
    const pageId = sanitizeId(page.id);
    code += `    ui_page_${pageId}_init();\n`;
  });
  code += `}\n`;

  return code;
}

// ============ 字体收集工具 ============
export function collectFonts(project) {
  const fontMap = new Map();
  if (!project || !Array.isArray(project.pages)) return [];

  project.pages.forEach(page => {
    if (!Array.isArray(page.widgets)) return;
    page.widgets.forEach(w => {
      if (w.fontFamily && w.fontSize != null) {
        // 提取文件名
        const familyName = w.fontFamily.replace(/[/\\]/g, '/').split('/').pop();
        // 跳过 "default" 字体（不需要生成字模）
        if (familyName === 'default') return;
        const bpp = w.fontBpp || 4;
        const key = `${familyName}|${w.fontSize}|${bpp}`;
        if (!fontMap.has(key)) {
          fontMap.set(key, { family: familyName, path: w.fontFamily, size: w.fontSize, bpp: bpp });
        }
      }
    });
  });

  return Array.from(fontMap.values());
}

function getFontId(family, size, bpp) {
  const cleanFamily = family.replace(/[^\w]/g, '_').replace(/^[0-9]/, '_$&');
  return `sgl_font_${cleanFamily}_${size}_bpp${bpp}`;
}

function sanitizeId(id) {
  return id.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
}

function hexToSglColor(hex) {
  // 将 #RRGGBB 转换为 sgl_rgb(r, g, b) 格式
  if (!hex || !hex.startsWith('#') || hex.length !== 7) return 'SGL_COLOR_BLACK';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `sgl_rgb(${r}, ${g}, ${b})`;
}

function hexAlphaToAlpha(hex) {
  if (!hex || !hex.startsWith('#') || hex.length !== 9) return 255;
  return parseInt(hex.slice(7, 9), 16);
}

function getSglCreateFn(type) {
  const map = {
    'rect': 'sgl_rect_create',
    'circle': 'sgl_circle_create',
    'ring': 'sgl_ring_create',
    'arc': 'sgl_arc_create',
    'line': 'sgl_line_create',
    'polygon': 'sgl_polygon_create',
    'button': 'sgl_button_create',
    'switch': 'sgl_switch_create',
    'checkbox': 'sgl_checkbox_create',
    'slider': 'sgl_slider_create',
    'numberkbd': 'sgl_numberkbd_create',
    'keyboard': 'sgl_keyboard_create',
    'label': 'sgl_label_create',
    'textbox': 'sgl_textbox_create',
    'textline': 'sgl_textline_create',
    'textlist': 'sgl_textlist_create',
    'progress': 'sgl_progress_create',
    'bar': 'sgl_bar_create',
    'gauge': 'sgl_gauge_create',
    'spectrum': 'sgl_spectrum_create',
    'battery': 'sgl_battery_create',
    'icon': 'sgl_icon_create',
    'led': 'sgl_led_create',
    'msgbox': 'sgl_msgbox_create',
    'viewlist': 'sgl_viewlist_create',
    'dropdown': 'sgl_dropdown_create',
    'scroll': 'sgl_scroll_create',
    'box': 'sgl_box_create',
    'win': 'sgl_win_create',
    'qrcode': 'sgl_qrcode_create',
    'scope': 'sgl_scope_create',
    'chart': 'sgl_chart_create',
    'canvas': 'sgl_canvas_create',
    '2dball': 'sgl_2dball_create',
    'sprite': 'sgl_sprite_create',
    'analogclock': 'sgl_analogclock_create',
    'ext_img': 'sgl_ext_img_create'
  };
  return map[type] || 'sgl_rect_create';
}

function getSglSetters(w) {
  const setters = [];

  switch (w.type) {
    case 'rect':
      if (w.color) setters.push(`sgl_rect_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (w.bgColor) setters.push(`sgl_rect_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (w.borderColor) setters.push(`sgl_rect_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (w.borderWidth != null) setters.push(`sgl_rect_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (w.borderAlpha != null && w.borderAlpha < 255) setters.push(`sgl_rect_set_border_alpha(${obj(w)}, ${w.borderAlpha});`);
      if (w.radius != null) setters.push(`sgl_rect_set_radius(${obj(w)}, ${w.radius});`);
      if (w.mainAlpha != null && w.mainAlpha < 255) setters.push(`sgl_rect_set_main_alpha(${obj(w)}, ${w.mainAlpha});`);
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_rect_set_alpha(${obj(w)}, ${w.alpha});`);
      if (w.pixmap) setters.push(`sgl_rect_set_pixmap(${obj(w)}, "${escapeStr(w.pixmap)}");`);
      break;

    case 'circle':
      if (w.color) setters.push(`sgl_circle_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (w.borderColor) setters.push(`sgl_circle_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (w.borderWidth != null) setters.push(`sgl_circle_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (w.radius != null) setters.push(`sgl_circle_set_radius(${obj(w)}, ${Math.min(w.width, w.height) / 2});`);
      if (w.xOffset != null) setters.push(`sgl_circle_set_x_offset(${obj(w)}, ${w.xOffset});`);
      if (w.yOffset != null) setters.push(`sgl_circle_set_y_offset(${obj(w)}, ${w.yOffset});`);
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_circle_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'line':
      if (w.color) setters.push(`sgl_line_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (w.borderWidth != null) setters.push(`sgl_line_set_width(${obj(w)}, ${w.borderWidth});`);
      if (w.dashed) {
        setters.push(`sgl_line_set_dashed(${obj(w)}, 1);`);
        if (w.dashLen != null) setters.push(`sgl_line_set_dash_pattern(${obj(w)}, ${w.dashLen}, ${w.gapLen || 5});`);
      }
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_line_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'button':
      if (w.text) setters.push(`sgl_button_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (w.color) setters.push(`sgl_button_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (w.textColor) setters.push(`sgl_button_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (w.bgColor) setters.push(`sgl_button_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (w.borderColor) setters.push(`sgl_button_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (w.borderWidth != null) setters.push(`sgl_button_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (w.radius != null) setters.push(`sgl_button_set_radius(${obj(w)}, ${w.radius});`);
      if (w.align) setters.push(`sgl_button_set_text_align(${obj(w)}, SGL_ALIGN_${w.align});`);
      if (w.fontSize != null) setters.push(`sgl_button_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (w.fontFamily && w.fontSize != null) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_button_set_font(${obj(w)}, &${fontId});`);
      }
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_button_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'label':
      if (w.text) setters.push(`sgl_label_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (w.textColor) setters.push(`sgl_label_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (w.bgColor && w.bgColor !== 'transparent') setters.push(`sgl_label_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (w.align) setters.push(`sgl_label_set_text_align(${obj(w)}, SGL_ALIGN_${w.align});`);
      if (w.radius != null) setters.push(`sgl_label_set_radius(${obj(w)}, ${w.radius});`);
      if (w.textOffsetX != null || w.textOffsetY != null) setters.push(`sgl_label_set_text_offset(${obj(w)}, ${w.textOffsetX || 0}, ${w.textOffsetY || 0});`);
      if (w.textRotation != null && w.textRotation !== 0) setters.push(`sgl_label_set_text_rotation(${obj(w)}, ${w.textRotation});`);
      if (w.fontSize != null) setters.push(`sgl_label_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (w.fontFamily && w.fontSize != null) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_label_set_font(${obj(w)}, &${fontId});`);
      }
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_label_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'textbox':
      if (w.text) setters.push(`sgl_textbox_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (w.textColor) setters.push(`sgl_textbox_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (w.bgColor) setters.push(`sgl_textbox_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (w.borderColor) setters.push(`sgl_textbox_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (w.borderWidth != null) setters.push(`sgl_textbox_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (w.radius != null) setters.push(`sgl_textbox_set_radius(${obj(w)}, ${w.radius});`);
      if (w.lineMargin != null) setters.push(`sgl_textbox_set_line_margin(${obj(w)}, ${w.lineMargin});`);
      if (w.fontSize != null) setters.push(`sgl_textbox_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (w.fontFamily && w.fontSize != null) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_textbox_set_font(${obj(w)}, &${fontId});`);
      }
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_textbox_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'switch':
      setters.push(`sgl_switch_set_status(${obj(w)}, ${w.status ? 'true' : 'false'});`);
      if (w.color) setters.push(`sgl_switch_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (w.bgColor) setters.push(`sgl_switch_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (w.knobColor) setters.push(`sgl_switch_set_knob_color(${obj(w)}, ${hexToSglColor(w.knobColor)});`);
      if (w.borderColor) setters.push(`sgl_switch_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (w.borderWidth != null) setters.push(`sgl_switch_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (w.radius != null) setters.push(`sgl_switch_set_radius(${obj(w)}, ${w.radius});`);
      if (w.knobRadius != null) setters.push(`sgl_switch_set_knob_radius(${obj(w)}, ${w.knobRadius});`);
      if (w.knobMargin != null) setters.push(`sgl_switch_set_knob_margin(${obj(w)}, ${w.knobMargin});`);
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_switch_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'checkbox':
      setters.push(`sgl_checkbox_set_status(${obj(w)}, ${w.status ? 'true' : 'false'});`);
      if (w.text) setters.push(`sgl_checkbox_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (w.color) setters.push(`sgl_checkbox_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (w.radius != null) setters.push(`sgl_checkbox_set_radius(${obj(w)}, ${w.radius});`);
      if (w.fontSize != null) setters.push(`sgl_checkbox_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (w.fontFamily && w.fontSize != null) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_checkbox_set_font(${obj(w)}, &${fontId});`);
      }
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_checkbox_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'slider':
      setters.push(`sgl_slider_set_value(${obj(w)}, ${w.value || 0});`);
      if (w.direct != null) setters.push(`sgl_slider_set_direct(${obj(w)}, ${w.direct});`);
      if (w.fillColor) setters.push(`sgl_slider_set_fill_color(${obj(w)}, ${hexToSglColor(w.fillColor)});`);
      if (w.trackColor) setters.push(`sgl_slider_set_track_color(${obj(w)}, ${hexToSglColor(w.trackColor)});`);
      if (w.knobColor) setters.push(`sgl_slider_set_knob_color(${obj(w)}, ${hexToSglColor(w.knobColor)});`);
      if (w.borderWidth != null) setters.push(`sgl_slider_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (w.radius != null) setters.push(`sgl_slider_set_radius(${obj(w)}, ${w.radius});`);
      if (w.thickness != null) setters.push(`sgl_slider_set_thickness(${obj(w)}, ${w.thickness});`);
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_slider_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'progress':
      setters.push(`sgl_progress_set_value(${obj(w)}, ${w.value || 0});`);
      if (w.fillColor) setters.push(`sgl_progress_set_fill_color(${obj(w)}, ${hexToSglColor(w.fillColor)});`);
      if (w.trackColor) setters.push(`sgl_progress_set_track_color(${obj(w)}, ${hexToSglColor(w.trackColor)});`);
      if (w.borderColor) setters.push(`sgl_progress_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (w.borderWidth != null) setters.push(`sgl_progress_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (w.radius != null) setters.push(`sgl_progress_set_radius(${obj(w)}, ${w.radius});`);
      if (w.fillGap != null) setters.push(`sgl_progress_set_fill_gap(${obj(w)}, ${w.fillGap});`);
      if (w.fillRadius != null) setters.push(`sgl_progress_set_fill_radius(${obj(w)}, ${w.fillRadius});`);
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_progress_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'bar':
      setters.push(`sgl_bar_set_value(${obj(w)}, ${w.value || 50});`);
      if (w.color) setters.push(`sgl_bar_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (w.bgColor) setters.push(`sgl_bar_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (w.borderColor) setters.push(`sgl_bar_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (w.borderWidth != null) setters.push(`sgl_bar_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_bar_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'gauge':
      setters.push(`sgl_gauge_set_value(${obj(w)}, ${w.value || 50});`);
      if (w.color) setters.push(`sgl_gauge_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (w.bgColor) setters.push(`sgl_gauge_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (w.borderColor) setters.push(`sgl_gauge_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (w.borderWidth != null) setters.push(`sgl_gauge_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_gauge_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'battery':
      setters.push(`sgl_battery_set_value(${obj(w)}, ${w.value || 80});`);
      if (w.color) setters.push(`sgl_battery_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (w.bgColor) setters.push(`sgl_battery_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (w.borderColor) setters.push(`sgl_battery_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (w.borderWidth != null) setters.push(`sgl_battery_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_battery_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'led':
      setters.push(`sgl_led_set_status(${obj(w)}, ${w.status ? 'true' : 'false'});`);
      if (w.color) setters.push(`sgl_led_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (w.bgColor) setters.push(`sgl_led_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (w.borderColor) setters.push(`sgl_led_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_led_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'msgbox':
    case 'win':
      if (w.text) setters.push(`sgl_${w.type}_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (w.color) setters.push(`sgl_${w.type}_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (w.textColor) setters.push(`sgl_${w.type}_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (w.bgColor) setters.push(`sgl_${w.type}_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (w.borderColor) setters.push(`sgl_${w.type}_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (w.borderWidth != null) setters.push(`sgl_${w.type}_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (w.radius != null) setters.push(`sgl_${w.type}_set_radius(${obj(w)}, ${w.radius});`);
      if (w.fontSize != null) setters.push(`sgl_${w.type}_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (w.fontFamily && w.fontSize != null) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_${w.type}_set_font(${obj(w)}, &${fontId});`);
      }
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_${w.type}_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'dropdown':
      if (w.text) setters.push(`sgl_dropdown_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (w.textColor) setters.push(`sgl_dropdown_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (w.bgColor) setters.push(`sgl_dropdown_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (w.borderColor) setters.push(`sgl_dropdown_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (w.borderWidth != null) setters.push(`sgl_dropdown_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (w.radius != null) setters.push(`sgl_dropdown_set_radius(${obj(w)}, ${w.radius});`);
      if (w.fontSize != null) setters.push(`sgl_dropdown_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (w.fontFamily && w.fontSize != null) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_dropdown_set_font(${obj(w)}, &${fontId});`);
      }
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_dropdown_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'viewlist':
    case 'textlist':
    case 'textline':
    case 'numberkbd':
    case 'keyboard':
      const typeNameT = w.type.replace('2dball', '2d_ball');
      if (w.color) setters.push(`sgl_${typeNameT}_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (w.bgColor) setters.push(`sgl_${typeNameT}_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (w.borderColor) setters.push(`sgl_${typeNameT}_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (w.borderWidth != null) setters.push(`sgl_${typeNameT}_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (w.radius != null) setters.push(`sgl_${typeNameT}_set_radius(${obj(w)}, ${w.radius});`);
      if (w.lineMargin != null) setters.push(`sgl_${typeNameT}_set_line_margin(${obj(w)}, ${w.lineMargin});`);
      if (w.fontSize != null) setters.push(`sgl_${typeNameT}_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (w.fontFamily && w.fontSize != null) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_${typeNameT}_set_font(${obj(w)}, &${fontId});`);
      }
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_${typeNameT}_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'scroll':
    case 'box':
    case 'canvas':
    case '2dball':
    case 'sprite':
    case 'spectrum':
    case 'scope':
    case 'chart':
    case 'analogclock':
    case 'ring':
    case 'arc':
    case 'polygon':
    case 'qrcode':
    case 'icon':
    case 'ext_img':
      const typeName = w.type.replace('2dball', '2d_ball').replace('ext_img', 'ext_img');
      if (w.color) setters.push(`sgl_${typeName}_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (w.bgColor) setters.push(`sgl_${typeName}_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (w.borderColor) setters.push(`sgl_${typeName}_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (w.borderWidth != null) setters.push(`sgl_${typeName}_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (w.radius != null) setters.push(`sgl_${typeName}_set_radius(${obj(w)}, ${w.radius});`);
      if (w.alpha != null && w.alpha < 255) setters.push(`sgl_${typeName}_set_alpha(${obj(w)}, ${w.alpha});`);
      break;
  }

  return setters;
}

function obj(w) {
  return 'obj_' + sanitizeId(w.id);
}

function escapeStr(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getWidgetDisplayName(type) {
  const w = SGL_WIDGET_TYPES.find(t => t.type === type);
  return w ? w.name : type;
}
