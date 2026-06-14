import { AppState, navigate, initNav, escapeHtml } from './app.js';
import { SGL_WIDGET_TYPES } from './sgl_api.js';

initNav('preview');
AppState.init();

let currentIndex = 0;

function render() {
  const pages = AppState.project.pages;
  if (!pages || pages.length === 0) return;
  if (currentIndex >= pages.length) currentIndex = 0;
  if (currentIndex < 0) currentIndex = pages.length - 1;

  const page = pages[currentIndex];
  const frame = document.getElementById('preview-frame');
  frame.style.width = page.width + 'px';
  frame.style.height = page.height + 'px';
  frame.style.background = page.bg_color || '#1e1e2e';
  frame.style.position = 'relative';
  frame.innerHTML = '';

  page.widgets.forEach(w => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = w.x + 'px';
    el.style.top = w.y + 'px';
    el.style.width = w.width + 'px';
    el.style.height = w.height + 'px';
    el.style.boxSizing = 'border-box';
    el.style.overflow = 'hidden';

    const z = 1;
    const alpha = w.alpha != null ? w.alpha : 255;
    el.style.opacity = alpha < 255 ? alpha / 255 : 1;

    renderPreviewWidget(el, w, z);

    frame.appendChild(el);
  });

  $('status-current-page').textContent = '页面 ' + (currentIndex + 1) + ' / ' + pages.length;
  $('status-page-name').textContent = page.name;
  $('status-page-size').textContent = page.width + '×' + page.height;
}

