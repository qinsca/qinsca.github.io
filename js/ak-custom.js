/* =========================================================================
   hexo-theme-arknights 魔改脚本：夜间模式切换增强
   - 读取/写入 localStorage，配合 <html theme-mode> 属性
   - 切换时同步 giscus 评论主题、高亮粒子画布与无障碍属性
   - 支持键盘：`c`（主题自带）与 `D`，忽略输入框内的按键
   - 与主题自带 pjax 共存（按钮被替换后自动重新接管）
   ========================================================================= */
(function () {
  'use strict';

  var STORAGE_KEY = 'theme-mode';
  var BTN_ID = 'color-mode';
  var badge = null;
  var timer = null;

  var Z = {
    light: '\u2600 LIGHT',
    dark: '\u263E DARK',
  };

  function getMode() {
    var m = document.documentElement.getAttribute('theme-mode');
    return m === 'light' ? 'light' : 'dark';
  }

  function store(mode) {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch (e) {
      /* 隐私模式等场景忽略 */
    }
  }

  function syncGiscus() {
    try {
      if (window.giscusManager && typeof window.giscusManager.syncTheme === 'function') {
        window.giscusManager.syncTheme();
      }
    } catch (e) {
      /* giscus 未加载时忽略 */
    }
  }

  /**
   * 与主题自带的 ColorMode.change() 等价的模式切换，
   * 但补上了：页面过渡动画、无障碍属性刷新、giscus 主题同步、画布粒子恢复。
   */
  function toggle() {
    var html = document.documentElement;
    var next = getMode() === 'dark' ? 'light' : 'dark';

    html.classList.add('ak-theme-changing');
    window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      html.classList.remove('ak-theme-changing');
    }, 500);

    html.setAttribute('theme-mode', next);
    store(next);
    refreshA11y();

    // 切换瞬间的整页底图淡入，避免背景突变
    var bg = document.createElement('div');
    bg.style.cssText =
      'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-99999;' +
      'background:var(--' + (next === 'dark' ? 'dark' : 'light') + '-background);' +
      'background-size:cover;background-position:50% 0;background-repeat:no-repeat;' +
      'background-attachment:fixed;transition:opacity 1.1s;opacity:1;pointer-events:none;';
    document.body.insertBefore(bg, document.body.firstChild);
    window.setTimeout(function () {
      bg.style.opacity = '0';
    }, 30);
    window.setTimeout(function () {
      if (bg.parentNode) bg.parentNode.removeChild(bg);
    }, 1300);

    syncGiscus();
  }

  function toggleBtn() {
    return document.getElementById(BTN_ID);
  }

  function refreshA11y() {
    var btn = toggleBtn();
    if (!btn) return;
    var mode = getMode();
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', mode === 'dark' ? '\u5207\u6362\u5230\u65e5\u95f4\u6A21\u5F0F' : '\u5207\u6362\u5230\u591C\u95F4\u6A21\u5F0F');
    btn.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
    btn.setAttribute(
      'title',
      (mode === 'dark' ? '\u5F53\u524D\uFF1A\u591C\u95F4' : '\u5F53\u524D\uFF1A\u65E5\u95F4') +
        ' \u00B7 \u70B9\u51FB\u6216\u6309 C \u5207\u6362'
    );

    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'ak-mode-badge';
      btn.parentNode.insertBefore(badge, btn.nextSibling);
    }
    badge.textContent = 'MODE // ' + (Z[mode] || Z.dark);
  }

  function bind() {
    // 用事件委托，pjax 换页后按钮被替换也无需重新绑定
    if (bind.done) return;
    bind.done = true;

    document.addEventListener(
      'click',
      function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest('#' + BTN_ID);
        if (!btn) return;
        ev.preventDefault();
        toggle();
      },
      true
    );

    document.addEventListener('keydown', function (ev) {
      var t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      // 主题自带 `c`，这里补一个大写 D，方便单手操作
      if (ev.key === 'D' || (ev.key === 'd' && ev.shiftKey)) {
        ev.preventDefault();
        toggle();
      }
    });

    // pjax 换页 / 主题初始化完成后刷新按钮状态
    document.addEventListener('pjax:success', refreshA11y);
    document.addEventListener('pjax:complete', refreshA11y);

    // 主题自带的 ColorMode.change() 也会改 theme-mode，这里统一刷新
    new MutationObserver(function () {
      refreshA11y();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['theme-mode'] });
  }

  function start() {
    bind();
    refreshA11y();
    initIframeCursor();
    // pjax 的 DOM 替换可能晚于 DOMContentLoaded
    window.setTimeout(refreshA11y, 600);
    window.setTimeout(initIframeCursor, 600);
  }

  /* ==================================================================
     评论区光标一致化
     ------------------------------------------------------------------
     giscus 是 giscus.app 的跨域 iframe，父页面的 cursor 规则进不到
     它内部的文档，所以整站的像素光标一进评论区就失效。

     由于无法穿透 iframe，改成覆盖层：指针在评论区上方时隐藏原生光标，
     在指针位置画同款像素光标（样式见 ak-custom.css 第 7 节）。

     判断方式用【坐标】而不是 event.target：
     iframe 由 giscus 异步注入，尺寸往往小于 #giscus 容器，用 target
     判断会在容器边缘的几像素上误判为"已离开"，导致光标一闪一闪。
     ================================================================== */
  var iframeCursor = null;
  var CURSOR_ZONE = '#giscus, #utterances, .giscus, .giscus-frame, #comments iframe';

  function ensureCursorLayer() {
    if (iframeCursor && iframeCursor.isConnected) return iframeCursor;
    iframeCursor = document.createElement('div');
    iframeCursor.id = 'ak-iframe-cursor';
    document.body.appendChild(iframeCursor);
    return iframeCursor;
  }

  /** 指针是否落在任一评论区的外接矩形内 */
  function overCommentZone(x, y) {
    var nodes = document.querySelectorAll(CURSOR_ZONE);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || !el.getBoundingClientRect) continue;
      var r = el.getBoundingClientRect();
      // 只认有实际尺寸的元素
      if (r.width < 8 || r.height < 8) continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  }

  function initIframeCursor() {
    if (initIframeCursor.done) return;
    initIframeCursor.done = true;

    var layer = ensureCursorLayer();
    var raf = 0;
    var lastX = 0;
    var lastY = 0;
    var shown = false;

    function paint() {
      raf = 0;
      layer.style.transform =
        'translate3d(' + lastX + 'px,' + lastY + 'px,0) translate3d(-50%,-50%,0)';
    }

    function setShown(on) {
      if (on === shown) return;
      shown = on;
      layer.classList.toggle('on', on);
    }

    function onMove(ev) {
      if (ev.pointerType && ev.pointerType !== 'mouse') {
        setShown(false);
        return;
      }
      lastX = ev.clientX;
      lastY = ev.clientY;
      setShown(overCommentZone(lastX, lastY));
      if (!raf) raf = window.requestAnimationFrame(paint);
    }

    // 捕获阶段监听，iframe 内的命中也能收到（同一文档内）
    document.addEventListener('pointermove', onMove, { passive: true, capture: true });
    document.addEventListener('mousemove', onMove, { passive: true, capture: true });

    // 指针离开文档 / 滚出评论区 / 失焦时收起
    document.addEventListener('pointerleave', function () { setShown(false); }, { passive: true });
    document.addEventListener('mouseleave', function () { setShown(false); }, { passive: true });
    window.addEventListener('blur', function () { setShown(false); });
    document.addEventListener('scroll', function () { setShown(false); }, { passive: true, capture: true });

    document.addEventListener('pjax:success', function () { setShown(false); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
