(function () {
  var TEXT = {
    title: 'We use cookies',
    body: 'Just the good kind \u2014 to remember your cart and make your visit smoother. No spam. You can review our',
    learnMore: 'Privacy policy',
    accept: 'Sounds good',
    decline: 'No thanks',
    manage: 'Manage choices',
    close: 'Close cookie banner'
  };
  var PRIVACY_FALLBACK_URL = '/policies/privacy-policy';
  var BANNER_CLASS = 'baf-cookie-consent-banner';
  var CLOSE_BUTTON_CLASS = 'baf-cookie-consent-close';
  var BACKDROP_ID = 'baf-cookie-consent-backdrop';
  var STYLE_ID = 'baf-cookie-consent-style';
  var DISMISSED_STORAGE_KEY = 'baf_cookie_consent_dismissed';
  var DISMISSED_AT_STORAGE_KEY = 'baf_cookie_consent_dismissed_at';
  var DISMISSED_COOKIE = 'baf_cookie_consent_dismissed';
  var CUSTOM_CHOICE_STORAGE_KEY = 'baf_cookie_consent_choice';
  var CUSTOM_CHOICE_COOKIE = 'baf_cookie_consent_choice';
  var SESSION_CHOICE_STORAGE_KEY = 'baf_cookie_consent_session_choice';
  var API_FEATURE = { name: 'consent-tracking-api', version: '0.1' };
  var RECENT_CHOICE_GRACE = 30000;
  var privacyCheckPending = false;
  var lastConsentChoiceAt = 0;
  var dismissedThisPage = false;
  var refreshFrame = null;

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function getCookie(name) {
    var prefix = name + '=';
    var cookies = document.cookie ? document.cookie.split('; ') : [];

    for (var i = 0; i < cookies.length; i += 1) {
      if (cookies[i].indexOf(prefix) === 0) return cookies[i].slice(prefix.length);
    }

    return '';
  }

  function hasDismissedConsent() {
    try {
      if (window.localStorage && window.localStorage.getItem(DISMISSED_STORAGE_KEY) === '1') return true;
    } catch (e) {}

    return getCookie(DISMISSED_COOKIE) === '1';
  }

  function hasSessionConsentChoice() {
    if (dismissedThisPage) return true;

    try {
      return window.sessionStorage && window.sessionStorage.getItem(SESSION_CHOICE_STORAGE_KEY) === '1';
    } catch (e) {}

    return false;
  }

  function setDismissedConsent() {
    lastConsentChoiceAt = Date.now();
    dismissedThisPage = true;

    try {
      if (window.localStorage) {
        window.localStorage.setItem(DISMISSED_STORAGE_KEY, '1');
        window.localStorage.setItem(DISMISSED_AT_STORAGE_KEY, String(lastConsentChoiceAt));
        window.localStorage.removeItem(CUSTOM_CHOICE_STORAGE_KEY);
      }
    } catch (e) {}

    try {
      if (window.sessionStorage) {
        window.sessionStorage.setItem(SESSION_CHOICE_STORAGE_KEY, '1');
      }
    } catch (e) {}

    var secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = DISMISSED_COOKIE + '=1; Max-Age=31536000; path=/; SameSite=Lax' + secure;
    document.cookie = CUSTOM_CHOICE_COOKIE + '=; Max-Age=0; path=/; SameSite=Lax' + secure;
  }

  function clearDismissedConsent() {
    try {
      if (window.localStorage) {
        window.localStorage.removeItem(DISMISSED_STORAGE_KEY);
        window.localStorage.removeItem(DISMISSED_AT_STORAGE_KEY);
        window.localStorage.removeItem(CUSTOM_CHOICE_STORAGE_KEY);
      }
    } catch (e) {}

    try {
      if (window.sessionStorage) {
        window.sessionStorage.removeItem(SESSION_CHOICE_STORAGE_KEY);
      }
    } catch (e) {}

    var secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = DISMISSED_COOKIE + '=; Max-Age=0; path=/; SameSite=Lax' + secure;
    document.cookie = CUSTOM_CHOICE_COOKIE + '=; Max-Age=0; path=/; SameSite=Lax' + secure;
  }

  function getCustomerPrivacy() {
    return window.Shopify && window.Shopify.customerPrivacy ? window.Shopify.customerPrivacy : null;
  }

  function loadPrivacyApi(callback) {
    var customerPrivacy = getCustomerPrivacy();

    if (customerPrivacy && typeof customerPrivacy.setTrackingConsent === 'function') {
      callback(customerPrivacy);
      return;
    }

    if (window.Shopify && typeof window.Shopify.loadFeatures === 'function') {
      window.Shopify.loadFeatures([API_FEATURE], function () {
        callback(getCustomerPrivacy());
      });
      return;
    }

    callback(null);
  }

  function privacyApiWantsBanner(customerPrivacy) {
    if (!customerPrivacy) return false;

    try {
      if (typeof customerPrivacy.shouldShowBanner === 'function' && customerPrivacy.shouldShowBanner()) return true;
    } catch (e) {}

    try {
      if (typeof customerPrivacy.getTrackingConsent === 'function' && customerPrivacy.getTrackingConsent() === 'no_interaction') return true;
    } catch (e) {}

    try {
      if (typeof customerPrivacy.currentVisitorConsent === 'function') {
        var consent = customerPrivacy.currentVisitorConsent() || {};
        return consent.analytics === '' &&
          consent.marketing === '' &&
          consent.preferences === '' &&
          consent.sale_of_data === '';
      }
    } catch (e) {}

    return false;
  }

  function reconcileDismissedConsent(callback) {
    if (!hasDismissedConsent()) {
      callback(false);
      return;
    }

    if (hasSessionConsentChoice()) {
      callback(false);
      return;
    }

    if (Date.now() - lastConsentChoiceAt < RECENT_CHOICE_GRACE) {
      callback(false);
      return;
    }

    if (privacyCheckPending) {
      callback(false);
      return;
    }

    privacyCheckPending = true;
    loadPrivacyApi(function (customerPrivacy) {
      privacyCheckPending = false;

      if (!privacyApiWantsBanner(customerPrivacy)) {
        callback(false);
        return;
      }

      clearDismissedConsent();
      callback(true);
    });
  }

  function isVisible(element) {
    if (!element || !(element instanceof Element)) return false;
    var style = window.getComputedStyle(element);
    var rect = element.getBoundingClientRect();
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + BACKDROP_ID + ' {',
      '  position: fixed;',
      '  inset: 0;',
      '  z-index: 2147483000;',
      '  background: rgba(255, 255, 255, 0.81);',
      '  opacity: 0;',
      '  visibility: hidden;',
      '  pointer-events: none;',
      '  transition: opacity 0.3s, visibility 0.3s;',
      '}',
      '#' + BACKDROP_ID + '.is-visible {',
      '  opacity: 1;',
      '  visibility: visible;',
      '  pointer-events: auto;',
      '}',
      '.shopify-pc__banner__dialog.' + BANNER_CLASS + ',',
      '#shopify-pc__banner.' + BANNER_CLASS + ' {',
      '  position: fixed !important;',
      '  top: 50% !important;',
      '  left: 50% !important;',
      '  right: auto !important;',
      '  bottom: auto !important;',
      '  transform: translate(-50%, -50%) !important;',
      '  z-index: 2147483001 !important;',
      '  border-radius: 16px !important;',
      '  box-sizing: border-box !important;',
      '  display: flex !important;',
      '  flex-direction: column !important;',
      '  gap: 18px !important;',
      '  width: min(560px, calc(100vw - 32px)) !important;',
      '  max-width: min(560px, calc(100vw - 32px)) !important;',
      '  min-width: 0 !important;',
      '  height: auto !important;',
      '  min-height: 0 !important;',
      '  max-height: calc(100vh - 32px) !important;',
      '  overflow: auto !important;',
      '  padding: 34px 36px 28px !important;',
      '  background: #fff !important;',
      '  color: var(--brown, #4C443F) !important;',
      '  box-shadow: 0 12px 30px rgba(76, 68, 63, 0.22) !important;',
      '  font-family: var(--baf-text-family, inherit) !important;',
      '  text-align: left !important;',
      '}',
      '.' + BANNER_CLASS + ' .baf-cookie-consent-title,',
      '.shopify-pc__banner__dialog.' + BANNER_CLASS + ' .baf-cookie-consent-title,',
      '#shopify-pc__banner.' + BANNER_CLASS + ' .baf-cookie-consent-title {',
      '  color: var(--brown, #4C443F) !important;',
      '  font-family: "display", var(--font-accent--family, "Times New Roman", serif) !important;',
      '  font-weight: 400 !important;',
      '  margin: 0 0 8px !important;',
      '  font-size: 30px !important;',
      '  line-height: 0.95 !important;',
      '}',
      '.' + BANNER_CLASS + ' .baf-cookie-consent-text,',
      '.shopify-pc__banner__dialog.' + BANNER_CLASS + ' .baf-cookie-consent-text,',
      '#shopify-pc__banner.' + BANNER_CLASS + ' .baf-cookie-consent-text {',
      '  margin: 0 !important;',
      '  color: var(--brown, #4C443F) !important;',
      '  font-size: 16px !important;',
      '  line-height: 1.32 !important;',
      '}',
      '.' + BANNER_CLASS + ' .baf-cookie-consent-text a,',
      '.shopify-pc__banner__dialog.' + BANNER_CLASS + ' .baf-cookie-consent-text a,',
      '#shopify-pc__banner.' + BANNER_CLASS + ' .baf-cookie-consent-text a {',
      '  color: inherit !important;',
      '  text-decoration: underline !important;',
      '  text-underline-offset: 2px !important;',
      '}',
      '.' + BANNER_CLASS + ' button,',
      '.' + BANNER_CLASS + ' a {',
      '  font-family: var(--baf-text-family, inherit) !important;',
      '}',
      '.' + BANNER_CLASS + ' .baf-cookie-consent-accept,',
      '.shopify-pc__banner__dialog.' + BANNER_CLASS + ' .baf-cookie-consent-accept,',
      '#shopify-pc__banner.' + BANNER_CLASS + ' .baf-cookie-consent-accept {',
      '  display: inline-flex !important;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  flex: 0 1 auto !important;',
      '  width: auto !important;',
      '  min-height: 48px !important;',
      '  padding: 12px 24px !important;',
      '  border: 0 !important;',
      '  border-radius: 999px !important;',
      '  background: var(--brown, #4C443F) !important;',
      '  color: #fff !important;',
      '  font-weight: 700 !important;',
      '  text-decoration: none !important;',
      '}',
      '.' + BANNER_CLASS + ' .baf-cookie-consent-decline,',
      '.' + BANNER_CLASS + ' .baf-cookie-consent-manage,',
      '.shopify-pc__banner__dialog.' + BANNER_CLASS + ' .baf-cookie-consent-decline,',
      '.shopify-pc__banner__dialog.' + BANNER_CLASS + ' .baf-cookie-consent-manage,',
      '#shopify-pc__banner.' + BANNER_CLASS + ' .baf-cookie-consent-decline,',
      '#shopify-pc__banner.' + BANNER_CLASS + ' .baf-cookie-consent-manage {',
      '  display: inline-flex !important;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  flex: 0 1 auto !important;',
      '  width: auto !important;',
      '  min-height: 0 !important;',
      '  padding: 6px 8px !important;',
      '  background: transparent !important;',
      '  border: 0 !important;',
      '  box-shadow: none !important;',
      '  color: var(--brown, #4C443F) !important;',
      '  font-weight: 700 !important;',
      '  text-decoration: underline !important;',
      '  text-underline-offset: 3px !important;',
      '}',
      '.' + BANNER_CLASS + ' .' + CLOSE_BUTTON_CLASS + ',',
      '.shopify-pc__banner__dialog.' + BANNER_CLASS + ' .' + CLOSE_BUTTON_CLASS + ',',
      '#shopify-pc__banner.' + BANNER_CLASS + ' .' + CLOSE_BUTTON_CLASS + ' {',
      '  position: absolute !important;',
      '  top: 14px !important;',
      '  right: 14px !important;',
      '  z-index: 2 !important;',
      '  display: inline-flex !important;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  width: 32px !important;',
      '  height: 32px !important;',
      '  min-width: 32px !important;',
      '  min-height: 32px !important;',
      '  padding: 0 !important;',
      '  border: 0 !important;',
      '  border-radius: 999px !important;',
      '  background: transparent !important;',
      '  color: var(--brown, #4C443F) !important;',
      '  box-shadow: none !important;',
      '  cursor: pointer !important;',
      '  font-family: var(--baf-text-family, inherit) !important;',
      '  font-size: 26px !important;',
      '  font-weight: 400 !important;',
      '  line-height: 1 !important;',
      '  text-decoration: none !important;',
      '}',
      '.' + BANNER_CLASS + ' button:focus,',
      '.' + BANNER_CLASS + ' button:focus-visible,',
      '.' + BANNER_CLASS + ' button:active,',
      '.' + BANNER_CLASS + ' a:focus,',
      '.' + BANNER_CLASS + ' a:focus-visible,',
      '.' + BANNER_CLASS + ' a:active,',
      '.shopify-pc__banner__dialog.' + BANNER_CLASS + ' button:focus,',
      '.shopify-pc__banner__dialog.' + BANNER_CLASS + ' button:focus-visible,',
      '.shopify-pc__banner__dialog.' + BANNER_CLASS + ' button:active,',
      '.shopify-pc__banner__dialog.' + BANNER_CLASS + ' a:focus,',
      '.shopify-pc__banner__dialog.' + BANNER_CLASS + ' a:focus-visible,',
      '.shopify-pc__banner__dialog.' + BANNER_CLASS + ' a:active,',
      '#shopify-pc__banner.' + BANNER_CLASS + ' button:focus,',
      '#shopify-pc__banner.' + BANNER_CLASS + ' button:focus-visible,',
      '#shopify-pc__banner.' + BANNER_CLASS + ' button:active,',
      '#shopify-pc__banner.' + BANNER_CLASS + ' a:focus,',
      '#shopify-pc__banner.' + BANNER_CLASS + ' a:focus-visible,',
      '#shopify-pc__banner.' + BANNER_CLASS + ' a:active {',
      '  outline: 0 !important;',
      '  box-shadow: none !important;',
      '  transform: none !important;',
      '  filter: none !important;',
      '}'
    ].join('\n');

    document.head.appendChild(style);
  }

  function getBackdrop() {
    var backdrop = document.getElementById(BACKDROP_ID);
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.id = BACKDROP_ID;
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function hasConsentContent(element) {
    var text = normalizeText(element.textContent);
    return /cookie consent|we use cookies|we and our partners|just the good kind/i.test(text) &&
      /accept|sounds good/i.test(text);
  }

  function findCookieBanner(includeHidden) {
    var candidates = Array.from(document.querySelectorAll(
      '.shopify-pc__banner__dialog, #shopify-pc__banner'
    ));

    return candidates.find(function (element) {
      return hasConsentContent(element) && (includeHidden || isVisible(element));
    }) || null;
  }

  function revealCookieSurface(element) {
    if (!element) return;

    element.style.removeProperty('display');
    element.removeAttribute('aria-hidden');
  }

  function hideCookieSurfaces() {
    document.documentElement.classList.remove('baf-cookie-consent-visible');

    var backdrop = document.getElementById(BACKDROP_ID);
    if (backdrop) backdrop.classList.remove('is-visible');

    Array.from(document.querySelectorAll('.shopify-pc__banner__dialog, #shopify-pc__banner')).forEach(function (element) {
      if (!hasConsentContent(element) && !element.classList.contains(BANNER_CLASS)) return;

      element.style.setProperty('display', 'none', 'important');
      element.setAttribute('aria-hidden', 'true');
    });
  }

  function isFinalConsentChoice(element) {
    var text = normalizeText(element && element.textContent);

    return /^(accept(?: all)?|sounds good|decline(?: all)?|no thanks|save preferences|save choices|confirm choices)$/i.test(text);
  }

  function findSmallestTextElement(root, pattern, selector) {
    var elements = Array.from(root.querySelectorAll(selector || 'p, div, span, h1, h2, h3, [role="heading"]'))
      .filter(function (element) {
        return pattern.test(normalizeText(element.textContent));
      });

    elements.sort(function (a, b) {
      return normalizeText(a.textContent).length - normalizeText(b.textContent).length;
    });

    return elements[0] || null;
  }

  function findAction(root, pattern) {
    return Array.from(root.querySelectorAll('button, a')).find(function (element) {
      return pattern.test(normalizeText(element.textContent));
    }) || null;
  }

  function getPrivacyHref(root) {
    var scope = root || document;
    var link = Array.from(scope.querySelectorAll('a')).find(function (anchor) {
      var href = anchor.getAttribute('href') || '';
      var text = normalizeText(anchor.textContent);
      return /privacy|policy/i.test(href) || /privacy policy|learn more/i.test(text);
    });

    return link ? link.href : PRIVACY_FALLBACK_URL;
  }

  function ensureCloseButton(root) {
    var close = root.querySelector('.' + CLOSE_BUTTON_CLASS);
    if (!close) {
      close = document.createElement('button');
      close.type = 'button';
      close.className = CLOSE_BUTTON_CLASS;
      close.textContent = '\u00d7';
      root.appendChild(close);
    }

    close.setAttribute('aria-label', TEXT.close);
    close.setAttribute('title', TEXT.close);
  }

  function setBodyText(element, privacyHref) {
    if (!element || element.dataset.bafCookieText === 'true') return;

    element.textContent = '';
    element.classList.add('baf-cookie-consent-text');
    element.appendChild(document.createTextNode(TEXT.body + ' '));

    var link = document.createElement('a');
    link.href = privacyHref;
    link.textContent = TEXT.learnMore;
    element.appendChild(link);
    element.dataset.bafCookieText = 'true';
  }

  function applyCopy(root) {
    var privacyHref = getPrivacyHref(root);
    var title = findSmallestTextElement(root, /cookie consent|we use cookies/i, 'h1, h2, h3, [role="heading"], div, span, p');
    var body = findSmallestTextElement(root, /just the good kind|we and our partners|including shopify|use cookies and other technologies/i);
    var accept = findAction(root, /^(accept(?: all)?|sounds good)$/i);
    var decline = findAction(root, /^(decline(?: all)?|no thanks)$/i);
    var manage = findAction(root, /manage preferences|manage choices/i);

    if (title) {
      title.textContent = TEXT.title;
      title.classList.add('baf-cookie-consent-title');
    }

    setBodyText(body, privacyHref);
    ensureCloseButton(root);

    if (accept) {
      accept.textContent = TEXT.accept;
      accept.classList.add('baf-cookie-consent-accept');
    }

    if (decline) {
      decline.textContent = TEXT.decline;
      decline.classList.add('baf-cookie-consent-decline');
    }

    if (manage) {
      manage.textContent = TEXT.manage;
      manage.classList.add('baf-cookie-consent-manage');
    }
  }

  function recordDeclinedConsent(callback) {
    var done = false;

    function finish() {
      if (done) return;
      done = true;
      if (typeof callback === 'function') callback();
    }

    loadPrivacyApi(function (customerPrivacy) {
      if (!customerPrivacy || typeof customerPrivacy.setTrackingConsent !== 'function') {
        finish();
        return;
      }

      try {
        customerPrivacy.setTrackingConsent(false, finish);
        window.setTimeout(finish, 500);
      } catch (e) {
        finish();
      }
    });
  }

  function dismissAsDeclined(banner) {
    var decline = banner && findAction(banner, /^(decline(?: all)?|no thanks)$/i);

    setDismissedConsent();

    if (decline && !decline.disabled) {
      decline.click();
    }

    recordDeclinedConsent(hideCookieSurfaces);
    window.setTimeout(hideCookieSurfaces, 80);
    window.setTimeout(hideCookieSurfaces, 300);
  }

  function refresh() {
    injectStyle();

    if (hasDismissedConsent()) {
      hideCookieSurfaces();

      reconcileDismissedConsent(function (wasCleared) {
        if (wasCleared) {
          refresh();
        }
      });
      return;
    }

    var banner = findCookieBanner(true);
    var backdrop = getBackdrop();

    revealCookieSurface(banner);

    if (!banner || !isVisible(banner)) {
      document.documentElement.classList.remove('baf-cookie-consent-visible');
      backdrop.classList.remove('is-visible');
      return;
    }

    banner.classList.add(BANNER_CLASS);
    applyCopy(banner);
    document.documentElement.classList.add('baf-cookie-consent-visible');
    backdrop.classList.add('is-visible');
  }

  function scheduleRefresh() {
    if (refreshFrame !== null) return;

    refreshFrame = window.requestAnimationFrame(function () {
      refreshFrame = null;
      refresh();
    });
  }

  function init() {
    refresh();

    var observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

    document.addEventListener('click', function (event) {
      var action = event.target.closest('.' + BANNER_CLASS + ' button, .' + BANNER_CLASS + ' a');

      if (action && action.classList.contains(CLOSE_BUTTON_CLASS)) {
        event.preventDefault();
        dismissAsDeclined(action.closest('.' + BANNER_CLASS));
        return;
      }

      if (action && isFinalConsentChoice(action)) {
        setDismissedConsent();
        window.setTimeout(hideCookieSurfaces, 80);
        window.setTimeout(hideCookieSurfaces, 300);
        return;
      }

      if (action) {
        window.setTimeout(refresh, 80);
        window.setTimeout(refresh, 300);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
