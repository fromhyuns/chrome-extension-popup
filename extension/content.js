(function () {
  if (window.__eiLoaded) return;
  window.__eiLoaded = true;

  /* ========================================
     STATE
     ======================================== */
  let active = false;
  let inspecting = false;
  let hoveredEl = null;
  let selectedEl = null;
  let panelOpen = false;

  /* ========================================
     OVERLAYS (main DOM)
     ======================================== */
  function makeOverlay(cls) {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = '<span class="__ei-overlay-tag"></span><span class="__ei-overlay-dim"></span>';
    document.documentElement.appendChild(el);
    return el;
  }
  const hoverOv = makeOverlay('__ei-hover-overlay');
  const selectOv = makeOverlay('__ei-select-overlay');

  function positionOverlay(ov, el) {
    const r = el.getBoundingClientRect();
    ov.style.cssText = `position:fixed!important;top:${r.top}px!important;left:${r.left}px!important;width:${r.width}px!important;height:${r.height}px!important;`;
    ov.classList.add('--visible');
    ov.querySelector('.__ei-overlay-tag').textContent = '<' + tagName(el) + '>';
    ov.querySelector('.__ei-overlay-dim').textContent = Math.round(r.width) + ' \u00d7 ' + Math.round(r.height);
  }
  function hideOverlay(ov) { ov.classList.remove('--visible'); }

  /* ========================================
     WIDGET (Shadow DOM for style isolation)
     ======================================== */
  const host = document.createElement('div');
  host.id = '__ei-host';
  host.style.cssText = 'all:initial!important;position:fixed!important;top:0!important;right:0!important;bottom:0!important;left:0!important;z-index:2147483646!important;pointer-events:none!important;display:none!important;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // ----- Shadow styles -----
  const style = document.createElement('style');
  style.textContent = WIDGET_CSS();
  shadow.appendChild(style);

  // ----- Widget HTML -----
  const wrapper = document.createElement('div');
  wrapper.className = 'ei-root';
  wrapper.innerHTML = WIDGET_HTML();
  shadow.appendChild(wrapper);

  // Refs inside shadow
  const fab = shadow.querySelector('.ei-fab');
  const panel = shadow.querySelector('.ei-panel');
  const minimizeBtn = shadow.querySelector('.ei-minimize');
  const selBar = shadow.querySelector('.ei-sel-bar');
  const selTag = shadow.querySelector('.ei-sel-tag');
  const selDim = shadow.querySelector('.ei-sel-dim');
  const selToken = shadow.querySelector('.ei-sel-token');
  const panelContent = shadow.querySelector('.ei-panel-scroll');
  const toast = shadow.querySelector('.ei-toast');
  const toastMsg = shadow.querySelector('.ei-toast-msg');
  const closeBtn = shadow.querySelector('.ei-close-btn');

  // Close button → full terminate + reset everything
  closeBtn.addEventListener('click', () => {
    inspecting = false;
    panelOpen = false;
    hoveredEl = null;
    selectedEl = null;
    active = false;
    hideOverlay(hoverOv);
    hideOverlay(selectOv);
    panel.classList.remove('--open');
    fab.classList.remove('--active');
    fab.style.display = 'none';
    fab.style.top = '16px';
    fab.style.right = '16px';
    fab.style.left = 'auto';
    host.style.display = 'none';
    // Reset panel content
    selTag.textContent = 'No selection';
    selDim.textContent = '';
    selToken.textContent = '';
    selToken.style.display = 'none';
    panelContent.innerHTML = '';
  });

  // Click sel-bar to copy tag + size + token
  selBar.addEventListener('click', () => {
    const tag = selTag.textContent;
    const dim = selDim.textContent;
    const token = selToken.textContent;
    if (!tag || tag === 'No selection') return;
    let text = dim ? tag + '  ' + dim : tag;
    if (token) text += '  ' + token;
    copyText(text);
  });

  /* ========================================
     TOGGLE (from background.js)
     ======================================== */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggle') {
      active = !active;
      host.style.display = active ? 'block' : 'none';
      if (!active) deactivate();
      else { inspecting = true; fab.classList.add('--active'); }
    }
  });

  function deactivate() {
    inspecting = false;
    panelOpen = false;
    hoveredEl = null;
    selectedEl = null;
    fab.classList.remove('--active');
    panel.classList.remove('--open');
    fab.style.display = '';
    hideOverlay(hoverOv);
    hideOverlay(selectOv);
  }

  /* ========================================
     FAB & PANEL
     ======================================== */
  // ===== Panel positioning =====
  function positionPanel() {
    const fabRect = fab.getBoundingClientRect();
    const fabCx = fabRect.left + fabRect.width / 2;
    const fabCy = fabRect.top + fabRect.height / 2;
    const pw = 312;
    const ph = window.innerHeight * 0.8; // max-height: 80vh
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;

    // Horizontal: open toward the side with more space
    let left;
    if (fabCx > vw / 2) {
      left = fabRect.right - pw;
      panel.style.transformOrigin = 'top right';
    } else {
      left = fabRect.left;
      panel.style.transformOrigin = 'top left';
    }

    // Vertical: open below or above FAB
    let top;
    const spaceBelow = vh - fabRect.bottom - margin;
    const spaceAbove = fabRect.top - margin;

    if (spaceBelow >= ph || spaceBelow >= spaceAbove) {
      top = fabRect.bottom + margin;
    } else {
      top = fabRect.top - ph - margin;
      panel.style.transformOrigin = panel.style.transformOrigin.replace('top', 'bottom');
    }

    // Clamp to viewport
    left = Math.max(margin, Math.min(left, vw - pw - margin));
    top = Math.max(margin, Math.min(top, vh - ph - margin));

    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.right = 'auto';
  }

  function openPanel() {
    panelOpen = true;
    inspecting = true;
    fab.classList.add('--active');
    if (!selectedEl) showEmpty();
    positionPanel();
    panel.classList.add('--open');
    fab.style.display = 'none';
  }

  // ===== FAB drag + click =====
  let _dragState = null;

  fab.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = fab.getBoundingClientRect();
    _dragState = {
      startX: e.clientX, startY: e.clientY,
      offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top,
      moved: false
    };
  });

  document.addEventListener('mousemove', (e) => {
    if (!_dragState) return;
    const dx = e.clientX - _dragState.startX;
    const dy = e.clientY - _dragState.startY;
    if (!_dragState.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    _dragState.moved = true;
    const x = Math.max(0, Math.min(window.innerWidth - 48, e.clientX - _dragState.offsetX));
    const y = Math.max(0, Math.min(window.innerHeight - 48, e.clientY - _dragState.offsetY));
    fab.style.left = x + 'px';
    fab.style.top = y + 'px';
    fab.style.right = 'auto';
  });

  document.addEventListener('mouseup', (e) => {
    if (!_dragState) return;
    const wasDrag = _dragState.moved;
    _dragState = null;
    if (!wasDrag && !panelOpen) {
      openPanel();
    }
  });

  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panelOpen = false;
    panel.classList.remove('--open');
    fab.style.display = '';
    selectedEl = null;
    hideOverlay(selectOv);
  });

  function showEmpty() {
    selTag.textContent = 'No selection';
    selDim.textContent = '';
    selToken.textContent = '';
    selToken.style.display = 'none';
    panelContent.innerHTML = `
      <div class="ei-empty">
        <div class="ei-empty-ico">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M4 7V4h3"/><path d="M20 7V4h-3"/>
            <path d="M4 17v3h3"/><path d="M20 17v3h-3"/>
            <circle cx="12" cy="12" r="3" stroke-dasharray="4 2"/>
          </svg>
        </div>
        <div class="ei-empty-title">Select an element</div>
        <div class="ei-empty-desc">Click any element on the page to inspect its styles</div>
      </div>`;
  }

  /* ========================================
     INSPECT LOGIC
     ======================================== */
  function isOwn(el) {
    if (!el) return true;
    if (el === host || host.contains(el)) return true;
    if (el.classList && (el.classList.contains('__ei-hover-overlay') || el.classList.contains('__ei-select-overlay'))) return true;
    if (el.closest && (el.closest('.__ei-hover-overlay') || el.closest('.__ei-select-overlay'))) return true;
    if (el.id === '__ei-host') return true;
    return false;
  }

  document.addEventListener('mousemove', (e) => {
    if (!active || !inspecting) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOwn(el) || el === document.body || el === document.documentElement) {
      hideOverlay(hoverOv); hoveredEl = null; return;
    }
    if (el === hoveredEl) return;
    if (el === selectedEl) { hideOverlay(hoverOv); hoveredEl = null; return; }
    hoveredEl = el;
    positionOverlay(hoverOv, el);
  }, true);

  document.addEventListener('click', (e) => {
    if (!active || !inspecting) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOwn(el) || el === document.body || el === document.documentElement) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    selectedEl = el;
    hoveredEl = null;
    hideOverlay(hoverOv);
    positionOverlay(selectOv, el);

    const r = el.getBoundingClientRect();
    selTag.textContent = '<' + tagName(el) + '>';
    selDim.textContent = Math.round(r.width) + ' \u00d7 ' + Math.round(r.height);
    const elTokens = findElementTokens(el);
    if (elTokens.length > 0) {
      selToken.textContent = elTokens[0];
      selToken.style.display = '';
    } else {
      selToken.textContent = '';
      selToken.style.display = 'none';
    }
    buildPanel(el);

    if (!panelOpen) {
      openPanel();
    }
  }, true);

  // Keep overlays in sync
  function refresh() {
    if (hoveredEl) positionOverlay(hoverOv, hoveredEl);
    if (selectedEl) positionOverlay(selectOv, selectedEl);
  }
  window.addEventListener('scroll', refresh, true);
  window.addEventListener('resize', refresh);

  // ESC → pause
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && active && inspecting) {
      inspecting = false;
      panelOpen = false;
      selectedEl = null;
      hoveredEl = null;
      hideOverlay(hoverOv);
      hideOverlay(selectOv);
      panel.classList.remove('--open');
      fab.style.display = '';
      fab.classList.remove('--active');
    }
  }, true);

  // ₩ (backtick) → resume
  document.addEventListener('keydown', (e) => {
    if ((e.key === '`' || e.key === '₩') && active && !inspecting) {
      openPanel();
    }
  }, true);

  /* ========================================
     HELPERS
     ======================================== */
  function tagName(el) {
    let t = el.tagName.toLowerCase();
    if (el.id) t += '#' + el.id;
    else if (el.className && typeof el.className === 'string') {
      const c = el.className.split(/\s+/).filter(s => s && !s.startsWith('__ei')).slice(0, 2).join('.');
      if (c) t += '.' + c;
    }
    return t;
  }

  // ===== Color token detection =====
  function collectCSSVars() {
    const varNames = new Set();
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.style) {
            for (const prop of rule.style) {
              if (prop.startsWith('--')) varNames.add(prop);
            }
          }
          // Check nested rules (e.g. @media)
          if (rule.cssRules) {
            for (const nested of rule.cssRules) {
              if (nested.style) {
                for (const prop of nested.style) {
                  if (prop.startsWith('--')) varNames.add(prop);
                }
              }
            }
          }
        }
      } catch (e) {} // skip cross-origin sheets
    }
    return varNames;
  }

  function resolveColor(val) {
    const tmp = document.createElement('div');
    tmp.style.color = val;
    tmp.style.display = 'none';
    document.body.appendChild(tmp);
    const resolved = getComputedStyle(tmp).color;
    tmp.remove();
    return resolved;
  }

  let _cachedVars = null;
  let _cacheTime = 0;

  function findElementTokens(el) {
    const tokens = [];

    // Collect tokens from a single element
    function scanEl(target) {
      if (!target || target === document.documentElement || target === document.body) return;
      // Data attributes
      for (const attr of ['data-token', 'data-component', 'data-icon', 'data-testid']) {
        const v = target.getAttribute && target.getAttribute(attr);
        if (v && !tokens.includes(v)) tokens.push(v);
      }
      // Icon class names (e.g. fa-home, icon-search, material-icons, mi-star)
      const cls = target.getAttribute && target.getAttribute('class');
      if (cls && typeof cls === 'string') {
        const iconClasses = cls.split(/\s+/).filter(c =>
          /^(fa-|icon-|mi-|mdi-|bi-|ri-|lucide-|heroicon-)/.test(c) ||
          /^(material-icons|material-symbols)/.test(c)
        );
        for (const ic of iconClasses) {
          if (!tokens.includes(ic)) tokens.push(ic);
        }
      }
      // aria-label on icon elements
      const ariaLabel = target.getAttribute && target.getAttribute('aria-label');
      if (ariaLabel && !tokens.includes(ariaLabel)) tokens.push(ariaLabel);
      // CSS rules with var()
      if (target.matches) {
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules) {
              if (!rule.selectorText || !rule.style) continue;
              try { if (!target.matches(rule.selectorText)) continue; } catch(e) { continue; }
              for (const prop of rule.style) {
                const val = rule.style.getPropertyValue(prop);
                const m = val.matchAll(/var\((--[^,)]+)/g);
                for (const match of m) {
                  if (!tokens.includes(match[1])) tokens.push(match[1]);
                }
              }
            }
          } catch(e) {}
        }
      }
      // Inline style var()
      const inline = target.getAttribute && (target.getAttribute('style') || '');
      const im = inline.matchAll(/var\((--[^,)]+)/g);
      for (const match of im) {
        if (!tokens.includes(match[1])) tokens.push(match[1]);
      }
    }

    // Scan the element itself
    scanEl(el);

    // For SVG child elements (path, circle, rect, line, etc.), walk up to the <svg> and its parent
    const svgTags = ['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g', 'use', 'text'];
    const tag = el.tagName && el.tagName.toLowerCase();
    if (tag === 'svg' || svgTags.includes(tag)) {
      let cur = el;
      // Walk up through SVG internals to reach <svg>
      while (cur && cur.tagName && cur.tagName.toLowerCase() !== 'svg') cur = cur.parentElement;
      if (cur) scanEl(cur); // scan <svg> itself
      // Scan the parent wrapper of <svg> (often the icon component container)
      if (cur && cur.parentElement) scanEl(cur.parentElement);
    }

    return tokens;
  }

  function resolveToPixel(val, prop) {
    if (!val || val === 'normal' || val === 'auto' || val === 'none') return val;
    const tmp = document.createElement('div');
    tmp.style.cssText = 'position:absolute;visibility:hidden;' + prop + ':' + val;
    document.body.appendChild(tmp);
    const resolved = getComputedStyle(tmp)[prop];
    tmp.remove();
    return resolved;
  }

  function findToken(targetValue, el, prop) {
    const now = Date.now();
    if (!_cachedVars || now - _cacheTime > 3000) {
      _cachedVars = collectCSSVars();
      _cacheTime = now;
    }
    const resolveProp = prop || 'width';
    const cs = getComputedStyle(el);
    for (const name of _cachedVars) {
      const val = cs.getPropertyValue(name).trim();
      if (!val) continue;
      // Direct match
      if (val === targetValue) return name;
      // Resolve units (rem, em, etc.) to px for comparison
      if (targetValue.endsWith('px') && val.match(/^[\d.]+(rem|em|vh|vw|%|ex|ch|vmin|vmax)$/)) {
        try {
          const resolved = resolveToPixel(val, resolveProp);
          if (resolved === targetValue) return name;
        } catch(e) {}
      }
    }
    return null;
  }

  function findColorToken(targetRgb, el) {
    // Cache vars for 3 seconds
    const now = Date.now();
    if (!_cachedVars || now - _cacheTime > 3000) {
      _cachedVars = collectCSSVars();
      _cacheTime = now;
    }
    const cs = getComputedStyle(el);
    for (const name of _cachedVars) {
      const val = cs.getPropertyValue(name).trim();
      if (!val) continue;
      // Quick filter: skip non-color values
      if (!val.match(/^(#|rgb|hsl|hwb|lab|lch|oklch|oklab|color|[a-z]{3,}$)/i)) continue;
      try {
        const resolved = resolveColor(val);
        if (resolved === targetRgb) return name;
      } catch (e) {}
    }
    return null;
  }

  function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return 'transparent';
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return rgb;
    return '#' + m.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function parseRgb(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return null;
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return null;
    return m.slice(0, 3).map(Number);
  }

  function luminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  function contrastRatio(rgb1, rgb2) {
    const l1 = luminance(...rgb1);
    const l2 = luminance(...rgb2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function getEffectiveBg(el) {
    let current = el;
    while (current && current !== document.documentElement) {
      const bg = getComputedStyle(current).backgroundColor;
      const parsed = parseRgb(bg);
      if (parsed && !(parsed[0] === 0 && parsed[1] === 0 && parsed[2] === 0 && bg.includes('0)'))) {
        return parsed;
      }
      current = current.parentElement;
    }
    return [255, 255, 255]; // default white
  }

  function wcagLevel(ratio, fontSize, fontWeight) {
    const size = parseInt(fontSize);
    const bold = parseInt(fontWeight) >= 700;
    const isLarge = size >= 24 || (size >= 18.66 && bold);
    const aa = isLarge ? 3 : 4.5;
    const aaa = isLarge ? 4.5 : 7;
    if (ratio >= aaa) return 'AAA';
    if (ratio >= aa) return 'AA';
    return 'Fail';
  }

  function wName(w) {
    return { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' }[w] || '';
  }

  function copyText(val) {
    navigator.clipboard.writeText(val).then(() => showToast('Copied "' + val + '"'));
  }

  function showToast(msg) {
    toastMsg.textContent = msg;
    toast.classList.add('--show');
    setTimeout(() => toast.classList.remove('--show'), 1800);
  }

  /* ========================================
     BUILD PANEL
     ======================================== */
  function buildPanel(el) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);

    const font = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    const fontSize = cs.fontSize;
    const fontWeight = cs.fontWeight;
    const lineHeight = cs.lineHeight;
    const letterSpacing = cs.letterSpacing;
    const color = rgbToHex(cs.color);
    const bg = rgbToHex(cs.backgroundColor);

    const mt = parseInt(cs.marginTop), mr = parseInt(cs.marginRight), mb = parseInt(cs.marginBottom), ml = parseInt(cs.marginLeft);
    const pt = parseInt(cs.paddingTop), pr = parseInt(cs.paddingRight), pb = parseInt(cs.paddingBottom), pl = parseInt(cs.paddingLeft);
    const border = cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + rgbToHex(cs.borderTopColor);
    const borderRadius = cs.borderRadius;

    let html = '';

    // Typography
    const sizeToken = findToken(fontSize, el, 'fontSize');
    const weightToken = findToken(fontWeight, el, 'fontWeight');
    const lhToken = findToken(lineHeight, el, 'lineHeight');
    const lsToken = findToken(letterSpacing, el, 'letterSpacing');

    html += `<div class="ei-section">
      <div class="ei-section-head">Typography</div>
      <div class="ei-row"><span class="ei-key">Font Family</span><span class="ei-val --copy" data-copy="${font}">${font}</span></div>
      <div class="ei-row"><span class="ei-key">Size</span><span class="ei-val --mono --copy" data-copy="${sizeToken ? 'var(' + sizeToken + ')' : fontSize}">${fontSize}${sizeToken ? '<span class="ei-token">var(' + sizeToken + ')</span>' : ''}</span></div>
      <div class="ei-row"><span class="ei-key">Weight</span><span class="ei-val --mono --copy" data-copy="${weightToken ? 'var(' + weightToken + ')' : fontWeight}">${fontWeight} ${wName(fontWeight)}${weightToken ? '<span class="ei-token">var(' + weightToken + ')</span>' : ''}</span></div>
      <div class="ei-row"><span class="ei-key">Line Height</span><span class="ei-val --mono --copy" data-copy="${lhToken ? 'var(' + lhToken + ')' : lineHeight}">${lineHeight}${lhToken ? '<span class="ei-token">var(' + lhToken + ')</span>' : ''}</span></div>
      <div class="ei-row"><span class="ei-key">Letter Spacing</span><span class="ei-val --mono --copy" data-copy="${lsToken ? 'var(' + lsToken + ')' : letterSpacing}">${letterSpacing}${lsToken ? '<span class="ei-token">var(' + lsToken + ')</span>' : ''}</span></div>
      <div class="ei-font-preview">
        <div class="ei-font-sample" style="font-family:'${font}',serif;font-size:${Math.min(parseInt(fontSize), 26)}px;font-weight:${fontWeight};">Aa Bb Cc 가나다 123</div>
        <div class="ei-font-meta">${font} ${wName(fontWeight)} ${fontSize}</div>
      </div>
    </div>`;

    // Colors
    const copySvg = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
    const textToken = findColorToken(cs.color, el);
    const bgToken = (bg !== 'transparent') ? findColorToken(cs.backgroundColor, el) : null;

    html += `<div class="ei-section"><div class="ei-section-head">Colors</div>`;
    html += `<div class="ei-color-row --copy" data-copy="${textToken || color}"><div class="ei-clr-dot" style="background:${color}"></div><div class="ei-clr-info"><span class="ei-clr-label">Text Color</span><span class="ei-clr-hex">${color}</span>${textToken ? '<span class="ei-clr-token">var(' + textToken + ')</span>' : ''}</div><span class="ei-clr-copy">${copySvg}</span></div>`;
    if (bg !== 'transparent') {
      html += `<div class="ei-color-row --copy" data-copy="${bgToken ? 'var(' + bgToken + ')' : bg}"><div class="ei-clr-dot" style="background:${bg}"></div><div class="ei-clr-info"><span class="ei-clr-label">Background</span><span class="ei-clr-hex">${bg}</span>${bgToken ? '<span class="ei-clr-token">var(' + bgToken + ')</span>' : ''}</div><span class="ei-clr-copy">${copySvg}</span></div>`;
    } else {
      // transparent — find effective bg from parent and look up its token
      const effBgRgb = getEffectiveBg(el);
      const effBgHex = rgbToHex('rgb(' + effBgRgb.join(',') + ')');
      const effBgEl = (function findBgEl(e) { while (e && e !== document.documentElement) { const b = getComputedStyle(e).backgroundColor; const p = parseRgb(b); if (p && !(p[0]===0&&p[1]===0&&p[2]===0&&b.includes('0)'))) return e; e = e.parentElement; } return document.documentElement; })(el.parentElement);
      const effBgToken = findColorToken(getComputedStyle(effBgEl).backgroundColor, effBgEl);
      html += `<div class="ei-color-row --copy" data-copy="${effBgToken ? 'var(' + effBgToken + ')' : effBgHex}"><div class="ei-clr-dot" style="background:${effBgHex}"></div><div class="ei-clr-info"><span class="ei-clr-label">Background <span style="font-size:9px;color:#aaa">(inherited)</span></span><span class="ei-clr-hex">${effBgHex}</span>${effBgToken ? '<span class="ei-clr-token">var(' + effBgToken + ')</span>' : ''}</div><span class="ei-clr-copy">${copySvg}</span></div>`;
    }
    // Contrast ratio
    const fgRgb = parseRgb(cs.color);
    const bgRgb = getEffectiveBg(el);
    if (fgRgb && bgRgb) {
      const ratio = contrastRatio(fgRgb, bgRgb);
      const ratioStr = ratio.toFixed(2);
      const level = wcagLevel(ratio, fontSize, fontWeight);
      const levelClass = level === 'Fail' ? '--fail' : level === 'AA' ? '--aa' : '--aaa';
      const effBgHex = rgbToHex('rgb(' + bgRgb.join(',') + ')');
      html += `<div class="ei-contrast">
        <div class="ei-contrast-preview" style="color:${color};background:${effBgHex};">Aa</div>
        <div class="ei-contrast-info">
          <div class="ei-contrast-ratio">${ratioStr}:1</div>
          <div class="ei-contrast-badges">
            <span class="ei-wcag-badge ${levelClass}">${level}</span>
            <span class="ei-wcag-detail">WCAG 2.1</span>
          </div>
        </div>
      </div>`;
    }
    html += `</div>`;

    // Box Model
    const gap = cs.gap;
    const rowGap = cs.rowGap;
    const columnGap = cs.columnGap;

    html += `<div class="ei-section"><div class="ei-section-head">Box Model</div>
      <div class="ei-box-model">
        <div class="ei-box-margin"><span class="ei-bv --t --mc">${mt}</span><span class="ei-bv --r --mc">${mr}</span><span class="ei-bv --b --mc">${mb}</span><span class="ei-bv --l --mc">${ml}</span>
          <div class="ei-box-padding"><span class="ei-bv --t --pc">${pt}</span><span class="ei-bv --r --pc">${pr}</span><span class="ei-bv --b --pc">${pb}</span><span class="ei-bv --l --pc">${pl}</span>
            <div class="ei-box-content"><span class="ei-box-sz">${w} \u00d7 ${h}</span></div>
          </div>
        </div>
        <div class="ei-box-legend"><span><i class="--lm"></i>Margin</span><span><i class="--lp"></i>Padding</span><span><i class="--lc"></i>Content</span></div>
      </div>`;

    // Spacing details
    const hasMargin = mt !== 0 || mr !== 0 || mb !== 0 || ml !== 0;
    const hasPadding = pt !== 0 || pr !== 0 || pb !== 0 || pl !== 0;
    const hasGap = gap && gap !== 'normal';

    if (hasGap || hasMargin || hasPadding) {
      html += `<div class="ei-spacing-tokens">`;

      // Gap
      if (hasGap) {
        const gapToken = findToken(gap, el);
        html += `<div class="ei-row"><span class="ei-key">Gap</span><span class="ei-val --mono --copy" data-copy="${gapToken ? 'var(' + gapToken + ')' : gap}">${gap}${gapToken ? '<span class="ei-token">var(' + gapToken + ')</span>' : ''}</span></div>`;
        if (rowGap && rowGap !== 'normal' && rowGap !== gap) {
          const rowGapToken = findToken(rowGap, el);
          html += `<div class="ei-row"><span class="ei-key">Row Gap</span><span class="ei-val --mono --copy" data-copy="${rowGapToken ? 'var(' + rowGapToken + ')' : rowGap}">${rowGap}${rowGapToken ? '<span class="ei-token">var(' + rowGapToken + ')</span>' : ''}</span></div>`;
        }
        if (columnGap && columnGap !== 'normal' && columnGap !== gap) {
          const colGapToken = findToken(columnGap, el);
          html += `<div class="ei-row"><span class="ei-key">Column Gap</span><span class="ei-val --mono --copy" data-copy="${colGapToken ? 'var(' + colGapToken + ')' : columnGap}">${columnGap}${colGapToken ? '<span class="ei-token">var(' + colGapToken + ')</span>' : ''}</span></div>`;
        }
      }

      // Margin
      if (hasMargin) {
        const marginToken = findToken(cs.margin, el);
        if (marginToken) {
          html += `<div class="ei-row"><span class="ei-key">Margin</span><span class="ei-val --mono --copy" data-copy="var(${marginToken})">${cs.margin}<span class="ei-token">var(${marginToken})</span></span></div>`;
        } else {
          const sides = [['Top', cs.marginTop, mt], ['Right', cs.marginRight, mr], ['Bottom', cs.marginBottom, mb], ['Left', cs.marginLeft, ml]];
          for (const [dir, val, num] of sides) {
            if (num !== 0) {
              const tk = findToken(val, el);
              html += `<div class="ei-row"><span class="ei-key">Margin ${dir}</span><span class="ei-val --mono --copy" data-copy="${tk ? 'var(' + tk + ')' : val}">${val}${tk ? '<span class="ei-token">var(' + tk + ')</span>' : ''}</span></div>`;
            }
          }
        }
      }

      // Padding
      if (hasPadding) {
        const paddingToken = findToken(cs.padding, el);
        if (paddingToken) {
          html += `<div class="ei-row"><span class="ei-key">Padding</span><span class="ei-val --mono --copy" data-copy="var(${paddingToken})">${cs.padding}<span class="ei-token">var(${paddingToken})</span></span></div>`;
        } else {
          const sides = [['Top', cs.paddingTop, pt], ['Right', cs.paddingRight, pr], ['Bottom', cs.paddingBottom, pb], ['Left', cs.paddingLeft, pl]];
          for (const [dir, val, num] of sides) {
            if (num !== 0) {
              const tk = findToken(val, el);
              html += `<div class="ei-row"><span class="ei-key">Padding ${dir}</span><span class="ei-val --mono --copy" data-copy="${tk ? 'var(' + tk + ')' : val}">${val}${tk ? '<span class="ei-token">var(' + tk + ')</span>' : ''}</span></div>`;
            }
          }
        }
      }

      html += `</div>`;
    }

    html += `</div>`;

    // Attributes
    html += `<div class="ei-section"><div class="ei-section-head">Attributes</div>`;
    html += `<div class="ei-row"><span class="ei-key">Display</span><span class="ei-val --mono --copy" data-copy="${cs.display}">${cs.display}</span></div>`;
    html += `<div class="ei-row"><span class="ei-key">Position</span><span class="ei-val --mono --copy" data-copy="${cs.position}">${cs.position}</span></div>`;
    if (cs.borderTopStyle !== 'none' && cs.borderTopWidth !== '0px') {
      const borderWidthToken = findToken(cs.borderTopWidth, el);
      const borderColorToken = findColorToken(cs.borderTopColor, el);
      const borderTokenStr = [borderWidthToken, borderColorToken].filter(Boolean).map(t => 'var(' + t + ')').join(' ');
      html += `<div class="ei-row"><span class="ei-key">Border</span><span class="ei-val --mono --copy" data-copy="${borderTokenStr || border}">${border}${borderTokenStr ? '<span class="ei-token">' + borderTokenStr + '</span>' : ''}</span></div>`;
    }
    if (borderRadius && borderRadius !== '0px') {
      const radiusToken = findToken(borderRadius, el);
      html += `<div class="ei-row"><span class="ei-key">Border Radius</span><span class="ei-val --mono --copy" data-copy="${radiusToken ? 'var(' + radiusToken + ')' : borderRadius}">${borderRadius}${radiusToken ? '<span class="ei-token">var(' + radiusToken + ')</span>' : ''}</span></div>`;
    }
    if (cs.opacity !== '1') {
      html += `<div class="ei-row"><span class="ei-key">Opacity</span><span class="ei-val --mono --copy" data-copy="${cs.opacity}">${cs.opacity}</span></div>`;
    }
    if (cs.overflow !== 'visible') {
      html += `<div class="ei-row"><span class="ei-key">Overflow</span><span class="ei-val --mono --copy" data-copy="${cs.overflow}">${cs.overflow}</span></div>`;
    }
    html += `</div>`;

    panelContent.innerHTML = html;

    // Copy click handlers
    panelContent.querySelectorAll('.--copy').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => copyText(el.dataset.copy));
    });
  }

  /* ========================================
     WIDGET HTML template
     ======================================== */
  function WIDGET_HTML() {
    return `
    <!-- FAB -->
    <button class="ei-fab --active">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M4 7V4h3"/><path d="M20 7V4h-3"/>
        <path d="M4 17v3h3"/><path d="M20 17v3h-3"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
      <span class="ei-fab-tip">Element Inspector</span>
    </button>

    <!-- Panel -->
    <div class="ei-panel">
      <div class="ei-panel-head">
        <div class="ei-head-row">
          <div class="ei-brand">
            <div class="ei-logo">
              <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                <path d="M4 7V4h3"/><path d="M20 7V4h-3"/>
                <path d="M4 17v3h3"/><path d="M20 17v3h-3"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <span class="ei-title">Element Inspector</span>
          </div>
          <div class="ei-head-btns">
            <button class="ei-minimize" title="Minimize">
              <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
            </button>
            <button class="ei-close-btn" title="Close Inspector">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div class="ei-sel-bar --copyable" title="Click to copy">
          <span class="ei-sel-dot"></span>
          <span class="ei-sel-tag">No selection</span>
          <span class="ei-sel-dim"></span>
          <span class="ei-sel-token"></span>
        </div>
      </div>
      <div class="ei-panel-scroll"></div>
      <div class="ei-panel-foot">
        <div class="ei-foot-shortcuts">
          <span class="ei-shortcut"><kbd>Click</kbd> Inspect</span>
          <span class="ei-shortcut"><kbd>ESC</kbd> Pause</span>
          <span class="ei-shortcut"><kbd>₩</kbd> Resume</span>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div class="ei-toast"><svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><span class="ei-toast-msg"></span></div>
    `;
  }

  /* ========================================
     WIDGET CSS (inside Shadow DOM)
     ======================================== */
  function WIDGET_CSS() {
    return `
    :host { all: initial; }

    .ei-root {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      -webkit-font-smoothing: antialiased;
      position: fixed; top: 0; right: 0; bottom: 0; left: 0;
      pointer-events: none; z-index: 2147483646;
    }

    /* FAB */
    .ei-fab {
      position: fixed; top: 16px; right: 16px;
      width: 48px; height: 48px; border-radius: 50%;
      background: linear-gradient(135deg, #0FA09B, #0B7E7A);
      box-shadow: 0 4px 14px rgba(15,160,155,0.35), 0 12px 32px rgba(15,160,155,0.18);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; border: none; pointer-events: auto;
      transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
    }
    .ei-fab:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(15,160,155,0.4), 0 16px 40px rgba(15,160,155,0.22); }
    .ei-fab:active { transform: scale(0.95); cursor: grabbing; }
    .ei-fab svg { width: 22px; height: 22px; color: #fff; }
    .ei-fab.--active::before {
      content: ''; position: absolute; inset: -4px; border-radius: 50%;
      border: 2px solid rgba(15,160,155,0.3);
      animation: eiPulse 2s ease-out infinite;
    }
    @keyframes eiPulse { 0%{transform:scale(1);opacity:1} 100%{transform:scale(1.5);opacity:0} }

    .ei-fab-tip {
      position: absolute; right: 58px; top: 50%; transform: translateY(-50%);
      background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);
      color: #fff; font-size: 12px; font-weight: 550;
      padding: 6px 12px; border-radius: 8px; white-space: nowrap;
      opacity: 0; pointer-events: none; transition: opacity 0.2s;
    }
    .ei-fab:hover .ei-fab-tip { opacity: 1; }
    .ei-fab-tip::after {
      content: ''; position: absolute; right: -4px; top: 50%;
      transform: translateY(-50%) rotate(45deg);
      width: 8px; height: 8px; background: rgba(0,0,0,0.8);
    }

    /* Panel */
    .ei-panel {
      position: fixed;
      width: 312px; max-height: 80vh;
      background: rgba(255,255,255,0.97);
      backdrop-filter: blur(40px) saturate(200%);
      border-radius: 3px;
      box-shadow: 0 0 0 0.5px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08), 0 24px 56px rgba(0,0,0,0.1);
      display: flex; flex-direction: column; overflow: hidden;
      opacity: 0; transform: scale(0.4); transform-origin: top right;
      pointer-events: none; transition: all 0.32s cubic-bezier(0.16,1,0.3,1);
    }
    .ei-panel.--open { opacity: 1; transform: scale(1) translateY(0); pointer-events: auto; }

    /* Panel head */
    .ei-panel-head { padding: 14px 16px 10px; border-bottom: 0.5px solid rgba(0,0,0,0.06); flex-shrink: 0; }
    .ei-head-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .ei-brand { display: flex; align-items: center; gap: 8px; }
    .ei-logo {
      width: 26px; height: 26px;
      background: linear-gradient(135deg, #0FA09B 0%, #0B7E7A 50%, #3DC4BF 100%);
      border-radius: 6px; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 6px rgba(15,160,155,0.25);
    }
    .ei-logo svg { width: 14px; height: 14px; color: #fff; }
    .ei-title { font-size: 13.5px; font-weight: 650; color: #1d1d1f; letter-spacing: -0.2px; }

    .ei-head-btns { display: flex; align-items: center; gap: 4px; }
    .ei-minimize {
      width: 24px; height: 24px; border-radius: 50%;
      background: rgba(0,0,0,0.05); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center; transition: background 0.12s;
    }
    .ei-minimize:hover { background: rgba(0,0,0,0.1); }
    .ei-minimize svg { width: 11px; height: 11px; color: #86868b; }

    .ei-sel-bar {
      display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap;
      background: rgba(15,160,155,0.06); border: 1px solid rgba(15,160,155,0.1);
      border-radius: 7px; padding: 7px 10px; transition: background 0.12s;
    }
    .ei-sel-bar.--copyable { cursor: pointer;
    }
    .ei-sel-bar.--copyable:hover {
      background: rgba(15,160,155,0.12);
    }
    .ei-sel-dot {
      width: 7px; height: 7px; border-radius: 50%; background: #0FA09B; flex-shrink: 0;
      animation: eiDotPulse 2s infinite;
    }
    @keyframes eiDotPulse { 0%,100%{box-shadow:0 0 0 0 rgba(15,160,155,0.4)} 50%{box-shadow:0 0 0 4px rgba(15,160,155,0)} }
    .ei-sel-tag { font: 500 11px/1 'Fira Code',monospace; color: #0FA09B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ei-sel-dim { margin-left: auto; font: 500 10px/1 'Fira Code',monospace; color: #86868b; white-space: nowrap; flex-shrink: 0; }
    .ei-sel-token {
      font: 500 9px/1 'Fira Code',monospace; color: #0FA09B; background: rgba(15,160,155,0.08);
      padding: 2px 6px; border-radius: 3px; white-space: nowrap; flex-shrink: 0; display: none;
    }

    /* Scroll */
    .ei-panel-scroll { flex: 1; overflow-y: auto; scrollbar-width: none; }
    .ei-panel-scroll::-webkit-scrollbar { display: none; }

    /* Empty */
    .ei-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 32px; text-align: center; }
    .ei-empty-ico {
      width: 44px; height: 44px; background: rgba(15,160,155,0.07); border-radius: 12px;
      display: flex; align-items: center; justify-content: center; margin-bottom: 12px;
    }
    .ei-empty-ico svg { width: 20px; height: 20px; color: #0FA09B; opacity: 0.5; }
    .ei-empty-title { font-size: 13.5px; font-weight: 600; color: #1d1d1f; margin-bottom: 4px; }
    .ei-empty-desc { font-size: 12px; color: #86868b; line-height: 1.5; }

    /* Section */
    .ei-section {
      padding: 12px 16px; border-bottom: 0.5px solid rgba(0,0,0,0.04);
      animation: eiFadeUp 0.25s cubic-bezier(0.16,1,0.3,1) backwards;
    }
    .ei-section:last-child { border-bottom: none; }
    .ei-section:nth-child(1) { animation-delay: 0.03s; }
    .ei-section:nth-child(2) { animation-delay: 0.07s; }
    .ei-section:nth-child(3) { animation-delay: 0.11s; }
    .ei-section:nth-child(4) { animation-delay: 0.15s; }
    @keyframes eiFadeUp { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }

    .ei-section-head {
      font-size: 10.5px; font-weight: 700; color: #1d1d1f; letter-spacing: 0.02px;
      margin-bottom: 10px; padding-bottom: 0;
    }

    /* Rows */
    .ei-row { display: flex; align-items: center; justify-content: space-between; padding: 5px 0; }
    .ei-row + .ei-row { border-top: 0.5px solid rgba(0,0,0,0.03); }
    .ei-key { font-size: 11.5px; color: #86868b; font-weight: 500; }
    .ei-val { font-size: 12px; color: #1d1d1f; font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
    .ei-val.--mono { font: 500 11px/1 'Fira Code',monospace; }
    .ei-val.--copy { padding: 2px 5px; border-radius: 4px; transition: all 0.12s; cursor: pointer; }
    .ei-val.--copy:hover { background: rgba(15,160,155,0.08); color: #0FA09B; }

    /* Font preview */
    .ei-font-preview {
      background: rgba(0,0,0,0.018); border: 0.5px solid rgba(0,0,0,0.04);
      border-radius: 8px; padding: 14px; margin-top: 8px; text-align: center;
    }
    .ei-font-sample { color: #1d1d1f; line-height: 1.2; }
    .ei-font-meta { font-size: 9.5px; color: #c7c7cc; margin-top: 7px; font-weight: 500; font-family: 'Inter',sans-serif!important; }

    /* Colors */
    .ei-color-row {
      display: flex; align-items: center; gap: 9px; padding: 6px 0; border-radius: 5px; transition: background 0.1s;
    }
    .ei-color-row + .ei-color-row { border-top: 0.5px solid rgba(0,0,0,0.03); }
    .ei-color-row.--copy:hover { background: rgba(0,0,0,0.015); margin: 0 -5px; padding: 6px 5px; cursor: pointer; }
    .ei-clr-dot {
      width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1), inset 0 0 0 0.5px rgba(0,0,0,0.08);
    }
    .ei-clr-info { flex: 1; min-width: 0; }
    .ei-clr-label { font-size: 10.5px; color: #86868b; font-weight: 500; display: block; }
    .ei-clr-hex { font: 600 11.5px/1 'Fira Code',monospace; color: #1d1d1f; letter-spacing: 0.2px; display: block; }
    .ei-clr-token, .ei-token { font: 500 9.5px/1 'Fira Code',monospace; color: #0FA09B; display: block; margin-top: 3px; }
    .ei-clr-copy { opacity: 0; transition: opacity 0.12s; color: #c7c7cc; }
    .ei-color-row:hover .ei-clr-copy { opacity: 1; }

    /* Contrast */
    .ei-contrast {
      display: flex; align-items: center; gap: 10px;
      margin-top: 8px; padding: 8px 10px;
      background: rgba(0,0,0,0.02); border: 0.5px solid rgba(0,0,0,0.05);
      border-radius: 6px;
    }
    .ei-contrast-preview {
      width: 36px; height: 36px; border-radius: 5px;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 700; flex-shrink: 0;
      border: 0.5px solid rgba(0,0,0,0.08);
    }
    .ei-contrast-info { flex: 1; }
    .ei-contrast-ratio { font: 600 13px/1 'Fira Code',monospace; color: #1d1d1f; margin-bottom: 4px; }
    .ei-contrast-badges { display: flex; align-items: center; gap: 6px; }
    .ei-wcag-badge {
      font-size: 9.5px; font-weight: 700; padding: 2px 6px;
      border-radius: 3px; letter-spacing: 0.3px;
    }
    .ei-wcag-badge.--aaa { background: rgba(22,163,74,0.1); color: #16a34a; }
    .ei-wcag-badge.--aa { background: rgba(234,179,8,0.12); color: #a16207; }
    .ei-wcag-badge.--fail { background: rgba(220,38,38,0.1); color: #dc2626; }
    .ei-wcag-detail { font-size: 9px; color: #aaa; font-weight: 500; }

    /* Box Model */
    .ei-box-model { display: flex; flex-direction: column; align-items: center; margin-top: 4px; }
    .ei-box-margin { position: relative; background: rgba(249,168,37,0.06); border: 1.5px dashed rgba(249,168,37,0.3); border-radius: 8px; padding: 14px; }
    .ei-box-padding { position: relative; background: rgba(76,175,80,0.06); border: 1.5px dashed rgba(76,175,80,0.3); border-radius: 6px; padding: 12px; }
    .ei-box-content { background: rgba(15,160,155,0.06); border: 1.5px solid rgba(15,160,155,0.2); border-radius: 4px; padding: 6px 14px; text-align: center; }
    .ei-box-sz { font: 600 10.5px/1 'Fira Code',monospace; color: #0FA09B; }
    .ei-bv { font: 500 9px/1 'Fira Code',monospace; position: absolute; color: #86868b; }
    .ei-bv.--t { top: 1px; left: 50%; transform: translateX(-50%); }
    .ei-bv.--b { bottom: 1px; left: 50%; transform: translateX(-50%); }
    .ei-bv.--l { left: 2px; top: 50%; transform: translateY(-50%); }
    .ei-bv.--r { right: 2px; top: 50%; transform: translateY(-50%); }
    .ei-bv.--mc { color: #f59e0b; } .ei-bv.--pc { color: #16a34a; }
    .ei-box-legend { display: flex; gap: 12px; margin-top: 8px; justify-content: center; }
    .ei-box-legend span { display: flex; align-items: center; gap: 4px; font-size: 9.5px; color: #86868b; font-weight: 500; }
    .ei-box-legend i { width: 7px; height: 7px; border-radius: 2px; display: inline-block; font-style: normal; }
    .--lm { background: rgba(249,168,37,0.35); } .--lp { background: rgba(76,175,80,0.35); } .--lc { background: rgba(15,160,155,0.35); }

    .ei-spacing-tokens { margin-top: 10px; padding-top: 8px; border-top: 0.5px solid rgba(0,0,0,0.04); }

    /* Footer */
    .ei-panel-foot {
      padding: 9px 16px; border-top: 0.5px solid rgba(0,0,0,0.05);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .ei-foot-shortcuts { display: flex; gap: 10px; }
    .ei-shortcut { font-size: 10px; color: #86868b; font-weight: 500; display: flex; align-items: center; gap: 4px; }
    .ei-shortcut kbd {
      font-family: 'Inter',system-ui,sans-serif; font-size: 9.5px; font-weight: 600; color: #1d1d1f;
      background: rgba(0,0,0,0.05); border: 0.5px solid rgba(0,0,0,0.1);
      padding: 2px 5px; border-radius: 3px; line-height: 1;
    }
    .ei-close-btn {
      width: 24px; height: 24px; border-radius: 50%;
      background: rgba(0,0,0,0.05); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.12s; flex-shrink: 0;
    }
    .ei-close-btn:hover { background: rgba(220,38,38,0.1); }
    .ei-close-btn svg { width: 11px; height: 11px; color: #86868b; }
    .ei-close-btn:hover svg { color: #dc2626; }

    /* Toast */
    .ei-toast {
      position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(20px);
      background: rgba(0,0,0,0.82); backdrop-filter: blur(12px);
      color: #fff; padding: 9px 18px; border-radius: 10px;
      font-size: 12.5px; font-weight: 500;
      opacity: 0; transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
      pointer-events: none; display: flex; align-items: center; gap: 7px;
    }
    .ei-toast.--show { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }
    .ei-toast svg { width: 13px; height: 13px; color: #3DC4BF; }
    `;
  }
})();
