const ORDER_ATTRIBUTE = '_order';
const ENTRY_ATTRIBUTE = '_enter';

/**
 * @param {unknown} value
 * @returns {string}
 */
function toStringValue(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function toNumberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/**
 * @returns {Promise<Record<string, unknown>>}
 */
function fetchCart() {
  return fetch('/cart.js', {
    headers: { Accept: 'application/json' },
  }).then((response) => {
    if (!response.ok) throw new Error('Could not read cart.');
    return response.json();
  });
}

/**
 * @param {unknown} lineItem
 * @returns {Record<string, unknown>}
 */
function normalizeLineItem(lineItem) {
  if (!lineItem || typeof lineItem !== 'object') return {};

  const item = /** @type {Record<string, unknown>} */ (lineItem);

  return {
    id: item.id,
    key: item.key,
    product_id: item.product_id,
    variant_id: item.variant_id,
    sku: item.sku,
    title: item.title,
    product_title: item.product_title,
    variant_title: item.variant_title,
    quantity: item.quantity,
    price: item.price,
    final_price: item.final_price,
    properties: item.properties || {},
  };
}

/**
 * @param {FormData | undefined} formData
 * @returns {Record<string, unknown>}
 */
function getProductFromFormData(formData) {
  if (!formData) return {};

  return {
    variant_id: toStringValue(formData.get('id')),
    quantity: toNumberValue(formData.get('quantity')) || 1,
  };
}

/**
 * @param {Record<string, unknown>} cart
 * @returns {{item_count: unknown, total_price: unknown, currency: unknown}}
 */
function getCartSummary(cart) {
  return {
    item_count: cart.item_count,
    total_price: cart.total_price,
    currency: cart.currency,
  };
}

/**
 * @param {Record<string, unknown>} cart
 * @param {unknown} lineItem
 * @returns {{currency?: string, value?: number, items?: Array<Record<string, unknown>>}}
 */
function getEcommercePayload(cart, lineItem) {
  const ecommerceAnalytics = window.BAFEcommerceAnalytics;

  if (!ecommerceAnalytics || typeof ecommerceAnalytics.buildCartEcommerce !== 'function') return {};

  return ecommerceAnalytics.buildCartEcommerce(cart, { lineItem });
}

/**
 * @returns {Promise<void>}
 */
function syncEntryAttribute() {
  const entrySync = window.BAFEntrySync;

  if (!entrySync || typeof entrySync.syncEntryAttribute !== 'function') return Promise.resolve();

  return entrySync.syncEntryAttribute().then(() => undefined);
}

/**
 * Publishes a custom Shopify analytics event for the Customer Events sandbox.
 *
 * @param {{
 *   source: string,
 *   formData?: FormData,
 *   product?: Record<string, unknown>,
 *   lineItem?: unknown
 * }} options
 * @returns {Promise<void>}
 */
export function publishBafAddToCart(options) {
  return syncEntryAttribute()
    .then(fetchCart)
    .then((cart) => {
      const attributes =
        cart.attributes && typeof cart.attributes === 'object'
          ? /** @type {Record<string, unknown>} */ (cart.attributes)
          : {};
      const product = {
        ...getProductFromFormData(options.formData),
        ...(options.product || {}),
      };
      const ecommerce = getEcommercePayload(cart, options.lineItem);

      if (!window.Shopify?.analytics || typeof window.Shopify.analytics.publish !== 'function') return;

      window.Shopify.analytics.publish('baf_add_to_cart', {
        source: options.source,
        ...ecommerce,
        product,
        added_item: normalizeLineItem(options.lineItem),
        cart: getCartSummary(cart),
        _Order: toStringValue(attributes[ORDER_ATTRIBUTE]),
        _Enter: toStringValue(attributes[ENTRY_ATTRIBUTE]),
      });
    })
    .catch((error) => {
      console.error('Add to cart analytics publish failed:', error);
    });
}

window.BAFAddToCartAnalytics = {
  publish: publishBafAddToCart,
};
