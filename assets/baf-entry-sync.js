const ORDER_ATTRIBUTE = '_order';
const ENTRY_ATTRIBUTE = '_enter';
const GA_CLIENT_ID_ATTRIBUTE = '_ga_client_id';
const GA_SESSION_ID_ATTRIBUTE = '_ga_session_id';
const GA4_COOKIE_SUFFIX = 'L65K24HNWN';
const ENTRY_COOKIE = 'baf_entry_url';
const MAX_ENTRY_LENGTH = 1500;
const DEFAULT_TAX_RATE = 0.21;
const TAX_RATES_BY_COUNTRY = {
  AT: 0.2,
  BE: 0.21,
  CZ: 0.21,
  DE: 0.19,
  ES: 0.21,
  FR: 0.2,
  IT: 0.22,
  NL: 0.21,
  PL: 0.23,
  SK: 0.23,
};
const TAX_RATES_BY_CURRENCY = {
  CZK: 0.21,
  EUR: 0.21,
  PLN: 0.23,
};

let syncPromise = null;
let submittingAfterSync = false;

function getCookie(name) {
  const cookies = document.cookie ? document.cookie.split('; ') : [];
  const prefix = `${name}=`;

  for (const cookie of cookies) {
    if (!cookie.startsWith(prefix)) continue;

    try {
      return decodeURIComponent(cookie.slice(prefix.length));
    } catch {
      return '';
    }
  }

  return '';
}

function getAllCookies() {
  return document.cookie ? document.cookie.split('; ') : [];
}

