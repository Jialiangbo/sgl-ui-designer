// ============ SGL UI Designer - AI 提示词构建器 ============
// 负责：构建 System Prompt、User Prompt 模板
// 设计原则：精简 Token、只列常用属性、未列属性用默认值

/**
 * 系统提示词（约 800 Token）
 * 列出所有控件类型和常用属性，LLM 只需输出它想设置的属性
 */
export function buildSystemPrompt() {
  return `你是 SGL UI Designer 的 AI 设计助手。SGL 是一个嵌入式图形库，你帮用户设计嵌入式设备的界面布局。

## 可用控件
格式：type(常用属性) — 未列出的属性使用默认值即可，无需输出

### 基础形状
- rect(bgColor,borderColor,borderWidth,radius,alpha) — 矩形
- circle(color,borderColor,borderWidth,radius) — 圆形（radius=0时用width/2）
- ring(color,radiusIn,radiusOut) — 圆环
- arc(color,startAngle,endAngle,radiusIn,radiusOut) — 弧形
- line(color,lineWidth) — 直线
- polygon(fillColor,borderColor,borderWidth,vertices) — 多边形，vertices格式"x1,y1;x2,y2;..."

### 交互控件
- button(text,textColor,color,borderColor,borderWidth,radius,align,fontSize) — 按钮
- switch(status,onColor,bgColor,knobColor) — 开关（status为true/false）
- checkbox(text,status,textColor,boxColor,checkColor,fontSize) — 复选框
- slider(value,fillColor,trackColor,knobColor,borderWidth,radius) — 滑块（value 0-100）
- dropdown(options,textColor,bgColor,borderColor,fontSize) — 下拉框（options用换行分隔）
- roller(options,textColor,bgColor,fontSize) — 滚轮选择器
- numberkbd(cellColor,btnColor,textColor,fontSize) — 数字键盘
- keyboard(cellColor,btnColor,textColor,fontSize) — 全键盘

### 文本控件
- label(text,textColor,bgColor,align,fontSize) — 标签（bgColor默认transparent）
- textbox(text,textColor,bgColor,borderColor,borderWidth,radius,fontSize) — 文本输入框
- textline(text,textColor,bgColor,fontSize) — 文本行
- textlist(options,textColor,selectedColor,bgColor,fontSize) — 文本列表
- arc_label(text,textColor,bgColor,radius,fontSize) — 弧形文本

### 显示控件
- progress(value,fillColor,trackColor,borderColor,borderWidth,radius) — 进度条（value 0-100）
- bar(value,barColor,bgColor,borderColor) — 柱状条
- gauge(value,arcColor,scaleColor,pointerColor,textColor,fontSize) — 仪表盘
- spectrum(barColor,barNum) — 频谱
- battery(level,fillColor,borderColor) — 电池（level 0-100）
- led(status,onColor,offColor,radius) — LED指示灯
- analogclock(hour,minute,second,hourPtrColor,minPtrColor,secPtrColor,bgColor) — 模拟时钟
- chart(chartType,seriesColors,bgColor,borderColor,textColor,fontSize) — 图表（chartType: linechart/barchart/piechart）
- scope — 示波器

### 容器与特殊控件
- viewlist — 视图列表（滚动容器，子控件通过append加入）
- scroll — 滚动条
- box — 容器（带边框和焦点）
- win(titleText,titleBgColor,color,borderColor,radius,fontSize) — 窗口（带标题栏可关闭）
- canvas — 画布（自定义绘制）
- 2dball — 2D球动画
- sprite — 精灵动画
- statusbar(bgColor,leftSlots,rightSlots,fontSize) — 状态栏
- launcher — 启动器

### 图像控件
- icon(icon,color,align) — 图标
- ext_img(pixmap,pixmapFormat) — 外部图片
- img(pixmap) — 图片
- qrcode(qrText,cellColor,bgColor) — 二维码
- msgbox(titleText,msgText,leftBtnText,rightBtnText,bgColor,borderColor,radius) — 消息框

## 坐标系与颜色
- 左上角(0,0)，x向右增大，y向下增大，单位像素(px)
- 颜色使用 #RRGGBB 十六进制格式
- align可选值：TOP_LEFT, TOP_MID, TOP_RIGHT, LEFT_MID, CENTER, RIGHT_MID, BOT_LEFT, BOT_MID, BOT_RIGHT

## 输出格式要求
仅输出 JSON 数组，不要输出任何解释、思考或注释文字。每个元素必须包含 type/id/x/y/width/height，其他属性按需设置：
[{"type":"rect","id":"rect1","x":0,"y":0,"width":480,"height":60,"bgColor":"#1e1e2e","borderWidth":0},
 {"type":"label","id":"label1","x":20,"y":16,"width":200,"height":28,"text":"标题","textColor":"#ffffff","fontSize":20,"align":"LEFT_MID"}]

重要：必须输出完整的 JSON 数组，所有控件都必须完整输出，不可截断或省略。

## 设计规则
1. id 格式：{type}{序号}，同类型控件序号不可重复（如 rect1, rect2, label1）
2. 所有控件必须在屏幕范围内，不可超出边界
3. 控件间距建议≥8px，屏幕边距建议≥12px
4. 配色协调统一，避免颜色过多（建议主色不超过3种）
5. 字号建议：标题18-24px，正文12-16px，辅助文字10-12px
6. 如需背景卡片，先用 rect 绘制背景，再在上面放置其他控件`;
}

