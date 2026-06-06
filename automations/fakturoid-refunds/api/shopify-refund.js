import crypto from 'node:crypto';

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-07';
const FAKTUROID_API_BASE = 'https://app.fakturoid.cz/api/v3';
const MAX_INVOICE_LOOKUP_PAGES = Number(process.env.FAKTUROID_INVOICE_LOOKUP_PAGES || 10);
const MARK_CORRECTION_PAID = process.env.MARK_CORRECTION_PAID !== 'false';
const DRY_RUN = process.env.DRY_RUN === 'true';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const rawBody = await readRawBody(req);
  const hmacSecret = requireEnv('SHOPIFY_WEBHOOK_SECRET');
  if (!verifyShopifyHmac(rawBody, req.headers['x-shopify-hmac-sha256'], hmacSecret)) {
    return json(res, 401, { error: 'invalid_shopify_hmac' });
  }

  const refund = parseJson(rawBody);
  const shopDomain = req.headers['x-shopify-shop-domain'] || process.env.SHOPIFY_SHOP_DOMAIN;
  if (!shopDomain) {
    return json(res, 400, { error: 'missing_shopify_shop_domain' });
  }

  try {
    const result = await processRefund({ refund, shopDomain });
    return json(res, 200, result);
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, {
      error: error.code || 'refund_automation_failed',
      message: error.message,
      details: error.details,
    });
  }
}

export async function processRefund({ refund, shopDomain }) {
  const refundId = String(refund.id || '');
  const orderId = String(refund.order_id || '');
  if (!refundId || !orderId) {
    throw httpError(400, 'invalid_refund_payload', 'Refund payload is missing id or order_id.');
  }

  const order = await fetchShopifyOrder({ shopDomain, orderId });
  const orderName = order.name || `#${order.order_number}`;
  const fakturoid = await createFakturoidClient();
  const existingCorrection = await findExistingCorrection(fakturoid, refundId);

  if (existingCorrection) {
    return {
      ok: true,
      skipped: true,
      reason: 'correction_already_exists',
      refund_id: refundId,
      order_name: orderName,
      correction: pickInvoiceFields(existingCorrection),
    };
  }

  const originalInvoice = await findOriginalInvoice(fakturoid, orderName);
  if (!originalInvoice) {
    throw httpError(
      404,
      'original_invoice_not_found',
      `Could not find a Fakturoid invoice with order_number ${orderName}.`
    );
  }

  const existingForInvoice = await findCorrectionForInvoice(fakturoid, originalInvoice.id);
  if (existingForInvoice) {
    throw httpError(
      409,
      'invoice_already_has_correction',
      `Fakturoid already has a correction for invoice ${originalInvoice.number}. One correction per invoice is allowed.`,
      { existing_correction: pickInvoiceFields(existingForInvoice) }
    );
  }

  const lines = buildCorrectionLines(refund, originalInvoice.currency);
  if (!lines.length) {
    throw httpError(422, 'empty_refund_lines', 'Refund payload does not contain refundable line or shipping amounts.');
  }

  const payload = {
    custom_id: `shopify-refund-${refundId}`,
    document_type: 'correction',
    correction_id: originalInvoice.id,
    number_format_id: Number(requireEnv('FAKTUROID_CORRECTION_NUMBER_FORMAT_ID')),
    subject_id: originalInvoice.subject_id,
    order_number: orderName,
    issued_on: dateOnly(refund.created_at) || todayPrague(),
    taxable_fulfillment_due: dateOnly(refund.created_at) || todayPrague(),
    vat_price_mode: 'from_total_with_vat',
    currency: originalInvoice.currency,
    exchange_rate: originalInvoice.exchange_rate,
    language: originalInvoice.language,
    payment_method: originalInvoice.payment_method,
    iban_visibility: 'always',
    note: `Opravný daňový doklad k objednávce ${orderName}`,
    private_note: `Created automatically from Shopify refund ${refundId}.`,
    tags: ['shopify_refund', `shopify_order_${orderName.replace(/^#/, '')}`],
    lines,
  };

  if (DRY_RUN) {
    return {
      ok: true,
      dry_run: true,
      refund_id: refundId,
      order_name: orderName,
      original_invoice: pickInvoiceFields(originalInvoice),
      correction_payload: payload,
    };
  }

  const correction = await fakturoid.createInvoice(payload);
  let payment = null;

  if (MARK_CORRECTION_PAID) {
    payment = await fakturoid.createPayment(correction.id, {
      paid_on: payload.issued_on,
      mark_document_as_paid: true,
    });
  }

  return {
    ok: true,
    refund_id: refundId,
    order_name: orderName,
    original_invoice: pickInvoiceFields(originalInvoice),
    correction: pickInvoiceFields(correction),
    payment,
  };
}

async function fetchShopifyOrder({ shopDomain, orderId }) {
  const token = requireEnv('SHOPIFY_ADMIN_ACCESS_TOKEN');
  const url = new URL(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}.json`);
  url.searchParams.set('fields', 'id,name,order_number,currency,presentment_currency');

  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': token,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw await apiError(response, 'shopify_order_fetch_failed');
  }

  const data = await response.json();
  return data.order;
}

async function createFakturoidClient() {
  const clientId = requireEnv('FAKTUROID_CLIENT_ID');
  const clientSecret = requireEnv('FAKTUROID_CLIENT_SECRET');
  const slug = requireEnv('FAKTUROID_ACCOUNT_SLUG');
  const userAgent = process.env.FAKTUROID_USER_AGENT || 'BarkAndFrameRefundAutomation (invoices@barkandframe.com)';
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(`${FAKTUROID_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': userAgent,
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  });

  if (!response.ok) {
    throw await apiError(response, 'fakturoid_auth_failed');
  }

  const token = await response.json();
  return new FakturoidClient({ slug, accessToken: token.access_token, userAgent });
}

