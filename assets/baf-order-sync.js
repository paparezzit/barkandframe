const ORDER_ATTRIBUTE = '_order';
const ORDER_TYPE_PROPERTY = '_baf_order_type';
const PORTRAIT_ITEM_ID_PROPERTY = '_baf_order_item_id';
const PORTRAIT_UNIT_QUANTITY_PROPERTY = '_baf_order_unit_quantity';

/**
 * @param {unknown} value
 * @returns {number}
 */
function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 1;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toStringValue(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * @param {Record<string, unknown> | null | undefined} properties
 * @param {string} key
 * @returns {string}
 */
function getProperty(properties, key) {
  if (!properties || typeof properties !== 'object') return '';
  return toStringValue(properties[key]);
}

/**
 * @param {Record<string, unknown> | null | undefined} properties
 * @param {string} key
 * @returns {Record<string, unknown> | null}
 */
function getJsonObjectProperty(properties, key) {
  const value = getProperty(properties, key);
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? /** @type {Record<string, unknown>} */ (parsed)
      : null;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} properties
 * @param {string} key
 * @returns {number}
 */
function getPositiveIntegerProperty(properties, key) {
  const number = Number.parseInt(getProperty(properties, key), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * @param {unknown} rawOrder
 * @returns {{items: Array<Record<string, unknown>>}}
 */
function normalizeOrder(rawOrder) {
  if (!rawOrder || typeof rawOrder !== 'object') return { items: [] };
  const order = /** @type {{items?: unknown}} */ (rawOrder);
  return {
    .../** @type {Record<string, unknown>} */ (rawOrder),
    items: Array.isArray(order.items) ? order.items.filter((item) => item && typeof item === 'object') : [],
  };
}

/**
 * @param {unknown} orderValue
 * @returns {{items: Array<Record<string, unknown>>}}
 */
function parseOrder(orderValue) {
  if (typeof orderValue !== 'string' || orderValue.trim() === '') return { items: [] };

  try {
    return normalizeOrder(JSON.parse(orderValue));
  } catch {
    return { items: [] };
  }
}

/**
 * @param {Record<string, unknown>} item
 * @returns {boolean}
 */
function isLegacyMerchItem(item) {
  const keys = Object.keys(item);
  return (
    item.type !== 'merch' &&
    item.printful_variant_id != null &&
    !item.style_id &&
    !item.photos &&
    keys.every((key) => ['line_item_id', 'printful_variant_id', 'quantity'].includes(key))
  );
}

/**
 * @param {Record<string, unknown>} item
 * @returns {boolean}
 */
function isGeneratedMerchItem(item) {
  return item.type === 'merch' || isLegacyMerchItem(item);
}

/**
 * @param {Record<string, unknown>} cartLine
 * @returns {Record<string, unknown> | null}
 */
function buildMerchOrderItem(cartLine) {
  const properties = /** @type {Record<string, unknown> | undefined} */ (cartLine.properties);
  if (getProperty(properties, ORDER_TYPE_PROPERTY) !== 'merch') return null;

  const printfulVariantId = Number(getProperty(properties, '_baf_printful_variant_id'));
  if (!Number.isFinite(printfulVariantId) || printfulVariantId <= 0) return null;

  const productionLine = getProperty(properties, '_baf_production_line');
  const orderItem = {
    line_item_id: '',
    type: 'merch',
    design_name: getProperty(properties, '_baf_design_name'),
    product_name: getProperty(properties, '_baf_product_name'),
    ...(productionLine ? { production_line: productionLine } : {}),
    product_color: getProperty(properties, '_baf_product_color'),
    size: getProperty(properties, '_baf_size'),
    artwork_colorway: getProperty(properties, '_baf_artwork_colorway'),
    production_name: getProperty(properties, '_baf_production_name'),
    printful_variant_id: printfulVariantId,
    quantity: toPositiveInteger(cartLine.quantity),
  };

  const production = getJsonObjectProperty(properties, '_baf_production');
  if (production) orderItem.production = production;

  const salePrice = getPositiveIntegerProperty(properties, '_Sale_Price');
  if (salePrice > 0) {
    orderItem.discount = {
      type: 'cart_upsell',
      sale_price: salePrice,
    };
  }

  return orderItem;
}

/**
 * @param {Record<string, unknown>} item
 * @param {{line: Record<string, unknown>, unitQuantity: number} | undefined} activePortrait
 * @returns {Record<string, unknown>}
 */
function withSyncedPortraitQuantity(item, activePortrait) {
  if (!activePortrait) return item;

  return {
    ...item,
    quantity: toPositiveInteger(activePortrait.line.quantity) * activePortrait.unitQuantity,
  };
}

/**
 * @param {Record<string, unknown>} cart
 * @param {Array<Record<string, unknown>>} additionalItems
 * @returns {{items: Array<Record<string, unknown>>}}
 */
function buildNextOrder(cart, additionalItems) {
  const cartItems = Array.isArray(cart.items) ? /** @type {Array<Record<string, unknown>>} */ (cart.items) : [];
  const existingOrder = parseOrder(
    cart.attributes && typeof cart.attributes === 'object'
      ? /** @type {Record<string, unknown>} */ (cart.attributes)[ORDER_ATTRIBUTE]
      : ''
  );

  const activePortraitItems = new Map();
  cartItems.forEach((line) => {
    const properties = /** @type {Record<string, unknown> | undefined} */ (line.properties);
    if (getProperty(properties, ORDER_TYPE_PROPERTY) !== 'portrait') return;

    const orderItemId = getProperty(properties, PORTRAIT_ITEM_ID_PROPERTY);
    if (!orderItemId) return;

    activePortraitItems.set(orderItemId, {
      line,
      unitQuantity: toPositiveInteger(getProperty(properties, PORTRAIT_UNIT_QUANTITY_PROPERTY)),
    });
  });

  const additionalById = new Map();
  additionalItems.forEach((item) => {
    const orderItemId = toStringValue(item.order_item_id);
    if (orderItemId) additionalById.set(orderItemId, item);
  });

  const nextItems = [];
  const usedPortraitIds = new Set();

  existingOrder.items.forEach((item) => {
    if (isGeneratedMerchItem(item)) return;

    const orderItemId = toStringValue(item.order_item_id);
    if (orderItemId) {
      const activePortrait = activePortraitItems.get(orderItemId);
      if (!activePortrait) return;

      nextItems.push(withSyncedPortraitQuantity(item, activePortrait));
      usedPortraitIds.add(orderItemId);
      return;
    }

    if (cartItems.length > 0) nextItems.push(item);
  });

  activePortraitItems.forEach((activePortrait, orderItemId) => {
    if (usedPortraitIds.has(orderItemId)) return;

    const additionalItem = additionalById.get(orderItemId);
    if (additionalItem) {
      nextItems.push(withSyncedPortraitQuantity(additionalItem, activePortrait));
    }
  });

  cartItems.forEach((line) => {
    const merchItem = buildMerchOrderItem(line);
    if (merchItem) nextItems.push(merchItem);
  });

  return {
    ...existingOrder,
    items: nextItems,
  };
}

/**
 * @param {Record<string, unknown> | undefined} cart
 * @returns {Promise<Record<string, unknown>>}
 */
function fetchCart(cart) {
  if (cart && Array.isArray(cart.items)) return Promise.resolve(cart);

  return fetch('/cart.js', {
    headers: { Accept: 'application/json' },
  }).then((response) => {
    if (!response.ok) throw new Error('Could not read cart.');
    return response.json();
  });
}

/**
 * Synchronizes the `_order` cart attribute from current cart lines.
 *
 * @param {{cart?: Record<string, unknown>, additionalItems?: Array<Record<string, unknown>>}} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
export function syncBafOrderAttribute(options = {}) {
  const additionalItems = Array.isArray(options.additionalItems) ? options.additionalItems : [];

  return fetchCart(options.cart).then((cart) => {
    const nextOrder = buildNextOrder(cart, additionalItems);
    const nextValue = nextOrder.items.length > 0 ? JSON.stringify(nextOrder) : '';
    const currentValue =
      cart.attributes && typeof cart.attributes === 'object'
        ? toStringValue(/** @type {Record<string, unknown>} */ (cart.attributes)[ORDER_ATTRIBUTE])
        : '';

    if (currentValue === nextValue) return cart;

    return fetch('/cart/update.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ attributes: { [ORDER_ATTRIBUTE]: nextValue } }),
    }).then((response) => {
      if (!response.ok) throw new Error('Could not update order data.');
      return response.json();
    });
  });
}

window.BAFOrderSync = {
  syncCartOrder: syncBafOrderAttribute,
};