function setCookie(name, value) {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax${secure}`;
  } catch {
    // Ignore cookie failures; checkout can continue without attribution.
  }
}

function normalizeEntryUrl(value) {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  return trimmed.length > MAX_ENTRY_LENGTH ? trimmed.slice(0, MAX_ENTRY_LENGTH) : trimmed;
}

function captureEntryUrlCookie() {
  const existingEntryUrl = normalizeEntryUrl(getCookie(ENTRY_COOKIE));
  if (existingEntryUrl) return existingEntryUrl;

  const entryUrl = normalizeEntryUrl(window.location.href);
  if (entryUrl) setCookie(ENTRY_COOKIE, entryUrl);

  return entryUrl;
}

function getEntryUrlFromCookie() {
  return normalizeEntryUrl(getCookie(ENTRY_COOKIE));
}

function toStringValue(value) {
  return typeof value === 'string' ? value : '';
}

function stringValue(value) {
  return value === undefined || value === null ? '' : String(value);
}

function numberValue(value) {
  if (value === undefined || value === null || value === '') return undefined;

  const number = Number(value);
  return Number.isFinite(number) ? roundMoney(number) : undefined;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function centsToMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? roundMoney(number / 100) : undefined;
}

function centsToNetMoney(value, taxRate) {
  const gross = centsToMoney(value);
  if (gross === undefined) return undefined;
  return roundMoney(gross / (1 + taxRate));
}

function booleanValue(value) {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseGaClientId(value) {
  if (typeof value !== 'string') return '';

  const parts = value.split('.');
  if (parts.length < 4) return '';

  const clientParts = parts.slice(-2);
  return clientParts.every((part) => /^\d+$/.test(part)) ? clientParts.join('.') : '';
}

function parseGaSessionId(value) {
  if (typeof value !== 'string') return '';

  const sessionPart = value.split('$').find((part) => /^s\d+$/.test(part));
  return sessionPart ? sessionPart.slice(1) : '';
}

function getGa4CookieValue() {
  const preferredName = `_ga_${GA4_COOKIE_SUFFIX}`;
  const preferredValue = getCookie(preferredName);
  if (preferredValue) return preferredValue;

  const cookie = getAllCookies().find((item) => /^_ga_[^=]+=GS/.test(item));
  if (!cookie) return '';

  const value = cookie.slice(cookie.indexOf('=') + 1);

  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function getGaAttribution() {
  return {
    clientId: parseGaClientId(getCookie('_ga')),
    sessionId: parseGaSessionId(getGa4CookieValue()),
  };
}

function getCartAttributes(cart) {
  if (!cart || typeof cart !== 'object') return {};

  const attributes = cart.attributes;
  return attributes && typeof attributes === 'object' ? attributes : {};
}

function getCartSummary(cart) {
  return {
    item_count: cart.item_count,
    total_price: cart.total_price,
    currency: cart.currency,
  };
}

function getTaxRate(cart) {
  const country = stringValue(window.Shopify?.country).trim().toUpperCase();
  if (country && TAX_RATES_BY_COUNTRY[country] !== undefined) return TAX_RATES_BY_COUNTRY[country];

  const currency = stringValue(cart?.currency).trim().toUpperCase();
  if (currency && TAX_RATES_BY_CURRENCY[currency] !== undefined) return TAX_RATES_BY_CURRENCY[currency];

  return DEFAULT_TAX_RATE;
}

function parseBafOrder(value) {
  const rawValue = stringValue(value).trim();
  if (!rawValue) return { items: [] };

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object') return { items: [] };

    return {
      ...parsed,
      items: Array.isArray(parsed.items)
        ? parsed.items.filter((item) => item && typeof item === 'object')
        : [],
    };
  } catch {
    return { items: [] };
  }
}

function lineItemProperties(lineItem) {
  const properties = lineItem?.properties;
  if (!properties) return {};

  if (Array.isArray(properties)) {
    return properties.reduce((values, property) => {
      if (!property || typeof property !== 'object') return values;

      const key = stringValue(property.name || property.key);
      if (!key) return values;

      values[key] = property.value;
      return values;
    }, {});
  }

  if (typeof properties === 'object') return properties;

  return {};
}

function findUnusedIndex(items, usedIndexes, predicate) {
  const index = items.findIndex((item, itemIndex) => !usedIndexes.has(itemIndex) && predicate(item));
  return index >= 0 ? index : undefined;
}

function createBafOrderItemMatcher(bafOrder) {
  const items = Array.isArray(bafOrder?.items) ? bafOrder.items : [];
  const usedIndexes = new Set();

  return (lineItem, index) => {
    const properties = lineItemProperties(lineItem);
    const orderItemId = stringValue(properties._baf_order_item_id);
    const printfulVariantId = stringValue(properties._baf_printful_variant_id);
    const orderType = stringValue(properties._baf_order_type);

    const matchedIndex = findUnusedIndex(items, usedIndexes, (item) => {
      return orderItemId && stringValue(item.order_item_id) === orderItemId;
    }) ?? findUnusedIndex(items, usedIndexes, (item) => {
      return printfulVariantId && stringValue(item.printful_variant_id) === printfulVariantId;
    }) ?? findUnusedIndex(items, usedIndexes, (item) => {
      return orderType && stringValue(item.type) === orderType;
    }) ?? (!usedIndexes.has(index) && items[index] ? index : undefined);

    if (matchedIndex === undefined) return undefined;

    usedIndexes.add(matchedIndex);
    return items[matchedIndex];
  };
}

function joinNonEmpty(values, separator) {
  return values.map((value) => stringValue(value).trim()).filter(Boolean).join(separator);
}

function removeEmpty(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  );
}

function itemIdValue(lineItem, properties, bafOrderItem) {
  return stringValue(
    bafOrderItemIdValue(bafOrderItem) ||
      productionPropertyItemIdValue(properties) ||
      lineItem?.sku ||
      lineItem?.variant_id ||
      lineItem?.product_id ||
      lineItem?.id
  );
}

function bafOrderItemIdValue(item) {
  if (!item || typeof item !== 'object') return '';

  const explicitItemId = stringValue(item.item_id);
  if (explicitItemId) return explicitItemId;

  const printfulVariantId = stringValue(item.printful_variant_id);
  if (printfulVariantId) return printfulVariantId;

  return stringValue(item.order_item_id);
}

function productionPropertyItemIdValue(properties) {
  const printfulVariantId = stringValue(properties._baf_printful_variant_id);
  if (printfulVariantId) return printfulVariantId;

  return stringValue(properties._baf_order_item_id);
}

function itemNameValue(lineItem, bafOrderItem) {
  const type = stringValue(bafOrderItem?.type);

  if (type === 'portrait') {
    return stringValue(bafOrderItem.style_name || bafOrderItem.style_id || lineItem?.product_title || lineItem?.title || lineItem?.name);
  }

  if (type === 'merch') {
    return stringValue(bafOrderItem.design_name || bafOrderItem.production_name || lineItem?.product_title || lineItem?.title || lineItem?.name);
  }

  return stringValue(lineItem?.product_title || lineItem?.title || lineItem?.name);
}

function itemVariantValue(lineItem, bafOrderItem) {
  const type = stringValue(bafOrderItem?.type);

  if (type === 'portrait') {
    return joinNonEmpty([bafOrderItem.product_type, bafOrderItem.size], ' / ') || stringValue(lineItem?.variant_title);
  }

  if (type === 'merch') {
    return joinNonEmpty([bafOrderItem.product_name, bafOrderItem.product_color, bafOrderItem.size], ' / ') ||
      stringValue(lineItem?.variant_title);
  }

  return stringValue(lineItem?.variant_title);
}

function itemCategoryValue(lineItem, bafOrderItem) {
  const type = stringValue(bafOrderItem?.type);
  if (type === 'portrait') return 'portrait';
  if (type === 'merch') return 'merch';
  return stringValue(lineItem?.product_type || lineItem?.product_category || lineItem?.category);
}

function photoCountValue(photos) {
  if (!Array.isArray(photos)) return undefined;
  return photos.length;
}

function centsPropertyValue(value) {
  const cents = numberValue(value);
  return cents == null ? undefined : roundMoney(cents / 100);
}

function placementsValue(placements) {
  if (!Array.isArray(placements)) return undefined;

  const value = placements
    .map((placement) => {
      if (!placement || typeof placement !== 'object') return '';
      return joinNonEmpty([
        placement.placement_key || placement.placement,
        placement.artwork || placement.artwork_file,
        placement.embroidery_type_key || placement.embroidery_type,
      ], ':');
    })
    .filter(Boolean)
    .join('|');

  return value || undefined;
}

function portraitItemParams(item, properties) {
  const supportAmount = numberValue(item.support_amount) ?? centsPropertyValue(properties._donation);

  return removeEmpty({
    baf_framing: stringValue(item.framing),
    baf_frame_color: stringValue(item.frame_color),
    baf_pasparta: booleanValue(item.pasparta),
    baf_photo_count: photoCountValue(item.photos),
    baf_low_resolution: booleanValue(item.low_resolution),
    baf_skip_the_queue: booleanValue(item.skip_the_queue),
    baf_support_amount: supportAmount,
  });
}

function merchItemParams(item, taxRate) {
  const production = item.production && typeof item.production === 'object' ? item.production : {};
  const thread = production.thread && typeof production.thread === 'object' ? production.thread : {};
  const discount = item.discount && typeof item.discount === 'object' ? item.discount : {};
  const discountSalePrice = centsToNetMoney(discount.sale_price, taxRate);
  const discountCompareAtPrice = centsToNetMoney(discount.compare_at_price, taxRate);

  return removeEmpty({
    baf_production_line: stringValue(item.production_line),
    baf_artwork_colorway: stringValue(item.artwork_colorway),
    baf_production_technique: stringValue(production.technique),
    baf_production_method: stringValue(production.printing_type),
    baf_thread_code: stringValue(thread.code),
    baf_placements: placementsValue(production.placements),
    baf_discount_type: stringValue(discount.type),
    baf_discount_source: stringValue(discount.source),
    baf_discount_sale_price: discountSalePrice,
    baf_discount_compare_at_price: discountCompareAtPrice,
    baf_discount_amount:
      discountCompareAtPrice !== undefined && discountSalePrice !== undefined && discountCompareAtPrice > discountSalePrice
        ? roundMoney(discountCompareAtPrice - discountSalePrice)
        : undefined,
  });
}

function bafDiscountValue(bafOrderItem, taxRate) {
  const discount = bafOrderItem?.discount;
  if (!discount || typeof discount !== 'object') return undefined;

  const salePrice = centsToNetMoney(discount.sale_price, taxRate);
  const compareAtPrice = centsToNetMoney(discount.compare_at_price, taxRate);

  return compareAtPrice !== undefined && salePrice !== undefined && compareAtPrice > salePrice
    ? roundMoney(compareAtPrice - salePrice)
    : undefined;
}

function bafItemParams(bafOrderItem, properties, taxRate) {
  if (!bafOrderItem || typeof bafOrderItem !== 'object') return {};

  const type = stringValue(bafOrderItem.type);
  if (type === 'portrait') return portraitItemParams(bafOrderItem, properties);
  if (type === 'merch') return merchItemParams(bafOrderItem, taxRate);

  return {};
}

function matchingCartLineIndex(cartLines, lineItem) {
  if (!lineItem || typeof lineItem !== 'object') return undefined;

  const key = stringValue(lineItem.key);
  if (key) {
    const matchedIndex = cartLines.findIndex((cartLine) => stringValue(cartLine?.key) === key);
    if (matchedIndex >= 0) return matchedIndex;
  }

  const id = stringValue(lineItem.id);
  const variantId = stringValue(lineItem.variant_id || lineItem.variantId);
  const matchedIndex = cartLines.findIndex((cartLine) => {
    return (id && stringValue(cartLine?.id) === id) || (variantId && stringValue(cartLine?.variant_id) === variantId);
  });

  return matchedIndex >= 0 ? matchedIndex : undefined;
}

function selectedCartLines(cart, options = {}) {
  const cartLines = Array.isArray(cart?.items) ? cart.items : [];
  const lineItem = options.lineItem && typeof options.lineItem === 'object' ? options.lineItem : undefined;

  if (!lineItem) {
    return cartLines.map((cartLine, index) => ({
      lineItem: cartLine,
      orderIndex: index,
    }));
  }

  const matchedIndex = matchingCartLineIndex(cartLines, lineItem);
  const selectedLine = matchedIndex === undefined ? lineItem : cartLines[matchedIndex];
  const quantity = positiveNumber(lineItem.quantity) || positiveNumber(selectedLine.quantity) || 1;

  return [{
    lineItem: { ...selectedLine, quantity },
    orderIndex: matchedIndex ?? 0,
  }];
}

function buildEcommerceItem(lineItem, index, bafOrderItem, taxRate) {
  const properties = lineItemProperties(lineItem);
  const grossPriceCents = Number.isFinite(Number(lineItem?.final_price)) ? lineItem.final_price : lineItem?.price;
  const originalPriceCents = Number.isFinite(Number(lineItem?.price)) ? lineItem.price : grossPriceCents;
  const price = centsToNetMoney(grossPriceCents, taxRate);
  const originalPrice = centsToNetMoney(originalPriceCents, taxRate);
  const lineDiscount = originalPrice !== undefined && price !== undefined && originalPrice > price
    ? roundMoney(originalPrice - price)
    : undefined;
  const discount = lineDiscount ?? bafDiscountValue(bafOrderItem, taxRate);

  return removeEmpty({
    item_id: itemIdValue(lineItem, properties, bafOrderItem),
    item_name: itemNameValue(lineItem, bafOrderItem),
    item_variant: itemVariantValue(lineItem, bafOrderItem),
    item_category: itemCategoryValue(lineItem, bafOrderItem),
    index,
    price,
    discount,
    quantity: positiveNumber(lineItem?.quantity) || 1,
    ...bafItemParams(bafOrderItem, properties, taxRate),
  });
}

function ecommerceValue(items) {
  if (!Array.isArray(items) || items.length === 0) return undefined;

  let hasPrice = false;
  const total = items.reduce((sum, item) => {
    const price = numberValue(item.price);
    if (price === undefined) return sum;

    hasPrice = true;
    return sum + price * (positiveNumber(item.quantity) || 1);
  }, 0);

  return hasPrice ? roundMoney(total) : undefined;
}

function buildCartEcommerce(cart, options = {}) {
  const attributes = getCartAttributes(cart);
  const bafOrder = parseBafOrder(attributes[ORDER_ATTRIBUTE]);
  const matchBafOrderItem = createBafOrderItemMatcher(bafOrder);
  const taxRate = getTaxRate(cart);
  const items = selectedCartLines(cart, options).map((selection, index) => {
    return buildEcommerceItem(
      selection.lineItem,
      index,
      matchBafOrderItem(selection.lineItem, selection.orderIndex),
      taxRate
    );
  });

  return {
    currency: stringValue(cart?.currency),
    value: ecommerceValue(items),
    items,
  };
}

function hasCheckoutTarget() {
  return Boolean(document.querySelector('#checkout, form[action="/cart"] [name="checkout"]'));
}

async function syncGaAttributionAttributes() {
  const gaAttribution = getGaAttribution();
  const attributes = {};

  if (gaAttribution.clientId) attributes[GA_CLIENT_ID_ATTRIBUTE] = gaAttribution.clientId;
  if (gaAttribution.sessionId) attributes[GA_SESSION_ID_ATTRIBUTE] = gaAttribution.sessionId;

  if (!Object.keys(attributes).length) return null;

  const response = await fetch('/cart/update.js', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      attributes,
    }),
  });

  if (!response.ok) throw new Error('Could not update GA attribution.');
  return response.json();
}

function fetchCart() {
  return fetch('/cart.js', {
    headers: { Accept: 'application/json' },
  }).then((response) => {
    if (!response.ok) throw new Error('Could not read cart.');
    return response.json();
  });
}

function scheduleEntrySync() {
  if (syncPromise) return syncPromise;

  syncPromise = syncGaAttributionAttributes()
    .catch((error) => {
      console.error(error);
    })
    .finally(() => {
      syncPromise = null;
    });

  return syncPromise;
}

function handleReady() {
  if (hasCheckoutTarget()) scheduleEntrySync();
}

function isCheckoutSubmit(event) {
  const submitter = event.submitter;
  if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
    return submitter.name === 'checkout' || submitter.id === 'checkout';
  }

  return event.target instanceof HTMLFormElement && Boolean(event.target.querySelector('[name="checkout"], #checkout'));
}

function submitCheckoutForm(form, submitter) {
  if (submitter instanceof HTMLElement && typeof form.requestSubmit === 'function') {
    form.requestSubmit(submitter);
    return;
  }

  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit();
    return;
  }

  let checkoutInput = form.querySelector('input[name="checkout"][data-baf-entry-submit]');
  if (!(checkoutInput instanceof HTMLInputElement)) {
    checkoutInput = document.createElement('input');
    checkoutInput.type = 'hidden';
    checkoutInput.name = 'checkout';
    checkoutInput.value = 'Checkout';
    checkoutInput.dataset.bafEntrySubmit = 'true';
    form.appendChild(checkoutInput);
  }

  form.submit();
}

function publishBeginCheckout(cart) {
  if (!window.Shopify?.analytics || typeof window.Shopify.analytics.publish !== 'function') return;

  const attributes = getCartAttributes(cart);
  const ecommerce = buildCartEcommerce(cart);

  window.Shopify.analytics.publish('baf_begin_checkout', {
    ...ecommerce,
    _Order: toStringValue(attributes[ORDER_ATTRIBUTE]),
    _Enter: toStringValue(attributes[ENTRY_ATTRIBUTE]) || getEntryUrlFromCookie(),
    cart: getCartSummary(cart),
  });
}

function syncGaAttributionAndPublishBeginCheckout() {
  return syncGaAttributionAttributes()
    .then(() => fetchCart())
    .then((cart) => {
      publishBeginCheckout(cart);
    })
    .catch((error) => {
      console.error('Begin checkout analytics publish failed:', error);
    });
}

captureEntryUrlCookie();

document.addEventListener('cart:update', () => scheduleEntrySync());

window.BAFEntrySync = {
  syncEntryAttribute: scheduleEntrySync,
  getEntryUrl: getEntryUrlFromCookie,
};

window.BAFEcommerceAnalytics = {
  buildCartEcommerce,
};

document.addEventListener(
  'submit',
  (event) => {
    if (submittingAfterSync) {
      submittingAfterSync = false;
      return;
    }

    if (!isCheckoutSubmit(event)) return;

    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    event.preventDefault();

    syncGaAttributionAndPublishBeginCheckout().finally(() => {
      submittingAfterSync = true;
      submitCheckoutForm(form, event.submitter);
    });
  },
  true
);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', handleReady, { once: true });
} else {
  handleReady();
}
