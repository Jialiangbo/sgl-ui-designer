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
    properties: ['color', 'borderColor', 'borderAlpha', 'borderWidth', 'radius', 'mainAlpha', 'pixmap', 'pixmapFormat', 'locked']
  },
  {
    type: 'circle',
    name: '圆形',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>',
    category: 'basic',
    defaultSize: [60, 60],
    properties: ['color', 'borderColor', 'borderWidth', 'radius', 'alpha', 'xOffset', 'yOffset', 'pixmap', 'pixmapFormat', 'locked']
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
    properties: ['text', 'color', 'textColor', 'borderColor', 'borderWidth', 'radius', 'alpha', 'align', 'fontSize', 'fontFamily', 'fontBpp', 'pixmap', 'pixmapFormat', 'locked']
  },
  {
    type: 'switch',
    name: '开关',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3"/></svg>',
    category: 'interactive',
    defaultSize: [60, 30],
    properties: ['status', 'onColor', 'bgColor', 'knobColor', 'borderColor', 'borderWidth', 'radius', 'knobRadius', 'knobMargin', 'alpha', 'pixmap', 'pixmapFormat', 'locked']
  },
  {
    type: 'checkbox',
    name: '复选框',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1"/><polyline points="5,7 7,9 11,4"/></svg>',
    category: 'interactive',
    defaultSize: [120, 24],
    properties: ['text', 'status', 'color', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'radius', 'locked']
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
    properties: ['cellColor', 'btnColor', 'textColor', 'borderColor', 'borderWidth', 'radius', 'btnMargin', 'btnBorderWidth', 'btnBorderColor', 'btnRadius', 'btnPixmap', 'pixmap', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },
  {
    type: 'keyboard',
    name: '键盘',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10.01"/><line x1="10" y1="10" x2="10" y2="10.01"/><line x1="14" y1="10" x2="14" y2="10.01"/><line x1="18" y1="10" x2="18" y2="10.01"/><line x1="8" y1="14" x2="16" y2="14"/></svg>',
    category: 'interactive',
    defaultSize: [320, 180],
    properties: ['cellColor', 'btnColor', 'textColor', 'borderColor', 'borderWidth', 'radius', 'mainAlpha', 'borderAlpha', 'btnRadius', 'btnAlpha', 'btnMainAlpha', 'btnBorderColor', 'btnBorderWidth', 'btnBorderAlpha', 'btnPixmap', 'pixmap', 'textarea', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },

  // ============ 文本相关 ============
  {
    type: 'label',
    name: '标签',
    icon: '<svg viewBox="0 0 24 24"><text x="4" y="17" font-size="14" font-weight="bold" fill="currentColor" stroke="none">Aa</text></svg>',
    category: 'text',
    defaultSize: [120, 24],
    properties: ['text', 'textColor', 'bgColor', 'align', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'textOffsetX', 'textOffsetY', 'textRotation', 'radius', 'textBuffer', 'textFmt', 'textFmtDynamic', 'locked']
  },
  {
    type: 'textbox',
    name: '文本框',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="13" y2="13"/></svg>',
    category: 'text',
    defaultSize: [160, 36],
    properties: ['text', 'textColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'fontSize', 'fontFamily', 'fontBpp', 'lineMargin', 'pixmap', 'pixmapFormat', 'alpha', 'locked']
  },
  {
    type: 'textline',
    name: '文本行',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>',
    category: 'text',
    defaultSize: [160, 30],
    properties: ['text', 'textColor', 'bgColor', 'bgTransparent', 'radius', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'edgeMargin', 'lineMargin', 'locked']
  },
  {
    type: 'textlist',
    name: '文本列表',
    icon: '<svg viewBox="0 0 24 24"><line x1="5" y1="7" x2="19" y2="7"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/></svg>',
    category: 'text',
    defaultSize: [160, 120],
    properties: ['options', 'textColor', 'selectedColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'pixmap', 'locked']
  },

  // ============ 显示/进度 ============
  {
    type: 'progress',
    name: '进度条',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="9" width="20" height="6" rx="3"/><rect x="2" y="9" width="13" height="6" rx="3"/></svg>',
    category: 'display',
    defaultSize: [180, 20],
    properties: ['value', 'fillColor', 'trackColor', 'borderColor', 'borderWidth', 'radius', 'fillGap', 'fillRadius', 'fillWidth', 'trackAlpha', 'fillAlpha', 'pixmap', 'pixmapFormat', 'alpha', 'locked']
  },
  {
    type: 'bar',
    name: '柱状条',
    icon: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="16" rx="1"/><rect x="14" y="10" width="6" height="10" rx="1"/></svg>',
    category: 'display',
    defaultSize: [60, 100],
    properties: ['value', 'barColor', 'barHatColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'barWidth', 'barNum', 'barMode', 'barHatHeight', 'direct', 'alpha', 'pixmap', 'pixmapFormat', 'locked']
  },
  {
    type: 'gauge',
    name: '仪表盘',
    icon: '<svg viewBox="0 0 24 24"><path d="M4 17a8 8 0 0 1 16 0"/><line x1="12" y1="14" x2="15" y2="8"/><circle cx="12" cy="14" r="1"/></svg>',
    category: 'display',
    defaultSize: [100, 100],
    properties: ['value', 'bgColor', 'arcColor', 'scaleColor', 'pointerColor', 'textColor', 'hubColor', 'scaleWidth', 'pointerWidth', 'arcWidth', 'hubRadius', 'scaleLength', 'scaleStart', 'scaleStep', 'scaleAngle', 'textInterval', 'scaleWarning', 'startAngle', 'endAngle', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },
  {
    type: 'spectrum',
    name: '频谱',
    icon: '<svg viewBox="0 0 24 24"><line x1="4" y1="18" x2="4" y2="10"/><line x1="8" y1="18" x2="8" y2="6"/><line x1="12" y1="18" x2="12" y2="8"/><line x1="16" y1="18" x2="16" y2="4"/><line x1="20" y1="18" x2="20" y2="12"/></svg>',
    category: 'display',
    defaultSize: [160, 60],
    properties: ['barColor', 'barHatColor', 'barNum', 'barMode', 'barHatHeight', 'barValues', 'alpha', 'locked']
  },
  {
    type: 'battery',
    name: '电池',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="18" height="10" rx="2"/><rect x="5" y="9" width="10" height="6" rx="1"/><line x1="22" y1="10" x2="22" y2="14"/></svg>',
    category: 'display',
    defaultSize: [60, 30],
    properties: ['level', 'fillColor', 'lowColor', 'mediumColor', 'highColor', 'bgColor', 'borderColor', 'numCells', 'direction', 'capSize', 'capPos', 'charging', 'chargingColor', 'showPercentage', 'textColor', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },
  {
    type: 'led',
    name: 'LED指示灯',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="5.5" fill="currentColor" opacity="0.9"/><circle cx="10" cy="10" r="1.5" fill="#fff" opacity="0.5"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="1" opacity="0.5"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="1" opacity="0.5"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="1" opacity="0.5"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="1" opacity="0.5"/></svg>',
    category: 'display',
    defaultSize: [20, 20],
    properties: ['onColor', 'offColor', 'bgColor', 'radius', 'status', 'alpha', 'locked']
  },

  // ============ 图像/视图 ============
  {
    type: 'icon',
    name: '图标',
    icon: '<svg viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9"/></svg>',
    category: 'image',
    defaultSize: [40, 40],
    properties: ['color', 'alpha', 'align', 'icon', 'locked']
  },
  {
    type: 'msgbox',
    name: '消息框',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="7" y1="7" x2="7" y2="7.01"/></svg>',
    category: 'special',
    defaultSize: [240, 160],
    properties: ['titleText', 'titleTextColor', 'msgText', 'msgColor', 'leftBtnText', 'leftBtnColor', 'leftBtnTextColor', 'rightBtnText', 'rightBtnColor', 'rightBtnTextColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'titleHeight', 'msgOffsetX', 'msgOffsetY', 'msgLineMargin', 'mainAlpha', 'borderAlpha', 'pixmap', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },
  {
    type: 'viewlist',
    name: '视图列表',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="6" rx="1"/><rect x="3" y="11" width="18" height="6" rx="1"/><rect x="3" y="19" width="18" height="2" rx="1"/></svg>',
    category: 'display',
    defaultSize: [160, 120],
    properties: ['bgColor', 'borderColor', 'borderWidth', 'radius', 'itemHeight', 'itemMarginX', 'itemMarginY', 'pixmap', 'alpha', 'locked']
  },
  {
    type: 'dropdown',
    name: '下拉框',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="8,11 12,15 16,11"/></svg>',
    category: 'interactive',
    defaultSize: [160, 36],
    properties: ['options', 'optionDynamic', 'selectedColor', 'textColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'visibleRows', 'alpha', 'fontSize', 'fontFamily', 'fontBpp', 'locked']
  },
  {
    type: 'roller',
    name: '滚轮选择器',
    icon: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="16" rx="2"/><line x1="10" y1="9" x2="14" y2="9"/><line x1="10" y1="12" x2="14" y2="12"/><line x1="10" y1="15" x2="14" y2="15"/></svg>',
    category: 'interactive',
    defaultSize: [120, 120],
    properties: ['options', 'optionDynamic', 'visibleRows', 'textColor', 'selectedColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },
  {
    type: 'scroll',
    name: '滚动容器',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="19" y1="7" x2="19" y2="17"/><line x1="17" y1="9" x2="17" y2="15"/></svg>',
    category: 'special',
    defaultSize: [160, 120],
    properties: ['color', 'borderColor', 'borderWidth', 'radius', 'width', 'value', 'direct', 'hidden', 'bindTarget', 'alpha', 'locked']
  },
  {
    type: 'box',
    name: '容器盒',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
    category: 'special',
    defaultSize: [160, 120],
    properties: ['bgColor', 'borderColor', 'borderWidth', 'radius', 'scrollbarColor', 'showVScrollbar', 'showHScrollbar', 'elasticUp', 'elasticDown', 'elasticLeft', 'elasticRight', 'pixmap', 'alpha', 'locked']
  },
  {
    type: 'win',
    name: '窗口',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="8" x2="21" y2="8"/><circle cx="7" cy="5.5" r="1"/><circle cx="11" cy="5.5" r="1"/><circle cx="15" cy="5.5" r="1"/></svg>',
    category: 'special',
    defaultSize: [240, 180],
    properties: ['titleText', 'titleBgColor', 'titleTextColor', 'closeBtnColor', 'bgColor', 'borderColor', 'borderWidth', 'radius', 'titleHeight', 'titleAlign', 'pixmap', 'fontSize', 'fontFamily', 'fontBpp', 'alpha', 'locked']
  },
  {
    type: 'qrcode',
    name: '二维码',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/></svg>',
    category: 'image',
    defaultSize: [80, 80],
    properties: ['qrText', 'cellColor', 'bgColor', 'cellRadius', 'zone', 'scale', 'version', 'ecc', 'logo', 'logoRadius', 'alpha', 'locked']
  },
  {
    type: 'scope',
    name: '示波器',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="5,12 8,8 11,14 14,10 17,12 20,12"/></svg>',
    category: 'display',
    defaultSize: [200, 120],
    properties: ['channelCount', 'channelBuffers', 'channelWaveformColors', 'maxDisplayPoints', 'rangeMin', 'rangeMax', 'autoScale', 'showYLabels', 'yLabelColor', 'lineWidth', 'gridLine', 'bgColor', 'gridColor', 'borderColor', 'borderWidth', 'alpha', 'fontSize', 'fontFamily', 'fontBpp', 'locked']
  },
  {
    type: 'chart',
    name: '图表',
    icon: '<svg viewBox="0 0 24 24"><polyline points="4,18 8,10 12,14 16,6 20,12"/></svg>',
    category: 'display',
    defaultSize: [200, 120],
    properties: ['chartType', 'bgColor', 'borderColor', 'minValue', 'maxValue', 'autoScale', 'showYLabels', 'gridColor', 'gridDashed', 'textColor', 'fontSize', 'fontFamily', 'fontBpp', 'seriesCount', 'seriesData', 'seriesColors', 'xLabels', 'startAngle', 'innerRadiusRate', 'radius', 'legendEnable', 'legendPos', 'legendDir', 'legendTextColor', 'sliceCount', 'sliceValues', 'sliceColors', 'sliceLabels', 'alpha', 'locked']
  },
  {
    type: 'canvas',
    name: '画布',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="7" x2="17" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="17" x2="12" y2="17"/></svg>',
    category: 'special',
    defaultSize: [200, 150],
    properties: ['painterCb', 'privateData', 'locked']
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
    properties: ['pixmap', 'alpha', 'locked']
  },
  {
    type: 'statusbar',
    name: '状态栏',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="6" rx="1"/><text x="4" y="9.5" font-size="4" fill="currentColor">L</text><text x="18" y="9.5" font-size="4" fill="currentColor">R</text></svg>',
    category: 'special',
    defaultSize: [240, 24],
    properties: ['bgColor', 'bgAlpha', 'radius', 'leftMargin', 'rightMargin', 'slotSpace', 'leftSlots', 'rightSlots', 'slotColor', 'slotAlpha', 'fontFamily', 'fontBpp', 'locked']
  },
  {
    type: 'launcher',
    name: '启动器',
    icon: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
    category: 'special',
    defaultSize: [240, 320],
    properties: ['iconSize', 'gridCol', 'gridRow', 'marginLeft', 'marginTop', 'marginRight', 'marginBottom', 'labelColor', 'navigbarColor', 'currentPage', 'fontFamily', 'fontBpp', 'locked']
  },
  {
    type: 'analogclock',
    name: '模拟时钟',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="12" y1="12" x2="12" y2="7"/><line x1="12" y1="12" x2="16" y2="12"/></svg>',
    category: 'display',
    defaultSize: [100, 100],
    properties: ['hour', 'minute', 'second', 'hourPtrColor', 'minPtrColor', 'secPtrColor', 'scaleColor', 'textColor', 'hubColor', 'bgColor', 'borderColor', 'borderWidth', 'hourPtrWidth', 'minPtrWidth', 'secPtrWidth', 'scaleWidth', 'scaleLength', 'hubRadius', 'alpha', 'locked']
  },
  {
    type: 'ext_img',
    name: '外部图片',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><polyline points="4,18 9,13 13,17 17,12 20,15"/></svg>',
    category: 'image',
    defaultSize: [100, 100],
    properties: ['pixmap', 'pixmapNum', 'pixmapIndex', 'autoRefresh', 'readOps', 'pixmapNext', 'alpha', 'locked']
  },
  {
    type: 'unzip_image',
    name: '解压图片',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l4-4 4 4M12 8v8"/></svg>',
    category: 'image',
    defaultSize: [100, 100],
    properties: ['color', 'alpha', 'align', 'unzipImg', 'locked']
  }
];

// ============ 属性元数据：中文名 + 输入类型 ============
// type: 'text' | 'number' | 'color' | 'bool' | 'select'
export const PROP_META = {
  text: { label: '文本内容', type: 'text' },
  textBuffer: { label: '文本缓冲区', type: 'text', placeholder: '格式: 缓冲区变量名,大小' },
  textFmt: { label: '格式化文本(静态缓冲)', type: 'text', placeholder: '不含格式参数的字符串，如 Value: 0' },
  textFmtDynamic: { label: '格式化文本(动态缓冲)', type: 'text', placeholder: '不含格式参数的字符串，如 Value: 0' },
  qrText: { label: '二维码内容', type: 'text' },
  titleText: { label: '标题文本', type: 'text' },
  titleTextColor: { label: '标题文本颜色', type: 'color' },
  leftSlots: { label: '左侧槽位文本', type: 'text', placeholder: '格式: 0:文本;1:文本 (最多4个)' },
  rightSlots: { label: '右侧槽位文本', type: 'text', placeholder: '格式: 0:文本;1:文本 (最多8个)' },
  slotSpace: { label: '槽位间距', type: 'number', min: 0, max: 50 },
  leftMargin: { label: '左侧边距', type: 'number', min: 0, max: 50 },
  rightMargin: { label: '右侧边距', type: 'number', min: 0, max: 50 },
  slotColor: { label: '槽位颜色', type: 'color' },
  slotAlpha: { label: '槽位透明度', type: 'number', min: 0, max: 255 },
  bgAlpha: { label: '背景透明度', type: 'number', min: 0, max: 255 },
  iconSize: { label: '图标大小', type: 'number', min: 8, max: 200 },
  gridCol: { label: '网格列数', type: 'number', min: 1, max: 10 },
  gridRow: { label: '网格行数', type: 'number', min: 1, max: 10 },
  marginLeft: { label: '左边距', type: 'number', min: 0, max: 100 },
  marginTop: { label: '上边距', type: 'number', min: 0, max: 100 },
  marginRight: { label: '右边距', type: 'number', min: 0, max: 100 },
  marginBottom: { label: '下边距', type: 'number', min: 0, max: 100 },
  navigbarColor: { label: '导航栏颜色', type: 'color' },
  msgText: { label: '消息文本', type: 'text' },
  leftBtnText: { label: '左侧按钮文本', type: 'text' },
  rightBtnText: { label: '右侧按钮文本', type: 'text' },
  options: { label: '选项文本', type: 'text', placeholder: '每行一个选项' },
  icon: { color: '#000000', align: 'CENTER', icon: '', alpha: 255 },
  unzipImg: { label: '解压图片数据', type: 'select' },
  color: { label: '颜色', type: 'color' },
  cellColor: { label: '单元颜色', type: 'color' },
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
  btnBorderColor: { label: '按钮边框颜色', type: 'color' },
  btnBorderAlpha: { label: '按钮边框透明度', type: 'number', min: 0, max: 255 },
  arcColor: { label: '弧形颜色', type: 'color' },
  scaleColor: { label: '刻度颜色', type: 'color' },
  pointerColor: { label: '指针颜色', type: 'color' },
  hubColor: { label: '中心点颜色', type: 'color' },
  hourPtrColor: { label: '时针颜色', type: 'color' },
  minPtrColor: { label: '分针颜色', type: 'color' },
  secPtrColor: { label: '秒针颜色', type: 'color' },
  waveColor: { label: '波形颜色', type: 'color' },
  gridColor: { label: '网格颜色', type: 'color' },
  gridDashed: { label: '网格虚线', type: 'bool' },
  scrollbarColor: { label: '滚动条颜色', type: 'color' },
  selectedColor: { label: '选中颜色', type: 'color' },
  borderWidth: { label: '边框宽度', type: 'number', min: 0, max: 50 },
  btnBorderWidth: { label: '按钮边框宽度', type: 'number', min: 0, max: 50 },
  radius: { label: '圆角半径', type: 'number', min: 0, max: 100 },
  btnRadius: { label: '按钮圆角', type: 'number', min: 0, max: 100 },
  radiusIn: { label: '内半径', type: 'number', min: 0, max: 500 },
  radiusOut: { label: '外半径', type: 'number', min: 0, max: 500 },
  cellRadius: { label: '单元格圆角', type: 'number', min: 0, max: 20 },
  alpha: { label: '透明度', type: 'number', min: 0, max: 255 },
  mainAlpha: { label: '填充透明度', type: 'number', min: 0, max: 255 },
  borderAlpha: { label: '边框透明度', type: 'number', min: 0, max: 255 },
  trackAlpha: { label: '轨道透明度', type: 'number', min: 0, max: 255 },
  fillAlpha: { label: '填充透明度', type: 'number', min: 0, max: 255 },
  btnAlpha: { label: '按钮透明度', type: 'number', min: 0, max: 255 },
  btnMainAlpha: { label: '按钮主体透明度', type: 'number', min: 0, max: 255 },
  pixmap: { label: '图片', type: 'select' },
  btnPixmap: { label: '按钮图片', type: 'select' },
  align: { label: '对齐方式', type: 'select', options: [['LEFT', '左'], ['CENTER', '居中'], ['RIGHT', '右']] },
  titleAlign: { label: '标题对齐', type: 'select', options: [['LEFT', '左'], ['CENTER', '居中'], ['RIGHT', '右']] },
  fontSize: { label: '字体大小', type: 'number', min: 8, max: 72 },
  fontFamily: { label: '字体文件', type: 'select', options: [] },
  fontBpp: { label: '抗锯齿', type: 'select', options: [[1, '1'], [2, '2'], [4, '4']] },
  status: { label: '开关状态', type: 'bool' },
  charging: { label: '充电状态', type: 'bool' },
  showPercentage: { label: '显示百分比', type: 'bool' },
  autoRefresh: { label: '自动刷新', type: 'bool' },
  autoScale: { label: '自动缩放', type: 'bool' },
  showYLabels: { label: '显示Y轴标签', type: 'bool' },
  hidden: { label: '隐藏', type: 'bool' },
  showVScrollbar: { label: '显示垂直滚动条', type: 'bool' },
  showHScrollbar: { label: '显示水平滚动条', type: 'bool' },
  knobRadius: { label: '旋钮圆角半径', type: 'number', min: 0, max: 255 },
  knobMargin: { label: '旋钮边距', type: 'number', min: 0, max: 20 },
  pixmapFormat: { label: '图片格式', type: 'select', options: [['RGB565', 'RGB565 (16-bit)'], ['ARGB4444', 'ARGB4444 (16-bit+透明度)'], ['RGB888', 'RGB888 (24-bit)'], ['ARGB8888', 'ARGB8888 (32-bit+透明度)'], ['RGB332', 'RGB332 (8-bit)'], ['ARGB2222', 'ARGB2222 (8-bit+透明度)']] },
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
  width: { label: '滚动条宽度', type: 'number', min: 0, max: 50 },
  bindTarget: { label: '绑定目标对象', type: 'text', placeholder: '目标控件变量名，如: list1' },
  scaleWidth: { label: '刻度宽度', type: 'number', min: 0, max: 30 },
  elasticUp: { label: '上弹性限制', type: 'number', min: 0, max: 500 },
  elasticDown: { label: '下弹性限制', type: 'number', min: 0, max: 500 },
  elasticLeft: { label: '左弹性限制', type: 'number', min: 0, max: 500 },
  elasticRight: { label: '右弹性限制', type: 'number', min: 0, max: 500 },
  scaleLength: { label: '刻度长度', type: 'number', min: 0, max: 50 },
  scaleStart: { label: '刻度起始值', type: 'number', min: -1000, max: 1000 },
  scaleStep: { label: '刻度步长', type: 'number', min: 1, max: 1000 },
  scaleAngle: { label: '刻度角度', type: 'number', min: 0, max: 360 },
  textInterval: { label: '文本间隔', type: 'number', min: 1, max: 50 },
  scaleWarning: { label: '警戒值', type: 'number', min: -1000, max: 1000 },
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
  version: { label: 'QR 版本', type: 'number', min: 1, max: 40 },
  cellRadius: { label: '单元圆角', type: 'number', min: 0, max: 20 },
  logo: { label: 'Logo 图片', type: 'select' },
  logoRadius: { label: 'Logo 圆角', type: 'number', min: -1, max: 100 },
  labelColor: { label: '标签文本颜色', type: 'color' },
  currentPage: { label: '当前页', type: 'number', min: 0, max: 100 },
  capPos: { label: '电池头位置', type: 'select', options: [[0, '右'], [1, '左'], [2, '上']] },
  btnMargin: { label: '按钮边距', type: 'number', min: 0, max: 30 },
  selectedIndex: { label: '选中项索引', type: 'number', min: -1, max: 50 },
  pixmapNum: { label: '图片数量', type: 'number', min: 1, max: 200 },
  pixmapIndex: { label: '当前图片索引', type: 'number', min: 0, max: 200 },
  optionDynamic: { label: '动态选项副本', type: 'bool' },
  readOps: { label: '外部读取函数', type: 'text', placeholder: '例如: flash_read_data' },
  pixmapNext: { label: '切换到下一张图片', type: 'bool' },
  bgTransparent: { label: '背景透明', type: 'bool' },
  barValues: { label: '初始柱值', type: 'text', placeholder: '用 ; 分隔，如: 10;20;30' },
  chartType: { label: '图表类型', type: 'select', options: [['linechart', '折线图'], ['barchart', '柱状图'], ['piechart', '饼图']] },
  seriesCount: { label: '系列数量', type: 'number', min: 1, max: 8 },
  seriesData: { label: '系列数据', type: 'text', placeholder: '格式: series0_ydata,10; series1_ydata,10' },
  seriesColors: { label: '系列颜色', type: 'text', placeholder: '用 ; 分隔，如: #ff0000;#00ff00' },
  xLabels: { label: 'X轴标签', type: 'text', placeholder: '用 ; 分隔，如: 周一;周二;周三' },
  innerRadiusRate: { label: '内半径比例(%)', type: 'number', min: 0, max: 100 },
  legendEnable: { label: '启用图例', type: 'bool' },
  legendPos: { label: '图例位置', type: 'select', options: [[0, '无'], [1, '左'], [2, '右'], [3, '上'], [4, '下']] },
  legendDir: { label: '图例方向', type: 'select', options: [[0, '垂直'], [1, '水平']] },
  legendTextColor: { label: '图例文本颜色', type: 'color' },
  sliceCount: { label: '扇区数量', type: 'number', min: 1, max: 16 },
  sliceValues: { label: '扇区值', type: 'text', placeholder: '用 ; 分隔，如: 30;50;20' },
  sliceColors: { label: '扇区颜色', type: 'text', placeholder: '用 ; 分隔，如: #ff0000;#00ff00;#0000ff' },
  sliceLabels: { label: '扇区标签', type: 'text', placeholder: '用 ; 分隔，如: A;B;C' },
  exitAnswer: { label: '退出时返回答案', type: 'bool' },
  channelCount: { label: '通道数量', type: 'number', min: 1, max: 4 },
  channelBuffers: { label: '通道数据缓冲区', type: 'text', placeholder: '例如: ch0_buf,128;ch1_buf,128' },
  channelWaveformColors: { label: '通道波形颜色', type: 'text', placeholder: '用 ; 分隔，如: #ff0000;#00ff00' },
  maxDisplayPoints: { label: '最大显示点数', type: 'number', min: 1, max: 1000 },
  rangeMin: { label: '量程最小值', type: 'number', min: -32768, max: 32767 },
  rangeMax: { label: '量程最大值', type: 'number', min: -32768, max: 32767 },
  lineWidth: { label: '波形线宽', type: 'number', min: 1, max: 10 },
  gridLine: { label: '网格线样式', type: 'select', options: [[0, '实线'], [1, '虚线']] },
  yLabelColor: { label: 'Y轴标签颜色', type: 'color' },
  visibleRows: { label: '最大可见行数', type: 'number', min: 1, max: 50 },
  itemHeight: { label: '项目高度', type: 'number', min: 10, max: 500 },
  itemMarginX: { label: '项目水平边距', type: 'number', min: 0, max: 50 },
  itemMarginY: { label: '项目垂直边距', type: 'number', min: 0, max: 50 },
  locked: { label: '锁定控件', type: 'bool' },
  vertices: { label: '顶点坐标', type: 'text', placeholder: '格式: x1,y1;x2,y2;x3,y3...' },
  eventCb: { label: '事件回调函数', type: 'text' },
  textarea: { label: '文本缓冲区变量', type: 'text' },
  painterCb: { label: '绘制回调函数', type: 'text', placeholder: '例如: my_canvas_painter' },
  privateData: { label: '私有数据指针', type: 'text', placeholder: 'C 变量名或 NULL' },
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
  roller: ['onClicked', 'onReleased', 'onMoveUp', 'onMoveDown', 'onKeyEnter'],
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
  statusbar: [],
  launcher: ['onPressed', 'onReleased', 'onClicked'],
  // 图像组件
  icon: [],
  ext_img: ['onPressed', 'onReleased'],
  unzip_image: ['onPressed', 'onReleased'],
};

// ============ 组件分类 ============
export const WIDGET_CATEGORIES = [
  { id: 'basic', name: '基础图形', types: ['rect', 'circle', 'ring', 'arc', 'line', 'polygon'] },
  { id: 'interactive', name: '交互组件', types: ['button', 'switch', 'checkbox', 'slider', 'numberkbd', 'keyboard', 'dropdown', 'roller'] },
  { id: 'text', name: '文本组件', types: ['label', 'textbox', 'textline', 'textlist'] },
  { id: 'display', name: '显示组件', types: ['progress', 'bar', 'gauge', 'spectrum', 'battery', 'led', 'viewlist', 'qrcode', 'scope', 'chart', 'analogclock'] },
  { id: 'special', name: '特殊组件', types: ['msgbox', 'scroll', 'box', 'win', 'canvas', '2dball', 'sprite', 'statusbar', 'launcher'] },
  { id: 'image', name: '图像组件', types: ['icon', 'ext_img', 'unzip_image'] }
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
      return { ...base, color: '#FFFFFF', borderColor: '#000000', borderWidth: 2, borderAlpha: 255, radius: 0, mainAlpha: 255, pixmap: '', pixmapFormat: 'RGB565' };
    case 'circle':
      return { ...base, color: '#FFFFFF', borderColor: '#000000', borderWidth: 2, radius: 0, xOffset: 0, yOffset: 0, pixmap: '', pixmapFormat: 'RGB565' };
    case 'ring':
      return { ...base, color: '#FFFFFF', radiusIn: -1, radiusOut: -1 };
    case 'arc':
      return { ...base, color: '#000000', bgColor: '#FFFFFF', alpha: 255, mode: 0, radiusIn: -1, radiusOut: -1, startAngle: 0, endAngle: 360 };
    case 'line':
      return { ...base, color: '#000000', lineWidth: 1, x1: 0, y1: 0, x2: null, y2: null, dashed: false, dashLen: 0, gapLen: 0 };
    case 'polygon':
      return { ...base, fillColor: '#7F7F7F', borderColor: '#000000', borderWidth: 1, alpha: 255, vertices: '40,5;70,30;60,75;20,75;10,30', text: '', textColor: '#000000', fontFamily: '', fontSize: 14, fontBpp: 4 };
    case 'button':
      return { ...base, text: '按钮', color: '#ffffff', textColor: '#000000', borderColor: '#000000', borderWidth: 2, radius: 0, align: 'CENTER', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, pixmap: '', pixmapFormat: 'RGB565' };
    case 'switch':
      return { ...base, status: false, onColor: '#FFFFFF', bgColor: '#000000', knobColor: '#808080', borderColor: '#000000', borderWidth: 2, radius: 0, knobRadius: 255, knobMargin: 2, pixmap: '', pixmapFormat: 'RGB565' };
    case 'checkbox':
      return { ...base, text: '选项', color: '#000000', status: false, radius: 0, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'slider':
      return { ...base, value: 50, direct: 0, fillColor: '#8b5cf6', trackColor: '#313149', knobColor: '#ffffff', borderWidth: 2, radius: 4, thickness: 8 };
    case 'numberkbd':
      return { ...base, cellColor: '#FFFFFF', borderColor: '#000000', borderWidth: 2, radius: 0, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, btnColor: '#FFFFFF', textColor: '#000000', btnMargin: 1, btnBorderWidth: 1, btnBorderColor: '#000000', btnRadius: 0, btnPixmap: '', pixmap: '' };
    case 'keyboard':
      return { ...base, cellColor: '#FFFFFF', borderColor: '#000000', borderWidth: 1, radius: 0, mainAlpha: 255, borderAlpha: 255, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, btnColor: '#404040', textColor: '#000000', btnRadius: 0, btnAlpha: 255, btnMainAlpha: 255, btnBorderColor: '#000000', btnBorderWidth: 0, btnBorderAlpha: 255, btnPixmap: '', pixmap: '', textarea: '' };
    case 'label':
      return { ...base, text: '标签文本', textColor: '#000000', bgColor: 'transparent', align: 'LEFT', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, textOffsetX: 0, textOffsetY: 0, textRotation: 0, radius: 0, textBuffer: '', textFmt: '', textFmtDynamic: '' };
    case 'textbox':
      return { ...base, text: 'textbox', textColor: '#000000', bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 1, radius: 10, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, lineMargin: 1, pixmap: '', pixmapFormat: 'RGB565' };
    case 'textline':
      return { ...base, text: 'textline', textColor: '#000000', bgColor: '#FFFFFF', bgTransparent: false, radius: 0, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, edgeMargin: 0, lineMargin: 1 };
    case 'textlist':
      return { ...base, options: '选项1\\n选项2\\n选项3', bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 1, radius: 0, fontSize: 12, fontFamily: 'simsun.ttc', fontBpp: 4, textColor: '#000000', selectedColor: '#808080', pixmap: '' };
    case 'progress':
      return { ...base, value: 50, fillColor: '#FFFFFF', trackColor: '#000000', borderColor: '#000000', borderWidth: 2, radius: 0, fillGap: 4, fillRadius: 0, fillWidth: 4, direct: 0 };
    case 'bar':
      return { ...base, value: 50, barColor: '#000000', bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 2, radius: 0, barWidth: 20, barNum: 10, barMode: 0, barHatColor: '#808080', barHatHeight: 2, direct: 0 };
    case 'gauge':
      return { ...base, value: 0, arcColor: '#FFFFFF', scaleColor: '#FFFFFF', pointerColor: '#FF0000', hubColor: '#FFFFFF', bgColor: '#000000', startAngle: 30, endAngle: 330, arcWidth: 2, scaleWidth: 1, scaleLength: 0, pointerWidth: 2, hubRadius: 0, scaleStart: 0, scaleStep: 10, scaleAngle: 15, textInterval: 3, scaleWarning: 32767 };
    case 'spectrum':
      return { ...base, barColor: '#000000', barHatColor: '#808080', barNum: 0, barMode: 0, barHatHeight: 3, barValues: '' };
    case 'battery':
      return { ...base, level: 100, fillColor: '#00FF00', lowColor: '#FF0000', mediumColor: '#FFA500', highColor: '#00FF00', bgColor: '#1E1E1E', borderColor: '#FFFFFF', numCells: 6, direction: 0, capSize: 4, capPos: 0, charging: false, chargingColor: '#FFFF00', showPercentage: false, textColor: '#000000', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'icon':
      return { ...base, color: '#000000', align: 'CENTER', icon: '' };
    case 'led':
      return { ...base, onColor: '#FFFFFF', offColor: '#000000', bgColor: '#000000', radius: 0, status: false };
    case 'msgbox':
      return { ...base, titleText: 'Message Box', titleTextColor: '#000000', msgText: 'NULL', msgColor: '#000000', leftBtnText: 'YES', leftBtnColor: '#C8C8C8', leftBtnTextColor: '#000000', rightBtnText: 'NO', rightBtnColor: '#C8C8C8', rightBtnTextColor: '#000000', bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 2, radius: 0, titleHeight: 0, msgOffsetX: 0, msgOffsetY: 0, msgLineMargin: 1, mainAlpha: 255, borderAlpha: 255, pixmap: '', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, exitAnswer: false };
    case 'viewlist':
      return { ...base, bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 1, radius: 0, itemHeight: 20, itemMarginX: 1, itemMarginY: 1, pixmap: '' };
    case 'dropdown':
      return { ...base, options: '选项1\n选项2\n选项3', optionDynamic: false, textColor: '#000000', bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 1, radius: 0, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, selectedColor: '#808080', visibleRows: 5 };
    case 'scroll':
      return { ...base, color: '#FFFFFF', borderColor: '#000000', borderWidth: 2, radius: 0, width: 10, value: 0, direct: 1, hidden: false, bindTarget: '' };
    case 'box':
      return { ...base, bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 1, radius: 0, scrollbarColor: '#C8C8C8', showVScrollbar: true, showHScrollbar: true, elasticUp: 0, elasticDown: 0, elasticLeft: 0, elasticRight: 0, pixmap: '' };
    case 'win':
      return { ...base, titleText: '窗口标题', titleBgColor: '#808080', titleTextColor: '#000000', closeBtnColor: '#FF5A50', bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 0, radius: 0, pixmap: '', pixmapFormat: 'RGB565', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, titleHeight: 0, titleAlign: 'LEFT' };
    case 'qrcode':
      return { ...base, cellColor: '#000000', bgColor: '#ffffff', cellRadius: 0, qrText: 'hello', scale: 4, zone: 1, version: 5, ecc: 0, logo: '', logoRadius: 0 };
    case 'scope':
      return { ...base, channelCount: 1, channelBuffers: '', channelWaveformColors: '#00FF00', maxDisplayPoints: 0, rangeMin: 0, rangeMax: 65535, autoScale: true, showYLabels: true, yLabelColor: '#FFFFFF', lineWidth: 2, gridLine: 0, bgColor: '#000000', gridColor: '#323232', borderColor: '#969696', borderWidth: 0, alpha: 255, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'chart':
      return { ...base, chartType: 'linechart', bgColor: '#000000', borderColor: '#000000', minValue: 0, maxValue: 100, autoScale: true, showYLabels: true, gridColor: '#3C3C3C', gridDashed: true, textColor: '#000000', fontSize: 12, fontFamily: 'simsun.ttc', fontBpp: 4, seriesCount: 0, seriesData: '', seriesColors: '#FFFFFF', xLabels: '', startAngle: 0, innerRadiusRate: 0, radius: 0, legendEnable: false, legendPos: 0, legendDir: 0, legendTextColor: '#e4e4e7', sliceCount: 3, sliceValues: '30;50;20', sliceColors: '#ff0000;#00ff00;#0000ff', sliceLabels: 'A;B;C', alpha: 255 };
    case 'canvas':
      return { ...base, painterCb: '', privateData: '' };
    case '2dball':
      return { ...base, color: '#FFFFFF', bgColor: '#000000', radius: 20 };
    case 'sprite':
      return { ...base, pixmap: '', pixmapFormat: 'ARGB4444', alpha: 255 };
    case 'statusbar':
      return { ...base, bgColor: '#141414', bgAlpha: 128, radius: 0, leftMargin: 5, rightMargin: 5, slotSpace: 4, leftSlots: '', rightSlots: '', slotColor: '#ffffff', slotAlpha: 255, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'launcher':
      return { ...base, iconSize: 48, gridCol: 4, gridRow: 5, marginLeft: 20, marginTop: 40, marginRight: 20, marginBottom: 60, labelColor: '#e4e4e7', navigbarColor: '#F5DEB3', currentPage: 0, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'roller':
      return { ...base, options: '选项1\n选项2\n选项3', optionDynamic: false, visibleRows: 3, textColor: '#000000', selectedColor: '#808080', bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 1, radius: 0, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4 };
    case 'unzip_image':
      return { ...base, color: '#000000', align: 'CENTER', unzipImg: '' };
    case 'analogclock':
      return { ...base, hourPtrColor: '#ffffff', minPtrColor: '#FFFFFF', secPtrColor: '#FF0000', scaleColor: '#FFFFFF', textColor: '#FFFFFF', hubColor: '#FF0000', bgColor: '#000000', borderColor: '#FFFFFF', borderWidth: 0, hour: 0, minute: 0, second: 0, hourPtrWidth: 5, minPtrWidth: 5, secPtrWidth: 2, scaleWidth: 1, scaleLength: 8, hubRadius: 6, fontFamily: 'simsun.ttc', fontSize: 12, fontBpp: 4 };
    case 'ext_img':
      return { ...base, pixmap: '', pixmapNum: 1, pixmapIndex: 0, autoRefresh: false, readOps: '', pixmapNext: false, alpha: 255 };
    default:
      return { ...base, color: '#8b5cf6', bgColor: '#313149', borderColor: '#3d3d5c', borderWidth: 1, radius: 4 };
  }
}

// ============ 控件默认值（用于代码生成优化） ============
export const WIDGET_DEFAULTS = {
  rect: { color: '#FFFFFF', borderColor: '#000000', borderWidth: 2, borderAlpha: 255, radius: 0, mainAlpha: 255, pixmap: '', pixmapFormat: 'RGB565' },
  circle: { color: '#FFFFFF', borderColor: '#000000', borderWidth: 2, radius: 0, xOffset: 0, yOffset: 0, alpha: 255, pixmap: '', pixmapFormat: 'RGB565' },
  ring: { color: '#FFFFFF', radiusIn: -1, radiusOut: -1, alpha: 255 },
  arc: { color: '#000000', bgColor: '#FFFFFF', alpha: 255, mode: 0, radiusIn: -1, radiusOut: -1, startAngle: 0, endAngle: 360 },
  line: { color: '#000000', lineWidth: 1, x1: 0, y1: 0, x2: null, y2: null, dashed: false, dashLen: 0, gapLen: 0, alpha: 255 },
  polygon: { fillColor: '#7F7F7F', borderColor: '#000000', borderWidth: 1, alpha: 255, vertices: '40,5;70,30;60,75;20,75;10,30', text: '', textColor: '#000000', fontFamily: '', fontSize: 14, fontBpp: 4 },
  button: { text: '按钮', color: '#ffffff', textColor: '#000000', borderColor: '#000000', borderWidth: 2, radius: 0, align: 'CENTER', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, alpha: 255, pixmap: '', pixmapFormat: 'RGB565' },
  switch: { status: false, onColor: '#FFFFFF', bgColor: '#000000', knobColor: '#808080', borderColor: '#000000', borderWidth: 2, radius: 0, knobRadius: 255, knobMargin: 2, alpha: 255, pixmap: '', pixmapFormat: 'RGB565' },
  checkbox: { text: '选项', color: '#000000', status: false, radius: 0, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, alpha: 255 },
  slider: { value: 50, direct: 0, fillColor: '#8b5cf6', trackColor: '#313149', knobColor: '#ffffff', borderWidth: 2, radius: 4, thickness: 8, alpha: 255 },
  numberkbd: { cellColor: '#FFFFFF', borderColor: '#000000', borderWidth: 2, radius: 0, fontFamily: 'simsun.ttc', fontBpp: 4, btnColor: '#FFFFFF', textColor: '#000000', btnMargin: 1, btnBorderWidth: 1, btnBorderColor: '#000000', btnRadius: 0, btnPixmap: '', pixmap: '', alpha: 255 },
  keyboard: { cellColor: '#FFFFFF', borderColor: '#000000', borderWidth: 1, radius: 0, mainAlpha: 255, borderAlpha: 255, fontFamily: 'simsun.ttc', fontBpp: 4, btnColor: '#404040', textColor: '#000000', btnRadius: 0, btnAlpha: 255, btnMainAlpha: 255, btnBorderColor: '#000000', btnBorderWidth: 0, btnBorderAlpha: 255, btnPixmap: '', pixmap: '', textarea: '', alpha: 255 },
  label: { text: '标签文本', textColor: '#000000', bgColor: 'transparent', align: 'LEFT', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, textOffsetX: 0, textOffsetY: 0, textRotation: 0, radius: 0, textBuffer: '', textFmt: '', textFmtDynamic: '', alpha: 255 },
  textbox: { text: 'textbox', textColor: '#000000', bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 1, radius: 10, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, lineMargin: 1, pixmap: '', pixmapFormat: 'RGB565', alpha: 255 },
  textline: { text: 'textline', textColor: '#000000', bgColor: '#FFFFFF', bgTransparent: false, radius: 0, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, edgeMargin: 0, lineMargin: 1, alpha: 255 },
  textlist: { options: '选项1\n选项2\n选项3', bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 1, radius: 0, fontSize: 12, fontFamily: 'simsun.ttc', fontBpp: 4, textColor: '#000000', selectedColor: '#808080', pixmap: '', alpha: 255 },
  progress: { value: 50, fillColor: '#FFFFFF', trackColor: '#000000', borderColor: '#000000', borderWidth: 2, radius: 0, fillGap: 4, fillRadius: 0, fillWidth: 4, direct: 0, alpha: 255 },
  bar: { value: 50, barColor: '#000000', bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 2, radius: 0, barWidth: 20, barNum: 10, barMode: 0, barHatColor: '#808080', barHatHeight: 2, direct: 0, alpha: 255 },
  gauge: { value: 0, arcColor: '#FFFFFF', scaleColor: '#FFFFFF', pointerColor: '#FF0000', hubColor: '#FFFFFF', bgColor: '#000000', startAngle: 30, endAngle: 330, arcWidth: 2, scaleWidth: 1, scaleLength: 0, pointerWidth: 2, hubRadius: 0, scaleStart: 0, scaleStep: 10, scaleAngle: 15, textInterval: 3, scaleWarning: 32767, alpha: 255 },
  spectrum: { barColor: '#000000', barHatColor: '#808080', barNum: 0, barMode: 0, barHatHeight: 3, barValues: '', alpha: 255 },
  battery: { level: 100, fillColor: '#00FF00', lowColor: '#FF0000', mediumColor: '#FFA500', highColor: '#00FF00', bgColor: '#1E1E1E', borderColor: '#FFFFFF', numCells: 6, direction: 0, capSize: 4, capPos: 0, charging: false, chargingColor: '#FFFF00', showPercentage: false, textColor: '#000000', fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, alpha: 255 },
  icon: { color: '#8b5cf6', align: 'CENTER', icon: '', alpha: 255 },
  led: { onColor: '#FFFFFF', offColor: '#000000', bgColor: '#000000', radius: 0, status: false, alpha: 255 },
  msgbox: { titleText: 'Message Box', titleTextColor: '#000000', msgText: 'NULL', msgColor: '#000000', leftBtnText: 'YES', leftBtnColor: '#C8C8C8', leftBtnTextColor: '#000000', rightBtnText: 'NO', rightBtnColor: '#C8C8C8', rightBtnTextColor: '#000000', bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 2, radius: 0, titleHeight: 0, msgOffsetX: 0, msgOffsetY: 0, msgLineMargin: 1, mainAlpha: 255, borderAlpha: 255, pixmap: '', fontFamily: 'simsun.ttc', fontBpp: 4, exitAnswer: false, alpha: 255 },
  viewlist: { bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 1, radius: 0, itemHeight: 20, itemMarginX: 1, itemMarginY: 1, pixmap: '', alpha: 255 },
  dropdown: { options: '选项1\n选项2\n选项3', optionDynamic: false, textColor: '#000000', bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 1, radius: 0, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, selectedColor: '#808080', visibleRows: 5, alpha: 255 },
  scroll: { color: '#FFFFFF', borderColor: '#000000', borderWidth: 2, radius: 0, width: 10, value: 0, direct: 1, hidden: false, alpha: 255 },
  box: { bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 1, radius: 0, scrollbarColor: '#C8C8C8', showVScrollbar: true, showHScrollbar: true, elasticUp: 0, elasticDown: 0, elasticLeft: 0, elasticRight: 0, pixmap: '', alpha: 255 },
  win: { titleText: '窗口标题', titleBgColor: '#808080', titleTextColor: '#000000', closeBtnColor: '#FF5A50', bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 0, radius: 0, pixmap: '', pixmapFormat: 'RGB565', fontFamily: 'simsun.ttc', fontBpp: 4, titleHeight: 0, titleAlign: 'LEFT', alpha: 255 },
  qrcode: { cellColor: '#000000', bgColor: '#ffffff', cellRadius: 0, qrText: 'hello', scale: 4, zone: 1, version: 5, ecc: 0, logo: '', logoRadius: 0, alpha: 255 },
  scope: { channelCount: 1, channelBuffers: '', channelWaveformColors: '#00FF00', maxDisplayPoints: 0, rangeMin: 0, rangeMax: 65535, autoScale: true, showYLabels: true, yLabelColor: '#FFFFFF', lineWidth: 2, gridLine: 0, bgColor: '#000000', gridColor: '#323232', borderColor: '#969696', borderWidth: 0, alpha: 255, fontFamily: 'simsun.ttc', fontBpp: 4 },
  chart: { chartType: 'linechart', bgColor: '#000000', borderColor: '#000000', minValue: 0, maxValue: 100, autoScale: true, showYLabels: true, gridColor: '#3C3C3C', gridDashed: true, textColor: '#000000', fontSize: 12, fontFamily: 'simsun.ttc', fontBpp: 4, seriesCount: 0, seriesData: '', seriesColors: '#FFFFFF', xLabels: '', startAngle: 0, innerRadiusRate: 0, radius: 0, legendEnable: false, legendPos: 0, legendDir: 0, legendTextColor: '#e4e4e7', sliceCount: 3, sliceValues: '30;50;20', sliceColors: '#ff0000;#00ff00;#0000ff', sliceLabels: 'A;B;C', alpha: 255 },
  canvas: { painterCb: '', privateData: '', locked: false },
  '2dball': { color: '#FFFFFF', bgColor: '#000000', radius: 20, alpha: 255 },
  sprite: { pixmap: '', pixmapFormat: 'ARGB4444', alpha: 255 },
  statusbar: { bgColor: '#141414', bgAlpha: 128, radius: 0, leftMargin: 5, rightMargin: 5, slotSpace: 4, leftSlots: '', rightSlots: '', slotColor: '#ffffff', slotAlpha: 255, fontFamily: 'simsun.ttc', fontBpp: 4, alpha: 255 },
  launcher: { iconSize: 48, gridCol: 4, gridRow: 5, marginLeft: 20, marginTop: 40, marginRight: 20, marginBottom: 60, labelColor: '#e4e4e7', navigbarColor: '#F5DEB3', currentPage: 0, fontFamily: 'simsun.ttc', fontBpp: 4, alpha: 255 },
  roller: { options: '选项1\n选项2\n选项3', optionDynamic: false, visibleRows: 3, textColor: '#000000', selectedColor: '#808080', bgColor: '#FFFFFF', borderColor: '#000000', borderWidth: 1, radius: 0, fontSize: 14, fontFamily: 'simsun.ttc', fontBpp: 4, alpha: 255 },
  unzip_image: { color: '#000000', align: 'CENTER', unzipImg: '', alpha: 255 },
  analogclock: { hourPtrColor: '#ffffff', minPtrColor: '#FFFFFF', secPtrColor: '#FF0000', scaleColor: '#FFFFFF', textColor: '#FFFFFF', hubColor: '#FF0000', bgColor: '#000000', borderColor: '#FFFFFF', borderWidth: 0, hour: 0, minute: 0, second: 0, hourPtrWidth: 5, minPtrWidth: 5, secPtrWidth: 2, scaleWidth: 1, scaleLength: 8, hubRadius: 6, fontFamily: 'simsun.ttc', fontSize: 12, fontBpp: 4, alpha: 255 },
  ext_img: { pixmap: '', pixmapNum: 1, pixmapIndex: 0, autoRefresh: false, readOps: '', pixmapNext: false, alpha: 255 },
};

// 判断属性值是否需要生成代码（图片属性专用：只有非空才生成）
function shouldGeneratePixmap(value) {
  return value && value.length > 0;
}

// 根据图片路径和格式生成合法的 C 变量名（用于 sgl_pixmap_t* 引用）
function pixmapVarName(pixmapPath, format) {
  const base = pixmapPath.replace(/[/\\]/g, '/').split('/').pop().replace(/\.[^.]+$/, '');
  const sanitized = base.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
  return 'pixmap_' + sanitized + '_' + (format || 'RGB565');
}

function iconVarName(iconPath) {
  const base = iconPath.replace(/[/\\]/g, '/').split('/').pop().replace(/\.[^.]+$/, '');
  const sanitized = base.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
  return 'icon_' + sanitized;
}

function unzipImgVarName(imgPath) {
  const base = imgPath.replace(/[/\\]/g, '/').split('/').pop().replace(/\.[^.]+$/, '');
  const sanitized = base.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
  return 'unzip_img_' + sanitized;
}

// 判断属性值是否需要生成代码：只要属性有有效值就生成，不跳过默认值
function shouldGenerateValue(value, defaults, prop) {
  // undefined / null 不生成
  if (value === undefined || value === null) return false;
  // 空字符串不生成（避免 set_text("") 之类无意义调用）
  if (value === '') return false;
  return true;
}

function hasVisibleText(text) {
  if (!text) return false;
  return [...text].some(ch => {
    const code = ch.charCodeAt(0);
    return code === 32 || (code > 32 && code !== 127);
  });
}

// 获取控件实际用于显示文本的属性（用于判断是否需要字体）
function getWidgetTextForFont(w) {
  // dropdown/roller/textlist 使用 options 作为显示文本
  if (w.type === 'dropdown' || w.type === 'roller' || w.type === 'textlist') {
    return w.options;
  }
  return w.text;
}

function shouldGenerateFont(w, defaults) {
  const textSource = getWidgetTextForFont(w);
  return shouldGenerateValue(w.fontFamily, defaults, 'fontFamily') && w.fontFamily &&
         shouldGenerateValue(w.fontSize, defaults, 'fontSize') && w.fontSize != null &&
         (textSource === undefined || hasVisibleText(textSource));
}

// 生成 alpha 组 API：先设置整体 alpha，再单独设置与整体不同的 main/border alpha
function emitAlphaGroup(setters, objId, prefix, alpha, mainAlpha, borderAlpha) {
  if (alpha !== undefined && alpha !== null) {
    setters.push(`${prefix}_set_alpha(${objId}, ${alpha});`);
  }
  if (mainAlpha !== undefined && mainAlpha !== null && mainAlpha !== alpha) {
    setters.push(`${prefix}_set_main_alpha(${objId}, ${mainAlpha});`);
  }
  if (borderAlpha !== undefined && borderAlpha !== null && borderAlpha !== alpha) {
    setters.push(`${prefix}_set_border_alpha(${objId}, ${borderAlpha});`);
  }
}

// ============ SGL 代码生成器 ============
export function generateSGLCode(project) {
  const fonts = collectFonts(project);
  const fontIssues = validateProjectFonts(project);

  let code = `/* ============================================\n`;
  code += ` * SGL UI Designer - Auto Generated Code\n`;
  code += ` * Project: ${project.name}\n`;
  code += ` * Screen: ${project.screen_width}x${project.screen_height}\n`;
  code += ` * Color Depth: ${project.color_depth}\n`;
  code += ` * Generated: ${new Date().toLocaleString()}\n`;
  code += ` * ============================================ */\n\n`;

  if (fontIssues.length > 0) {
    code += `/* [警告] 以下文本控件缺少字体资源，请在项目资源中添加字体文件后再编译运行：\n`;
    fontIssues.forEach(item => {
      code += ` *   - ${item.page} / ${item.widget}: ${item.reason} (${item.fontFamily || '无'})\n`;
    });
    code += ` */\n\n`;
  }

  code += `#include "sgl.h"\n`;

  if (fonts.length > 0) {
    code += `\n/* ============================================\n`;
    code += ` * 字体字模声明（由 sgl_font_conv.exe 生成对应 C 文件）\n`;
    code += ` * 在导出目录下运行以下命令生成字体字模：\n`;
    fonts.forEach(f => {
      const fontId = getFontId(f.family, f.size, f.bpp);
      // 如果有完整路径则使用路径，否则使用文件名
      const fontPath = f.path || f.family;
      code += ` *   sgl_font_conv.exe --font ${fontPath} --size ${f.size} --bpp ${f.bpp} --output fonts/${fontId}.c\n`;
    });
    code += ` * ============================================ */\n`;
    fonts.forEach(f => {
      const fontId = getFontId(f.family, f.size, f.bpp);
      code += `extern const sgl_font_t ${fontId};\n`;
    });
  }

  code += `\n`;

  // 生成图片取模 include，与导出代码保持一致
  const pixmapIncludes = new Set();
  project.pages.forEach(page => {
    if (shouldGeneratePixmap(page.pixmap)) {
      pixmapIncludes.add(`#include "pixmaps/${pixmapVarName(page.pixmap, page.pixmapFormat)}.c"`);
    }
    if (Array.isArray(page.widgets)) {
      page.widgets.forEach(w => {
        if (shouldGeneratePixmap(w.pixmap)) {
          pixmapIncludes.add(`#include "pixmaps/${pixmapVarName(w.pixmap, w.pixmapFormat)}.c"`);
        }
      });
    }
  });
  if (pixmapIncludes.size > 0) {
    code += `/* ============================================\n`;
    code += ` * 图片取模数据\n`;
    code += ` * ============================================ */\n`;
    pixmapIncludes.forEach(inc => { code += inc + '\n'; });
    code += '\n';
  }

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
    code += `void ui_page_${pageId}_create(void)\n{\n`;
    code += `    sgl_obj_t *page_${pageId} = sgl_screen_act();\n`;
    // 页面背景：优先使用图片，否则使用颜色
    if (shouldGeneratePixmap(page.pixmap)) {
      code += `    sgl_page_set_pixmap(page_${pageId}, &${pixmapVarName(page.pixmap, page.pixmapFormat)});\n`;
    } else if (page.bg_color) {
      code += `    sgl_page_set_color(page_${pageId}, ${hexToSglColor(page.bg_color)});\n`;
    }
    if (page.alpha != null && page.alpha < 255) {
      code += `    sgl_page_set_alpha(page_${pageId}, ${page.alpha});\n`;
    }
    code += `\n`;

    // 按层级排序：父控件先创建，子控件后创建
    const sortedWidgets = sortWidgetsByHierarchy(page.widgets);

    sortedWidgets.forEach(w => {
      const objId = getWidgetVarName(w);
      let createFn = getSglCreateFn(w.type);
      if (w.type === 'chart') {
        createFn = w.chartType === 'barchart' ? 'sgl_barchart_create' : (w.chartType === 'piechart' ? 'sgl_piechart_create' : 'sgl_linechart_create');
      }
      // 父对象：如果有 parentId 则使用父控件对象，否则使用页面对象
      const parentWidget = w.parentId ? page.widgets.find(p => p.id === w.parentId) : null;
      const parentObjId = parentWidget ? getWidgetVarName(parentWidget) : `page_${pageId}`;
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

      // 事件回调绑定：如果有事件，绑定包装函数（包装函数名仍基于唯一 id，避免重名）
      const widgetEvents = (w.events || []).filter(e => e.callback && e.callback.trim());
      if (widgetEvents.length > 0) {
        const wrapperName = `_${sanitizeId(w.id)}_event_handler`;
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
    code += `    ui_page_${pageId}_create();\n`;
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
        // 有实际显示文本的控件，只有包含可显示字符时才使用字体
        const textSource = getWidgetTextForFont(w);
        if (textSource !== undefined && !hasVisibleText(textSource)) return;
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

// ============ 字体缺失校验 ============
// 检查所有需要显示文本的控件是否已添加对应的字体资源
export function validateProjectFonts(project) {
  const issues = [];
  if (!project || !Array.isArray(project.pages)) return issues;

  const typeMap = new Map(SGL_WIDGET_TYPES.map(t => [t.type, t]));
  const resourceFontPaths = new Set((project.resources?.fonts || []).map(f => f.path));
  const resourceFontNames = new Set((project.resources?.fonts || []).map(f => f.name));

  project.pages.forEach(page => {
    if (!Array.isArray(page.widgets)) return;
    page.widgets.forEach(w => {
      const typeDef = typeMap.get(w.type);
      if (!typeDef || !Array.isArray(typeDef.properties)) return;
      // 只有具备 fontFamily 属性的控件才需要校验字体
      if (!typeDef.properties.includes('fontFamily')) return;
      // polygon 没有文本时不需要字体
      if (w.type === 'polygon' && !w.text) return;

      const family = w.fontFamily;
      if (!family || family === 'default') {
        issues.push({
          page: page.name || '未命名页面',
          widget: `${typeDef.name || w.type} (${w.id})`,
          type: w.type,
          fontFamily: family || '',
          reason: '未设置字体文件'
        });
        return;
      }

      // 检查字体文件是否已添加到项目资源
      const fileName = family.replace(/[/\\]/g, '/').split('/').pop();
      if (!resourceFontPaths.has(family) && !resourceFontNames.has(fileName)) {
        issues.push({
          page: page.name || '未命名页面',
          widget: `${typeDef.name || w.type} (${w.id})`,
          type: w.type,
          fontFamily: family,
          reason: '字体文件未添加到项目资源'
        });
      }
    });
  });

  return issues;
}

function getFontId(family, size, bpp) {
  // 与 collectFonts / 后端 font_filename 保持一致：使用文件名作为字体标识
  const familyName = family.replace(/[/\\]/g, '/').split('/').pop();
  const cleanFamily = familyName.replace(/[^\w]/g, '_');
  return `sgl_font_${cleanFamily}_${size}_bpp${bpp}`;
}

function sanitizeId(id) {
  return id.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
}

function getWidgetVarName(w) {
  const n = w && w.name;
  if (n && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n)) return n;
  return sanitizeId(w.id);
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
    'statusbar': 'sgl_statusbar_create',
    'launcher': 'sgl_launcher_create',
    'analogclock': 'sgl_analogclock_create',
    'ext_img': 'sgl_ext_img_create',
    'roller': 'sgl_roller_create',
    'unzip_image': 'sgl_unzip_img_create'
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
        setters.push(`sgl_rect_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat)});`);
      } else if (shouldGenerateValue(w.color, defaults, 'color')) {
        setters.push(`sgl_rect_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      }
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_rect_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_rect_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_rect_set_radius(${obj(w)}, ${w.radius});`);
      emitAlphaGroup(setters, obj(w), 'sgl_rect', w.alpha, w.mainAlpha, w.borderAlpha);
      break;

    case 'circle':
      // 颜色或图片二选一
      if (shouldGeneratePixmap(w.pixmap)) {
        setters.push(`sgl_circle_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat)});`);
      } else if (shouldGenerateValue(w.color, defaults, 'color')) {
        setters.push(`sgl_circle_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      }
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_circle_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_circle_set_border_width(${obj(w)}, ${w.borderWidth});`);
      // SGL 的 sgl_circle_set_radius 会改变控件尺寸，而设计器中 circle 大小由 width/height 决定，因此不生成该 setter
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
            return `{${x}, ${y}}`;
          }).join(', ');
          setters.push(`sgl_polygon_set_vertex_array(${obj(w)}, (int16_t[][2]){${coordPairs}}, ${coords.length});`);
        }
      }
      if (shouldGenerateValue(w.text, defaults, 'text')) {
        setters.push(`sgl_polygon_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
        if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_polygon_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
        if (shouldGenerateFont(w, defaults)) {
          const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
          setters.push(`sgl_polygon_set_font(${obj(w)}, &${fontId});`);
        }
      }
      break;

    case 'button':
      if (shouldGenerateValue(w.text, defaults, 'text')) setters.push(`sgl_button_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (shouldGenerateValue(w.color, defaults, 'color')) setters.push(`sgl_button_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_button_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_button_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_button_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_button_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.align, defaults, 'align')) setters.push(`sgl_button_set_text_align(${obj(w)}, SGL_ALIGN_${w.align});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_button_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_button_set_alpha(${obj(w)}, ${w.alpha});`);
      if (shouldGeneratePixmap(w.pixmap)) setters.push(`sgl_button_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat)});`);
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
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_label_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_label_set_alpha(${obj(w)}, ${w.alpha});`);
      if (shouldGenerateValue(w.textBuffer, defaults, 'textBuffer') && w.textBuffer) {
        const [bufName, bufSize] = w.textBuffer.split(',').map(s => s.trim());
        if (bufName && bufSize) setters.push(`sgl_label_set_text_buffer(${obj(w)}, ${bufName}, ${bufSize});`);
      }
      if (shouldGenerateValue(w.textFmt, defaults, 'textFmt') && w.textFmt) setters.push(`sgl_label_set_text_fmt(${obj(w)}, "${escapeStr(w.textFmt)}");`);
      if (shouldGenerateValue(w.textFmtDynamic, defaults, 'textFmtDynamic') && w.textFmtDynamic) setters.push(`sgl_label_set_text_fmt_dynamic(${obj(w)}, "${escapeStr(w.textFmtDynamic)}");`);
      break;

    case 'textbox':
      if (shouldGenerateValue(w.text, defaults, 'text')) setters.push(`sgl_textbox_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_textbox_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_textbox_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_textbox_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_textbox_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_textbox_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.lineMargin, defaults, 'lineMargin')) setters.push(`sgl_textbox_set_line_margin(${obj(w)}, ${w.lineMargin});`);
      if (shouldGeneratePixmap(w.pixmap)) setters.push(`sgl_textbox_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat)});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_textbox_set_text_font(${obj(w)}, &${fontId});`);
      }
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
      if (shouldGeneratePixmap(w.pixmap)) setters.push(`sgl_switch_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat)});`);
      break;

    case 'checkbox': {
      const cbColor = w.color || w.onColor || w.textColor;
      if (shouldGenerateValue(w.status, defaults, 'status')) setters.push(`sgl_checkbox_set_status(${obj(w)}, ${w.status ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.text, defaults, 'text')) setters.push(`sgl_checkbox_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (shouldGenerateValue(cbColor, defaults, 'color') && cbColor) setters.push(`sgl_checkbox_set_color(${obj(w)}, ${hexToSglColor(cbColor)});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_checkbox_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_checkbox_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_checkbox_set_alpha(${obj(w)}, ${w.alpha});`);
      break;
    }

    case 'slider':
      if (shouldGenerateValue(w.value, defaults, 'value')) setters.push(`sgl_slider_set_value(${obj(w)}, ${w.value || 0});`);
      if (shouldGenerateValue(w.direct, defaults, 'direct')) setters.push(`sgl_slider_set_direct(${obj(w)}, ${w.direct});`);
      if (shouldGenerateValue(w.fillColor, defaults, 'fillColor')) setters.push(`sgl_slider_set_fill_color(${obj(w)}, ${hexToSglColor(w.fillColor)});`);
      if (shouldGenerateValue(w.trackColor, defaults, 'trackColor')) setters.push(`sgl_slider_set_track_color(${obj(w)}, ${hexToSglColor(w.trackColor)});`);
      if (shouldGenerateValue(w.knobColor, defaults, 'knobColor')) setters.push(`sgl_slider_set_knob_color(${obj(w)}, ${hexToSglColor(w.knobColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_slider_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_slider_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.thickness, defaults, 'thickness')) setters.push(`sgl_slider_set_thickness(${obj(w)}, ${w.thickness});`);
      break;

    case 'progress':
      if (shouldGenerateValue(w.value, defaults, 'value')) setters.push(`sgl_progress_set_value(${obj(w)}, ${w.value || 0});`);
      if (shouldGenerateValue(w.fillColor, defaults, 'fillColor')) setters.push(`sgl_progress_set_fill_color(${obj(w)}, ${hexToSglColor(w.fillColor)});`);
      if (shouldGenerateValue(w.trackColor, defaults, 'trackColor')) setters.push(`sgl_progress_set_track_color(${obj(w)}, ${hexToSglColor(w.trackColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_progress_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_progress_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_progress_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.fillGap, defaults, 'fillGap')) setters.push(`sgl_progress_set_fill_gap(${obj(w)}, ${w.fillGap});`);
      if (shouldGenerateValue(w.fillRadius, defaults, 'fillRadius')) setters.push(`sgl_progress_set_fill_radius(${obj(w)}, ${w.fillRadius});`);
      if (shouldGenerateValue(w.fillWidth, defaults, 'fillWidth')) setters.push(`sgl_progress_set_fill_width(${obj(w)}, ${w.fillWidth});`);
      if (shouldGenerateValue(w.trackAlpha, defaults, 'trackAlpha')) setters.push(`sgl_progress_set_track_alpha(${obj(w)}, ${w.trackAlpha});`);
      if (shouldGenerateValue(w.fillAlpha, defaults, 'fillAlpha')) setters.push(`sgl_progress_set_fill_alpha(${obj(w)}, ${w.fillAlpha});`);
      if (shouldGeneratePixmap(w.pixmap)) setters.push(`sgl_progress_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat)});`);
      break;

    case 'bar':
      if (shouldGenerateValue(w.value, defaults, 'value')) setters.push(`sgl_bar_set_value(${obj(w)}, ${w.value || 50});`);
      if (shouldGenerateValue(w.direct, defaults, 'direct')) setters.push(`sgl_bar_set_direct(${obj(w)}, ${w.direct});`);
      if (shouldGenerateValue(w.barColor, defaults, 'barColor')) setters.push(`sgl_bar_set_fill_color(${obj(w)}, ${hexToSglColor(w.barColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_bar_set_track_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_bar_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_bar_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_bar_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_bar_set_alpha(${obj(w)}, ${w.alpha});`);
      if (shouldGeneratePixmap(w.pixmap)) setters.push(`sgl_bar_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat)});`);
      break;

    case 'gauge':
      if (shouldGenerateValue(w.value, defaults, 'value')) setters.push(`sgl_gauge_set_value(${obj(w)}, ${w.value || 50});`);
      if (shouldGenerateValue(w.arcColor, defaults, 'arcColor')) setters.push(`sgl_gauge_set_arc_color(${obj(w)}, ${hexToSglColor(w.arcColor)});`);
      if (shouldGenerateValue(w.scaleColor, defaults, 'scaleColor')) setters.push(`sgl_gauge_set_scale_color(${obj(w)}, ${hexToSglColor(w.scaleColor)});`);
      if (shouldGenerateValue(w.pointerColor, defaults, 'pointerColor')) setters.push(`sgl_gauge_set_pointer_color(${obj(w)}, ${hexToSglColor(w.pointerColor)});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_gauge_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.hubColor, defaults, 'hubColor')) setters.push(`sgl_gauge_set_hub_color(${obj(w)}, ${hexToSglColor(w.hubColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_gauge_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.startAngle, defaults, 'startAngle') || shouldGenerateValue(w.endAngle, defaults, 'endAngle')) setters.push(`sgl_gauge_set_angle_range(${obj(w)}, ${w.startAngle || 0}, ${w.endAngle || 360});`);
      if (shouldGenerateValue(w.arcWidth, defaults, 'arcWidth')) setters.push(`sgl_gauge_set_arc_width(${obj(w)}, ${w.arcWidth});`);
      if (shouldGenerateValue(w.scaleWidth, defaults, 'scaleWidth')) setters.push(`sgl_gauge_set_scale_width(${obj(w)}, ${w.scaleWidth});`);
      if (shouldGenerateValue(w.scaleLength, defaults, 'scaleLength')) setters.push(`sgl_gauge_set_scale_length(${obj(w)}, ${w.scaleLength});`);
      if (shouldGenerateValue(w.pointerWidth, defaults, 'pointerWidth')) setters.push(`sgl_gauge_set_pointer_width(${obj(w)}, ${w.pointerWidth});`);
      if (shouldGenerateValue(w.hubRadius, defaults, 'hubRadius')) setters.push(`sgl_gauge_set_hub_radius(${obj(w)}, ${w.hubRadius});`);
      if (shouldGenerateValue(w.scaleStart, defaults, 'scaleStart')) setters.push(`sgl_gauge_set_scale_start_value(${obj(w)}, ${w.scaleStart});`);
      if (shouldGenerateValue(w.scaleStep, defaults, 'scaleStep')) setters.push(`sgl_gauge_set_scale_step_value(${obj(w)}, ${w.scaleStep});`);
      if (shouldGenerateValue(w.scaleAngle, defaults, 'scaleAngle')) setters.push(`sgl_gauge_set_scale_angle(${obj(w)}, ${w.scaleAngle});`);
      if (shouldGenerateValue(w.textInterval, defaults, 'textInterval')) setters.push(`sgl_gauge_set_text_interval(${obj(w)}, ${w.textInterval});`);
      if (shouldGenerateValue(w.scaleWarning, defaults, 'scaleWarning')) setters.push(`sgl_gauge_set_scale_warning_value(${obj(w)}, ${w.scaleWarning});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_gauge_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_gauge_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'spectrum':
      if (shouldGenerateValue(w.barColor, defaults, 'barColor')) setters.push(`sgl_spectrum_set_bar_color(${obj(w)}, ${hexToSglColor(w.barColor)});`);
      if (shouldGenerateValue(w.barHatColor, defaults, 'barHatColor')) setters.push(`sgl_spectrum_set_bar_hat_color(${obj(w)}, ${hexToSglColor(w.barHatColor)});`);
      if (shouldGenerateValue(w.barNum, defaults, 'barNum')) setters.push(`sgl_spectrum_set_bar_number(${obj(w)}, ${w.barNum});`);
      if (shouldGenerateValue(w.barMode, defaults, 'barMode')) setters.push(`sgl_spectrum_set_bar_mode(${obj(w)}, ${w.barMode});`);
      if (shouldGenerateValue(w.barHatHeight, defaults, 'barHatHeight')) setters.push(`sgl_spectrum_set_bar_hat_height(${obj(w)}, ${w.barHatHeight});`);
      if (shouldGenerateValue(w.barValues, defaults, 'barValues') && w.barValues) {
        w.barValues.split(';').map(s => s.trim()).filter(s => s).forEach((val, idx) => {
          setters.push(`sgl_spectrum_set_bar_value(${obj(w)}, ${idx}, ${val});`);
        });
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_spectrum_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'battery':
      {
        const levelVal = w.level != null ? w.level : (w.value != null ? w.value : 80);
        if (shouldGenerateValue(levelVal, defaults, 'level')) setters.push(`sgl_battery_set_level(${obj(w)}, ${levelVal});`);
      }
      if (shouldGenerateValue(w.fillColor, defaults, 'fillColor')) setters.push(`sgl_battery_set_fill_color(${obj(w)}, ${hexToSglColor(w.fillColor)});`);
      if (shouldGenerateValue(w.lowColor, defaults, 'lowColor')) setters.push(`sgl_battery_set_low_color(${obj(w)}, ${hexToSglColor(w.lowColor)});`);
      if (shouldGenerateValue(w.mediumColor, defaults, 'mediumColor')) setters.push(`sgl_battery_set_medium_color(${obj(w)}, ${hexToSglColor(w.mediumColor)});`);
      if (shouldGenerateValue(w.highColor, defaults, 'highColor')) setters.push(`sgl_battery_set_high_color(${obj(w)}, ${hexToSglColor(w.highColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_battery_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_battery_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.numCells, defaults, 'numCells')) setters.push(`sgl_battery_set_num_cells(${obj(w)}, ${w.numCells});`);
      if (shouldGenerateValue(w.direction, defaults, 'direction')) setters.push(`sgl_battery_set_direction(${obj(w)}, ${w.direction});`);
      if (shouldGenerateValue(w.capSize, defaults, 'capSize')) setters.push(`sgl_battery_set_cap_size(${obj(w)}, ${w.capSize});`);
      if (shouldGenerateValue(w.capPos, defaults, 'capPos')) setters.push(`sgl_battery_set_cap_pos(${obj(w)}, ${w.capPos});`);
      if (shouldGenerateValue(w.charging, defaults, 'charging')) setters.push(`sgl_battery_set_charging(${obj(w)}, ${w.charging ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.chargingColor, defaults, 'chargingColor')) setters.push(`sgl_battery_set_charging_color(${obj(w)}, ${hexToSglColor(w.chargingColor)});`);
      if (shouldGenerateValue(w.showPercentage, defaults, 'showPercentage')) setters.push(`sgl_battery_show_percentage(${obj(w)}, ${w.showPercentage ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_battery_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_battery_set_font(${obj(w)}, &${fontId});`);
      }
      break;

    case 'led':
      if (shouldGenerateValue(w.status, defaults, 'status')) setters.push(`sgl_led_set_status(${obj(w)}, ${w.status ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.onColor, defaults, 'onColor')) setters.push(`sgl_led_set_on_color(${obj(w)}, ${hexToSglColor(w.onColor)});`);
      if (shouldGenerateValue(w.offColor, defaults, 'offColor')) setters.push(`sgl_led_set_off_color(${obj(w)}, ${hexToSglColor(w.offColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_led_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_led_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_led_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'msgbox':
      if (shouldGenerateValue(w.titleText, defaults, 'titleText')) setters.push(`sgl_msgbox_set_title_text(${obj(w)}, "${escapeStr(w.titleText)}");`);
      if (shouldGenerateValue(w.titleTextColor, defaults, 'titleTextColor')) setters.push(`sgl_msgbox_set_title_text_color(${obj(w)}, ${hexToSglColor(w.titleTextColor)});`);
      if (shouldGenerateValue(w.msgText, defaults, 'msgText')) setters.push(`sgl_msgbox_set_msg_text(${obj(w)}, "${escapeStr(w.msgText)}");`);
      if (shouldGenerateValue(w.msgColor, defaults, 'msgColor')) setters.push(`sgl_msgbox_set_msg_text_color(${obj(w)}, ${hexToSglColor(w.msgColor)});`);
      if (shouldGenerateValue(w.leftBtnText, defaults, 'leftBtnText')) setters.push(`sgl_msgbox_set_left_btn_text(${obj(w)}, "${escapeStr(w.leftBtnText)}");`);
      if (shouldGenerateValue(w.leftBtnColor, defaults, 'leftBtnColor')) setters.push(`sgl_msgbox_set_left_btn_color(${obj(w)}, ${hexToSglColor(w.leftBtnColor)});`);
      if (shouldGenerateValue(w.leftBtnTextColor, defaults, 'leftBtnTextColor')) setters.push(`sgl_msgbox_set_left_btn_text_color(${obj(w)}, ${hexToSglColor(w.leftBtnTextColor)});`);
      if (shouldGenerateValue(w.rightBtnText, defaults, 'rightBtnText')) setters.push(`sgl_msgbox_set_right_btn_text(${obj(w)}, "${escapeStr(w.rightBtnText)}");`);
      if (shouldGenerateValue(w.rightBtnColor, defaults, 'rightBtnColor')) setters.push(`sgl_msgbox_set_right_btn_color(${obj(w)}, ${hexToSglColor(w.rightBtnColor)});`);
      if (shouldGenerateValue(w.rightBtnTextColor, defaults, 'rightBtnTextColor')) setters.push(`sgl_msgbox_set_right_btn_text_color(${obj(w)}, ${hexToSglColor(w.rightBtnTextColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_msgbox_set_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_msgbox_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_msgbox_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_msgbox_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.titleHeight, defaults, 'titleHeight')) setters.push(`sgl_msgbox_set_title_height(${obj(w)}, ${w.titleHeight});`);
      if (shouldGenerateValue(w.msgOffsetX, defaults, 'msgOffsetX')) setters.push(`sgl_msgbox_set_msg_x_offset(${obj(w)}, ${w.msgOffsetX});`);
      if (shouldGenerateValue(w.msgOffsetY, defaults, 'msgOffsetY')) setters.push(`sgl_msgbox_set_msg_y_offset(${obj(w)}, ${w.msgOffsetY});`);
      if (shouldGenerateValue(w.msgLineMargin, defaults, 'msgLineMargin')) setters.push(`sgl_msgbox_set_msg_line_margin(${obj(w)}, ${w.msgLineMargin});`);
      emitAlphaGroup(setters, obj(w), 'sgl_msgbox', w.alpha, w.mainAlpha, w.borderAlpha);
      if (shouldGeneratePixmap(w.pixmap)) setters.push(`sgl_msgbox_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat)});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_msgbox_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_msgbox_set_alpha(${obj(w)}, ${w.alpha});`);
      if (shouldGenerateValue(w.exitAnswer, defaults, 'exitAnswer') && w.exitAnswer) {
        setters.push(`static const char *${obj(w)}_answer = NULL; sgl_msgbox_set_exit_answer(${obj(w)}, &${obj(w)}_answer);`);
      }
      break;

    case 'win':
      if (shouldGenerateValue(w.titleText, defaults, 'titleText')) setters.push(`sgl_win_set_title_text(${obj(w)}, "${escapeStr(w.titleText)}");`);
      if (shouldGenerateValue(w.titleBgColor, defaults, 'titleBgColor')) setters.push(`sgl_win_set_title_bg_color(${obj(w)}, ${hexToSglColor(w.titleBgColor)});`);
      if (shouldGenerateValue(w.titleTextColor, defaults, 'titleTextColor')) setters.push(`sgl_win_set_title_text_color(${obj(w)}, ${hexToSglColor(w.titleTextColor)});`);
      if (shouldGenerateValue(w.closeBtnColor, defaults, 'closeBtnColor')) setters.push(`sgl_win_set_close_btn_color(${obj(w)}, ${hexToSglColor(w.closeBtnColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_win_set_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_win_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_win_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_win_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.titleHeight, defaults, 'titleHeight')) setters.push(`sgl_win_set_title_height(${obj(w)}, ${w.titleHeight});`);
      if (shouldGenerateValue(w.titleAlign, defaults, 'titleAlign')) setters.push(`sgl_win_set_title_text_align(${obj(w)}, SGL_ALIGN_${w.titleAlign});`);
      if (shouldGeneratePixmap(w.pixmap)) setters.push(`sgl_win_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat)});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_win_set_title_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_win_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'dropdown':
      if (shouldGenerateValue(w.options, defaults, 'options')) {
        if (w.optionDynamic) {
          setters.push(`sgl_dropdown_set_option_dynamic(${obj(w)}, "${escapeStr(w.options)}");`);
        } else {
          setters.push(`sgl_dropdown_set_option_static(${obj(w)}, "${escapeStr(w.options)}");`);
        }
      }
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_dropdown_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_dropdown_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_dropdown_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_dropdown_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_dropdown_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.selectedColor, defaults, 'selectedColor')) setters.push(`sgl_dropdown_set_selected_color(${obj(w)}, ${hexToSglColor(w.selectedColor)});`);
      if (shouldGenerateValue(w.visibleRows, defaults, 'visibleRows')) setters.push(`sgl_dropdown_set_visible_rows(${obj(w)}, ${w.visibleRows});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_dropdown_set_text_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_dropdown_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'numberkbd':
      if (shouldGenerateValue(w.cellColor, defaults, 'cellColor')) setters.push(`sgl_numberkbd_set_color(${obj(w)}, ${hexToSglColor(w.cellColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_numberkbd_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_numberkbd_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_numberkbd_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.btnColor, defaults, 'btnColor')) setters.push(`sgl_numberkbd_set_btn_color(${obj(w)}, ${hexToSglColor(w.btnColor)});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_numberkbd_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.btnMargin, defaults, 'btnMargin')) setters.push(`sgl_numberkbd_set_btn_margin(${obj(w)}, ${w.btnMargin});`);
      if (shouldGenerateValue(w.btnBorderWidth, defaults, 'btnBorderWidth')) setters.push(`sgl_numberkbd_set_btn_border_width(${obj(w)}, ${w.btnBorderWidth});`);
      if (shouldGenerateValue(w.btnBorderColor, defaults, 'btnBorderColor')) setters.push(`sgl_numberkbd_set_btn_border_color(${obj(w)}, ${hexToSglColor(w.btnBorderColor)});`);
      if (shouldGenerateValue(w.btnRadius, defaults, 'btnRadius')) setters.push(`sgl_numberkbd_set_btn_radius(${obj(w)}, ${w.btnRadius});`);
      if (shouldGeneratePixmap(w.btnPixmap)) setters.push(`sgl_numberkbd_set_btn_pixmap(${obj(w)}, &${pixmapVarName(w.btnPixmap, w.pixmapFormat || 'RGB565')});`);
      if (shouldGeneratePixmap(w.pixmap)) setters.push(`sgl_numberkbd_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat || 'RGB565')});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_numberkbd_set_text_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_numberkbd_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'keyboard':
      if (shouldGenerateValue(w.cellColor, defaults, 'cellColor')) setters.push(`sgl_keyboard_set_color(${obj(w)}, ${hexToSglColor(w.cellColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_keyboard_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_keyboard_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_keyboard_set_radius(${obj(w)}, ${w.radius});`);
      emitAlphaGroup(setters, obj(w), 'sgl_keyboard', w.alpha, w.mainAlpha, w.borderAlpha);
      if (shouldGenerateValue(w.btnColor, defaults, 'btnColor')) setters.push(`sgl_keyboard_set_btn_color(${obj(w)}, ${hexToSglColor(w.btnColor)});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_keyboard_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.btnRadius, defaults, 'btnRadius')) setters.push(`sgl_keyboard_set_btn_radius(${obj(w)}, ${w.btnRadius});`);
      emitAlphaGroup(setters, obj(w), 'sgl_keyboard_btn', w.btnAlpha, w.btnMainAlpha, w.btnBorderAlpha);
      if (shouldGenerateValue(w.btnBorderColor, defaults, 'btnBorderColor')) setters.push(`sgl_keyboard_set_btn_border_color(${obj(w)}, ${hexToSglColor(w.btnBorderColor)});`);
      if (shouldGenerateValue(w.btnBorderWidth, defaults, 'btnBorderWidth')) setters.push(`sgl_keyboard_set_btn_border_width(${obj(w)}, ${w.btnBorderWidth});`);
      if (shouldGeneratePixmap(w.btnPixmap)) setters.push(`sgl_keyboard_set_btn_pixmap(${obj(w)}, &${pixmapVarName(w.btnPixmap, w.pixmapFormat || 'RGB565')});`);
      if (shouldGeneratePixmap(w.pixmap)) setters.push(`sgl_keyboard_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat || 'RGB565')});`);
      if (shouldGenerateValue(w.textarea, defaults, 'textarea') && w.textarea) setters.push(`sgl_keyboard_set_textarea(${obj(w)}, ${w.textarea}, sizeof(${w.textarea}));`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_keyboard_set_text_font(${obj(w)}, &${fontId});`);
      }
      break;

    case 'textline':
      if (shouldGenerateValue(w.text, defaults, 'text')) setters.push(`sgl_textline_set_text(${obj(w)}, "${escapeStr(w.text)}");`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_textline_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor') && !w.bgTransparent) setters.push(`sgl_textline_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_textline_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.edgeMargin, defaults, 'edgeMargin')) setters.push(`sgl_textline_set_edge_margin(${obj(w)}, ${w.edgeMargin});`);
      if (shouldGenerateValue(w.lineMargin, defaults, 'lineMargin')) setters.push(`sgl_textline_set_line_margin(${obj(w)}, ${w.lineMargin});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_textline_set_text_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_textline_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'textlist':
      if (shouldGenerateValue(w.options, defaults, 'options') && w.options) {
        w.options.split('\n').map(t => t.trim()).filter(t => t).forEach(item => {
          setters.push(`sgl_textlist_add_item(${obj(w)}, "${escapeStr(item)}");`);
        });
      }
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_textlist_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_textlist_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_textlist_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_textlist_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_textlist_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.selectedColor, defaults, 'selectedColor')) setters.push(`sgl_textlist_set_selected_color(${obj(w)}, ${hexToSglColor(w.selectedColor)});`);
      if (shouldGeneratePixmap(w.pixmap)) setters.push(`sgl_textlist_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat)});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_textlist_set_text_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_textlist_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'viewlist':
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_viewlist_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_viewlist_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_viewlist_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_viewlist_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.itemHeight, defaults, 'itemHeight')) setters.push(`sgl_viewlist_set_item_height(${obj(w)}, ${w.itemHeight});`);
      if (shouldGenerateValue(w.itemMarginX, defaults, 'itemMarginX') || shouldGenerateValue(w.itemMarginY, defaults, 'itemMarginY')) {
        setters.push(`sgl_viewlist_set_item_margin(${obj(w)}, ${w.itemMarginX || 0}, ${w.itemMarginY || 0});`);
      }
      if (shouldGeneratePixmap(w.pixmap)) setters.push(`sgl_viewlist_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat)});`);
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
      if (shouldGenerateValue(w.color, defaults, 'color')) setters.push(`sgl_scroll_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_scroll_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_scroll_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_scroll_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.width, defaults, 'width')) setters.push(`sgl_scroll_set_width(${obj(w)}, ${w.width});`);
      if (shouldGenerateValue(w.direct, defaults, 'direct')) setters.push(`sgl_scroll_set_direct(${obj(w)}, ${w.direct});`);
      if (shouldGenerateValue(w.value, defaults, 'value')) setters.push(`sgl_scroll_set_value(${obj(w)}, ${w.value});`);
      if (shouldGenerateValue(w.hidden, defaults, 'hidden')) setters.push(`sgl_scroll_set_hidden(${obj(w)}, ${w.hidden ? 1 : 0});`);
      if (shouldGenerateValue(w.bindTarget, defaults, 'bindTarget') && w.bindTarget) setters.push(`sgl_scroll_bind_obj(${obj(w)}, ${w.bindTarget});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_scroll_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'box':
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_box_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_box_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_box_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_box_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.scrollbarColor, defaults, 'scrollbarColor')) setters.push(`sgl_box_set_scrollbar_color(${obj(w)}, ${hexToSglColor(w.scrollbarColor)});`);
      if (shouldGenerateValue(w.showVScrollbar, defaults, 'showVScrollbar') || shouldGenerateValue(w.showHScrollbar, defaults, 'showHScrollbar')) {
        setters.push(`sgl_box_set_show_scrollbar(${obj(w)}, ${w.showVScrollbar ? 1 : 0}, ${w.showHScrollbar ? 1 : 0});`);
      }
      if (shouldGenerateValue(w.elasticUp, defaults, 'elasticUp') || shouldGenerateValue(w.elasticDown, defaults, 'elasticDown') || shouldGenerateValue(w.elasticLeft, defaults, 'elasticLeft') || shouldGenerateValue(w.elasticRight, defaults, 'elasticRight')) {
        setters.push(`sgl_box_set_elastic_scroll(${obj(w)}, ${w.elasticUp || 0}, ${w.elasticDown || 0}, ${w.elasticLeft || 0}, ${w.elasticRight || 0});`);
      }
      if (shouldGeneratePixmap(w.pixmap)) setters.push(`sgl_box_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat)});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_box_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'qrcode':
      if (shouldGenerateValue(w.qrText, defaults, 'qrText')) setters.push(`sgl_qrcode_set_text(${obj(w)}, "${escapeStr(w.qrText)}");`);
      if (shouldGenerateValue(w.cellColor, defaults, 'cellColor')) setters.push(`sgl_qrcode_set_cell_color(${obj(w)}, ${hexToSglColor(w.cellColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_qrcode_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.cellRadius, defaults, 'cellRadius')) setters.push(`sgl_qrcode_set_cell_radius(${obj(w)}, ${w.cellRadius});`);
      if (shouldGenerateValue(w.scale, defaults, 'scale')) setters.push(`sgl_qrcode_set_scale(${obj(w)}, ${w.scale});`);
      if (shouldGenerateValue(w.zone, defaults, 'zone')) setters.push(`sgl_qrcode_set_zone(${obj(w)}, ${w.zone});`);
      if (shouldGenerateValue(w.version, defaults, 'version')) setters.push(`sgl_qrcode_set_version(${obj(w)}, ${w.version});`);
      if (shouldGenerateValue(w.ecc, defaults, 'ecc')) setters.push(`sgl_qrcode_set_ecc(${obj(w)}, ${w.ecc});`);
      if (shouldGeneratePixmap(w.logo)) setters.push(`sgl_qrcode_set_logo(${obj(w)}, &${pixmapVarName(w.logo, w.pixmapFormat || 'RGB565')});`);
      if (shouldGenerateValue(w.logoRadius, defaults, 'logoRadius')) setters.push(`sgl_qrcode_set_logo_radius(${obj(w)}, ${w.logoRadius});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_qrcode_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'scope':
      if (shouldGenerateValue(w.channelCount, defaults, 'channelCount')) setters.push(`sgl_scope_set_channel_count(${obj(w)}, ${w.channelCount || 1});`);
      if (shouldGenerateValue(w.channelBuffers, defaults, 'channelBuffers') && w.channelBuffers) {
        w.channelBuffers.split(';').map(s => s.trim()).filter(s => s).forEach((buf, idx) => {
          const [name, len] = buf.split(',').map(s => s.trim());
          if (name && len) {
            setters.push(`sgl_scope_set_channel_data_buffer(${obj(w)}, ${idx}, ${name}, ${len});`);
          }
        });
      }
      if (shouldGenerateValue(w.channelWaveformColors, defaults, 'channelWaveformColors') && w.channelWaveformColors) {
        w.channelWaveformColors.split(';').map(s => s.trim()).filter(s => s).forEach((color, idx) => {
          setters.push(`sgl_scope_set_channel_waveform_color(${obj(w)}, ${idx}, ${hexToSglColor(color)});`);
        });
      }
      if (shouldGenerateValue(w.maxDisplayPoints, defaults, 'maxDisplayPoints')) setters.push(`sgl_scope_set_max_display_points(${obj(w)}, ${w.maxDisplayPoints});`);
      if (shouldGenerateValue(w.rangeMin, defaults, 'rangeMin') || shouldGenerateValue(w.rangeMax, defaults, 'rangeMax')) {
        setters.push(`sgl_scope_set_range(${obj(w)}, ${w.rangeMin || 0}, ${w.rangeMax || 100});`);
      }
      if (shouldGenerateValue(w.autoScale, defaults, 'autoScale')) setters.push(`sgl_scope_enable_auto_scale(${obj(w)}, ${w.autoScale ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.showYLabels, defaults, 'showYLabels')) setters.push(`sgl_scope_show_y_labels(${obj(w)}, ${w.showYLabels ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.yLabelColor, defaults, 'yLabelColor')) setters.push(`sgl_scope_set_y_label_color(${obj(w)}, ${hexToSglColor(w.yLabelColor)});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_scope_set_y_label_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.lineWidth, defaults, 'lineWidth')) setters.push(`sgl_scope_set_line_width(${obj(w)}, ${w.lineWidth});`);
      if (shouldGenerateValue(w.gridLine, defaults, 'gridLine')) setters.push(`sgl_scope_set_grid_line(${obj(w)}, ${w.gridLine});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_scope_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.gridColor, defaults, 'gridColor')) setters.push(`sgl_scope_set_grid_color(${obj(w)}, ${hexToSglColor(w.gridColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_scope_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_scope_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_scope_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'chart': {
      const chartType = w.chartType || 'linechart';
      const prefix = chartType === 'barchart' ? 'sgl_barchart' : (chartType === 'piechart' ? 'sgl_piechart' : 'sgl_linechart');
      const axisY = chartType === 'barchart' ? 'SGL_BARCHART_AXIS_Y' : 'SGL_LINECHART_AXIS_Y';
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`${prefix}_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`${prefix}_set_alpha(${obj(w)}, ${w.alpha});`);

      if (chartType === 'piechart') {
        if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`${prefix}_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
        if (shouldGenerateValue(w.startAngle, defaults, 'startAngle')) setters.push(`${prefix}_set_start_angle(${obj(w)}, ${w.startAngle});`);
        if (shouldGenerateValue(w.innerRadiusRate, defaults, 'innerRadiusRate')) setters.push(`${prefix}_set_inner_radius_rate(${obj(w)}, ${w.innerRadiusRate});`);
        if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`${prefix}_set_radius(${obj(w)}, ${w.radius});`);
        if (shouldGenerateValue(w.legendEnable, defaults, 'legendEnable')) setters.push(`${prefix}_enable_legend(${obj(w)}, ${w.legendEnable ? 'true' : 'false'});`);
        if (w.legendEnable && shouldGenerateValue(w.legendPos, defaults, 'legendPos')) setters.push(`${prefix}_set_legend_pos(${obj(w)}, ${w.legendPos});`);
        if (w.legendEnable && shouldGenerateValue(w.legendDir, defaults, 'legendDir')) setters.push(`${prefix}_set_legend_dir(${obj(w)}, ${w.legendDir});`);
        if (w.legendEnable && shouldGenerateValue(w.legendTextColor, defaults, 'legendTextColor')) setters.push(`${prefix}_set_legend_text_color(${obj(w)}, ${hexToSglColor(w.legendTextColor)});`);
        if (shouldGenerateValue(w.sliceCount, defaults, 'sliceCount')) setters.push(`${prefix}_set_slice_count(${obj(w)}, ${w.sliceCount});`);
        if (shouldGenerateValue(w.sliceValues, defaults, 'sliceValues') && w.sliceValues) {
          w.sliceValues.split(';').map(s => s.trim()).filter(s => s).forEach((val, idx) => {
            setters.push(`${prefix}_set_slice_value(${obj(w)}, ${idx}, ${val});`);
          });
        }
        if (shouldGenerateValue(w.sliceColors, defaults, 'sliceColors') && w.sliceColors) {
          w.sliceColors.split(';').map(s => s.trim()).filter(s => s).forEach((color, idx) => {
            setters.push(`${prefix}_set_slice_color(${obj(w)}, ${idx}, ${hexToSglColor(color)});`);
          });
        }
        if (shouldGenerateValue(w.sliceLabels, defaults, 'sliceLabels') && w.sliceLabels) {
          w.sliceLabels.split(';').map(s => s.trim()).filter(s => s).forEach((label, idx) => {
            setters.push(`${prefix}_set_slice_label(${obj(w)}, ${idx}, "${escapeStr(label)}");`);
          });
        }
      } else {
        if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`${prefix}_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
        if (shouldGenerateValue(w.minValue, defaults, 'minValue') || shouldGenerateValue(w.maxValue, defaults, 'maxValue')) {
          setters.push(`${prefix}_set_axis_range(${obj(w)}, ${axisY}, ${w.minValue || 0}, ${w.maxValue || 100});`);
        }
        if (shouldGenerateValue(w.autoScale, defaults, 'autoScale')) setters.push(`${prefix}_enable_axis_auto_scale(${obj(w)}, ${axisY}, ${w.autoScale ? 'true' : 'false'});`);
        if (shouldGenerateValue(w.showYLabels, defaults, 'showYLabels')) setters.push(`${prefix}_enable_axis_labels(${obj(w)}, ${axisY}, ${w.showYLabels ? 'true' : 'false'});`);
        if (shouldGenerateValue(w.gridColor, defaults, 'gridColor') || shouldGenerateValue(w.gridDashed, defaults, 'gridDashed')) {
          const enableGrid = w.gridColor && w.gridColor !== 'transparent';
          setters.push(`${prefix}_enable_axis_grid(${obj(w)}, ${axisY}, ${enableGrid ? 'true' : 'false'});`);
          if (enableGrid) setters.push(`${prefix}_set_axis_grid_color(${obj(w)}, ${axisY}, ${hexToSglColor(w.gridColor)}, 255);`);
          setters.push(`${prefix}_set_axis_grid_style(${obj(w)}, ${axisY}, ${w.gridDashed ? 1 : 0});`);
        }
        if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`${prefix}_set_axis_label_color(${obj(w)}, ${axisY}, ${hexToSglColor(w.textColor)}, 255);`);
        if (shouldGenerateFont(w, defaults)) {
          const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
          setters.push(`    ${prefix}_set_axis_label_font(${obj(w)}, ${axisY}, &${fontId});`);
        }
        if (shouldGenerateValue(w.seriesCount, defaults, 'seriesCount')) setters.push(`${prefix}_set_series_count(${obj(w)}, ${w.seriesCount});`);
        if (shouldGenerateValue(w.seriesData, defaults, 'seriesData') && w.seriesData) {
          w.seriesData.split(';').map(s => s.trim()).filter(s => s).forEach((data, idx) => {
            const [name, len] = data.split(',').map(s => s.trim());
            if (name && len) setters.push(`${prefix}_set_series_y_array(${obj(w)}, ${idx}, ${name}, ${len});`);
          });
        }
        if (shouldGenerateValue(w.seriesColors, defaults, 'seriesColors') && w.seriesColors) {
          w.seriesColors.split(';').map(s => s.trim()).filter(s => s).forEach((color, idx) => {
            if (chartType === 'barchart') {
              setters.push(`${prefix}_set_series_color(${obj(w)}, ${idx}, ${hexToSglColor(color)}, 255);`);
            } else {
              setters.push(`${prefix}_set_series_line_color(${obj(w)}, ${idx}, ${hexToSglColor(color)});`);
              setters.push(`${prefix}_set_series_fill_color(${obj(w)}, ${idx}, ${hexToSglColor(color)}, 0);`);
            }
          });
        }
        if (chartType !== 'piechart' && shouldGenerateValue(w.xLabels, defaults, 'xLabels') && w.xLabels) {
          const labels = w.xLabels.split(';').map(s => `"${escapeStr(s.trim())}"`).filter(s => s !== '""');
          if (labels.length > 0) {
            setters.push(`const char *x_labels_${obj(w)}[] = {${labels.join(', ')}}; ${prefix}_set_x_labels(${obj(w)}, x_labels_${obj(w)}, ${labels.length});`);
          }
        }
      }
      break;
    }

    case 'sprite':
      if (shouldGeneratePixmap(w.pixmap)) setters.push(`sgl_sprite_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat || 'ARGB4444')});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_sprite_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'roller':
      if (shouldGenerateValue(w.options, defaults, 'options') && w.options) {
        if (w.optionDynamic) {
          setters.push(`sgl_roller_set_option_dynamic(${obj(w)}, "${escapeStr(w.options)}");`);
        } else {
          setters.push(`sgl_roller_set_option_static(${obj(w)}, "${escapeStr(w.options)}");`);
        }
      }
      if (shouldGenerateValue(w.visibleRows, defaults, 'visibleRows')) setters.push(`sgl_roller_set_visible_rows(${obj(w)}, ${w.visibleRows});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_roller_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.selectedColor, defaults, 'selectedColor')) setters.push(`sgl_roller_set_selected_color(${obj(w)}, ${hexToSglColor(w.selectedColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_roller_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_roller_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_roller_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_roller_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_roller_set_text_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_roller_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'analogclock':
      if (shouldGenerateValue(w.hour, defaults, 'hour') || shouldGenerateValue(w.minute, defaults, 'minute') || shouldGenerateValue(w.second, defaults, 'second')) setters.push(`sgl_analogclock_set_time(${obj(w)}, ${w.hour || 0}, ${w.minute || 0}, ${w.second || 0});`);
      if (shouldGenerateValue(w.hourPtrColor, defaults, 'hourPtrColor')) setters.push(`sgl_analogclock_set_hour_ptr_color(${obj(w)}, ${hexToSglColor(w.hourPtrColor)});`);
      if (shouldGenerateValue(w.minPtrColor, defaults, 'minPtrColor')) setters.push(`sgl_analogclock_set_min_ptr_color(${obj(w)}, ${hexToSglColor(w.minPtrColor)});`);
      if (shouldGenerateValue(w.secPtrColor, defaults, 'secPtrColor')) setters.push(`sgl_analogclock_set_sec_ptr_color(${obj(w)}, ${hexToSglColor(w.secPtrColor)});`);
      if (shouldGenerateValue(w.scaleColor, defaults, 'scaleColor')) setters.push(`sgl_analogclock_set_scale_color(${obj(w)}, ${hexToSglColor(w.scaleColor)});`);
      if (shouldGenerateValue(w.textColor, defaults, 'textColor')) setters.push(`sgl_analogclock_set_text_color(${obj(w)}, ${hexToSglColor(w.textColor)});`);
      if (shouldGenerateValue(w.hubColor, defaults, 'hubColor')) setters.push(`sgl_analogclock_set_hub_color(${obj(w)}, ${hexToSglColor(w.hubColor)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_analogclock_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.borderColor, defaults, 'borderColor')) setters.push(`sgl_analogclock_set_border_color(${obj(w)}, ${hexToSglColor(w.borderColor)});`);
      if (shouldGenerateValue(w.borderWidth, defaults, 'borderWidth')) setters.push(`sgl_analogclock_set_border_width(${obj(w)}, ${w.borderWidth});`);
      if (shouldGenerateValue(w.hourPtrWidth, defaults, 'hourPtrWidth')) setters.push(`sgl_analogclock_set_hour_ptr_width(${obj(w)}, ${w.hourPtrWidth});`);
      if (shouldGenerateValue(w.minPtrWidth, defaults, 'minPtrWidth')) setters.push(`sgl_analogclock_set_min_ptr_width(${obj(w)}, ${w.minPtrWidth});`);
      if (shouldGenerateValue(w.secPtrWidth, defaults, 'secPtrWidth')) setters.push(`sgl_analogclock_set_sec_ptr_width(${obj(w)}, ${w.secPtrWidth});`);
      if (shouldGenerateValue(w.scaleWidth, defaults, 'scaleWidth')) setters.push(`sgl_analogclock_set_scale_width(${obj(w)}, ${w.scaleWidth});`);
      if (shouldGenerateValue(w.hubRadius, defaults, 'hubRadius')) setters.push(`sgl_analogclock_set_hub_radius(${obj(w)}, ${w.hubRadius});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_analogclock_set_font(${obj(w)}, &${fontId});`);
      }
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_analogclock_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'canvas':
      if (shouldGenerateValue(w.painterCb, defaults, 'painterCb') && w.painterCb) setters.push(`sgl_canvas_set_painter_cb(${obj(w)}, ${w.painterCb});`);
      if (shouldGenerateValue(w.privateData, defaults, 'privateData') && w.privateData) setters.push(`sgl_canvas_set_private(${obj(w)}, ${w.privateData});`);
      break;

    case 'statusbar':
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_statusbar_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.bgAlpha, defaults, 'bgAlpha')) setters.push(`sgl_statusbar_set_bg_alpha(${obj(w)}, ${w.bgAlpha});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_statusbar_set_bg_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.leftMargin, defaults, 'leftMargin') || shouldGenerateValue(w.rightMargin, defaults, 'rightMargin')) {
        setters.push(`sgl_statusbar_set_slot_margin(${obj(w)}, ${w.leftMargin || 0}, ${w.rightMargin || 0});`);
      }
      if (shouldGenerateValue(w.slotSpace, defaults, 'slotSpace')) setters.push(`sgl_statusbar_set_slot_space(${obj(w)}, ${w.slotSpace});`);
      if (shouldGenerateValue(w.leftSlots, defaults, 'leftSlots') && w.leftSlots) {
        w.leftSlots.split(';').map(s => s.trim()).filter(s => s).forEach(slot => {
          const idx = slot.indexOf(':');
          const index = idx >= 0 ? parseInt(slot.slice(0, idx).trim()) || 0 : 0;
          const text = idx >= 0 ? slot.slice(idx + 1).trim() : slot;
          setters.push(`sgl_statusbar_set_left_slot(${obj(w)}, ${index}, "${escapeStr(text)}");`);
        });
      }
      if (shouldGenerateValue(w.rightSlots, defaults, 'rightSlots') && w.rightSlots) {
        w.rightSlots.split(';').map(s => s.trim()).filter(s => s).forEach(slot => {
          const idx = slot.indexOf(':');
          const index = idx >= 0 ? parseInt(slot.slice(0, idx).trim()) || 0 : 0;
          const text = idx >= 0 ? slot.slice(idx + 1).trim() : slot;
          setters.push(`sgl_statusbar_set_right_slot(${obj(w)}, ${index}, "${escapeStr(text)}");`);
        });
      }
      if (shouldGenerateValue(w.slotColor, defaults, 'slotColor') || shouldGenerateValue(w.slotAlpha, defaults, 'slotAlpha')) {
        const colorVal = hexToSglColor(w.slotColor);
        setters.push(`sgl_statusbar_set_left_slot_color(${obj(w)}, 0, ${colorVal});`);
        setters.push(`sgl_statusbar_set_right_slot_color(${obj(w)}, 0, ${colorVal});`);
        setters.push(`sgl_statusbar_set_left_slot_alpha(${obj(w)}, 0, ${w.slotAlpha || 255});`);
        setters.push(`sgl_statusbar_set_right_slot_alpha(${obj(w)}, 0, ${w.slotAlpha || 255});`);
      }
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_statusbar_set_font(${obj(w)}, &${fontId});`);
      }
      break;

    case 'launcher':
      if (shouldGenerateValue(w.iconSize, defaults, 'iconSize')) setters.push(`sgl_launcher_set_icon_size(${obj(w)}, ${w.iconSize});`);
      if (shouldGenerateValue(w.gridCol, defaults, 'gridCol') || shouldGenerateValue(w.gridRow, defaults, 'gridRow')) {
        setters.push(`sgl_launcher_set_grid_size(${obj(w)}, ${w.gridCol || 3}, ${w.gridRow || 4});`);
      }
      if (shouldGenerateValue(w.marginLeft, defaults, 'marginLeft') || shouldGenerateValue(w.marginTop, defaults, 'marginTop') || shouldGenerateValue(w.marginRight, defaults, 'marginRight') || shouldGenerateValue(w.marginBottom, defaults, 'marginBottom')) {
        setters.push(`sgl_launcher_set_margin(${obj(w)}, ${w.marginLeft || 0}, ${w.marginTop || 0}, ${w.marginRight || 0}, ${w.marginBottom || 0});`);
      }
      if (shouldGenerateValue(w.labelColor, defaults, 'labelColor')) setters.push(`sgl_launcher_set_label_color(${obj(w)}, ${hexToSglColor(w.labelColor)});`);
      if (shouldGenerateValue(w.navigbarColor, defaults, 'navigbarColor')) setters.push(`sgl_launcher_set_navigbar_color(${obj(w)}, ${hexToSglColor(w.navigbarColor)});`);
      if (shouldGenerateValue(w.currentPage, defaults, 'currentPage')) setters.push(`sgl_launcher_set_current_page(${obj(w)}, ${w.currentPage});`);
      if (shouldGenerateFont(w, defaults)) {
        const fontId = getFontId(w.fontFamily, w.fontSize, w.fontBpp || 4);
        setters.push(`    sgl_launcher_set_font(${obj(w)}, &${fontId});`);
      }
      break;

    case '2dball':
      if (shouldGenerateValue(w.color, defaults, 'color')) setters.push(`sgl_2dball_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (shouldGenerateValue(w.bgColor, defaults, 'bgColor')) setters.push(`sgl_2dball_set_bg_color(${obj(w)}, ${hexToSglColor(w.bgColor)});`);
      if (shouldGenerateValue(w.radius, defaults, 'radius')) setters.push(`sgl_2dball_set_radius(${obj(w)}, ${w.radius});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_2dball_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'icon':
      if (shouldGenerateValue(w.color, defaults, 'color')) setters.push(`sgl_icon_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (shouldGenerateValue(w.align, defaults, 'align')) setters.push(`sgl_icon_set_align(${obj(w)}, SGL_ALIGN_${w.align});`);
      if (shouldGeneratePixmap(w.icon)) setters.push(`sgl_icon_set_icon(${obj(w)}, &${iconVarName(w.icon)});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_icon_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'ext_img':
      if (shouldGeneratePixmap(w.pixmap)) setters.push(`sgl_ext_img_set_pixmap(${obj(w)}, &${pixmapVarName(w.pixmap, w.pixmapFormat)});`);
      if (shouldGenerateValue(w.pixmapNum, defaults, 'pixmapNum')) setters.push(`sgl_ext_img_set_pixmap_num(${obj(w)}, ${w.pixmapNum}, ${w.autoRefresh ? 'true' : 'false'});`);
      if (shouldGenerateValue(w.pixmapIndex, defaults, 'pixmapIndex')) setters.push(`sgl_ext_img_set_pixmap_index(${obj(w)}, ${w.pixmapIndex});`);
      if (shouldGenerateValue(w.pixmapNext, defaults, 'pixmapNext') && w.pixmapNext) setters.push(`sgl_ext_img_set_pixmap_next(${obj(w)});`);
      if (shouldGenerateValue(w.readOps, defaults, 'readOps') && w.readOps) setters.push(`sgl_ext_img_set_read_ops(${obj(w)}, ${w.readOps});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_ext_img_set_alpha(${obj(w)}, ${w.alpha});`);
      break;

    case 'unzip_image':
      if (shouldGenerateValue(w.color, defaults, 'color')) setters.push(`sgl_unzip_img_set_color(${obj(w)}, ${hexToSglColor(w.color)});`);
      if (shouldGenerateValue(w.align, defaults, 'align')) setters.push(`sgl_unzip_img_set_align(${obj(w)}, SGL_ALIGN_${w.align});`);
      if (shouldGenerateValue(w.unzipImg, defaults, 'unzipImg') && w.unzipImg) setters.push(`sgl_unzip_img_set_img(${obj(w)}, &${unzipImgVarName(w.unzipImg)});`);
      if (shouldGenerateValue(w.alpha, defaults, 'alpha')) setters.push(`sgl_unzip_img_set_alpha(${obj(w)}, ${w.alpha});`);
      break;
  }

  return setters;
}

function obj(w) {
  return getWidgetVarName(w);
}

function escapeStr(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

function getWidgetDisplayName(type) {
  const w = SGL_WIDGET_TYPES.find(t => t.type === type);
  return w ? w.name : type;
}