function renderPreviewWidget(el, w, z) {
  switch (w.type) {
    case 'rect':
      el.style.background = w.bgColor || 'transparent';
      el.style.border = `${(w.borderWidth || 0)}px solid ${w.borderColor || 'transparent'}`;
      el.style.borderRadius = ((w.radius || 0)) + 'px';
      if (w.color && w.color !== 'transparent') {
        el.style.boxShadow = 'inset 0 0 0 4px ' + w.color;
      }
      break;

    case 'circle':
      el.style.background = w.color || 'transparent';
      el.style.border = `${(w.borderWidth || 0)}px solid ${w.borderColor || 'transparent'}`;
      el.style.borderRadius = '50%';
      if (w.xOffset || w.yOffset) {
        el.style.transform = `translate(${w.xOffset || 0}px, ${w.yOffset || 0}px)`;
      }
      break;

    case 'line': {
      el.style.background = 'transparent';
      const lineH = Math.max(2, w.borderWidth || 2);
      const lineEl = document.createElement('div');
      lineEl.style.cssText = `position:absolute;left:0;top:50%;transform:translateY(-50%);width:100%;height:${lineH}px;background:${w.color || '#8b5cf6'};border-radius:${lineH / 2}px;`;
      el.appendChild(lineEl);
      break;
    }

    case 'button': {
      el.style.background = w.bgColor || '#8b5cf6';
      el.style.border = `${(w.borderWidth || 1)}px solid ${w.borderColor || '#7c3aed'}`;
      el.style.borderRadius = ((w.radius || 8)) + 'px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = justifyContent(w.align);
      el.style.padding = '4px 8px';
      const text = document.createElement('span');
      text.textContent = w.text || '按钮';
      text.style.color = w.textColor || '#ffffff';
      text.style.fontSize = (w.fontSize || 14) + 'px';
      text.style.overflow = 'hidden';
      text.style.textOverflow = 'ellipsis';
      text.style.whiteSpace = 'nowrap';
      el.appendChild(text);
      break;
    }

    case 'label': {
      el.style.background = w.bgColor && w.bgColor !== 'transparent' ? w.bgColor : 'transparent';
      el.style.borderRadius = ((w.radius || 0)) + 'px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = justifyContent(w.align);
      el.style.padding = '2px 4px';
      const text = document.createElement('span');
      text.textContent = w.text || '标签';
      text.style.color = w.textColor || w.color || '#e4e4e7';
      text.style.fontSize = (w.fontSize || 14) + 'px';
      text.style.overflow = 'hidden';
      text.style.textOverflow = 'ellipsis';
      text.style.whiteSpace = 'nowrap';
      if (w.textRotation) text.style.transform = `rotate(${w.textRotation}deg)`;
      el.appendChild(text);
      break;
    }

    case 'textbox': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 2)}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 6)) + 'px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.padding = '0 8px';
      const text = document.createElement('span');
      text.textContent = w.text || '';
      text.style.color = w.textColor || '#e4e4e7';
      text.style.fontSize = (w.fontSize || 14) + 'px';
      text.style.opacity = 0.7;
      el.appendChild(text);
      break;
    }

    case 'switch': {
      el.style.background = w.bgColor || '#313149';
      el.style.border = `${(w.borderWidth || 1)}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 15)) + 'px';
      if (w.status) el.style.background = w.color || '#8b5cf6';
      const knobR = w.knobRadius || 10;
      const margin = w.knobMargin || 2;
      const pos = w.status ? el.clientWidth - knobR - margin : margin;
      const knob = document.createElement('div');
      knob.style.cssText = `position:absolute;top:50%;left:${pos}px;transform:translateY(-50%);width:${knobR}px;height:${knobR}px;border-radius:50%;background:${w.knobColor || '#ffffff'};box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
      el.appendChild(knob);
      break;
    }

    case 'checkbox': {
      el.style.background = 'transparent';
      const boxSize = Math.min(w.height, 18);
      const box = document.createElement('div');
      box.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:${boxSize}px;height:${boxSize}px;border:1px solid ${w.color || '#8b5cf6'};border-radius:${w.radius || 4}px;font-size:${boxSize * 0.7}px;color:${w.color || '#8b5cf6'};margin-right:6px;flex-shrink:0;`;
      if (w.status) box.textContent = '✓';
      const text = document.createElement('span');
      text.textContent = w.text || '';
      text.style.color = w.color || '#e4e4e7';
      text.style.fontSize = (w.fontSize || 14) + 'px';
      const inner = document.createElement('div');
      inner.style.cssText = 'display:flex;align-items:center;width:100%;height:100%;padding:0 4px;';
      inner.appendChild(box);
      inner.appendChild(text);
      el.appendChild(inner);
      break;
    }

    case 'slider': {
      const isHoriz = w.direct !== 1;
      el.style.background = w.trackColor || '#313149';
      el.style.borderRadius = ((w.radius || 4)) + 'px';
      const fill = document.createElement('div');
      if (isHoriz) fill.style.cssText = `position:absolute;left:0;top:0;height:100%;width:${w.value || 0}%;background:${w.fillColor || '#8b5cf6'};border-radius:${(w.radius || 4)}px;`;
      else fill.style.cssText = `position:absolute;left:0;bottom:0;width:100%;height:${w.value || 0}%;background:${w.fillColor || '#8b5cf6'};border-radius:${(w.radius || 4)}px;`;
      el.appendChild(fill);
      const knobSize = Math.max(12, (w.thickness || 8) + 6);
      const knob = document.createElement('div');
      knob.style.cssText = `position:absolute;${isHoriz ? 'top:50%;left:' + (w.value || 0) + '%' : 'left:50%;bottom:' + (w.value || 0) + '%'};transform:translate(-50%,-50%);width:${knobSize}px;height:${knobSize}px;border-radius:50%;background:${w.knobColor || '#ffffff'};box-shadow:0 1px 4px rgba(0,0,0,0.4);`;
      el.appendChild(knob);
      break;
    }

    case 'progress': {
      el.style.background = w.trackColor || '#313149';
      el.style.border = `${(w.borderWidth || 1)}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4)) + 'px';
      const fill = document.createElement('div');
      fill.style.cssText = `position:absolute;left:0;top:0;height:100%;width:${w.value || 0}%;background:${w.fillColor || '#22c55e'};border-radius:${(w.radius || 4)}px;`;
      el.appendChild(fill);
      break;
    }

    case 'bar': {
      el.style.background = w.bgColor || '#313149';
      el.style.border = `${(w.borderWidth || 1)}px solid ${w.borderColor || '#3d3d5c'}`;
      const fill = document.createElement('div');
      fill.style.cssText = `position:absolute;left:0;bottom:0;width:100%;height:${w.value || 50}%;background:${w.color || '#8b5cf6'};`;
      el.appendChild(fill);
      break;
    }

    case 'gauge': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 2)}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = '50%';
      const cx = w.width / 2, cy = w.height / 2, r = Math.min(w.width, w.height) / 2 - (w.borderWidth || 2);
      const arc = document.createElement('div');
      arc.style.cssText = `position:absolute;top:${cy - r}px;left:${cx - r}px;width:${r * 2}px;height:${r * 2}px;border:${(w.borderWidth || 4)}px solid ${w.color || '#8b5cf6'};border-radius:50%;border-right-color:transparent;border-bottom-color:transparent;transform:rotate(${-45 + ((w.value || 0) / 100) * 270}deg);`;
      el.appendChild(arc);
      const valText = document.createElement('div');
      valText.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:' + (w.color || '#8b5cf6') + ';';
      valText.textContent = w.value || 0;
      el.appendChild(valText);
      break;
    }

    case 'led': {
      el.style.background = w.status ? w.color : (w.bgColor || '#313149');
      el.style.border = '1px solid ' + (w.borderColor || '#3d3d5c');
      el.style.borderRadius = '50%';
      if (w.status) el.style.boxShadow = '0 0 6px ' + (w.color || '#22c55e');
      break;
    }

    case 'battery': {
      el.style.background = w.bgColor || '#313149';
      el.style.border = `${(w.borderWidth || 1)}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4)) + 'px';
      const pct = w.value || 80;
      const fill = document.createElement('div');
      fill.style.cssText = `position:absolute;left:0;top:0;height:100%;width:${pct}%;background:${pct > 20 ? (w.color || '#22c55e') : '#ef4444'};border-radius:${(w.radius || 4)}px;`;
      el.appendChild(fill);
      const cap = document.createElement('div');
      cap.style.cssText = `position:absolute;right:${-3}px;top:50%;transform:translateY(-50%);width:3px;height:50%;background:${w.borderColor || '#3d3d5c'};border-radius:0 3px 3px 0;`;
      el.appendChild(cap);
      break;
    }

    case 'dropdown': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 1)}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4)) + 'px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.padding = '0 8px';
      const text = document.createElement('span');
      text.textContent = w.text || '请选择';
      text.style.color = w.textColor || '#e4e4e7';
      text.style.fontSize = (w.fontSize || 14) + 'px';
      text.style.flex = '1';
      text.style.overflow = 'hidden';
      text.style.textOverflow = 'ellipsis';
      text.style.whiteSpace = 'nowrap';
      const arrow = document.createElement('span');
      arrow.textContent = '▼';
      arrow.style.fontSize = '8px';
      arrow.style.color = w.textColor || '#a1a1aa';
      el.appendChild(text);
      el.appendChild(arrow);
      break;
    }

    case 'textline':
    case 'textlist':
    case 'viewlist': {
      el.style.background = w.bgColor || '#1e1e2e';
      el.style.border = `${(w.borderWidth || 1)}px solid ${w.borderColor || '#3d3d5c'}`;
      el.style.borderRadius = ((w.radius || 4)) + 'px';
      if (w.text) {
        const text = document.createElement('span');
        text.textContent = w.text;
        text.style.color = w.color || w.textColor || '#e4e4e7';
        text.style.fontSize = (w.fontSize || 14) + 'px';
        text.style.padding = '4px 8px';
        text.style.display = 'block';
        el.appendChild(text);
      }
      break;
    }

    case 'win': {
      el.style.background = w.bgColor || '#313149';
      el.style.border = `${(w.borderWidth || 2)}px solid ${w.borderColor || '#8b5cf6'}`;
      el.style.borderRadius = ((w.radius || 8)) + 'px';
      const titleBar = document.createElement('div');
      titleBar.style.cssText = `height:${Math.max(24, (w.fontSize || 14) * 2)}px;background:${w.color || '#8b5cf6'};display:flex;align-items:center;padding:0 8px;border-radius:${(w.radius || 8)}px ${(w.radius || 8)}px 0 0;`;
      const titleText = document.createElement('span');
      titleText.textContent = w.text || '窗口';
      titleText.style.color = w.textColor || '#ffffff';
      titleText.style.fontSize = (w.fontSize || 14) + 'px';
      titleBar.appendChild(titleText);
      el.appendChild(titleBar);
      break;
    }

    case 'msgbox': {
      el.style.background = w.bgColor || '#313149';
      el.style.border = `${(w.borderWidth || 2)}px solid ${w.borderColor || '#8b5cf6'}`;
      el.style.borderRadius = ((w.radius || 8)) + 'px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      const text = document.createElement('span');
      text.textContent = w.text || '提示信息';
      text.style.color = w.textColor || '#ffffff';
      text.style.fontSize = (w.fontSize || 14) + 'px';
      text.style.textAlign = 'center';
      text.style.padding = '8px';
      el.appendChild(text);
      break;
    }

    default: {
      el.style.background = w.bgColor || '#313149';
      el.style.border = `${(w.borderWidth || 1)}px solid ${w.borderColor || '#8b5cf6'}`;
      el.style.borderRadius = ((w.radius || 4)) + 'px';
      const typeInfo = SGL_WIDGET_TYPES.find(t => t.type === w.type);
      const text = document.createElement('span');
      text.textContent = w.text || typeInfo?.name || w.type;
      text.style.color = w.color || '#8b5cf6';
      text.style.fontSize = '12px';
      text.style.display = 'flex';
      text.style.alignItems = 'center';
      text.style.justifyContent = 'center';
      text.style.width = '100%';
      text.style.height = '100%';
      el.appendChild(text);
    }
  }
}

function justifyContent(align) {
  if (align === 'CENTER') return 'center';
  if (align === 'RIGHT') return 'flex-end';
  return 'flex-start';
}

function $(id) { return document.getElementById(id); }

document.getElementById('btn-prev-page').addEventListener('click', () => { currentIndex--; render(); });
document.getElementById('btn-next-page').addEventListener('click', () => { currentIndex++; render(); });

document.querySelectorAll('[data-nav]').forEach(tab => {
  tab.addEventListener('click', () => navigate(tab.dataset.nav));
});

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') { currentIndex--; render(); }
  if (e.key === 'ArrowRight') { currentIndex++; render(); }
});

render();
