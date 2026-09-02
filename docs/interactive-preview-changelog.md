# 交互预览改动记录

## 2026-09-01：阶段 1（重新实现）

本阶段只接入已有的预览 runtime，不修改画布布局、页面管理、HTML、CSS 或 `preview.js`。

### `src/editor.js`

1. 扩展 `preview.js` import：
   - `enterPreviewSimulator`
   - `exitPreviewSimulator`
   - `setPreviewDemoEnabled`
2. 将 `_previewMode` 声明移到首次 `renderAll()` 调用之前，避免初始化时访问未声明变量。
3. `renderAll()`：
   - 预览态只调用 `previewRender()` 并返回。
   - 编辑态原有渲染代码保持不变。
4. `enterPreviewMode()`：
   - 调用 `enterPreviewSimulator()`，启用控件临时交互状态。
   - 调用 `setPreviewDemoEnabled(false)`，阶段 1 不启用仪表、波形等假数据动画。
5. `exitPreviewMode()`：
   - 调用 `exitPreviewSimulator()`，停止预览动画并清空临时 runtime。

### 明确未修改

- `src/editor.html`
- `src/styles.css`
- `src/preview.js`
- 编辑画布的缩放、平移、居中和网格
- 默认页面、新建页面和页面切换
- 工程数据保存结构
- 预览工具栏和预览翻页功能
