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

  /* ==================================================================
     评论区光标（覆盖层）
     ------------------------------------------------------------------
     giscus 是跨域 iframe，父页面 CSS 进不到它内部，评论区内只能显示
     系统箭头。这里在 iframe 上方画一个与主题同款的像素光标来模拟。

     判定用【坐标】而非 event.target：
     giscus 的 iframe 是异步注入的，尺寸又常小于容器，用 target 判断
     会在容器边缘几像素上误判为"已离开"，导致光标闪烁。
     ================================================================== */
  var commentCursor = null;

  var COMMENT_ZONE = '#comments, #giscus, #utterances, .giscus-frame';

  function cursorLayer() {
    if (commentCursor && commentCursor.isConnected) return commentCursor;
    commentCursor = document.createElement('div');
    commentCursor.id = 'ak-iframe-cursor';
    document.body.appendChild(commentCursor);
    return commentCursor;
  }

  /** 指针坐标是否落在评论区的外接矩形内 */
  function inCommentZone(x, y) {
    var nodes = document.querySelectorAll(COMMENT_ZONE);
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect();
      // 跳过尚未注入 / 没有尺寸的容器
      if (r.width < 16 || r.height < 16) continue;
      if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return true;
    }
    return false;
  }

  function initCommentCursor() {
    if (initCommentCursor.done) return;
    initCommentCursor.done = true;

    var layer = cursorLayer();
    var shown = false;
    var raf = 0;
    var px = 0;
    var py = 0;

    function paint() {
      raf = 0;
      layer.style.left = px + 'px';
      layer.style.top = py + 'px';
    }

    function show(on) {
      if (on === shown) return;
      shown = on;
      layer.classList.toggle('on', on);
    }

    function track(ev) {
      if (ev.pointerType && ev.pointerType !== 'mouse') {
        show(false);
        return;
      }
      px = ev.clientX;
      py = ev.clientY;
      // 先定位再决定是否显示，避免第一帧出现在旧位置
      if (!raf) raf = window.requestAnimationFrame(paint);
      show(inCommentZone(px, py));
    }

    document.addEventListener('pointermove', track, { passive: true });
    document.addEventListener('mousemove', track, { passive: true });
    document.addEventListener('pointerleave', function () { show(false); }, { passive: true });
    window.addEventListener('blur', function () { show(false); });
    document.addEventListener('scroll', function () { show(false); }, { passive: true, capture: true });
    document.addEventListener('pjax:success', function () { show(false); });
  }

  function start() {
    bind();
    refreshA11y();
    initCommentCursor();
    // pjax 的 DOM 替换可能晚于 DOMContentLoaded
    window.setTimeout(refreshA11y, 600);
    window.setTimeout(initCommentCursor, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
