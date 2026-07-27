(function () {
  var TEXT = {
    title: 'We use cookies',
    body: 'Just the good kind \u2014 to remember your cart and make your visit smoother. No spam. You can review our',
    learnMore: 'Privacy policy',
    accept: 'Sounds good',
    decline: 'No thanks',
    manage: 'Manage choices',
    close: 'Close cookie banner',
    preferencesTitle: 'Cookie choices',
    preferencesBody: 'Choose which optional cookies Bark & Frame may use.',
    necessary: 'Necessary',
    necessaryDescription: 'Required for checkout, cart and security. Always on.',
    preferences: 'Preferences',
    preferencesDescription: 'Remember choices such as language, region and currency.',
    analytics: 'Analytics',
    analyticsDescription: 'Help us understand how the shop is used.',
    marketing: 'Marketing',
    marketingDescription: 'Support personalized ads and campaign measurement.',
    saleOfData: 'Data sale or sharing',
    saleOfDataDescription: 'Allow sharing data with advertising partners where applicable.',
    save: 'Save choices',
    alwaysOn: 'Always on'
  };
  var PRIVACY_FALLBACK_URL = '/policies/privacy-policy';
  var BANNER_CLASS = 'baf-cookie-consent-banner';
  var CLOSE_BUTTON_CLASS = 'baf-cookie-consent-close';
  var BACKDROP_ID = 'baf-cookie-consent-backdrop';
  var CUSTOM_BANNER_ID = 'baf-cookie-consent-custom';
  var PREFS_ID = 'baf-cookie-consent-preferences';
  var STYLE_ID = 'baf-cookie-consent-style';
  var DISMISSED_STORAGE_KEY = 'baf_cookie_consent_dismissed';
  var DISMISSED_AT_STORAGE_KEY = 'baf_cookie_consent_dismissed_at';
  var DISMISSED_COOKIE = 'baf_cookie_consent_dismissed';
  var CUSTOM_CHOICE_STORAGE_KEY = 'baf_cookie_consent_choice';
  var CUSTOM_CHOICE_COOKIE = 'baf_cookie_consent_choice';
  var SESSION_CHOICE_STORAGE_KEY = 'baf_cookie_consent_session_choice';
  var API_FEATURE = { name: 'consent-tracking-api', version: '0.1' };
  var RECENT_CHOICE_GRACE = 30000;
  var CONSENT_CHECK_GRACE = 700;
  var OPTIONAL_CONSENT_PURPOSES = ['preferences', 'analytics', 'marketing', 'sale_of_data'];
  var privacyCheckPending = false;
  var privacyConsentState = 'unknown';
  var privacyConsentCheckPending = false;
  var initStartedAt = Date.now();
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
      if (window.localStorage && window.localStorage.getItem(CUSTOM_CHOICE_STORAGE_KEY)) return true;
    } catch (e) {}

    return getCookie(DISMISSED_COOKIE) === '1' || getCookie(CUSTOM_CHOICE_COOKIE) === '1';
  }

  function hasSessionConsentChoice() {
    if (dismissedThisPage) return true;

    try {
      return window.sessionStorage && window.sessionStorage.getItem(SESSION_CHOICE_STORAGE_KEY) === '1';
    } catch (e) {}

    return false;
  }

  function setDismissedConsent(choice) {
    lastConsentChoiceAt = Date.now();
    dismissedThisPage = true;

    try {
      if (window.localStorage) {
        window.localStorage.setItem(DISMISSED_STORAGE_KEY, '1');
        window.localStorage.setItem(DISMISSED_AT_STORAGE_KEY, String(lastConsentChoiceAt));
        window.localStorage.setItem(CUSTOM_CHOICE_STORAGE_KEY, JSON.stringify(choice || { saved: true }));
      }
    } catch (e) {}

    try {
      if (window.sessionStorage) {
        window.sessionStorage.setItem(SESSION_CHOICE_STORAGE_KEY, '1');
      }
    } catch (e) {}

    var secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = DISMISSED_COOKIE + '=1; Max-Age=31536000; path=/; SameSite=Lax' + secure;
    document.cookie = CUSTOM_CHOICE_COOKIE + '=1; Max-Age=31536000; path=/; SameSite=Lax' + secure;
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

    if (customerPrivacy) {
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

  function readCurrentVisitorConsent(customerPrivacy) {
    var consent = null;

    try {
      if (customerPrivacy && typeof customerPrivacy.currentVisitorConsent === 'function') {
        consent = customerPrivacy.currentVisitorConsent();
      }
    } catch (e) {}

    try {
      if (!consent && customerPrivacy && customerPrivacy.visitorConsent) {
        consent = customerPrivacy.visitorConsent;
      }
    } catch (e) {}

    try {
      if (!consent && customerPrivacy && customerPrivacy.value && customerPrivacy.value.visitorConsent) {
        consent = customerPrivacy.value.visitorConsent;
      }
    } catch (e) {}

    if (!consent) return null;

    return {
      analytics: consent.analytics,
      marketing: consent.marketing,
      preferences: consent.preferences,
      sale_of_data: consent.sale_of_data !== undefined ? consent.sale_of_data : consent.saleOfData
    };
  }

  function isAnsweredConsent(value) {
    return value === true ||
      value === false ||
      value === 'yes' ||
      value === 'no' ||
      value === 'true' ||
      value === 'false' ||
      value === 'granted' ||
      value === 'denied';
  }

  function hasAnyConsentDecision(consent) {
    if (!consent) return false;

    return OPTIONAL_CONSENT_PURPOSES.some(function (purpose) {
      return isAnsweredConsent(consent[purpose]);
    });
  }

  function hasNoConsentDecision(consent) {
    return consent && !hasAnyConsentDecision(consent);
  }

  function privacyApiNeedsConsent(customerPrivacy) {
    if (!customerPrivacy) return false;

    try {
      if (typeof customerPrivacy.getTrackingConsent === 'function' && customerPrivacy.getTrackingConsent() === 'no_interaction') return true;
    } catch (e) {}

    var consent = readCurrentVisitorConsent(customerPrivacy);
    if (hasNoConsentDecision(consent)) return true;

    try {
      if (typeof customerPrivacy.shouldShowBanner === 'function' && customerPrivacy.shouldShowBanner()) return true;
    } catch (e) {}

    return false;
  }

  function privacyApiHasRecordedConsent(customerPrivacy) {
    if (!customerPrivacy) return false;

    var consent = readCurrentVisitorConsent(customerPrivacy);
    if (hasAnyConsentDecision(consent)) return true;

    try {
      if (typeof customerPrivacy.getTrackingConsent === 'function') {
        return customerPrivacy.getTrackingConsent() !== 'no_interaction';
      }
    } catch (e) {}

    return false;
  }

  function requestPrivacyConsentState(force) {
    if (privacyConsentCheckPending) return;
    if (!force && privacyConsentState !== 'unknown') return;

    privacyConsentCheckPending = true;
    loadPrivacyApi(function (customerPrivacy) {
      privacyConsentCheckPending = false;

      if (!customerPrivacy) {
        privacyConsentState = 'unavailable';
      } else if (privacyApiNeedsConsent(customerPrivacy)) {
        privacyConsentState = 'needs';
      } else if (privacyApiHasRecordedConsent(customerPrivacy)) {
        privacyConsentState = 'recorded';
      } else {
        privacyConsentState = 'needs';
      }

      scheduleRefresh();
    });
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

      if (!privacyApiNeedsConsent(customerPrivacy)) {
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
      '.' + BANNER_CLASS + ',',
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
      '}',
      '.' + BANNER_CLASS + ' button {',
      '  cursor: pointer !important;',
      '}',
      '.' + BANNER_CLASS + ' button:disabled {',
      '  cursor: default !important;',
      '}',
      '.' + BANNER_CLASS + ' .baf-cookie-consent-actions {',
      '  display: flex !important;',
      '  flex-wrap: wrap !important;',
      '  align-items: center !important;',
      '  gap: 10px 14px !important;',
      '}',
      '#' + PREFS_ID + ' {',
      '  width: min(660px, calc(100vw - 32px)) !important;',
      '  max-width: min(660px, calc(100vw - 32px)) !important;',
      '}',
      '#' + PREFS_ID + ' .baf-cookie-consent-choice-list {',
      '  display: flex !important;',
      '  flex-direction: column !important;',
      '  gap: 12px !important;',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '}',
      '#' + PREFS_ID + ' .baf-cookie-consent-choice {',
      '  display: grid !important;',
      '  grid-template-columns: minmax(0, 1fr) auto !important;',
      '  align-items: center !important;',
      '  gap: 16px !important;',
      '  padding: 14px 0 !important;',
      '  border-top: 1px solid rgba(76, 68, 63, 0.18) !important;',
      '  color: var(--brown, #4C443F) !important;',
      '}',
      '#' + PREFS_ID + ' .baf-cookie-consent-choice:first-child {',
      '  border-top: 0 !important;',
      '}',
      '#' + PREFS_ID + ' .baf-cookie-consent-choice-title {',
      '  display: block !important;',
      '  margin: 0 0 4px !important;',
      '  font-weight: 700 !important;',
      '  line-height: 1.15 !important;',
      '}',
      '#' + PREFS_ID + ' .baf-cookie-consent-choice-description {',
      '  display: block !important;',
      '  margin: 0 !important;',
      '  font-size: 14px !important;',
      '  line-height: 1.32 !important;',
      '  opacity: 0.78 !important;',
      '}',
      '#' + PREFS_ID + ' .baf-cookie-consent-choice input {',
      '  width: 46px !important;',
      '  height: 26px !important;',
      '  margin: 0 !important;',
      '  appearance: none !important;',
      '  -webkit-appearance: none !important;',
      '  border: 1px solid rgba(76, 68, 63, 0.34) !important;',
      '  border-radius: 999px !important;',
      '  background: rgba(76, 68, 63, 0.12) !important;',
      '  position: relative !important;',
      '  transition: background 0.2s, border-color 0.2s !important;',
      '}',
      '#' + PREFS_ID + ' .baf-cookie-consent-choice input::before {',
      '  content: "" !important;',
      '  position: absolute !important;',
      '  top: 3px !important;',
      '  left: 3px !important;',
      '  width: 18px !important;',
      '  height: 18px !important;',
      '  border-radius: 50% !important;',
      '  background: #fff !important;',
      '  box-shadow: 0 1px 3px rgba(76, 68, 63, 0.24) !important;',
      '  transition: transform 0.2s !important;',
      '}',
      '#' + PREFS_ID + ' .baf-cookie-consent-choice input:checked {',
      '  border-color: var(--brown, #4C443F) !important;',
      '  background: var(--brown, #4C443F) !important;',
      '}',
      '#' + PREFS_ID + ' .baf-cookie-consent-choice input:checked::before {',
      '  transform: translateX(20px) !important;',
      '}',
      '#' + PREFS_ID + ' .baf-cookie-consent-choice input:disabled {',
      '  opacity: 0.62 !important;',
      '}',
      '#' + PREFS_ID + ' .baf-cookie-consent-choice-state {',
      '  display: inline-block !important;',
      '  margin-top: 6px !important;',
      '  font-size: 12px !important;',
      '  font-weight: 700 !important;',
      '  text-transform: uppercase !important;',
      '}',
      '@media (max-width: 640px) {',
      '  .' + BANNER_CLASS + ' {',
      '    padding: 30px 24px 24px !important;',
      '  }',
      '  .' + BANNER_CLASS + ' .baf-cookie-consent-actions {',
      '    align-items: stretch !important;',
      '    flex-direction: column !important;',
      '  }',
      '  .' + BANNER_CLASS + ' .baf-cookie-consent-accept,',
      '  .' + BANNER_CLASS + ' .baf-cookie-consent-decline,',
      '  .' + BANNER_CLASS + ' .baf-cookie-consent-manage {',
      '    width: 100% !important;',
      '  }',
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

  function createConsentButton(text, action, className) {
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('data-baf-cookie-action', action);
    if (className) button.className = className;
    return button;
  }

  function createActions() {
    var actions = document.createElement('div');
    actions.className = 'baf-cookie-consent-actions';
    return actions;
  }

  function createTitle(text, id) {
    var title = document.createElement('h2');
    title.className = 'baf-cookie-consent-title';
    title.textContent = text;
    if (id) title.id = id;
    return title;
  }

  function createBody(text, privacyHref) {
    var body = document.createElement('p');
    body.className = 'baf-cookie-consent-text';
    body.appendChild(document.createTextNode(text + ' '));

    var link = document.createElement('a');
    link.href = privacyHref || PRIVACY_FALLBACK_URL;
    link.textContent = TEXT.learnMore;
    body.appendChild(link);

    return body;
  }

  function createCustomBanner() {
    var banner = document.getElementById(CUSTOM_BANNER_ID);
    if (banner) return banner;

    banner = document.createElement('section');
    banner.id = CUSTOM_BANNER_ID;
    banner.className = BANNER_CLASS + ' baf-cookie-consent-custom';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'true');
    banner.setAttribute('aria-labelledby', CUSTOM_BANNER_ID + '-title');

    banner.appendChild(createTitle(TEXT.title, CUSTOM_BANNER_ID + '-title'));
    banner.appendChild(createBody(TEXT.body, getPrivacyHref(document)));

    var actions = createActions();
    actions.appendChild(createConsentButton(TEXT.accept, 'accept', 'baf-cookie-consent-accept'));
    actions.appendChild(createConsentButton(TEXT.decline, 'decline', 'baf-cookie-consent-decline'));
    actions.appendChild(createConsentButton(TEXT.manage, 'manage', 'baf-cookie-consent-manage'));
    banner.appendChild(actions);

    ensureCloseButton(banner);
    banner.style.setProperty('display', 'none', 'important');
    banner.setAttribute('aria-hidden', 'true');
    document.body.appendChild(banner);

    return banner;
  }

  function createChoice(name, title, description, checked, disabled) {
    var label = document.createElement('label');
    label.className = 'baf-cookie-consent-choice';

    var copy = document.createElement('span');
    var heading = document.createElement('span');
    var detail = document.createElement('span');

    heading.className = 'baf-cookie-consent-choice-title';
    heading.textContent = title;
    detail.className = 'baf-cookie-consent-choice-description';
    detail.textContent = description;

    copy.appendChild(heading);
    copy.appendChild(detail);

    if (disabled) {
      var state = document.createElement('span');
      state.className = 'baf-cookie-consent-choice-state';
      state.textContent = TEXT.alwaysOn;
      copy.appendChild(state);
    }

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(checked);
    input.disabled = Boolean(disabled);
    if (name) input.setAttribute('data-baf-cookie-purpose', name);

    label.appendChild(copy);
    label.appendChild(input);

    return label;
  }

  function createPreferencesDialog() {
    var dialog = document.getElementById(PREFS_ID);
    if (dialog) return dialog;

    dialog = document.createElement('section');
    dialog.id = PREFS_ID;
    dialog.className = BANNER_CLASS + ' baf-cookie-consent-preferences';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', PREFS_ID + '-title');

    dialog.appendChild(createTitle(TEXT.preferencesTitle, PREFS_ID + '-title'));
    dialog.appendChild(createBody(TEXT.preferencesBody, getPrivacyHref(document)));

    var list = document.createElement('div');
    list.className = 'baf-cookie-consent-choice-list';
    list.appendChild(createChoice('', TEXT.necessary, TEXT.necessaryDescription, true, true));
    list.appendChild(createChoice('preferences', TEXT.preferences, TEXT.preferencesDescription, false, false));
    list.appendChild(createChoice('analytics', TEXT.analytics, TEXT.analyticsDescription, false, false));
    list.appendChild(createChoice('marketing', TEXT.marketing, TEXT.marketingDescription, false, false));
    list.appendChild(createChoice('sale_of_data', TEXT.saleOfData, TEXT.saleOfDataDescription, false, false));
    dialog.appendChild(list);

    var actions = createActions();
    actions.appendChild(createConsentButton(TEXT.save, 'save', 'baf-cookie-consent-accept'));
    actions.appendChild(createConsentButton(TEXT.decline, 'decline', 'baf-cookie-consent-decline'));
    actions.appendChild(createConsentButton(TEXT.accept, 'accept', 'baf-cookie-consent-manage'));
    dialog.appendChild(actions);

    ensureCloseButton(dialog);
    dialog.style.setProperty('display', 'none', 'important');
    dialog.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dialog);

    return dialog;
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

    Array.from(document.querySelectorAll('.shopify-pc__banner__dialog, #shopify-pc__banner, #' + CUSTOM_BANNER_ID + ', #' + PREFS_ID)).forEach(function (element) {
      if (!hasConsentContent(element) && !element.classList.contains(BANNER_CLASS)) return;

      element.style.setProperty('display', 'none', 'important');
      element.setAttribute('aria-hidden', 'true');
    });
  }

  function isFinalConsentChoice(element) {
    var text = normalizeText(element && element.textContent);

    return /^(accept(?: all)?|sounds good|decline(?: all)?|reject(?: all)?|no thanks|save preferences|save choices|confirm choices)$/i.test(text);
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
    close.setAttribute('data-baf-cookie-action', 'close');
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
    var decline = findAction(root, /^(decline(?: all)?|reject(?: all)?|no thanks)$/i);
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
      accept.setAttribute('data-baf-cookie-action', 'accept');
    }

    if (decline) {
      decline.textContent = TEXT.decline;
      decline.classList.add('baf-cookie-consent-decline');
      decline.setAttribute('data-baf-cookie-action', 'decline');
    }

    if (manage) {
      manage.textContent = TEXT.manage;
      manage.classList.add('baf-cookie-consent-manage');
      manage.setAttribute('data-baf-cookie-action', 'manage');
    }
  }

  function consentPayload(value) {
    return {
      preferences: Boolean(value),
      analytics: Boolean(value),
      marketing: Boolean(value),
      sale_of_data: Boolean(value)
    };
  }

  function normalizeConsentChoice(choice) {
    var normalized = {};

    OPTIONAL_CONSENT_PURPOSES.forEach(function (purpose) {
      normalized[purpose] = Boolean(choice && choice[purpose]);
    });

    return normalized;
  }

  function consentValueAsBoolean(value, fallback) {
    if (value === true || value === 'yes' || value === 'true' || value === 'granted') return true;
    if (value === false || value === 'no' || value === 'false' || value === 'denied') return false;
    return Boolean(fallback);
  }

  function getStoredConsentChoice() {
    try {
      if (!window.localStorage) return null;

      var rawChoice = window.localStorage.getItem(CUSTOM_CHOICE_STORAGE_KEY);
      if (!rawChoice) return null;

      return normalizeConsentChoice(JSON.parse(rawChoice));
    } catch (e) {}

    return null;
  }

  function getInitialConsentChoice() {
    var customerPrivacy = getCustomerPrivacy();
    var currentConsent = readCurrentVisitorConsent(customerPrivacy);
    var storedConsent = getStoredConsentChoice();
    var initialConsent = {};

    OPTIONAL_CONSENT_PURPOSES.forEach(function (purpose) {
      var currentValue = currentConsent ? currentConsent[purpose] : undefined;
      var storedValue = storedConsent ? storedConsent[purpose] : false;
      initialConsent[purpose] = consentValueAsBoolean(currentValue, storedValue);
    });

    return initialConsent;
  }

  function syncPreferencesDialog(dialog) {
    var consent = getInitialConsentChoice();

    OPTIONAL_CONSENT_PURPOSES.forEach(function (purpose) {
      var input = dialog.querySelector('[data-baf-cookie-purpose="' + purpose + '"]');
      if (input) input.checked = Boolean(consent[purpose]);
    });
  }

  function readPreferencesDialog(dialog) {
    var consent = {};

    OPTIONAL_CONSENT_PURPOSES.forEach(function (purpose) {
      var input = dialog.querySelector('[data-baf-cookie-purpose="' + purpose + '"]');
      consent[purpose] = Boolean(input && input.checked);
    });

    return consent;
  }

  function notifyConsentChoice(choice) {
    try {
      document.dispatchEvent(new CustomEvent('bafCookieConsentUpdated', { detail: choice }));
    } catch (e) {}

    try {
      document.dispatchEvent(new Event('trackingConsentAccepted'));
    } catch (e) {}
  }

  function submitTrackingConsent(customerPrivacy, choice, finish) {
    var retriedWithoutSaleOfData = false;

    function submit(payload) {
      customerPrivacy.setTrackingConsent(payload, function (result) {
        if (!retriedWithoutSaleOfData && result && result.error && Object.prototype.hasOwnProperty.call(payload, 'sale_of_data')) {
          var retryPayload = {
            preferences: payload.preferences,
            analytics: payload.analytics,
            marketing: payload.marketing
          };

          retriedWithoutSaleOfData = true;
          submit(retryPayload);
          return;
        }

        finish();
      });
    }

    submit(choice);
  }

  function recordConsentChoice(choice, callback) {
    var done = false;
    var normalizedChoice = normalizeConsentChoice(choice);

    privacyConsentState = 'recorded';
    setDismissedConsent(normalizedChoice);

    function finish() {
      if (done) return;
      done = true;
      notifyConsentChoice(normalizedChoice);
      if (typeof callback === 'function') callback();
    }

    loadPrivacyApi(function (customerPrivacy) {
      if (!customerPrivacy || typeof customerPrivacy.setTrackingConsent !== 'function') {
        finish();
        return;
      }

      try {
        submitTrackingConsent(customerPrivacy, normalizedChoice, finish);
        window.setTimeout(finish, 800);
      } catch (e) {
        finish();
      }
    });
  }

  function hidePrimaryCookieBanners() {
    Array.from(document.querySelectorAll('.shopify-pc__banner__dialog, #shopify-pc__banner, #' + CUSTOM_BANNER_ID)).forEach(function (element) {
      if (!hasConsentContent(element) && !element.classList.contains(BANNER_CLASS)) return;

      element.style.setProperty('display', 'none', 'important');
      element.setAttribute('aria-hidden', 'true');
    });
  }

  function showPreferences() {
    injectStyle();
    hidePrimaryCookieBanners();

    var backdrop = getBackdrop();
    var dialog = createPreferencesDialog();

    syncPreferencesDialog(dialog);
    revealCookieSurface(dialog);
    dialog.classList.add(BANNER_CLASS);

    document.documentElement.classList.add('baf-cookie-consent-visible');
    backdrop.classList.add('is-visible');
  }

  function dismissAsDeclined(banner) {
    recordConsentChoice(consentPayload(false), hideCookieSurfaces);
    window.setTimeout(hideCookieSurfaces, 80);
    window.setTimeout(hideCookieSurfaces, 300);
  }

  function refresh() {
    injectStyle();
    requestPrivacyConsentState(false);

    if (hasDismissedConsent()) {
      hideCookieSurfaces();

      reconcileDismissedConsent(function (wasCleared) {
        if (wasCleared) {
          refresh();
        }
      });
      return;
    }

    if (privacyConsentState === 'recorded') {
      hideCookieSurfaces();
      return;
    }

    if (privacyConsentState === 'unknown' && Date.now() - initStartedAt < CONSENT_CHECK_GRACE) {
      hideCookieSurfaces();
      return;
    }

    var banner = findCookieBanner(true);
    var backdrop = getBackdrop();

    if (!banner) {
      banner = createCustomBanner();
    }

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
      if (!(event.target instanceof Element)) return;

      var action = event.target.closest('[data-baf-cookie-action], .' + BANNER_CLASS + ' button, .' + BANNER_CLASS + ' a');
      if (!action) return;

      var consentAction = action.getAttribute('data-baf-cookie-action');

      if (!consentAction && action.classList.contains(CLOSE_BUTTON_CLASS)) {
        consentAction = 'close';
      } else if (!consentAction && action.classList.contains('baf-cookie-consent-accept')) {
        consentAction = 'accept';
      } else if (!consentAction && action.classList.contains('baf-cookie-consent-decline')) {
        consentAction = 'decline';
      } else if (!consentAction && action.classList.contains('baf-cookie-consent-manage')) {
        consentAction = 'manage';
      } else if (!consentAction && isFinalConsentChoice(action)) {
        consentAction = /reject|decline|no thanks/i.test(normalizeText(action.textContent)) ? 'decline' : 'accept';
      }

      if (!consentAction) {
        window.setTimeout(refresh, 80);
        window.setTimeout(refresh, 300);
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (consentAction === 'manage') {
        showPreferences();
        return;
      }

      if (consentAction === 'save') {
        recordConsentChoice(readPreferencesDialog(action.closest('#' + PREFS_ID) || createPreferencesDialog()), hideCookieSurfaces);
      } else if (consentAction === 'accept') {
        recordConsentChoice(consentPayload(true), hideCookieSurfaces);
      } else if (consentAction === 'decline' || consentAction === 'close') {
        dismissAsDeclined(action.closest('.' + BANNER_CLASS));
      }

      window.setTimeout(hideCookieSurfaces, 80);
      window.setTimeout(hideCookieSurfaces, 300);
    }, true);

    requestPrivacyConsentState(true);
    window.setTimeout(function () { requestPrivacyConsentState(true); }, 1200);
    window.setTimeout(function () { requestPrivacyConsentState(true); }, 3200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