/**
 * 场景A：根据描述生成布局
 */
export function buildGeneratePrompt(screenWidth, screenHeight, description) {
  return `屏幕尺寸：${screenWidth} x ${screenHeight} px
请根据以下描述生成界面布局：

"${description}"`;
}

/**
 * 场景B：优化/修改当前布局
 * @param {Array} widgets - 当前页面控件列表（已精简序列化）
 * @param {string} instruction - 用户的修改指令
 */
export function buildModifyPrompt(screenWidth, screenHeight, widgets, instruction) {
  const widgetsJson = JSON.stringify(widgets, null, 2);
  return `屏幕尺寸：${screenWidth} x ${screenHeight} px

当前页面控件列表（JSON）：
${widgetsJson}

请按以下要求修改控件布局：
"${instruction}"

输出修改后的完整控件 JSON 数组。`;
}

/**
 * 场景B2：局部修改 - 只修改选中的控件
 * @param {Array} allWidgets - 当前页面所有控件（用于上下文参考）
 * @param {Array} selectedWidgets - 选中的控件（需要修改的）
 * @param {string} instruction - 用户的修改指令
 */
export function buildPartialModifyPrompt(screenWidth, screenHeight, allWidgets, selectedWidgets, instruction) {
  const allJson = JSON.stringify(allWidgets, null, 2);
  const selectedJson = JSON.stringify(selectedWidgets, null, 2);
  const selectedIds = selectedWidgets.map(w => w.id).join(', ');
  return `屏幕尺寸：${screenWidth} x ${screenHeight} px

当前页面所有控件（供参考，了解上下文）：
${allJson}

当前选中的控件（需要你修改的，共 ${selectedWidgets.length} 个：${selectedIds}）：
${selectedJson}

请按以下要求**仅修改选中的控件**，保持其他控件不变：
"${instruction}"

输出要求：输出完整的选中控件 JSON 数组（只包含修改后的选中控件，不需要输出未选中的控件）。`;
}

/**
 * 场景C：分析/解释当前布局
 */
export function buildAnalyzePrompt(screenWidth, screenHeight, widgets) {
  const widgetsJson = JSON.stringify(widgets, null, 2);
  return `屏幕尺寸：${screenWidth} x ${screenHeight} px

当前页面控件列表（JSON）：
${widgetsJson}

请分析这个界面布局，指出可以改进的地方（配色、间距、层次感等），并给出具体建议。用简洁的中文回答。`;
}

/**
 * 场景D：解释生成的 SGL C 代码
 */
export function buildExplainCodePrompt(code) {
  return `请解释以下 SGL C 代码的功能和结构，用简洁的中文说明主要逻辑和各个控件的作用：

\`\`\`c
${code}
\`\`\``;
}

/**
 * 场景E：截图生成布局（多模态，需要传 image base64）
 */
export function buildImageToLayoutPrompt(screenWidth, screenHeight, description) {
  const text = description
    ? `屏幕尺寸：${screenWidth} x ${screenHeight} px\n请分析这张 UI 图片，并生成尽可能还原的 SGL 控件布局 JSON。\n用户补充说明：${description}`
    : `屏幕尺寸：${screenWidth} x ${screenHeight} px\n请分析这张 UI 图片，并生成尽可能还原的 SGL 控件布局 JSON。`;
  return text;
}

/**
 * 精简序列化当前页面控件（只保留 AI 需要的字段，减少 Token 消耗）
 * @param {Array} widgets - AppState 中的完整控件列表
 * @returns {Array} 精简后的控件列表
 */
export function serializeWidgetsForAI(widgets) {
  // 需要保留的关键字段
  const KEY_FIELDS = new Set([
    'type', 'id', 'name', 'x', 'y', 'width', 'height',
    'text', 'textColor', 'bgColor', 'color', 'borderColor', 'borderWidth',
    'radius', 'alpha', 'fontSize', 'align', 'value', 'status',
    'fillColor', 'trackColor', 'onColor', 'knobColor',
    'startAngle', 'endAngle', 'radiusIn', 'radiusOut',
    'options', 'vertices', 'lineWidth',
    'pixmap', 'pixmapFormat', 'parentId', 'zOrder'
  ]);

  return widgets.map(w => {
    const slim = {};
    for (const key of KEY_FIELDS) {
      if (w[key] !== undefined && w[key] !== null && w[key] !== '') {
        slim[key] = w[key];
      }
    }
    // 确保必需字段存在
    slim.type = w.type;
    slim.id = w.id;
    slim.x = w.x;
    slim.y = w.y;
    slim.width = w.width;
    slim.height = w.height;
    return slim;
  });
}

