(() => {
  // Match the existing product theme setting without loading auth, chat or
  // other domain runtimes on an error document.
  let theme;
  try {
    const saved = localStorage.getItem('myeongha.productTheme.v1');
    theme = saved === 'light' || saved === 'dark' ? saved : null;
  } catch { /* private browsing can block storage */ }
  if (!theme) theme = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;


  // Public 404/5xx documents do not load the application or its private runtime.
  // Use the same persisted five-locale preference for all public error statuses.
  const ERROR_CHROME = Object.freeze({
  "ja-JP": {
    "title": "ページ案内 · 命河",
    "meta": "命河のエラーページ案内",
    "brand": "命河のホームへ",
    "contact": "お問い合わせ",
    "kicker": "サービスのご案内",
    "home": "ホームに戻る",
    "retry": "再試行",
    "back": "前のページ",
    "support": "問題が続く場合はお問い合わせください。"
  },
  "zh-TW": {
    "title": "頁面說明 · 命河",
    "meta": "命河頁面錯誤說明",
    "brand": "前往命河首頁",
    "contact": "聯絡客服",
    "kicker": "服務說明",
    "home": "返回首頁",
    "retry": "重試",
    "back": "上一頁",
    "support": "若問題持續發生，請聯絡我們。"
  },
  "en-US": {
    "title": "Page notice · MyeongHa",
    "meta": "MyeongHa page error notice",
    "brand": "Go to MyeongHa home",
    "contact": "Contact us",
    "kicker": "Service notice",
    "home": "Go home",
    "retry": "Try again",
    "back": "Previous page",
    "support": "If the problem continues, please contact us."
  },
  "zh-CN": {
    "title": "页面说明 · 命河",
    "meta": "命河页面错误说明",
    "brand": "前往命河首页",
    "contact": "联系我们",
    "kicker": "服务说明",
    "home": "返回首页",
    "retry": "重试",
    "back": "上一页",
    "support": "如果问题持续出现，请联系我们。"
  }
});
  const ERROR_COPY = Object.freeze({
  "404": {
    "ja-JP": [
      "ページが見つかりません。",
      "お探しのページが存在しないか、URLが変更された可能性があります。"
    ],
    "zh-TW": [
      "找不到頁面。",
      "您要求的頁面可能不存在，或網址已變更。"
    ],
    "en-US": [
      "Page not found.",
      "The page may no longer exist or its address may have changed."
    ],
    "zh-CN": [
      "找不到页面。",
      "您请求的页面可能不存在，或地址已更改。"
    ]
  },
  "500": {
    "ja-JP": [
      "一時的なエラーが発生しました。",
      "ページを表示できませんでした。しばらくしてからもう一度お試しください。"
    ],
    "zh-TW": [
      "發生暫時性錯誤。",
      "無法顯示此頁面，請稍後重試。"
    ],
    "en-US": [
      "A temporary error occurred.",
      "The page could not be displayed. Please try again shortly."
    ],
    "zh-CN": [
      "发生暂时性错误。",
      "无法显示此页面，请稍后重试。"
    ]
  },
  "501": {
    "ja-JP": [
      "この機能は現在サポートされていません。",
      "リクエストされた機能はまだ提供されていません。"
    ],
    "zh-TW": [
      "目前不支援此功能。",
      "您要求的功能尚未提供。"
    ],
    "en-US": [
      "This feature is not supported yet.",
      "The requested feature is not currently available."
    ],
    "zh-CN": [
      "目前不支持此功能。",
      "您请求的功能尚未提供。"
    ]
  },
  "502": {
    "ja-JP": [
      "サービスへの接続に問題が発生しました。",
      "リクエストを完了できませんでした。しばらくしてからもう一度お試しください。"
    ],
    "zh-TW": [
      "服務連線發生問題。",
      "無法完成要求，請稍後重試。"
    ],
    "en-US": [
      "There was a problem connecting to the service.",
      "Your request could not be completed. Please try again shortly."
    ],
    "zh-CN": [
      "服务连接出现问题。",
      "无法完成请求，请稍后重试。"
    ]
  },
  "503": {
    "ja-JP": [
      "一時的にご利用いただけません。",
      "現在ページを表示できません。しばらくしてからもう一度お試しください。"
    ],
    "zh-TW": [
      "服務暫時無法使用。",
      "目前無法顯示此頁面，請稍後重試。"
    ],
    "en-US": [
      "Temporarily unavailable.",
      "This page is currently unavailable. Please try again shortly."
    ],
    "zh-CN": [
      "服务暂时不可用。",
      "目前无法显示此页面，请稍后重试。"
    ]
  },
  "504": {
    "ja-JP": [
      "応答が遅れています。",
      "ページの応答に時間がかかっています。もう一度お試しください。"
    ],
    "zh-TW": [
      "回應逾時。",
      "頁面回應時間過長，請重試。"
    ],
    "en-US": [
      "The response is taking too long.",
      "The page is taking longer than expected to respond. Please try again."
    ],
    "zh-CN": [
      "响应超时。",
      "页面响应时间过长，请重试。"
    ]
  }
});
  let sourceDocumentCopy = null;
  const sourceFields = Object.freeze({
    brand: ['.mh-error-brand', 'aria-label'],
    contact: ['.mh-error-header-help', 'textContent'],
    kicker: ['.mh-error-kicker', 'textContent'],
    home: ['.mh-error-primary', 'textContent'],
    retry: ['[data-error-retry]', 'textContent'],
    back: ['[data-error-back]', 'textContent'],
    support: ['.mh-error-support', 'textContent'],
  });
  function paintErrorLocale() {
    if (!sourceDocumentCopy) {
      sourceDocumentCopy = {
        title: document.title,
        meta: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
        statusTitle: document.querySelector('[data-error-title]')?.textContent ?? '',
        statusDescription: document.querySelector('[data-error-description]')?.textContent ?? '',
        chrome: Object.fromEntries(Object.entries(sourceFields).map(([key, [selector, property]]) => {
          const node = document.querySelector(selector);
          return [key, property === 'textContent' ? node?.textContent ?? '' : node?.getAttribute(property) ?? ''];
        })),
      };
    }
    let locale = 'ko-KR';
    try {
      const value = localStorage.getItem('myeongha.ui.locale.v1');
      if (Object.hasOwn(ERROR_CHROME, value)) locale = value;
    } catch { /* restricted browsing: keep Korean source */ }
    document.documentElement.lang = locale;
    const chrome = locale === 'ko-KR'
      ? { ...sourceDocumentCopy.chrome, title: sourceDocumentCopy.title, meta: sourceDocumentCopy.meta }
      : ERROR_CHROME[locale];
    const code = document.querySelector('[data-error-code]')?.textContent?.trim() ?? '404';
    const copy = locale === 'ko-KR'
      ? [sourceDocumentCopy.statusTitle, sourceDocumentCopy.statusDescription]
      : (ERROR_COPY[code] ?? ERROR_COPY[404])[locale];
    const setText = (selector, value) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = value;
    };
    document.title = chrome.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', chrome.meta);
    document.querySelector('.mh-error-brand')?.setAttribute('aria-label', chrome.brand);
    setText('.mh-error-header-help', chrome.contact);
    setText('.mh-error-kicker', chrome.kicker);
    setText('[data-error-title]', copy[0]);
    setText('[data-error-description]', copy[1]);
    setText('.mh-error-primary', chrome.home);
    setText('[data-error-retry]', chrome.retry);
    setText('[data-error-back]', chrome.back);
    setText('.mh-error-support', chrome.support);
  }

  document.addEventListener('DOMContentLoaded', () => {
    paintErrorLocale();
    document.querySelector('[data-error-back]')?.addEventListener('click', (event) => {
      let sameOrigin = false;
      try { sameOrigin = Boolean(document.referrer && new URL(document.referrer).origin === location.origin); } catch {}
      if (sameOrigin && history.length > 1) {
        event.preventDefault();
        history.back();
      }
    });
    document.querySelector('[data-error-retry]')?.addEventListener('click', () => location.reload());
  }, { once: true });
  window.addEventListener?.('storage', (event) => {
    if (event.key === 'myeongha.ui.locale.v1') paintErrorLocale();
  });
})();
