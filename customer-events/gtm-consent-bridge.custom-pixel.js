window.dataLayer = window.dataLayer || [];

function gtag() {
  window.dataLayer.push(arguments);
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

var latestPageContext = {};

function pageContext(event) {
  var context = event && event.context ? event.context : {};
  var documentContext = context.document || {};
  var location = documentContext.location || {};

  return {
    page_location: clean(location.href),
    page_path: clean(location.pathname),
    page_title: clean(documentContext.title),
    page_referrer: clean(documentContext.referrer)
  };
}

function currentPageContext(event) {
  var page = pageContext(event);

  if (page.page_location || page.page_path) {
    latestPageContext = page;
  }

  return latestPageContext;
}

function allowed(value) {
  if (value === true) return true;
  if (value === "yes") return true;
  if (value === "true") return true;
  if (value === "granted") return true;
  return false;
}

function consentValue(isAllowed) {
  if (isAllowed) return "granted";
  return "denied";
}

var customerPrivacyStatus = {};

if (typeof init !== "undefined" && init && init.customerPrivacy) {
  customerPrivacyStatus = init.customerPrivacy;
}

gtag("consent", "default", {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  functionality_storage: "granted",
  security_storage: "granted",
  wait_for_update: 500
});

function pushConsent(source) {
  var analyticsAllowed = allowed(customerPrivacyStatus.analyticsProcessingAllowed);
  var marketingAllowed = allowed(customerPrivacyStatus.marketingAllowed);
  var preferencesAllowed = allowed(customerPrivacyStatus.preferencesProcessingAllowed);
  var saleOfDataAllowed = allowed(customerPrivacyStatus.saleOfDataAllowed);
  var adUserDataAllowed = marketingAllowed && saleOfDataAllowed;

  gtag("consent", "update", {
    analytics_storage: consentValue(analyticsAllowed),
    ad_storage: consentValue(marketingAllowed),
    ad_user_data: consentValue(adUserDataAllowed),
    ad_personalization: consentValue(adUserDataAllowed)
  });

  window.dataLayer.push({
    event: "gtm_consent",
    consent_analytics: analyticsAllowed,
    consent_marketing: marketingAllowed,
    consent_preferences: preferencesAllowed,
    consent_sale_of_data: saleOfDataAllowed,
    consent_source: source,
    timestamp: new Date().toISOString()
  });
}

analytics.subscribe("page_viewed", function (event) {
  var page = currentPageContext(event);

  pushConsent("page_viewed");

  window.dataLayer.push({
    event: "baf_page_context",
    page_location: page.page_location,
    page_path: page.page_path,
    page_title: page.page_title,
    page_referrer: page.page_referrer
  });
});

if (api && api.customerPrivacy && api.customerPrivacy.subscribe) {
  api.customerPrivacy.subscribe("visitorConsentCollected", function (event) {
    customerPrivacyStatus = event.customerPrivacy || {};
    pushConsent("visitorConsentCollected");
  });
}

analytics.subscribe("photo_upload", function (event) {
  var customData = event.customData || {};

  window.dataLayer.push({
    event: "photo_upload",
    source: customData.source
  });
});

analytics.subscribe("generate_lead", function (event) {
  var customData = event.customData || {};

  window.dataLayer.push({
    event: "generate_lead",
    form: customData.form || {},
    user: customData.user || {},
    clear: true
  });
});

function ecommercePayload(customData) {
  return {
    currency: customData.currency,
    value: customData.value,
    items: Array.isArray(customData.items) ? customData.items : []
  };
}

analytics.subscribe("baf_add_to_cart", function (event) {
  var customData = event.customData || {};
  var ecommerce = ecommercePayload(customData);
  var page = currentPageContext(event);

  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({
    event: "add_to_cart",
    page_location: page.page_location,
    page_path: page.page_path,
    page_title: page.page_title,
    page_referrer: page.page_referrer,
    source: customData.source,
    currency: ecommerce.currency,
    value: ecommerce.value,
    items: ecommerce.items,
    ecommerce: ecommerce,
    _Order: customData._Order,
    _Enter: customData._Enter,
    product: customData.product || {},
    added_item: customData.added_item || {},
    cart: customData.cart || {}
  });
});

analytics.subscribe("baf_begin_checkout", function (event) {
  var customData = event.customData || {};
  var ecommerce = ecommercePayload(customData);
  var page = currentPageContext(event);

  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({
    event: "begin_checkout",
    page_location: page.page_location,
    page_path: page.page_path,
    page_title: page.page_title,
    page_referrer: page.page_referrer,
    currency: ecommerce.currency,
    value: ecommerce.value,
    items: ecommerce.items,
    ecommerce: ecommerce,
    _Order: customData._Order,
    _Enter: customData._Enter,
    cart: customData.cart || {}
  });
});

analytics.subscribe("clicked", function (event) {
  var element = {};

  if (event.data && event.data.element) {
    element = event.data.element;
  }

  function getElementType(element) {
    var tagName = clean(element.tagName).toLowerCase();
    var type = clean(element.type).toLowerCase();
    var href = clean(element.href).toLowerCase();

    if (tagName === "button") return "button";
    if (type === "button") return "button";
    if (type === "submit") return "button";
    if (href.indexOf("tel:") === 0) return "telefon";
    if (href.indexOf("mailto:") === 0) return "email";
    if (tagName === "a") return "textlink";
    if (tagName === "img") return "obrazek";
    if (tagName === "picture") return "obrazek";
    if (tagName) return tagName;

    return "other";
  }

  function getClickText(element) {
    var href = clean(element.href);

    if (href) {
      try {
        var url = new URL(href);
        var path = url.pathname.replace(/^\/+|\/+$/g, "");
        var parts = path.split("/");
        var lastPart = "";
        var i = 0;

        for (i = parts.length - 1; i >= 0; i = i - 1) {
          if (parts[i]) {
            lastPart = parts[i];
            break;
          }
        }

        if (lastPart) {
          return decodeURIComponent(lastPart).replace(/[-_]+/g, " ");
        }

        return url.hostname;
      } catch (e) {
        return href;
      }
    }

    if (clean(element.value)) return clean(element.value);
    if (clean(element.name)) return clean(element.name);
    if (clean(element.id)) return clean(element.id);

    return clean(element.tagName);
  }

  window.dataLayer.push({
    event: "click_on",
    element_type: getElementType(element),
    click_text: getClickText(element),
    click_id: clean(element.id)
  });
});

window.dataLayer.push({
  "gtm.start": new Date().getTime(),
  event: "gtm.js"
});

var gtmScript = document.createElement("script");
gtmScript.async = true;
gtmScript.src = "https://www.googletagmanager.com/gtm.js?id=GTM-58GKRKRZ";
document.head.appendChild(gtmScript);