/**
 * 从 AI 响应文本中提取 JSON 数组
 * 优先级：```json代码块 > ```代码块 > 第一个[到最后一个]
 */
function extractJsonArray(raw) {
  const text = raw.trim();

  // 1. 优先找 ```json ... ``` 代码块
  const jsonBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  for (const m of jsonBlocks) {
    const content = m[1].trim();
    if (content.startsWith('[') || content.startsWith('{')) {
      return content;
    }
  }

  // 2. 找普通 ``` ... ``` 代码块中看起来像 JSON 的
  const codeBlocks = [...text.matchAll(/```\s*([\s\S]*?)```/g)];
  for (const m of codeBlocks) {
    const content = m[1].trim();
    if ((content.startsWith('[') && content.includes(']')) ||
        (content.startsWith('{') && content.includes('}'))) {
      return content;
    }
  }

  // 3. 找第一个 [ 和最后一个 ] 之间的内容（数组）
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return text.slice(firstBracket, lastBracket + 1);
  }

  // 4. 找第一个 { 和最后一个 }（兜底，对象格式）
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text;
}

/**
 * 解析并校验 AI 返回的 JSON
 * @param {string} raw - LLM 返回的原始文本
 * @param {number} screenWidth
 * @param {number} screenHeight
 * @returns {{ valid: boolean, widgets?: Array, errors?: string[] }}
 */
export function parseAndValidateAIResponse(raw, screenWidth, screenHeight) {
  // 1. 提取 JSON
  const jsonStr = extractJsonArray(raw);

  // 2. 解析 JSON
  let widgets;
  try {
    widgets = JSON.parse(jsonStr);
  } catch (e) {
    return { valid: false, errors: [`JSON 解析失败: ${e.message}`] };
  }

  // 3. 如果是对象且有 widgets 字段，提取出来
  if (!Array.isArray(widgets) && typeof widgets === 'object' && Array.isArray(widgets.widgets)) {
    widgets = widgets.widgets;
  }

  // 4. 必须是数组
  if (!Array.isArray(widgets)) {
    return { valid: false, errors: ['期望 JSON 数组格式'] };
  }

  // 4. 已知的控件类型列表
  const VALID_TYPES = [
    'rect', 'circle', 'ring', 'arc', 'line', 'polygon',
    'button', 'switch', 'checkbox', 'slider', 'numberkbd', 'keyboard', 'dropdown', 'roller',
    'label', 'textbox', 'textline', 'textlist', 'arc_label',
    'progress', 'bar', 'gauge', 'spectrum', 'battery', 'led', 'analogclock', 'chart', 'scope',
    'icon', 'msgbox', 'ext_img', 'img', 'qrcode',
    'viewlist', 'scroll', 'box', 'win', 'canvas', '2dball', 'sprite',
    'statusbar', 'launcher'
  ];

  const errors = [];
  const idSet = new Set();
  const validated = [];

  for (let i = 0; i < widgets.length; i++) {
    const w = widgets[i];
    const prefix = `控件[${i}]`;

    if (!w.type) {
      errors.push(`${prefix}: 缺少 type 字段`);
      continue;
    }
    if (!VALID_TYPES.includes(w.type)) {
      errors.push(`${prefix}: 未知控件类型 "${w.type}"`);
      continue;
    }
    if (!w.id) {
      errors.push(`${prefix}(${w.type}): 缺少 id`);
      continue;
    }
    if (idSet.has(w.id)) {
      errors.push(`${prefix}: 重复的 id "${w.id}"`);
    }
    idSet.add(w.id);

    // 校验坐标
    const x = typeof w.x === 'number' ? w.x : parseInt(w.x);
    const y = typeof w.y === 'number' ? w.y : parseInt(w.y);
    const width = typeof w.width === 'number' ? w.width : parseInt(w.width);
    const height = typeof w.height === 'number' ? w.height : parseInt(w.height);

    if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
      errors.push(`${w.id}: x/y/width/height 必须是数字`);
      continue;
    }
    if (width <= 0 || height <= 0) {
      errors.push(`${w.id}: width/height 必须大于 0`);
      continue;
    }

    // 构建校验通过的控件（合并原始属性）
    validated.push({ ...w, x, y, width, height });
  }

  if (errors.length > 0) {
    return { valid: false, errors, widgets: validated };
  }

  return { valid: true, widgets: validated };
}