class FakturoidClient {
  constructor({ slug, accessToken, userAgent }) {
    this.slug = slug;
    this.accessToken = accessToken;
    this.userAgent = userAgent;
  }

  async invoices(params = {}) {
    const url = this.url('/invoices.json', params);
    return this.request(url);
  }

  async createInvoice(payload) {
    return this.request(this.url('/invoices.json'), {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createPayment(invoiceId, payload) {
    return this.request(this.url(`/invoices/${invoiceId}/payments.json`), {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': this.userAgent,
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw await apiError(response, 'fakturoid_request_failed');
    }

    if (response.status === 204) return null;
    return response.json();
  }

  url(path, params = {}) {
    const url = new URL(`${FAKTUROID_API_BASE}/accounts/${this.slug}${path}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });
    return url;
  }
}

async function findOriginalInvoice(fakturoid, orderName) {
  const candidates = normalizedOrderNumbers(orderName);

  for (let page = 1; page <= MAX_INVOICE_LOOKUP_PAGES; page += 1) {
    const invoices = await fakturoid.invoices({ document_type: 'invoice', page });
    if (!invoices.length) break;

    const invoice = invoices.find((item) => candidates.has(normalizeOrderNumber(item.order_number)));
    if (invoice) return invoice;
  }

  return null;
}

async function findExistingCorrection(fakturoid, refundId) {
  const customId = `shopify-refund-${refundId}`;

  for (let page = 1; page <= MAX_INVOICE_LOOKUP_PAGES; page += 1) {
    const corrections = await fakturoid.invoices({ document_type: 'correction', page });
    if (!corrections.length) break;

    const correction = corrections.find((item) => item.custom_id === customId);
    if (correction) return correction;
  }

  return null;
}

async function findCorrectionForInvoice(fakturoid, invoiceId) {
  for (let page = 1; page <= MAX_INVOICE_LOOKUP_PAGES; page += 1) {
    const corrections = await fakturoid.invoices({ document_type: 'correction', page });
    if (!corrections.length) break;

    const correction = corrections.find((item) => Number(item.correction_id) === Number(invoiceId));
    if (correction) return correction;
  }

  return null;
}

export function buildCorrectionLines(refund, targetCurrency) {
  const lines = [];

  for (const refundLine of refund.refund_line_items || []) {
    const title = lineTitle(refundLine);
    const base = moneyForCurrency(refundLine.subtotal_set, targetCurrency) || refundLine.subtotal;
    const tax = moneyForCurrency(refundLine.total_tax_set, targetCurrency) || refundLine.total_tax || 0;
    const quantity = Number(refundLine.quantity || 1);
    const unitBase = roundMoney(Math.abs(Number(base)) / Math.max(quantity, 1));

    if (unitBase > 0) {
      lines.push({
        name: title,
        quantity: String(Math.max(quantity, 1)),
        unit_name: 'ks',
        unit_price: String(-unitBase),
        vat_rate: String(vatRateFromGross(base, tax)),
      });
    }
  }

  for (const adjustment of refund.order_adjustments || []) {
    const base = moneyForCurrency(adjustment.amount_set, targetCurrency) || adjustment.amount;
    const tax = moneyForCurrency(adjustment.tax_amount_set, targetCurrency) || adjustment.tax_amount || 0;
    const amount = Math.abs(Number(base));

    if (amount > 0) {
      lines.push({
        name: adjustment.reason || adjustment.kind || 'Refund adjustment',
        quantity: '1',
        unit_name: '',
        unit_price: String(-roundMoney(amount)),
        vat_rate: String(vatRateFromGross(base, tax)),
      });
    }
  }

  return lines;
}

function lineTitle(refundLine) {
  const item = refundLine.line_item || {};
  return [item.title, item.variant_title].filter(Boolean).join(' - ') || `Refunded item ${refundLine.line_item_id}`;
}

function moneyForCurrency(moneySet, currency) {
  if (!moneySet || !currency) return null;

  const options = [moneySet.presentment_money, moneySet.shop_money].filter(Boolean);
  const match = options.find((money) => money.currency_code === currency);
  return match ? Number(match.amount) : null;
}

function vatRateFromGross(gross, tax) {
  const grossNumber = Math.abs(Number(gross));
  const taxNumber = Math.abs(Number(tax));
  const netNumber = grossNumber - taxNumber;
  if (!netNumber || netNumber <= 0 || !taxNumber) return 0;

  const rawRate = roundMoney((taxNumber / netNumber) * 100);
  const knownRate = [21, 15, 12, 10, 0].find((rate) => Math.abs(rate - rawRate) <= 0.5);
  return knownRate ?? rawRate;
}

function normalizedOrderNumbers(orderName) {
  const normalized = normalizeOrderNumber(orderName);
  return new Set([normalized, normalized.replace(/^#/, ''), `#${normalized.replace(/^#/, '')}`]);
}

function normalizeOrderNumber(value) {
  return String(value || '').trim();
}

function pickInvoiceFields(invoice) {
  if (!invoice) return null;
  return {
    id: invoice.id,
    number: invoice.number,
    custom_id: invoice.custom_id,
    order_number: invoice.order_number,
    document_type: invoice.document_type,
    correction_id: invoice.correction_id,
    number_format_id: invoice.number_format_id,
    html_url: invoice.html_url,
    public_html_url: invoice.public_html_url,
    pdf_url: invoice.pdf_url,
  };
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

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function todayPrague() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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

async function apiError(response, code) {
  const body = await response.text();
  let details = body;
  try {
    details = JSON.parse(body);
  } catch {
    // Keep plain text response.
  }

  return httpError(response.status, code, `${code}: ${response.status}`, details);
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
