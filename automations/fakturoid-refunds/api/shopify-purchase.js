import crypto from 'node:crypto';

const DEFAULT_GA4_ENDPOINT = 'https://region1.google-analytics.com/mp/collect';
const DEFAULT_GA4_DEBUG_ENDPOINT = 'https://region1.google-analytics.com/debug/mp/collect';
const DRY_RUN = process.env.GA4_PURCHASE_DRY_RUN === 'true';
const VALIDATE_ONLY = process.env.GA4_VALIDATE === 'true';
const DEBUG_MODE = process.env.GA4_DEBUG_MODE === 'true';

const GA_CLIENT_ID_ATTRIBUTE = '_ga_client_id';
const GA_SESSION_ID_ATTRIBUTE = '_ga_session_id';
const ORDER_ATTRIBUTE = '_order';
const ENTRY_ATTRIBUTE = '_enter';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const rawBody = await readRawBody(req);
  const hmacSecret = purchaseWebhookSecret();
  if (!verifyShopifyHmac(rawBody, req.headers['x-shopify-hmac-sha256'], hmacSecret)) {
    return json(res, 401, { error: 'invalid_shopify_hmac' });
  }

  try {
    const order = parseJson(rawBody);
    const result = await processPurchaseOrder({ order });
    return json(res, 200, result);
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, {
      error: error.code || 'ga4_purchase_failed',
      message: error.message,
      details: error.details,
    });
  }
}

export async function processPurchaseOrder({ order }) {
  const payload = buildGa4PurchasePayload(order);

  if (!payload.client_id) {
    return {
      ok: true,
      skipped: true,
      reason: 'missing_ga_client_id',
      transaction_id: payload.events[0]?.params?.transaction_id,
    };
  }

  if (DRY_RUN) {
    return {
      ok: true,
      dry_run: true,
      payload,
    };
  }

  const ga4 = await sendGa4Payload(payload);

  return {
    ok: true,
    transaction_id: payload.events[0].params.transaction_id,
    validate_only: VALIDATE_ONLY,
    ga4,
  };
}

export function buildGa4PurchasePayload(order) {
  if (!order || typeof order !== 'object') {
    throw httpError(400, 'invalid_order_payload', 'Order payload is missing.');
  }

  const attributes = extractOrderAttributes(order);
  const currency = stringValue(order.presentment_currency || order.currency || order.current_total_price_set?.presentment_money?.currency_code);
  const transactionId = stringValue(order.id || order.admin_graphql_api_id || order.name);
  if (!transactionId) {
    throw httpError(400, 'missing_transaction_id', 'Order payload is missing id.');
  }

  const taxesIncluded = order.taxes_included === true || order.taxes_included === 'true';
  const bafOrder = parseBafOrder(attributes[ORDER_ATTRIBUTE]);
  const items = buildItems(order.line_items, currency, taxesIncluded, order, bafOrder);
  const params = removeEmpty({
    transaction_id: transactionId,
    page_location: pageLocationValue(order),
    value: orderMerchandiseValue(order, currency, taxesIncluded) ?? purchaseValue(items),
    tax: moneyValue(order.current_total_tax_set, currency) ?? numberValue(order.current_total_tax ?? order.total_tax),
    shipping: shippingValue(order, currency),
    currency,
    coupon: couponValue(order),
    customer_type: customerTypeValue(order),
    session_id: sessionIdValue(attributes[GA_SESSION_ID_ATTRIBUTE]),
    engagement_time_msec: 1,
    baf_order_item_count: bafOrderItemCount(bafOrder),
    baf_order_types: bafOrderTypes(bafOrder),
    baf_enter: shortParamValue(attributes[ENTRY_ATTRIBUTE]),
    debug_mode: DEBUG_MODE ? true : undefined,
    items,
  });

  return removeEmpty({
    client_id: stringValue(attributes[GA_CLIENT_ID_ATTRIBUTE]),
    events: [
      {
        name: 'purchase',
        params,
      },
    ],
  });
}

export function extractOrderAttributes(order) {
  const attributes = {};
  const candidates = [order.note_attributes, order.attributes].filter(Array.isArray);

  for (const list of candidates) {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;

      const key = stringValue(item.name || item.key);
      if (!key) continue;

      attributes[key] = stringValue(item.value);
    }
  }

  return attributes;
}

