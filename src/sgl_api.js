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
    properties: ['color', 'borderColor', 'borderAlpha', 'borderWidth', 'radius', 'mainAlpha', 'pixmap', 'locked']
  },
  {
    type: 'circle',
    name: '圆形',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>',
    category: 'basic',
    defaultSize: [60, 60],
    properties: ['color', 'borderColor', 'borderWidth', 'radius', 'alpha', 'xOffset', 'yOffset', 'pixmap', 'locked']
  },
  {
    type: 'ring',
    name: '圆环',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></svg>',
    category: 'basic',
    defaultSize: [60, 60],
    properties: ['color', 'radiusIn', 'radiusOut', 'alpha', 'locked']
  },
  {
    type: 'arc',
    name: '弧形',
    icon: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 1 9 9"/></svg>',
    category: 'basic',
    defaultSize: [60, 60],
    properties: ['color', 'bgColor', 'alpha', 'mode', 'radiusIn', 'radiusOut', 'startAngle', 'endAngle', 'locked']
  },
  {
    type: 'line',
    name: '直线',
    icon: '<svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/></svg>',
    category: 'basic',
    defaultSize: [120, 4],
    properties: ['color', 'lineWidth', 'x1', 'y1', 'x2', 'y2', 'alpha', 'dashed', 'dashLen', 'gapLen', 'locked']
  },
  {
    type: 'polygon',
    name: '多边形',
    icon: '<svg viewBox="0 0 24 24"><polygon points="12,2 22,9 18,21 6,21 2,9"/></svg>',
    category: 'basic',
    defaultSize: [80, 80],
    properties: ['fillColor', 'borderColor', 'borderWidth', 'alpha', 'vertices', 'text', 'textColor', 'fontFamily', 'fontSize', 'fontBpp', 'locked']
  },

  // ============ 按钮与交互 ============
  {
    type: 'button',
    name: '按钮',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="3"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    category: 'interactive',
    defaultSize: [120, 40],
    properties: ['text', 'color', 'textColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'align', 'fontSize', 'fontFamily', 'fontBpp', 'locked']
  },
  {
    type: 'switch',
    name: '开关',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3"/></svg>',
    category: 'interactive',
    defaultSize: [60, 30],
    properties: ['status', 'onColor', 'bgColor', 'knobColor', 'borderColor', 'borderWidth', 'radius', 'knobRadius', 'knobMargin', 'alpha', 'locked']
  },
  {
    type: 'checkbox',
    name: '复选框',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1"/><polyline points="5,7 7,9 11,4"/></svg>',
    category: 'interactive',
    defaultSize: [120, 24],
    properties: ['text', 'onColor', 'textColor', 'bgColor', 'borderColor', 'borderWidth', 'status', 'radius', 'align', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
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
    properties: ['cellColor', 'btnColor', 'textColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'btnMargin', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },
  {
    type: 'keyboard',
    name: '键盘',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10.01"/><line x1="10" y1="10" x2="10" y2="10.01"/><line x1="14" y1="10" x2="14" y2="10.01"/><line x1="18" y1="10" x2="18" y2="10.01"/><line x1="8" y1="14" x2="16" y2="14"/></svg>',
    category: 'interactive',
    defaultSize: [320, 180],
    properties: ['cellColor', 'btnColor', 'textColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'btnMargin', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },

  // ============ 文本相关 ============
  {
    type: 'label',
    name: '标签',
    icon: '<svg viewBox="0 0 24 24"><text x="4" y="17" font-size="14" font-weight="bold" fill="currentColor" stroke="none">Aa</text></svg>',
    category: 'text',
    defaultSize: [120, 24],
    properties: ['text', 'textColor', 'bgColor', 'align', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'textOffsetX', 'textOffsetY', 'textRotation', 'radius', 'locked']
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
    properties: ['text', 'textColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'edgeMargin', 'lineMargin', 'locked']
  },
  {
    type: 'textlist',
    name: '文本列表',
    icon: '<svg viewBox="0 0 24 24"><line x1="5" y1="7" x2="19" y2="7"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/></svg>',
    category: 'text',
    defaultSize: [160, 120],
    properties: ['color', 'textColor', 'selectedColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'selectedIndex', 'lineMargin', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
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
    properties: ['value', 'barColor', 'barHatColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'barWidth', 'barNum', 'barMode', 'barHatHeight', 'direct', 'alpha', 'locked']
  },
  {
    type: 'gauge',
    name: '仪表盘',
    icon: '<svg viewBox="0 0 24 24"><path d="M4 17a8 8 0 0 1 16 0"/><line x1="12" y1="14" x2="15" y2="8"/><circle cx="12" cy="14" r="1"/></svg>',
    category: 'display',
    defaultSize: [100, 100],
    properties: ['value', 'bgColor', 'arcColor', 'scaleColor', 'pointerColor', 'textColor', 'hubColor', 'borderColor', 'borderWidth', 'scaleWidth', 'pointerWidth', 'arcWidth', 'hubRadius', 'scaleLength', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },
  {
    type: 'spectrum',
    name: '频谱',
    icon: '<svg viewBox="0 0 24 24"><line x1="4" y1="18" x2="4" y2="10"/><line x1="8" y1="18" x2="8" y2="6"/><line x1="12" y1="18" x2="12" y2="8"/><line x1="16" y1="18" x2="16" y2="4"/><line x1="20" y1="18" x2="20" y2="12"/></svg>',
    category: 'display',
    defaultSize: [160, 60],
    properties: ['barColor', 'barHatColor', 'bgColor', 'borderColor', 'borderWidth', 'barWidth', 'barNum', 'barMode', 'barHatHeight', 'direct', 'alpha', 'locked']
  },
  {
    type: 'battery',
    name: '电池',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="18" height="10" rx="2"/><rect x="5" y="9" width="10" height="6" rx="1"/><line x1="22" y1="10" x2="22" y2="14"/></svg>',
    category: 'display',
    defaultSize: [60, 30],
    properties: ['level', 'fillColor', 'lowColor', 'mediumColor', 'highColor', 'bgColor', 'borderColor', 'borderWidth', 'cellRadius', 'numCells', 'direction', 'capSize', 'charging', 'chargingColor', 'showPercentage', 'textColor', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },
  {
    type: 'led',
    name: 'LED指示灯',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="5.5" fill="currentColor" opacity="0.9"/><circle cx="10" cy="10" r="1.5" fill="#fff" opacity="0.5"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="1" opacity="0.5"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="1" opacity="0.5"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="1" opacity="0.5"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="1" opacity="0.5"/></svg>',
    category: 'display',
    defaultSize: [20, 20],
    properties: ['onColor', 'offColor', 'bgColor', 'borderColor', 'borderWidth', 'status', 'alpha', 'locked']
  },

  // ============ 图像/视图 ============
  {
    type: 'icon',
    name: '图标',
    icon: '<svg viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9"/></svg>',
    category: 'image',
    defaultSize: [40, 40],
    properties: ['textColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'locked']
  },
  {
    type: 'msgbox',
    name: '消息框',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="7" y1="7" x2="7" y2="7.01"/></svg>',
    category: 'special',
    defaultSize: [240, 160],
    properties: ['msgText', 'msgColor', 'leftBtnText', 'leftBtnColor', 'leftBtnTextColor', 'rightBtnText', 'rightBtnColor', 'rightBtnTextColor', 'closeBtnColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'titleHeight', 'msgOffsetX', 'msgOffsetY', 'msgLineMargin', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },
  {
    type: 'viewlist',
    name: '视图列表',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="6" rx="1"/><rect x="3" y="11" width="18" height="6" rx="1"/><rect x="3" y="19" width="18" height="2" rx="1"/></svg>',
    category: 'display',
    defaultSize: [160, 120],
    properties: ['fillColor', 'scrollbarColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'textColor', 'itemMarginX', 'itemMarginY', 'lineMargin', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },
  {
    type: 'dropdown',
    name: '下拉框',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="8,11 12,15 16,11"/></svg>',
    category: 'interactive',
    defaultSize: [160, 36],
    properties: ['selectedIndex', 'selectedColor', 'textColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'fontSize', 'fontFamily', 'fontBpp', 'locked']
  },
  {
    type: 'scroll',
    name: '滚动容器',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="19" y1="7" x2="19" y2="17"/><line x1="17" y1="9" x2="17" y2="15"/></svg>',
    category: 'special',
    defaultSize: [160, 120],
    properties: ['fillColor', 'scrollbarColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'value', 'direct', 'autoRefresh', 'alpha', 'locked']
  },
  {
    type: 'box',
    name: '容器盒',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
    category: 'special',
    defaultSize: [160, 120],
    properties: ['fillColor', 'scrollbarColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'textColor', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },
  {
    type: 'win',
    name: '窗口',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="8" x2="21" y2="8"/><circle cx="7" cy="5.5" r="1"/><circle cx="11" cy="5.5" r="1"/><circle cx="15" cy="5.5" r="1"/></svg>',
    category: 'special',
    defaultSize: [240, 180],
    properties: ['titleText', 'titleColor', 'titleTextColor', 'closeBtnColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'titleHeight', 'titleAlign', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },
  {
    type: 'qrcode',
    name: '二维码',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/></svg>',
    category: 'image',
    defaultSize: [80, 80],
    properties: ['qrText', 'color', 'bgColor', 'borderColor', 'borderWidth', 'zone', 'scale', 'ecc', 'edgeMargin', 'alpha', 'locked']
  },
  {
    type: 'scope',
    name: '示波器',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="5,12 8,8 11,14 14,10 17,12 20,12"/></svg>',
    category: 'display',
    defaultSize: [200, 120],
    properties: ['color', 'waveColor', 'gridColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'gridStyle', 'edgeMargin', 'alpha', 'locked']
  },
  {
    type: 'chart',
    name: '图表',
    icon: '<svg viewBox="0 0 24 24"><polyline points="4,18 8,10 12,14 16,6 20,12"/></svg>',
    category: 'display',
    defaultSize: [200, 120],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'minValue', 'maxValue', 'autoScale', 'showYLabels', 'textColor', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },
  {
    type: 'canvas',
    name: '画布',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="7" x2="17" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="17" x2="12" y2="17"/></svg>',
    category: 'special',
    defaultSize: [200, 150],
    properties: ['bgColor', 'alpha', 'locked']
  },
  {
    type: '2dball',
    name: '2D弹球',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><line x1="8" y1="8" x2="12" y2="12"/></svg>',
    category: 'special',
    defaultSize: [120, 120],
    properties: ['color', 'bgColor', 'radius', 'alpha', 'locked']
  },
  {
    type: 'sprite',
    name: '精灵动画',
    icon: '<svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg>',
    category: 'special',
    defaultSize: [48, 48],
    properties: ['color', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'pixmapNum', 'pixmapIndex', 'autoRefresh', 'alpha', 'locked']
  },
  {
    type: 'analogclock',
    name: '模拟时钟',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="12" y1="12" x2="12" y2="7"/><line x1="12" y1="12" x2="16" y2="12"/></svg>',
    category: 'display',
    defaultSize: [100, 100],
    properties: ['hour', 'minute', 'second', 'hourPtrColor', 'minPtrColor', 'secPtrColor', 'hubColor', 'bgColor', 'borderColor', 'borderWidth', 'hourPtrWidth', 'minPtrWidth', 'secPtrWidth', 'hubRadius', 'alpha', 'locked']
  },
  {
    type: 'ext_img',
    name: '外部图片',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><polyline points="4,18 9,13 13,17 17,12 20,15"/></svg>',
    category: 'image',
    defaultSize: [100, 100],
    properties: ['alpha', 'pixmapNum', 'pixmapIndex', 'autoRefresh', 'locked']
  }
];

// ============ 属性元数据：中文名 + 输入类型 ============
// type: 'text' | 'number' | 'color' | 'bool' | 'select'
export const PROP_META = {
  text: { label: '文本内容', type: 'text' },
  qrText: { label: '二维码内容', type: 'text' },
  titleText: { label: '标题文本', type: 'text' },
  msgText: { label: '消息文本', type: 'text' },
  leftBtnText: { label: '左侧按钮文本', type: 'text' },
  rightBtnText: { label: '右侧按钮文本', type: 'text' },
  color: { label: '颜色', type: 'color' },
  textColor: { label: '文字颜色', type: 'color' },
  titleColor: { label: '标题颜色', type: 'color' },
  titleTextColor: { label: '标题文本颜色', type: 'color' },
  titleBgColor: { label: '标题背景色', type: 'color' },
  msgColor: { label: '消息颜色', type: 'color' },
  leftBtnColor: { label: '左侧按钮颜色', type: 'color' },
  leftBtnTextColor: { label: '左侧按钮文本颜色', type: 'color' },
  rightBtnColor: { label: '右侧按钮颜色', type: 'color' },
  rightBtnTextColor: { label: '右侧按钮文本颜色', type: 'color' },
  closeBtnColor: { label: '关闭按钮颜色', type: 'color' },
  bgColor: { label: '背景色', type: 'color' },
  borderColor: { label: '边框颜色', type: 'color' },
  knobColor: { label: '旋钮颜色', type: 'color' },
  fillColor: { label: '填充色', type: 'color' },
  trackColor: { label: '轨道颜色', type: 'color' },
  cellColor: { label: '单元格颜色', type: 'color' },
  onColor: { label: '开启颜色', type: 'color' },
  offColor: { label: '关闭颜色', type: 'color' },
  lowColor: { label: '低电量颜色', type: 'color' },
  mediumColor: { label: '中电量颜色', type: 'color' },
  highColor: { label: '高电量颜色', type: 'color' },
  chargingColor: { label: '充电颜色', type: 'color' },
  barColor: { label: '柱状条颜色', type: 'color' },
  barHatColor: { label: '柱状条帽颜色', type: 'color' },
  btnColor: { label: '按钮颜色', type: 'color' },
  arcColor: { label: '弧形颜色', type: 'color' },
  scaleColor: { label: '刻度颜色', type: 'color' },
  pointerColor: { label: '指针颜色', type: 'color' },
  hubColor: { label: '中心点颜色', type: 'color' },
  hourPtrColor: { label: '时针颜色', type: 'color' },
  minPtrColor: { label: '分针颜色', type: 'color' },
  secPtrColor: { label: '秒针颜色', type: 'color' },
  waveColor: { label: '波形颜色', type: 'color' },
  gridColor: { label: '网格颜色', type: 'color' },
  scrollbarColor: { label: '滚动条颜色', type: 'color' },
  selectedColor: { label: '选中颜色', type: 'color' },
  borderWidth: { label: '边框宽度', type: 'number', min: 0, max: 50 },
  radius: { label: '圆角半径', type: 'number', min: 0, max: 100 },
  radiusIn: { label: '内半径', type: 'number', min: 0, max: 500 },
  radiusOut: { label: '外半径', type: 'number', min: 0, max: 500 },
  cellRadius: { label: '单元格圆角', type: 'number', min: 0, max: 20 },
  alpha: { label: '透明度', type: 'number', min: 0, max: 255 },
  mainAlpha: { label: '填充透明度', type: 'number', min: 0, max: 255 },
  borderAlpha: { label: '边框透明度', type: 'number', min: 0, max: 255 },
  pixmap: { label: '图片', type: 'select' },
  align: { label: '对齐方式', type: 'select', options: [['LEFT', '左'], ['CENTER', '居中'], ['RIGHT', '右']] },
  titleAlign: { label: '标题对齐', type: 'select', options: [['LEFT', '左'], ['CENTER', '居中'], ['RIGHT', '右']] },
  fontSize: { label: '字体大小', type: 'number', min: 8, max: 72 },
  fontFamily: { label: '字体文件', type: 'select', options: [['simsun.ttc', '宋体'], ['simhei.ttf', '黑体'], ['simkai.ttf', '楷体'], ['simsunb.ttf', '宋体加粗'], ['msyh.ttf', '微软雅黑'], ['arial.ttf', 'Arial'], ['DejaVuSans.ttf', 'DejaVu Sans'], ['sourcehansans.ttf', '思源黑体'], ['notosanscjk.ttf', 'Noto Sans CJK'], ['default', '默认字体']] },
  fontBpp: { label: '抗锯齿', type: 'select', options: [[1, '1'], [2, '2'], [4, '4']] },
  status: { label: '开关状态', type: 'bool' },
  charging: { label: '充电状态', type: 'bool' },
  showPercentage: { label: '显示百分比', type: 'bool' },
  autoRefresh: { label: '自动刷新', type: 'bool' },
  autoScale: { label: '自动缩放', type: 'bool' },
  showYLabels: { label: '显示Y轴标签', type: 'bool' },
  knobRadius: { label: '旋钮半径', type: 'number', min: 2, max: 50 },
  knobMargin: { label: '旋钮边距', type: 'number', min: 0, max: 20 },
  hubRadius: { label: '中心点半径', type: 'number', min: 0, max: 50 },
  mode: { label: '弧形模式', type: 'select', options: [[0, '普通'], [1, '圆环'], [2, '普通平滑'], [3, '圆环平滑']] },
  startAngle: { label: '起始角度', type: 'number', min: 0, max: 360 },
  endAngle: { label: '结束角度', type: 'number', min: 0, max: 360 },
  value: { label: '值 (0-100)', type: 'number', min: 0, max: 100 },
  level: { label: '电量 (0-100)', type: 'number', min: 0, max: 100 },
  hour: { label: '时 (0-23)', type: 'number', min: 0, max: 23 },
  minute: { label: '分 (0-59)', type: 'number', min: 0, max: 59 },
  second: { label: '秒 (0-59)', type: 'number', min: 0, max: 59 },
  direct: { label: '方向', type: 'select', options: [[0, '水平'], [1, '垂直']] },
  direction: { label: '电池方向', type: 'select', options: [[0, '水平'], [1, '垂直']] },
  thickness: { label: '厚度', type: 'number', min: 2, max: 30 },
  scaleWidth: { label: '刻度宽度', type: 'number', min: 0, max: 30 },
  scaleLength: { label: '刻度长度', type: 'number', min: 0, max: 50 },
  pointerWidth: { label: '指针宽度', type: 'number', min: 1, max: 30 },
  arcWidth: { label: '弧形宽度', type: 'number', min: 1, max: 50 },
  hourPtrWidth: { label: '时针宽度', type: 'number', min: 1, max: 20 },
  minPtrWidth: { label: '分针宽度', type: 'number', min: 1, max: 20 },
  secPtrWidth: { label: '秒针宽度', type: 'number', min: 1, max: 20 },
  xOffset: { label: 'X 偏移', type: 'number', min: -50, max: 50 },
  yOffset: { label: 'Y 偏移', type: 'number', min: -50, max: 50 },
  textOffsetX: { label: '文本 X 偏移', type: 'number', min: -50, max: 50 },
  textOffsetY: { label: '文本 Y 偏移', type: 'number', min: -50, max: 50 },
  msgOffsetX: { label: '消息文本 X 偏移', type: 'number', min: 0, max: 100 },
  msgOffsetY: { label: '消息文本 Y 偏移', type: 'number', min: 0, max: 100 },
  textRotation: { label: '文本旋转 (°)', type: 'number', min: -180, max: 180 },
  titleHeight: { label: '标题栏高度', type: 'number', min: 0, max: 100 },
  msgLineMargin: { label: '消息行间距', type: 'number', min: 0, max: 50 },
  capSize: { label: '电池头尺寸', type: 'number', min: 0, max: 30 },
  numCells: { label: '电池格数', type: 'number', min: 1, max: 10 },
  dashed: { label: '线型', type: 'select', options: [[false, '实线'], [true, '虚线']] },
  dashLen: { label: '虚线长度', type: 'number', min: 1, max: 50 },
  gapLen: { label: '虚线间隔', type: 'number', min: 1, max: 50 },
  lineMargin: { label: '行间距', type: 'number', min: 0, max: 30 },
  edgeMargin: { label: '边缘边距', type: 'number', min: 0, max: 50 },
  fillGap: { label: '填充间隔', type: 'number', min: 0, max: 20 },
  fillRadius: { label: '填充圆角', type: 'number', min: 0, max: 20 },
  fillWidth: { label: '填充宽度', type: 'number', min: 0, max: 20 },
  lineWidth: { label: '线宽', type: 'number', min: 1, max: 20 },
  x1: { label: '起点 X', type: 'number', min: -500, max: 500 },
  y1: { label: '起点 Y', type: 'number', min: -500, max: 500 },
  x2: { label: '终点 X', type: 'number', min: -500, max: 500 },
  y2: { label: '终点 Y', type: 'number', min: -500, max: 500 },
  barWidth: { label: '柱状条宽度', type: 'number', min: 1, max: 100 },
  barHatHeight: { label: '柱状条帽高度', type: 'number', min: 0, max: 50 },
  barNum: { label: '柱状条数量', type: 'number', min: 1, max: 100 },
  barMode: { label: '柱状条模式', type: 'select', options: [[0, '条状'], [1, '块状'], [2, '条状带帽'], [3, '块状带帽']] },
  gridStyle: { label: '网格样式', type: 'select', options: [[0, '实线'], [1, '虚线']] },
  minValue: { label: '最小值', type: 'number', min: -1000, max: 1000 },
  maxValue: { label: '最大值', type: 'number', min: -1000, max: 1000 },
  zone: { label: 'QR Zone', type: 'number', min: 0, max: 10 },
  scale: { label: 'QR 缩放', type: 'number', min: 1, max: 10 },
  ecc: { label: '纠错等级', type: 'number', min: 0, max: 3 },
  btnMargin: { label: '按钮边距', type: 'number', min: 0, max: 30 },
  selectedIndex: { label: '选中项索引', type: 'number', min: -1, max: 50 },
  pixmapNum: { label: '图片数量', type: 'number', min: 1, max: 200 },
  pixmapIndex: { label: '当前图片索引', type: 'number', min: 0, max: 200 },
  itemMarginX: { label: '项目水平边距', type: 'number', min: 0, max: 50 },
  itemMarginY: { label: '项目垂直边距', type: 'number', min: 0, max: 50 },
  locked: { label: '锁定控件', type: 'bool' },
  vertices: { label: '顶点坐标', type: 'text', placeholder: '格式: x1,y1;x2,y2;x3,y3...' },
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
      return { ...base, color: '#FFFFFF', borderColor: '#000000', borderWidth: 2, borderAlpha: 255, radius: 0, mainAlpha: 255, pixmap: '' };
    case 'circle':
      return { ...base, color: '#FFFFFF', borderColor: '#000000', borderWidth: 2, radius: 30, xOffset: 0, yOffset: 0 };
    case 'ring':
      return { ...base, color: '#FFFFFF', radiusIn: -1, radiusOut: -1 };
    case 'arc':
      return { ...base, color: '#000000', bgColor: '#FFFFFF', alpha: 255, mode: 0, radiusIn: -1, radiusOut: -1, startAngle: 0, endAngle: 360 };
    case 'line':
      return { ...base, color: '#000000', lineWidth: 1, x1: 0, y1: 0, x2: null, y2: null, dashed: false, dashLen: 10, gapLen: 5 };
    case 'polygon':
      return { ...base, fillColor: '#8b5cf6', borderColor: '#7c3aed', borderWidth: 2, alpha: 255, vertices: '0,0;50,100;100,0', text: '', textColor: '#ffffff', fontFamily: 'simsun.ttc', fontSize: 14, fontBpp: 4 };
    case 'button':
      return { ...base, text: '按钮', color: '#8b5cf6', textColor: '#ffffff', bgColor: '#8b5cf6', borderColor: '#7c3aed', borderWidth: 1, radius: 8, align: 'CENTER', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'switch':
      return { ...base, status: false, onColor: '#8b5cf6', bgColor: '#313149', knobColor: '#ffffff', borderColor: '#3d3d5c', borderWidth: 1, radius: 15, knobRadius: 10, knobMargin: 2 };
    case 'checkbox':
      return { ...base, text: '选项', onColor: '#8b5cf6', textColor: '#e4e4e7', bgColor: 'transparent', borderColor: 'transparent', borderWidth: 0, status: true, radius: 4, align: 'LEFT', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'slider':
      return { ...base, value: 50, direct: 0, fillColor: '#8b5cf6', trackColor: '#313149', knobColor: '#ffffff', borderWidth: 0, radius: 4, thickness: 8 };
    case 'numberkbd':
      return { ...base, cellColor: '#313149', bgColor: '#1e1e2e', borderColor: '#8b5cf6', borderWidth: 2, radius: 8, fontSize: 18, fontFamily: 'simsun.ttc', fontBpp: 4, btnColor: '#8b5cf6', textColor: '#ffffff', btnMargin: 1 };
    case 'keyboard':
      return { ...base, cellColor: '#313149', bgColor: '#1e1e2e', borderColor: '#8b5cf6', borderWidth: 2, radius: 6, fontSize: 16, fontFamily: 'simsun.ttc', fontBpp: 4, btnColor: '#8b5cf6', textColor: '#ffffff', btnMargin: 1 };
    case 'label':
      return { ...base, text: '标签文本', textColor: '#e4e4e7', bgColor: 'transparent', align: 'LEFT', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, textOffsetX: 0, textOffsetY: 0, textRotation: 0, radius: 0 };
    case 'textbox':
      return { ...base, text: '', textColor: '#e4e4e7', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 2, radius: 6, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, lineMargin: 0 };
    case 'textline':
      return { ...base, text: '', textColor: '#e4e4e7', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, align: 'LEFT' };
    case 'textlist':
      return { ...base, color: '#313149', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fontSize: 12, fontFamily: 'simsun.ttc', fontBpp: 4, lineMargin: 4, textColor: '#e4e4e7', selectedColor: '#8b5cf6', selectedIndex: -1 };
    case 'progress':
      return { ...base, value: 60, fillColor: '#22c55e', trackColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fillGap: 2, fillRadius: 2, fillWidth: 0, direct: 0 };
    case 'bar':
      return { ...base, value: 50, barColor: '#8b5cf6', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, radius: 2, barWidth: 20, barNum: 10, barMode: 0, barHatColor: '#7c3aed', barHatHeight: 2, direct: 0 };
    case 'gauge':
      return { ...base, value: 50, arcColor: '#313149', scaleColor: '#7c3aed', pointerColor: '#ef4444', hubColor: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 2, startAngle: 0, endAngle: 360, arcWidth: 8, scaleWidth: 2, scaleLength: 8, pointerWidth: 4, hubRadius: 6 };
    case 'spectrum':
      return { ...base, barColor: '#8b5cf6', barHatColor: '#7c3aed', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, barWidth: 8, barNum: 20, barMode: 0, barHatHeight: 2, direct: 1 };
    case 'battery':
      return { ...base, level: 80, fillColor: '#22c55e', lowColor: '#ef4444', mediumColor: '#f59e0b', highColor: '#22c55e', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, cellRadius: 2, numCells: 0, direction: 0, capSize: 8, charging: false, chargingColor: '#8b5cf6', showPercentage: false, textColor: '#ffffff', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'icon':
      return { ...base, color: '#8b5cf6', bgColor: 'transparent', borderColor: 'transparent', borderWidth: 0, radius: 4 };
    case 'led':
      return { ...base, onColor: '#22c55e', offColor: '#313149', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, status: true };
    case 'msgbox':
      return { ...base, msgText: '提示信息', msgColor: '#ffffff', leftBtnText: '取消', leftBtnColor: '#8b5cf6', leftBtnTextColor: '#ffffff', rightBtnText: '确定', rightBtnColor: '#7c3aed', rightBtnTextColor: '#ffffff', closeBtnColor: '#ef4444', bgColor: '#313149', borderColor: '#8b5cf6', borderWidth: 2, radius: 8, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, titleHeight: 30, msgOffsetX: 10, msgOffsetY: 10, msgLineMargin: 4 };
    case 'viewlist':
      return { ...base, fillColor: '#8b5cf6', scrollbarColor: '#7c3aed', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fontSize: 12, fontFamily: 'simsun.ttc', fontBpp: 4, lineMargin: 4, textColor: '#ffffff', itemMarginX: 5, itemMarginY: 5 };
    case 'dropdown':
      return { ...base, text: '请选择', textColor: '#e4e4e7', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, selectedColor: '#8b5cf6', selectedIndex: -1 };
    case 'scroll':
      return { ...base, fillColor: '#8b5cf6', scrollbarColor: '#7c3aed', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, direct: 0, value: 50, autoRefresh: false };
    case 'box':
      return { ...base, fillColor: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#8b5cf6', borderWidth: 2, radius: 4, scrollbarColor: '#7c3aed', textColor: '#ffffff', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'win':
      return { ...base, titleText: '窗口标题', titleColor: '#8b5cf6', titleTextColor: '#ffffff', closeBtnColor: '#ef4444', bgColor: '#2a2a3e', borderColor: '#8b5cf6', borderWidth: 2, radius: 8, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, titleHeight: 30, titleAlign: 'CENTER' };
    case 'qrcode':
      return { ...base, color: '#000000', bgColor: '#ffffff', borderColor: '#3d3d5c', borderWidth: 0, qrText: 'hello', scale: 1, zone: 2, ecc: 2, edgeMargin: 4 };
    case 'scope':
      return { ...base, color: '#22c55e', waveColor: '#22c55e', gridColor: '#3d3d5c', bgColor: '#0f1a0f', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, gridStyle: 0, edgeMargin: 2 };
    case 'chart':
      return { ...base, color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, minValue: 0, maxValue: 100, autoScale: false, showYLabels: false, textColor: '#e4e4e7', fontSize: 12, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'canvas':
      return { ...base, color: '#ffffff', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4 };
    case '2dball':
      return { ...base, color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4 };
    case 'sprite':
      return { ...base, color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, pixmapNum: 1, pixmapIndex: 0, autoRefresh: false };
    case 'analogclock':
      return { ...base, color: '#8b5cf6', hourPtrColor: '#ffffff', minPtrColor: '#e4e4e7', secPtrColor: '#ef4444', hubColor: '#ffffff', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 2, hour: 10, minute: 10, second: 30, hourPtrWidth: 4, minPtrWidth: 3, secPtrWidth: 2, hubRadius: 5 };
    case 'ext_img':
      return { ...base, color: '#ffffff', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, radius: 4 };
    default:
      return { ...base, color: '#8b5cf6', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, radius: 4 };
  }
}

// ============ 控件默认值（用于代码生成优化） ============
const WIDGET_DEFAULTS = {
  rect: { color: '#FFFFFF', borderColor: '#000000', borderWidth: 2, borderAlpha: 255, radius: 0, mainAlpha: 255, pixmap: '' },
  circle: { color: '#FFFFFF', borderColor: '#000000', borderWidth: 2, radius: 30, xOffset: 0, yOffset: 0, alpha: 255 },
  ring: { color: '#FFFFFF', radiusIn: -1, radiusOut: -1, alpha: 255 },
  arc: { color: '#000000', bgColor: '#FFFFFF', alpha: 255, mode: 0, radiusIn: -1, radiusOut: -1, startAngle: 0, endAngle: 360 },
  line: { color: '#000000', lineWidth: 1, x1: 0, y1: 0, x2: null, y2: null, dashed: false, dashLen: 10, gapLen: 5, alpha: 255 },
  polygon: { fillColor: '#8b5cf6', borderColor: '#7c3aed', borderWidth: 2, alpha: 255, vertices: '0,0;50,100;100,0', text: '', textColor: '#ffffff', fontFamily: 'simsun.ttc', fontSize: 14, fontBpp: 4 },
  button: { text: '按钮', color: '#8b5cf6', textColor: '#ffffff', bgColor: '#8b5cf6', borderColor: '#7c3aed', borderWidth: 1, radius: 8, align: 'CENTER', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, alpha: 255 },
  switch: { status: false, onColor: '#8b5cf6', bgColor: '#313149', knobColor: '#ffffff', borderColor: '#3d3d5c', borderWidth: 1, radius: 15, knobRadius: 10, knobMargin: 2, alpha: 255 },
  checkbox: { text: '选项', onColor: '#8b5cf6', textColor: '#e4e4e7', bgColor: 'transparent', borderColor: 'transparent', borderWidth: 0, status: true, radius: 4, align: 'LEFT', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, alpha: 255 },
  slider: { value: 50, direct: 0, fillColor: '#8b5cf6', trackColor: '#313149', knobColor: '#ffffff', borderWidth: 0, radius: 4, thickness: 8, alpha: 255 },
  numberkbd: { cellColor: '#313149', bgColor: '#1e1e2e', borderColor: '#8b5cf6', borderWidth: 2, radius: 8, fontSize: 18, fontFamily: 'simsun.ttc', fontBpp: 4, btnColor: '#8b5cf6', textColor: '#ffffff', btnMargin: 1, alpha: 255 },
  keyboard: { cellColor: '#313149', bgColor: '#1e1e2e', borderColor: '#8b5cf6', borderWidth: 2, radius: 6, fontSize: 16, fontFamily: 'simsun.ttc', fontBpp: 4, btnColor: '#8b5cf6', textColor: '#ffffff', btnMargin: 1, alpha: 255 },
  label: { text: '标签文本', textColor: '#e4e4e7', bgColor: 'transparent', align: 'LEFT', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, textOffsetX: 0, textOffsetY: 0, textRotation: 0, radius: 0, alpha: 255 },
  textbox: { text: '', textColor: '#e4e4e7', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 2, radius: 6, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, lineMargin: 0, alpha: 255 },
  textline: { text: '', textColor: '#e4e4e7', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, align: 'LEFT', alpha: 255 },
  textlist: { color: '#313149', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fontSize: 12, fontFamily: 'simsun.ttc', fontBpp: 4, lineMargin: 4, textColor: '#e4e4e7', selectedColor: '#8b5cf6', selectedIndex: -1, alpha: 255 },
  progress: { value: 60, fillColor: '#22c55e', trackColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fillGap: 2, fillRadius: 2, fillWidth: 0, direct: 0, alpha: 255 },
  bar: { value: 50, barColor: '#8b5cf6', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, radius: 2, barWidth: 20, barNum: 10, barMode: 0, barHatColor: '#7c3aed', barHatHeight: 2, direct: 0, alpha: 255 },
  gauge: { value: 50, arcColor: '#313149', scaleColor: '#7c3aed', pointerColor: '#ef4444', hubColor: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 2, startAngle: 0, endAngle: 360, arcWidth: 8, scaleWidth: 2, scaleLength: 8, pointerWidth: 4, hubRadius: 6, alpha: 255 },
  spectrum: { barColor: '#8b5cf6', barHatColor: '#7c3aed', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, barWidth: 8, barNum: 20, barMode: 0, barHatHeight: 2, direct: 1, alpha: 255 },
  battery: { level: 80, fillColor: '#22c55e', lowColor: '#ef4444', mediumColor: '#f59e0b', highColor: '#22c55e', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, cellRadius: 2, numCells: 0, direction: 0, capSize: 8, charging: false, chargingColor: '#8b5cf6', showPercentage: false, textColor: '#ffffff', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, alpha: 255 },
  icon: { color: '#8b5cf6', bgColor: 'transparent', borderColor: 'transparent', borderWidth: 0, radius: 4, alpha: 255 },
  led: { onColor: '#22c55e', offColor: '#313149', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, status: true, alpha: 255 },
  msgbox: { msgText: '提示信息', msgColor: '#ffffff', leftBtnText: '取消', leftBtnColor: '#8b5cf6', leftBtnTextColor: '#ffffff', rightBtnText: '确定', rightBtnColor: '#7c3aed', rightBtnTextColor: '#ffffff', closeBtnColor: '#ef4444', bgColor: '#313149', borderColor: '#8b5cf6', borderWidth: 2, radius: 8, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, titleHeight: 30, msgOffsetX: 10, msgOffsetY: 10, msgLineMargin: 4, alpha: 255 },
  viewlist: { fillColor: '#8b5cf6', scrollbarColor: '#7c3aed', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fontSize: 12, fontFamily: 'simsun.ttc', fontBpp: 4, lineMargin: 4, textColor: '#ffffff', itemMarginX: 5, itemMarginY: 5, alpha: 255 },
  dropdown: { text: '请选择', textColor: '#e4e4e7', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, selectedColor: '#8b5cf6', selectedIndex: -1, alpha: 255 },
  scroll: { fillColor: '#8b5cf6', scrollbarColor: '#7c3aed', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, direct: 0, value: 50, autoRefresh: false, alpha: 255 },
  box: { fillColor: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#8b5cf6', borderWidth: 2, radius: 4, scrollbarColor: '#7c3aed', textColor: '#ffffff', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, alpha: 255 },
  win: { titleText: '窗口标题', titleColor: '#8b5cf6', titleTextColor: '#ffffff', closeBtnColor: '#ef4444', bgColor: '#2a2a3e', borderColor: '#8b5cf6', borderWidth: 2, radius: 8, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, titleHeight: 30, titleAlign: 'CENTER', alpha: 255 },
  qrcode: { color: '#000000', bgColor: '#ffffff', borderColor: '#3d3d5c', borderWidth: 0, qrText: 'hello', scale: 1, zone: 2, ecc: 2, edgeMargin: 4, alpha: 255 },
  scope: { color: '#22c55e', waveColor: '#22c55e', gridColor: '#3d3d5c', bgColor: '#0f1a0f', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, gridStyle: 0, edgeMargin: 2, alpha: 255 },
  chart: { color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, minValue: 0, maxValue: 100, autoScale: false, showYLabels: false, textColor: '#e4e4e7', fontSize: 12, fontFamily: 'simsun.ttc', fontBpp: 4, alpha: 255 },
  canvas: { color: '#ffffff', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, alpha: 255 },
  '2dball': { color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, alpha: 255 },
  sprite: { color: '#8b5cf6', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, pixmapNum: 1, pixmapIndex: 0, autoRefresh: false, alpha: 255 },
  analogclock: { color: '#8b5cf6', hourPtrColor: '#ffffff', minPtrColor: '#e4e4e7', secPtrColor: '#ef4444', hubColor: '#ffffff', bgColor: '#1e1e2e', borderColor: '#3d3d5c', borderWidth: 2, hour: 10, minute: 10, second: 30, hourPtrWidth: 4, minPtrWidth: 3, secPtrWidth: 2, hubRadius: 5, alpha: 255 },
  ext_img: { color: '#ffffff', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, radius: 4, alpha: 255 },
};

// 判断属性值是否需要生成代码（图片属性专用：只有非空才生成）
function shouldGeneratePixmap(value) {
  return value && value.length > 0;
}

// 判断属性值是否需要生成代码（普通属性：有值就生成，方便用户修改）
function shouldGenerateValue(value, defaults, prop) {
  // 如果值是 undefined 或 null，不生成代码
  if (value === undefined || value === null) return false;
  // 有值就生成代码（方便用户直接修改）
  return true;
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
    // 只有没有图片时才设置背景色
    if (!page.pixmap && page.bg_color) {
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
      
      if (w.type === 'line') {
        // line: sgl_obj_set_pos 使用 sgl_line_set_pos 的起点坐标
        // sgl_obj_set_size 使用终点减起点的绝对值
        const x1 = w.x1 != null ? w.x1 : 0;
        const y1 = w.y1 != null ? w.y1 : 0;
        const x2 = w.x2 != null ? w.x2 : (w.x1 != null ? w.x1 + 100 : 100);
        const y2 = w.y2 != null ? w.y2 : 0;
        const lineW = Math.abs(x2 - x1);
        const lineH = Math.abs(y2 - y1);
        code += `    sgl_obj_set_pos(${objId}, ${x1}, ${y1});\n`;
        code += `    sgl_obj_set_size(${objId}, ${lineW}, ${lineH});\n`;
      } else {
        code += `    sgl_obj_set_pos(${objId}, ${w.x}, ${w.y});\n`;
        code += `    sgl_obj_set_size(${objId}, ${w.width}, ${w.height});\n`;
      }

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
  const defaults = WIDGET_DEFAULTS[w.type] || {};

  switch (w.type) {
    case 'rect':
      // 图片和背景色二选一：有图片时设置图片，无图片时设置主色
      if (shouldGeneratePixmap(w.pixmap)) {
        setters.push(`sgl_rect_set_pixmap(${obj(w)}, "${escapeStr(w.pixmap)}");`);
      } else if (shouldGenerateValue(w.color, defaults, 'color')) {
        setters.push(`sgl_rect_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      }
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_rect_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_rect_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.borderAlpha, defaults, 'borderAlpha')) setters.push(`sgl_rect_set_border_alpha(${obj(w)}, ${w.borderAlpha});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_rect_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.mainAlpha, defaults, 'mainAlpha')) setters.push(`sgl_rect_set_main_alpha(${obj(w)}, ${w.mainAlpha});`);
      break;

    case 'circle':
      // 颜色或图片二选一
      if (shouldGeneratePixmap(w.pixmap)) {
        setters.push(`sgl_circle_set_pixmap(${obj(w)}, "${escapeStr(w.pixmap)}");`);
      } else if (shouldGenerateValue(w.color, defaults, 'color')) {
        setters.push(`sgl_circle_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      }
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_circle_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_circle_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_circle_set_radius(${obj(w)}, ${Math.min(w.width, w.height) / 2});`);
      if (shouldGenerateValue(w.xOffset, defaults, 'xOffset')) setters.push(`sgl_circle_set_x_offset(${obj(w)}, ${w.xOffset});`);
      if (shouldGenerateValue(w.yOffset, defaults, 'yOffset')) setters.push(`sgl_circle_set_y_offset(${obj(w)}, ${w.yOffset});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_circle_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'ring':
      if (shouldGenerateValue(w.color, defaults, 'color')) setters.push(`sgl_ring_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (shouldGenerateValue(w.radiusIn, defaults, 'radiusIn') || shouldGenerateValue(w.radiusOut, defaults, 'radiusOut')) {
        setters.push(`sgl_ring_set_radius(${obj(w)}, ${w.radiusIn || 28}, ${w.radiusOut || 30});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_ring_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'line':
      if (shouldGenerateValue(w.color, defaults, 'color')) setters.push(`sgl_line_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (shouldGenerateValue(w.lineWidth, defaults, 'lineWidth')) setters.push(`sgl_line_set_width(${obj(w)}, ${w.lineWidth});`);
      if (shouldGenerateValue(w.dashed, defaults, 'dashed')) setters.push(`sgl_line_set_dashed(${obj(w)}, ${w.dashed ? 1 : 0});`);
      if (w.dashed) {
        const dashLen = w.dashLen != null ? w.dashLen : 10;
        const gapLen = w.gapLen != null ? w.gapLen : 5;
        setters.push(`sgl_line_set_dash_pattern(${obj(w)}, ${dashLen}, ${gapLen});`);
      }
      // line 控件的 x1/y1 就是控件位置，x2/y2 默认由 x1+width/y1+height 计算
      const absX1 = w.x1 != null ? w.x1 : w.x;
      const absY1 = w.y1 != null ? w.y1 : w.y;
      const absX2 = w.x2 != null ? w.x2 : (w.x + w.width);
      const absY2 = w.y2 != null ? w.y2 : (w.y + w.height);
      setters.push(`sgl_line_set_pos(${obj(w)}, ${absX1}, ${absY1}, ${absX2}, ${absY2});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_line_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'polygon':
      if (shouldGenerateValue(w.fillColor, defaults, 'fillColor')) setters.push(`sgl_polygon_set_fill_color(${obj(w)}, ${hexToSglColor(w.fillColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_polygon_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_polygon_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_polygon_set_alpha(${obj(w)}, ${w.alpha});`);
      if (shouldGenerateValue(w.vertices, defaults, 'vertices') && w.vertices) {
        const coords = w.vertices.split(';').map(p => p.trim()).filter(p => p);
        if (coords.length >= 3) {
          const coordPairs = coords.map(p => {
            const [x, y] = p.split(',').map(v => parseInt(v.trim()) || 0);
            return `${x}, ${y}`;
          }).join(', ');
          setters.push(`    sgl_polygon_set_vertex_array(${obj(w)}, (int16_t[][2]){{${coordPairs}}}, ${coords.length});`);
        }
      }
      if (shouldGenerateValue(w.text, defaults, 'text')) setters.push(`sgl_polygon_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_polygon_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_polygon_set_font(${obj(w)}, &${fontId});`);
      }
      break;

    case 'button':
      if (shouldGenerateValue(w.text, defaults, 'text')) setters.push(`sgl_button_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (shouldGenerateValue(w.color, defaults, 'color')) setters.push(`sgl_button_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_button_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_button_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_button_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_button_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_button_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.align, defaults, 'align')) setters.push(`sgl_button_set_text_align(${obj(w)}, SGL_ALIGN_${w.align});`);
      if (shouldGenerateValue(w.fontSize, defaults, 'fontSize')) setters.push(`sgl_button_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_button_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_button_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'label':
      if (shouldGenerateValue(w.text, defaults, 'text')) setters.push(`sgl_label_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_label_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor') && w.bgColor !== 'transparent') setters.push(`sgl_label_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.align, defaults, 'align')) setters.push(`sgl_label_set_text_align(${obj(w)}, SGL_ALIGN_${w.align});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_label_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.textOffsetX, defaults, 'textOffsetX') || shouldGenerateValue(w.textOffsetY, defaults, 'textOffsetY')) {
        setters.push(`sgl_label_set_text_offset(${obj(w)}, ${w.textOffsetX || 0}, ${w.textOffsetY || 0});`);
      }
      if (shouldGenerateValue(w.textRotation, defaults, 'textRotation') && w.textRotation !== 0) setters.push(`sgl_label_set_text_rotation(${obj(w)}, ${w.textRotation});`);
      if (shouldGenerateValue(w.fontSize, defaults, 'fontSize')) setters.push(`sgl_label_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_label_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_label_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'textbox':
      if (shouldGenerateValue(w.text, defaults, 'text')) setters.push(`sgl_textbox_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_textbox_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_textbox_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_textbox_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_textbox_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_textbox_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.lineMargin, defaults, 'lineMargin')) setters.push(`sgl_textbox_set_line_margin(${obj(w)}, ${w.lineMargin});`);
      if (shouldGenerateValue(w.fontSize, defaults, 'fontSize')) setters.push(`sgl_textbox_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_textbox_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_textbox_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'switch':
      if (shouldGenerateValue(w.status, defaults, 'status')) setters.push(`sgl_switch_set_status(${obj(w)}, ${w.status ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.onColor, defaults, 'onColor')) setters.push(`sgl_switch_set_color(${obj(w)}, ${hexToSglColor(w.onColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_switch_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.knobColor, defaults, 'knobColor')) setters.push(`sgl_switch_set_knob_color(${obj(w)}, ${hexToSglColor(w.knobColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_switch_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_switch_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_switch_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.knobRadius, defaults, 'knobRadius')) setters.push(`sgl_switch_set_knob_radius(${obj(w)}, ${w.knobRadius});`);
      if (shouldGenerateValue(w.knobMargin, defaults, 'knobMargin')) setters.push(`sgl_switch_set_knob_margin(${obj(w)}, ${w.knobMargin});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_switch_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'checkbox':
      if (shouldGenerateValue(w.status, defaults, 'status')) setters.push(`sgl_checkbox_set_status(${obj(w)}, ${w.status ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.text, defaults, 'text')) setters.push(`sgl_checkbox_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (shouldGenerateValue(w.onColor, defaults, 'onColor')) setters.push(`sgl_checkbox_set_color(${obj(w)}, ${hexToSglColor(w.onColor)});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_checkbox_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor') && w.bgColor !== 'transparent') setters.push(`sgl_checkbox_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_checkbox_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_checkbox_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_checkbox_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.align, defaults, 'align')) setters.push(`sgl_checkbox_set_text_align(${obj(w)}, SGL_ALIGN_${w.align});`);
      if (shouldGenerateValue(w.fontSize, defaults, 'fontSize')) setters.push(`sgl_checkbox_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_checkbox_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_checkbox_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'slider':
      if (shouldGenerateValue(w.value, defaults, 'value')) setters.push(`sgl_slider_set_value(${obj(w)}, ${w.value || 0});`);
      if (shouldGenerateValue(w.direct, defaults, 'direct')) setters.push(`sgl_slider_set_direct(${obj(w)}, ${w.direct});`);
      if (shouldGenerateValue(w.fillColor, defaults, 'fillColor')) setters.push(`sgl_slider_set_fill_color(${obj(w)}, ${hexToSglColor(w.fillColor)});`);
      if (shouldGenerateValue(w.trackColor, defaults, 'trackColor')) setters.push(`sgl_slider_set_track_color(${obj(w)}, ${hexToSglColor(w.trackColor)});`);
      if (shouldGenerateValue(w.knobColor, defaults, 'knobColor')) setters.push(`sgl_slider_set_knob_color(${obj(w)}, ${hexToSglColor(w.knobColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_slider_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_slider_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.thickness, defaults, 'thickness')) setters.push(`sgl_slider_set_thickness(${obj(w)}, ${w.thickness});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_slider_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'progress':
      if (shouldGenerateValue(w.value, defaults, 'value')) setters.push(`sgl_progress_set_value(${obj(w)}, ${w.value || 0});`);
      if (shouldGenerateValue(w.direct, defaults, 'direct')) setters.push(`sgl_progress_set_direct(${obj(w)}, ${w.direct});`);
      if (shouldGenerateValue(w.fillColor, defaults, 'fillColor')) setters.push(`sgl_progress_set_fill_color(${obj(w)}, ${hexToSglColor(w.fillColor)});`);
      if (shouldGenerateValue(w.trackColor, defaults, 'trackColor')) setters.push(`sgl_progress_set_track_color(${obj(w)}, ${hexToSglColor(w.trackColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_progress_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_progress_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_progress_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.fillGap, defaults, 'fillGap')) setters.push(`sgl_progress_set_fill_gap(${obj(w)}, ${w.fillGap});`);
      if (shouldGenerateValue(w.fillRadius, defaults, 'fillRadius')) setters.push(`sgl_progress_set_fill_radius(${obj(w)}, ${w.fillRadius});`);
      if (shouldGenerateValue(w.fillWidth, defaults, 'fillWidth')) setters.push(`sgl_progress_set_fill_width(${obj(w)}, ${w.fillWidth});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_progress_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'bar':
      if (shouldGenerateValue(w.value, defaults, 'value')) setters.push(`sgl_bar_set_value(${obj(w)}, ${w.value || 50});`);
      if (shouldGenerateValue(w.direct, defaults, 'direct')) setters.push(`sgl_bar_set_direct(${obj(w)}, ${w.direct});`);
      if (shouldGenerateValue(w.barColor, defaults, 'barColor')) setters.push(`sgl_bar_set_color(${obj(w)}, ${hexToSglColor(w.barColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_bar_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_bar_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_bar_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_bar_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.barWidth, defaults, 'barWidth')) setters.push(`sgl_bar_set_bar_width(${obj(w)}, ${w.barWidth});`);
      if (shouldGenerateValue(w.barNum, defaults, 'barNum')) setters.push(`sgl_bar_set_bar_num(${obj(w)}, ${w.barNum});`);
      if (shouldGenerateValue(w.barMode, defaults, 'barMode')) setters.push(`sgl_bar_set_mode(${obj(w)}, ${w.barMode});`);
      if (shouldGenerateValue(w.barHatColor, defaults, 'barHatColor')) setters.push(`sgl_bar_set_bar_hat_color(${obj(w)}, ${hexToSglColor(w.barHatColor)});`);
      if (shouldGenerateValue(w.barHatHeight, defaults, 'barHatHeight')) setters.push(`sgl_bar_set_bar_hat_height(${obj(w)}, ${w.barHatHeight});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_bar_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'gauge':
      if (shouldGenerateValue(w.value, defaults, 'value')) setters.push(`sgl_gauge_set_value(${obj(w)}, ${w.value || 50});`);
      if (shouldGenerateValue(w.arcColor, defaults, 'arcColor')) setters.push(`sgl_gauge_set_arc_color(${obj(w)}, ${hexToSglColor(w.arcColor)});`);
      if (shouldGenerateValue(w.scaleColor, defaults, 'scaleColor')) setters.push(`sgl_gauge_set_scale_color(${obj(w)}, ${hexToSglColor(w.scaleColor)});`);
      if (shouldGenerateValue(w.pointerColor, defaults, 'pointerColor')) setters.push(`sgl_gauge_set_pointer_color(${obj(w)}, ${hexToSglColor(w.pointerColor)});`);
      if (shouldGenerateValue(w.hubColor, defaults, 'hubColor')) setters.push(`sgl_gauge_set_hub_color(${obj(w)}, ${hexToSglColor(w.hubColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_gauge_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_gauge_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_gauge_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.startAngle, defaults, 'startAngle')) setters.push(`sgl_gauge_set_start_angle(${obj(w)}, ${w.startAngle});`);
      if (shouldGenerateValue(w.endAngle, defaults, 'endAngle')) setters.push(`sgl_gauge_set_end_angle(${obj(w)}, ${w.endAngle});`);
      if (shouldGenerateValue(w.arcWidth, defaults, 'arcWidth')) setters.push(`sgl_gauge_set_arc_width(${obj(w)}, ${w.arcWidth});`);
      if (shouldGenerateValue(w.scaleWidth, defaults, 'scaleWidth')) setters.push(`sgl_gauge_set_scale_width(${obj(w)}, ${w.scaleWidth});`);
      if (shouldGenerateValue(w.scaleLength, defaults, 'scaleLength')) setters.push(`sgl_gauge_set_scale_length(${obj(w)}, ${w.scaleLength});`);
      if (shouldGenerateValue(w.pointerWidth, defaults, 'pointerWidth')) setters.push(`sgl_gauge_set_pointer_width(${obj(w)}, ${w.pointerWidth});`);
      if (shouldGenerateValue(w.hubRadius, defaults, 'hubRadius')) setters.push(`sgl_gauge_set_hub_radius(${obj(w)}, ${w.hubRadius});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_gauge_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'spectrum':
      if (shouldGenerateValue(w.barColor, defaults, 'barColor')) setters.push(`sgl_spectrum_set_color(${obj(w)}, ${hexToSglColor(w.barColor)});`);
      if (shouldGenerateValue(w.barHatColor, defaults, 'barHatColor')) setters.push(`sgl_spectrum_set_bar_hat_color(${obj(w)}, ${hexToSglColor(w.barHatColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_spectrum_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_spectrum_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_spectrum_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.barWidth, defaults, 'barWidth')) setters.push(`sgl_spectrum_set_bar_width(${obj(w)}, ${w.barWidth});`);
      if (shouldGenerateValue(w.barNum, defaults, 'barNum')) setters.push(`sgl_spectrum_set_bar_num(${obj(w)}, ${w.barNum});`);
      if (shouldGenerateValue(w.barMode, defaults, 'barMode')) setters.push(`sgl_spectrum_set_mode(${obj(w)}, ${w.barMode});`);
      if (shouldGenerateValue(w.barHatHeight, defaults, 'barHatHeight')) setters.push(`sgl_spectrum_set_bar_hat_height(${obj(w)}, ${w.barHatHeight});`);
      if (shouldGenerateValue(w.direct, defaults, 'direct')) setters.push(`sgl_spectrum_set_direct(${obj(w)}, ${w.direct});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_spectrum_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'battery':
      if (shouldGenerateValue(w.level, defaults, 'level')) setters.push(`sgl_battery_set_level(${obj(w)}, ${w.level || 80});`);
      if (shouldGenerateValue(w.fillColor, defaults, 'fillColor')) setters.push(`sgl_battery_set_color(${obj(w)}, ${hexToSglColor(w.fillColor)});`);
      if (shouldGenerateValue(w.lowColor, defaults, 'lowColor')) setters.push(`sgl_battery_set_low_color(${obj(w)}, ${hexToSglColor(w.lowColor)});`);
      if (shouldGenerateValue(w.mediumColor, defaults, 'mediumColor')) setters.push(`sgl_battery_set_medium_color(${obj(w)}, ${hexToSglColor(w.mediumColor)});`);
      if (shouldGenerateValue(w.highColor, defaults, 'highColor')) setters.push(`sgl_battery_set_high_color(${obj(w)}, ${hexToSglColor(w.highColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_battery_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_battery_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_battery_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.cellRadius, defaults, 'cellRadius')) setters.push(`sgl_battery_set_radius(${obj(w)}, ${w.cellRadius});`);
      if (shouldGenerateValue(w.numCells, defaults, 'numCells')) setters.push(`sgl_battery_set_num_cells(${obj(w)}, ${w.numCells});`);
      if (shouldGenerateValue(w.direction, defaults, 'direction')) setters.push(`sgl_battery_set_direction(${obj(w)}, ${w.direction});`);
      if (shouldGenerateValue(w.capSize, defaults, 'capSize')) setters.push(`sgl_battery_set_cap_size(${obj(w)}, ${w.capSize});`);
      if (shouldGenerateValue(w.charging, defaults, 'charging')) setters.push(`sgl_battery_set_charging(${obj(w)}, ${w.charging ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.chargingColor, defaults, 'chargingColor')) setters.push(`sgl_battery_set_charging_color(${obj(w)}, ${hexToSglColor(w.chargingColor)});`);
      if (shouldGenerateValue(w.showPercentage, defaults, 'showPercentage')) setters.push(`sgl_battery_show_percentage(${obj(w)}, ${w.showPercentage ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_battery_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.fontSize, defaults, 'fontSize')) setters.push(`sgl_battery_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_battery_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_battery_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'led':
      if (shouldGenerateValue(w.status, defaults, 'status')) setters.push(`sgl_led_set_status(${obj(w)}, ${w.status ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.onColor, defaults, 'onColor')) setters.push(`sgl_led_set_color(${obj(w)}, ${hexToSglColor(w.onColor)});`);
      if (shouldGenerateValue(w.offColor, defaults, 'offColor')) setters.push(`sgl_led_set_off_color(${obj(w)}, ${hexToSglColor(w.offColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_led_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_led_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'msgbox':
      if (shouldGenerateValue(w.msgText, defaults, 'msgText')) setters.push(`sgl_msgbox_set_text(${obj(w)}, "${escapeStr(w.msgText)}");`);
      if (shouldGenerateValue(w.msgColor, defaults, 'msgColor')) setters.push(`sgl_msgbox_set_text_color(${obj(w)}, ${hexToSglColor(w.msgColor)});`);
      if (shouldGenerateValue(w.leftBtnText, defaults, 'leftBtnText')) setters.push(`sgl_msgbox_set_left_btn_text(${obj(w)}, "${escapeStr(w.leftBtnText)}");`);
      if (shouldGenerateValue(w.leftBtnColor, defaults, 'leftBtnColor')) setters.push(`sgl_msgbox_set_left_btn_color(${obj(w)}, ${hexToSglColor(w.leftBtnColor)});`);
      if (shouldGenerateValue(w.leftBtnTextColor, defaults, 'leftBtnTextColor')) setters.push(`sgl_msgbox_set_left_btn_text_color(${obj(w)}, ${hexToSglColor(w.leftBtnTextColor)});`);
      if (shouldGenerateValue(w.rightBtnText, defaults, 'rightBtnText')) setters.push(`sgl_msgbox_set_right_btn_text(${obj(w)}, "${escapeStr(w.rightBtnText)}");`);
      if (shouldGenerateValue(w.rightBtnColor, defaults, 'rightBtnColor')) setters.push(`sgl_msgbox_set_right_btn_color(${obj(w)}, ${hexToSglColor(w.rightBtnColor)});`);
      if (shouldGenerateValue(w.rightBtnTextColor, defaults, 'rightBtnTextColor')) setters.push(`sgl_msgbox_set_right_btn_text_color(${obj(w)}, ${hexToSglColor(w.rightBtnTextColor)});`);
      if (shouldGenerateValue(w.closeBtnColor, defaults, 'closeBtnColor')) setters.push(`sgl_msgbox_set_close_btn_color(${obj(w)}, ${hexToSglColor(w.closeBtnColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_msgbox_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_msgbox_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_msgbox_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_msgbox_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.titleHeight, defaults, 'titleHeight')) setters.push(`sgl_msgbox_set_title_height(${obj(w)}, ${w.titleHeight});`);
      if (shouldGenerateValue(w.msgOffsetX, defaults, 'msgOffsetX')) setters.push(`sgl_msgbox_set_text_offset_x(${obj(w)}, ${w.msgOffsetX});`);
      if (shouldGenerateValue(w.msgOffsetY, defaults, 'msgOffsetY')) setters.push(`sgl_msgbox_set_text_offset_y(${obj(w)}, ${w.msgOffsetY});`);
      if (shouldGenerateValue(w.msgLineMargin, defaults, 'msgLineMargin')) setters.push(`sgl_msgbox_set_line_margin(${obj(w)}, ${w.msgLineMargin});`);
      if (shouldGenerateValue(w.fontSize, defaults, 'fontSize')) setters.push(`sgl_msgbox_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_msgbox_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_msgbox_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'win':
      if (shouldGenerateValue(w.titleText, defaults, 'titleText')) setters.push(`sgl_win_set_text(${obj(w)}, "${escapeStr(w.titleText)}");`);
      if (shouldGenerateValue(w.titleColor, defaults, 'titleColor')) setters.push(`sgl_win_set_color(${obj(w)}, ${hexToSglColor(w.titleColor)});`);
      if (shouldGenerateValue(w.titleTextColor, defaults, 'titleTextColor')) setters.push(`sgl_win_set_text_color(${obj(w)}, ${hexToSglColor(w.titleTextColor)});`);
      if (shouldGenerateValue(w.closeBtnColor, defaults, 'closeBtnColor')) setters.push(`sgl_win_set_close_btn_color(${obj(w)}, ${hexToSglColor(w.closeBtnColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_win_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_win_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_win_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_win_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.titleHeight, defaults, 'titleHeight')) setters.push(`sgl_win_set_title_height(${obj(w)}, ${w.titleHeight});`);
      if (shouldGenerateValue(w.titleAlign, defaults, 'titleAlign')) setters.push(`sgl_win_set_text_align(${obj(w)}, SGL_ALIGN_${w.titleAlign});`);
      if (shouldGenerateValue(w.fontSize, defaults, 'fontSize')) setters.push(`sgl_win_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_win_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_win_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'dropdown':
      if (shouldGenerateValue(w.text, defaults, 'text')) setters.push(`sgl_dropdown_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_dropdown_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_dropdown_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_dropdown_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_dropdown_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_dropdown_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.selectedColor, defaults, 'selectedColor')) setters.push(`sgl_dropdown_set_selected_color(${obj(w)}, ${hexToSglColor(w.selectedColor)});`);
      if (shouldGenerateValue(w.selectedIndex, defaults, 'selectedIndex')) setters.push(`sgl_dropdown_set_selected_index(${obj(w)}, ${w.selectedIndex});`);
      if (shouldGenerateValue(w.fontSize, defaults, 'fontSize')) setters.push(`sgl_dropdown_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_dropdown_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_dropdown_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'numberkbd':
    case 'keyboard':
      if (shouldGenerateValue(w.cellColor, defaults, 'cellColor')) setters.push(`sgl_${w.type}_set_color(${obj(w)}, ${hexToSglColor(w.cellColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_${w.type}_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_${w.type}_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_${w.type}_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_${w.type}_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.btnColor, defaults, 'btnColor')) setters.push(`sgl_${w.type}_set_btn_color(${obj(w)}, ${hexToSglColor(w.btnColor)});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_${w.type}_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.btnMargin, defaults, 'btnMargin')) setters.push(`sgl_${w.type}_set_btn_margin(${obj(w)}, ${w.btnMargin});`);
      if (shouldGenerateValue(w.fontSize, defaults, 'fontSize')) setters.push(`sgl_${w.type}_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_${w.type}_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_${w.type}_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'textline':
      if (shouldGenerateValue(w.text, defaults, 'text')) setters.push(`sgl_textline_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_textline_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_textline_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_textline_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_textline_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_textline_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.align, defaults, 'align')) setters.push(`sgl_textline_set_text_align(${obj(w)}, SGL_ALIGN_${w.align});`);
      if (shouldGenerateValue(w.fontSize, defaults, 'fontSize')) setters.push(`sgl_textline_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_textline_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_textline_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'textlist':
      if (shouldGenerateValue(w.color, defaults, 'color')) setters.push(`sgl_textlist_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_textlist_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_textlist_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_textlist_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_textlist_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_textlist_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.selectedColor, defaults, 'selectedColor')) setters.push(`sgl_textlist_set_selected_color(${obj(w)}, ${hexToSglColor(w.selectedColor)});`);
      if (shouldGenerateValue(w.selectedIndex, defaults, 'selectedIndex')) setters.push(`sgl_textlist_set_selected_index(${obj(w)}, ${w.selectedIndex});`);
      if (shouldGenerateValue(w.lineMargin, defaults, 'lineMargin')) setters.push(`sgl_textlist_set_line_margin(${obj(w)}, ${w.lineMargin});`);
      if (shouldGenerateValue(w.fontSize, defaults, 'fontSize')) setters.push(`sgl_textlist_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_textlist_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_textlist_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'viewlist':
      if (shouldGenerateValue(w.fillColor, defaults, 'fillColor')) setters.push(`sgl_viewlist_set_color(${obj(w)}, ${hexToSglColor(w.fillColor)});`);
      if (shouldGenerateValue(w.scrollbarColor, defaults, 'scrollbarColor')) setters.push(`sgl_viewlist_set_scrollbar_color(${obj(w)}, ${hexToSglColor(w.scrollbarColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_viewlist_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_viewlist_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_viewlist_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_viewlist_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_viewlist_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.itemMarginX, defaults, 'itemMarginX')) setters.push(`sgl_viewlist_set_item_margin_x(${obj(w)}, ${w.itemMarginX});`);
      if (shouldGenerateValue(w.itemMarginY, defaults, 'itemMarginY')) setters.push(`sgl_viewlist_set_item_margin_y(${obj(w)}, ${w.itemMarginY});`);
      if (shouldGenerateValue(w.lineMargin, defaults, 'lineMargin')) setters.push(`sgl_viewlist_set_line_margin(${obj(w)}, ${w.lineMargin});`);
      if (shouldGenerateValue(w.fontSize, defaults, 'fontSize')) setters.push(`sgl_viewlist_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_viewlist_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_viewlist_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'arc':
      if (shouldGenerateValue(w.color, defaults, 'color')) setters.push(`sgl_arc_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_arc_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_arc_set_alpha(${obj(w)}, ${w.alpha});`);
      if (shouldGenerateValue(w.radiusIn, defaults, 'radiusIn') || shouldGenerateValue(w.radiusOut, defaults, 'radiusOut')) setters.push(`sgl_arc_set_radius(${obj(w)}, ${w.radiusIn || 0}, ${w.radiusOut || 0});`);
      if (shouldGenerateValue(w.mode, defaults, 'mode')) {
        const modeMacros = ['SGL_ARC_MODE_NORMAL', 'SGL_ARC_MODE_RING', 'SGL_ARC_MODE_NORMAL_SMOOTH', 'SGL_ARC_MODE_RING_SMOOTH'];
        setters.push(`sgl_arc_set_mode(${obj(w)}, ${modeMacros[w.mode] || 'SGL_ARC_MODE_NORMAL'});`);
      }
      if (shouldGenerateValue(w.startAngle, defaults, 'startAngle')) setters.push(`sgl_arc_set_start_angle(${obj(w)}, ${w.startAngle});`);
      if (shouldGenerateValue(w.endAngle, defaults, 'endAngle')) setters.push(`sgl_arc_set_end_angle(${obj(w)}, ${w.endAngle});`);
      break;

    case 'scroll':
      if (shouldGenerateValue(w.fillColor, defaults, 'fillColor')) setters.push(`sgl_scroll_set_color(${obj(w)}, ${hexToSglColor(w.fillColor)});`);
      if (shouldGenerateValue(w.scrollbarColor, defaults, 'scrollbarColor')) setters.push(`sgl_scroll_set_scrollbar_color(${obj(w)}, ${hexToSglColor(w.scrollbarColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_scroll_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_scroll_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_scroll_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_scroll_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.direct, defaults, 'direct')) setters.push(`sgl_scroll_set_direct(${obj(w)}, ${w.direct});`);
      if (shouldGenerateValue(w.value, defaults, 'value')) setters.push(`sgl_scroll_set_value(${obj(w)}, ${w.value});`);
      if (shouldGenerateValue(w.autoRefresh, defaults, 'autoRefresh')) setters.push(`sgl_scroll_set_auto_refresh(${obj(w)}, ${w.autoRefresh ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_scroll_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'box':
      if (shouldGenerateValue(w.fillColor, defaults, 'fillColor')) setters.push(`sgl_box_set_color(${obj(w)}, ${hexToSglColor(w.fillColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_box_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_box_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_box_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_box_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.scrollbarColor, defaults, 'scrollbarColor')) setters.push(`sgl_box_set_scrollbar_color(${obj(w)}, ${hexToSglColor(w.scrollbarColor)});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_box_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.fontSize, defaults, 'fontSize')) setters.push(`sgl_box_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_box_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_box_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'qrcode':
      if (shouldGenerateValue(w.qrText, defaults, 'qrText')) setters.push(`sgl_qrcode_set_text(${obj(w)}, "${escapeStr(w.qrText)}");`);
      if (shouldGenerateValue(w.color, defaults, 'color')) setters.push(`sgl_qrcode_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_qrcode_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_qrcode_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_qrcode_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.scale, defaults, 'scale')) setters.push(`sgl_qrcode_set_scale(${obj(w)}, ${w.scale});`);
      if (shouldGenerateValue(w.zone, defaults, 'zone')) setters.push(`sgl_qrcode_set_zone(${obj(w)}, ${w.zone});`);
      if (shouldGenerateValue(w.ecc, defaults, 'ecc')) setters.push(`sgl_qrcode_set_ecc_level(${obj(w)}, ${w.ecc});`);
      if (shouldGenerateValue(w.edgeMargin, defaults, 'edgeMargin')) setters.push(`sgl_qrcode_set_edge_margin(${obj(w)}, ${w.edgeMargin});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_qrcode_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'scope':
      if (shouldGenerateValue(w.waveColor, defaults, 'waveColor')) setters.push(`sgl_scope_set_wave_color(${obj(w)}, ${hexToSglColor(w.waveColor)});`);
      if (shouldGenerateValue(w.gridColor, defaults, 'gridColor')) setters.push(`sgl_scope_set_grid_color(${obj(w)}, ${hexToSglColor(w.gridColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_scope_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_scope_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_scope_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_scope_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.gridStyle, defaults, 'gridStyle')) setters.push(`sgl_scope_set_grid_style(${obj(w)}, ${w.gridStyle});`);
      if (shouldGenerateValue(w.edgeMargin, defaults, 'edgeMargin')) setters.push(`sgl_scope_set_edge_margin(${obj(w)}, ${w.edgeMargin});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_scope_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'chart':
      if (shouldGenerateValue(w.color, defaults, 'color')) setters.push(`sgl_chart_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_chart_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_chart_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_chart_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_chart_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.minValue, defaults, 'minValue')) setters.push(`sgl_chart_set_min_value(${obj(w)}, ${w.minValue});`);
      if (shouldGenerateValue(w.maxValue, defaults, 'maxValue')) setters.push(`sgl_chart_set_max_value(${obj(w)}, ${w.maxValue});`);
      if (shouldGenerateValue(w.autoScale, defaults, 'autoScale')) setters.push(`sgl_chart_set_auto_scale(${obj(w)}, ${w.autoScale ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.showYLabels, defaults, 'showYLabels')) setters.push(`sgl_chart_set_show_y_labels(${obj(w)}, ${w.showYLabels ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_chart_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.fontSize, defaults, 'fontSize')) setters.push(`sgl_chart_set_font_size(${obj(w)}, ${w.fontSize});`);
      if (shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && shouldGenerateValue(w.fontSize, defaults, 'fontSize')) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_chart_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_chart_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'sprite':
      if (shouldGenerateValue(w.color, defaults, 'color')) setters.push(`sgl_sprite_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_sprite_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_sprite_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_sprite_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_sprite_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.pixmapNum, defaults, 'pixmapNum')) setters.push(`sgl_sprite_set_pixmap_num(${obj(w)}, ${w.pixmapNum});`);
      if (shouldGenerateValue(w.pixmapIndex, defaults, 'pixmapIndex')) setters.push(`sgl_sprite_set_pixmap_index(${obj(w)}, ${w.pixmapIndex});`);
      if (shouldGenerateValue(w.autoRefresh, defaults, 'autoRefresh')) setters.push(`sgl_sprite_set_auto_refresh(${obj(w)}, ${w.autoRefresh ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_sprite_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'analogclock':
      if (shouldGenerateValue(w.hourPtrColor, defaults, 'hourPtrColor')) setters.push(`sgl_analogclock_set_hour_ptr_color(${obj(w)}, ${hexToSglColor(w.hourPtrColor)});`);
      if (shouldGenerateValue(w.minPtrColor, defaults, 'minPtrColor')) setters.push(`sgl_analogclock_set_min_ptr_color(${obj(w)}, ${hexToSglColor(w.minPtrColor)});`);
      if (shouldGenerateValue(w.secPtrColor, defaults, 'secPtrColor')) setters.push(`sgl_analogclock_set_sec_ptr_color(${obj(w)}, ${hexToSglColor(w.secPtrColor)});`);
      if (shouldGenerateValue(w.hubColor, defaults, 'hubColor')) setters.push(`sgl_analogclock_set_hub_color(${obj(w)}, ${hexToSglColor(w.hubColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_analogclock_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_analogclock_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_analogclock_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.hour, defaults, 'hour')) setters.push(`sgl_analogclock_set_hour(${obj(w)}, ${w.hour});`);
      if (shouldGenerateValue(w.minute, defaults, 'minute')) setters.push(`sgl_analogclock_set_minute(${obj(w)}, ${w.minute});`);
      if (shouldGenerateValue(w.second, defaults, 'second')) setters.push(`sgl_analogclock_set_second(${obj(w)}, ${w.second});`);
      if (shouldGenerateValue(w.hourPtrWidth, defaults, 'hourPtrWidth')) setters.push(`sgl_analogclock_set_hour_ptr_width(${obj(w)}, ${w.hourPtrWidth});`);
      if (shouldGenerateValue(w.minPtrWidth, defaults, 'minPtrWidth')) setters.push(`sgl_analogclock_set_min_ptr_width(${obj(w)}, ${w.minPtrWidth});`);
      if (shouldGenerateValue(w.secPtrWidth, defaults, 'secPtrWidth')) setters.push(`sgl_analogclock_set_sec_ptr_width(${obj(w)}, ${w.secPtrWidth});`);
      if (shouldGenerateValue(w.hubRadius, defaults, 'hubRadius')) setters.push(`sgl_analogclock_set_hub_radius(${obj(w)}, ${w.hubRadius});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_analogclock_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'canvas':
    case '2dball':
    case 'icon':
    case 'ext_img':
      const typeName = w.type.replace('2dball', '2d_ball');
      if (shouldGenerateValue(w.color, defaults, 'color')) setters.push(`sgl_${typeName}_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_${typeName}_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_${typeName}_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_${typeName}_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_${typeName}_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_${typeName}_set_alpha(${obj(w)}, ${w.alpha});`);
      break;
  }

  return setters;
}

function obj(w) {
  return sanitizeId(w.id);
}

function escapeStr(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getWidgetDisplayName(type) {
  const w = SGL_WIDGET_TYPES.find(t => t.type === type);
  return w ? w.name : type;
}
