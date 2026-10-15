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
    // pjax 的 DOM 替换可能晚于 DOMContentLoaded
    window.setTimeout(refreshA11y, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