export function buildItems(lineItems, currency, taxesIncluded = false, order = {}, bafOrder = {}) {
  if (!Array.isArray(lineItems)) return [];

  const matchBafOrderItem = createBafOrderItemMatcher(bafOrder);

  return lineItems.map((lineItem, index) => {
    const properties = lineItemProperties(lineItem);
    const bafOrderItem = matchBafOrderItem(lineItem, properties, index);
    const quantity = positiveNumber(lineItem.quantity) || 1;
    const grossUnitPrice = moneyValue(lineItem.price_set, currency) ?? numberValue(lineItem.price);
    const grossTotalDiscount = lineItemDiscountValue(lineItem, currency, grossUnitPrice, quantity);
    const netRatio = taxesIncluded ? lineItemNetRatio(lineItem, currency, grossUnitPrice, grossTotalDiscount, quantity) : 1;
    const basePrice = grossUnitPrice == null ? undefined : roundMoney(grossUnitPrice * netRatio);
    const discount = grossTotalDiscount ? roundMoney((grossTotalDiscount * netRatio) / quantity) : undefined;
    const price = basePrice == null ? undefined : roundMoney(Math.max(basePrice - (discount ?? 0), 0));
    const categories = itemCategories(lineItem);

    return removeEmpty({
      item_id: itemIdValue(lineItem, properties, bafOrderItem),
      item_name: itemNameValue(lineItem, bafOrderItem),
      item_variant: itemVariantValue(lineItem, bafOrderItem),
      item_category: itemCategoryValue(lineItem, bafOrderItem, categories),
      index,
      price,
      discount,
      quantity,
      ...bafItemParams(bafOrderItem, properties),
    });
  });
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

function createBafOrderItemMatcher(bafOrder) {
  const items = Array.isArray(bafOrder?.items) ? bafOrder.items : [];
  const usedIndexes = new Set();

  return (_lineItem, properties, index) => {
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

function findUnusedIndex(items, usedIndexes, predicate) {
  const index = items.findIndex((item, itemIndex) => !usedIndexes.has(itemIndex) && predicate(item));
  return index >= 0 ? index : undefined;
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

function itemIdValue(lineItem, properties, bafOrderItem) {
  return stringValue(
    bafOrderItemIdValue(bafOrderItem) ||
      productionPropertyItemIdValue(properties) ||
      lineItem.sku ||
      lineItem.variant_id ||
      lineItem.product_id ||
      lineItem.id
  );
}

function bafOrderItemIdValue(item) {
  if (!item || typeof item !== 'object') return '';

  const explicitItemId = stringValue(item.item_id);
  if (explicitItemId) return explicitItemId;

  const printfulVariantId = stringValue(item.printful_variant_id);
  if (printfulVariantId) return printfulVariantId;

  const orderItemId = stringValue(item.order_item_id);
  return orderItemId;
}

function productionPropertyItemIdValue(properties) {
  const printfulVariantId = stringValue(properties._baf_printful_variant_id);
  if (printfulVariantId) return printfulVariantId;

  const orderItemId = stringValue(properties._baf_order_item_id);
  return orderItemId;
}

function itemNameValue(lineItem, bafOrderItem) {
  const type = stringValue(bafOrderItem?.type);

  if (type === 'portrait') {
    return stringValue(bafOrderItem.style_name || bafOrderItem.style_id || lineItem.title || lineItem.name);
  }

  if (type === 'merch') {
    return stringValue(bafOrderItem.design_name || bafOrderItem.production_name || lineItem.title || lineItem.name);
  }

  return stringValue(lineItem.title || lineItem.name);
}

function itemVariantValue(lineItem, bafOrderItem) {
  const type = stringValue(bafOrderItem?.type);

  if (type === 'portrait') {
    return joinNonEmpty([bafOrderItem.product_type, bafOrderItem.size], ' / ') || stringValue(lineItem.variant_title);
  }

  if (type === 'merch') {
    return joinNonEmpty([bafOrderItem.product_name, bafOrderItem.product_color, bafOrderItem.size], ' / ') ||
      stringValue(lineItem.variant_title);
  }

  return stringValue(lineItem.variant_title);
}

function itemCategoryValue(_lineItem, bafOrderItem, fallbackCategories) {
  const type = stringValue(bafOrderItem?.type);
  if (type === 'portrait') return 'portrait';
  if (type === 'merch') return 'merch';
  return fallbackCategories[0];
}

function bafItemParams(bafOrderItem, properties) {
  if (!bafOrderItem || typeof bafOrderItem !== 'object') return {};

  const type = stringValue(bafOrderItem.type);
  if (type === 'portrait') return portraitItemParams(bafOrderItem, properties);
  if (type === 'merch') return merchItemParams(bafOrderItem);

  return {};
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

function merchItemParams(item) {
  const production = item.production && typeof item.production === 'object' ? item.production : {};
  const thread = production.thread && typeof production.thread === 'object' ? production.thread : {};
  const discount = item.discount && typeof item.discount === 'object' ? item.discount : {};

  return removeEmpty({
    baf_production_line: stringValue(item.production_line),
    baf_artwork_colorway: stringValue(item.artwork_colorway),
    baf_production_technique: stringValue(production.technique),
    baf_production_method: stringValue(production.printing_type),
    baf_thread_code: stringValue(thread.code),
    baf_placements: placementsValue(production.placements),
    baf_discount_type: stringValue(discount.type),
  });
}

function bafOrderItemCount(bafOrder) {
  return Array.isArray(bafOrder?.items) && bafOrder.items.length > 0 ? bafOrder.items.length : undefined;
}

function bafOrderTypes(bafOrder) {
  if (!Array.isArray(bafOrder?.items)) return undefined;

  const types = uniqueTruthy(bafOrder.items.map((item) => stringValue(item?.type)));
  return types.length ? shortParamValue(types.join(',')) : undefined;
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

function photoCountValue(photos) {
  if (!Array.isArray(photos)) return undefined;
  return photos.length;
}

function booleanValue(value) {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function centsPropertyValue(value) {
  const cents = numberValue(value);
  return cents == null ? undefined : roundMoney(cents / 100);
}

function joinNonEmpty(values, separator) {
  return values.map((value) => stringValue(value).trim()).filter(Boolean).join(separator);
}

function purchaseValue(items) {
  if (!Array.isArray(items) || items.length === 0) return undefined;

  let hasPrice = false;
  const total = items.reduce((sum, item) => {
    const quantity = positiveNumber(item.quantity) || 1;
    const price = numberValue(item.price);
    if (price == null) return sum;

    hasPrice = true;
    return sum + price * quantity;
  }, 0);

  return hasPrice ? roundMoney(total) : undefined;
}

function pageLocationValue(order) {
  return shortParamValue(order.order_status_url || order.statusPageUrl, 1000);
}

function orderMerchandiseValue(order, currency, taxesIncluded) {
  const subtotal =
    moneyValue(order.current_subtotal_price_set, currency) ??
    numberValue(order.current_subtotal_price ?? order.subtotal_price);

  if (subtotal == null) return undefined;
  if (!taxesIncluded) return roundMoney(Math.max(subtotal, 0));

  return roundMoney(Math.max(subtotal - lineItemsTaxValue(order.line_items, currency), 0));
}

function lineItemsTaxValue(lineItems, currency) {
  if (!Array.isArray(lineItems)) return 0;

  const total = lineItems.reduce((sum, lineItem) => {
    return sum + lineItemTaxValue(lineItem, currency);
  }, 0);

  return roundMoney(total);
}

function lineItemNetRatio(lineItem, currency, grossUnitPrice, grossTotalDiscount, quantity) {
  if (grossUnitPrice == null) return 1;

  const lineTax = lineItemTaxValue(lineItem, currency);
  if (!lineTax) return 1;

  const grossDiscountedTotal = roundMoney(grossUnitPrice * quantity - grossTotalDiscount);
  if (grossDiscountedTotal <= 0) return 1;

  return Math.max(grossDiscountedTotal - lineTax, 0) / grossDiscountedTotal;
}

function lineItemTaxValue(lineItem, currency) {
  if (!Array.isArray(lineItem.tax_lines)) return 0;

  const total = lineItem.tax_lines.reduce((sum, taxLine) => {
    return sum + (moneyValue(taxLine.price_set, currency) ?? numberValue(taxLine.price) ?? 0);
  }, 0);

  return roundMoney(total);
}

async function sendGa4Payload(payload) {
  const measurementId = requireEnv('GA4_MEASUREMENT_ID');
  const apiSecret = requireEnv('GA4_API_SECRET');
  const endpoint = VALIDATE_ONLY
    ? process.env.GA4_DEBUG_ENDPOINT || DEFAULT_GA4_DEBUG_ENDPOINT
    : process.env.GA4_MP_ENDPOINT || DEFAULT_GA4_ENDPOINT;
  const url = new URL(endpoint);
  url.searchParams.set('measurement_id', measurementId);
  url.searchParams.set('api_secret', apiSecret);

  const body = VALIDATE_ONLY
    ? { ...payload, validation_behavior: 'ENFORCE_RECOMMENDATIONS' }
    : payload;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.text();
  let details = responseBody;
  if (responseBody) {
    try {
      details = JSON.parse(responseBody);
    } catch {
      // Keep plain text response.
    }
  }

  if (!response.ok) {
    throw httpError(response.status, 'ga4_request_failed', `GA4 request failed: ${response.status}`, details);
  }

  return {
    status: response.status,
    details,
  };
}

function shippingValue(order, currency) {
  const totalShipping = moneyValue(order.total_shipping_price_set, currency);
  if (totalShipping != null) return totalShipping;

  if (!Array.isArray(order.shipping_lines)) return undefined;

  const total = order.shipping_lines.reduce((sum, line) => {
    return sum + (moneyValue(line.discounted_price_set, currency) ?? numberValue(line.discounted_price) ?? 0);
  }, 0);

  return total > 0 ? roundMoney(total) : undefined;
}

function couponValue(order) {
  const codes = Array.isArray(order.discount_codes)
    ? order.discount_codes.map((discount) => stringValue(discount.code)).filter(Boolean)
    : [];

  return codes.length ? codes.join(',') : undefined;
}

function customerTypeValue(order) {
  const ordersCount = Number(order.customer?.orders_count);
  if (!Number.isFinite(ordersCount) || ordersCount <= 0) return undefined;
  return ordersCount <= 1 ? 'new' : 'returning';
}

function itemCategories(lineItem) {
  const rawCategory = stringValue(
    lineItem.product_type ||
      lineItem.product_category ||
      lineItem.category ||
      lineItem.product?.product_type ||
      lineItem.product?.category
  );

  if (!rawCategory) return [];

  return rawCategory
    .split(/\s*(?:>|\/|\||,)\s*/)
    .map((category) => category.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function uniqueTruthy(values) {
  return [...new Set(values.filter(Boolean))];
}

function moneyValue(moneySet, currency) {
  if (!moneySet || typeof moneySet !== 'object') return undefined;

  const moneyOptions = [moneySet.presentment_money, moneySet.shop_money].filter(Boolean);
  const matched = moneyOptions.find((money) => !currency || money.currency_code === currency) || moneyOptions[0];
  return matched ? numberValue(matched.amount) : undefined;
}

function lineItemDiscountValue(lineItem, currency, grossUnitPrice, quantity) {
  const totalDiscount = moneyValue(lineItem.total_discount_set, currency) ?? numberValue(lineItem.total_discount) ?? 0;
  const allocatedDiscount = discountAllocationsValue(lineItem.discount_allocations, currency) ?? 0;
  const discount = Math.max(totalDiscount, allocatedDiscount, 0);

  if (grossUnitPrice == null) return roundMoney(discount);

  return roundMoney(Math.min(discount, grossUnitPrice * quantity));
}

function discountAllocationsValue(discountAllocations, currency) {
  if (!Array.isArray(discountAllocations)) return undefined;

  const total = discountAllocations.reduce((sum, allocation) => {
    if (!allocation || typeof allocation !== 'object') return sum;

    return sum + (
      moneyValue(allocation.amount_set, currency) ??
      numberValue(allocation.amount) ??
      0
    );
  }, 0);

  return total > 0 ? roundMoney(total) : undefined;
}

function sessionIdValue(value) {
  const sessionId = stringValue(value);
  return /^\d+$/.test(sessionId) ? Number(sessionId) : undefined;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function numberValue(value) {
  if (value === undefined || value === null || value === '') return undefined;

  const number = Number(value);
  return Number.isFinite(number) ? roundMoney(number) : undefined;
}

function stringValue(value) {
  return value === undefined || value === null ? '' : String(value);
}

function shortParamValue(value, maxLength = 100) {
  const text = stringValue(value).trim();
  return text ? text.slice(0, maxLength) : '';
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

function verifyShopifyHmac(rawBody, receivedHmac, secret) {
  if (!receivedHmac) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const expected = Buffer.from(digest);
  const received = Buffer.from(String(receivedHmac));
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseJson(rawBody) {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw httpError(400, 'invalid_json', 'Request body is not valid JSON.');
  }
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw httpError(500, 'missing_environment_variable', `${name} is not configured.`);
  }
  return value;
}

function purchaseWebhookSecret() {
  return process.env.SHOPIFY_PURCHASE_WEBHOOK_SECRET || requireEnv('SHOPIFY_WEBHOOK_SECRET');
}

function httpError(status, code, message, details = undefined) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
