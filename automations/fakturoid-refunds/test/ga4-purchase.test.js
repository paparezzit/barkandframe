import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGa4PurchasePayload, extractOrderAttributes } from '../api/shopify-purchase.js';

test('extracts GA and BAF attributes from Shopify order note attributes', () => {
  const attributes = extractOrderAttributes({
    note_attributes: [
      { name: '_ga_client_id', value: '1020782520.1783002733' },
      { name: '_ga_session_id', value: '1783004538' },
      { name: '_order', value: '{"items":[{"type":"portrait"}]}' },
      { name: '_enter', value: 'https://barkandframe.com/' },
    ],
  });

  assert.deepEqual(attributes, {
    _ga_client_id: '1020782520.1783002733',
    _ga_session_id: '1783004538',
    _order: '{"items":[{"type":"portrait"}]}',
    _enter: 'https://barkandframe.com/',
  });
});

test('builds GA4 purchase payload from a Shopify order webhook', () => {
  const bafOrder = {
    items: [
      {
        type: 'portrait',
        order_item_id: 'portrait-test-001',
        style_id: 'the_gentleman',
        style_name: 'The Gentleman',
        product_type: 'Fine Art Paper',
        size: '33 x 43 cm',
        framing: 'framed',
        frame_color: 'Black',
        printful_variant_id: 17627,
        pasparta: true,
        pet_name: 'Benny',
        photos: ['https://cdn.example/photo-1.jpg', 'https://cdn.example/photo-2.jpg'],
        portrait_font: null,
        low_resolution: false,
        skip_the_queue: false,
        support_organization: 'Koninklijke Hondenbescherming',
        support_amount: 5,
        quantity: 2,
      },
    ],
  };
  const payload = buildGa4PurchasePayload({
    id: 1234567890,
    order_status_url: 'https://barkandframe.com/checkouts/cn/test-token/en-cz/thank-you',
    presentment_currency: 'CZK',
    taxes_included: true,
    current_subtotal_price_set: {
      presentment_money: { amount: '1900.00', currency_code: 'CZK' },
    },
    current_total_price_set: {
      presentment_money: { amount: '1999.00', currency_code: 'CZK' },
    },
    current_total_tax_set: {
      presentment_money: { amount: '346.93', currency_code: 'CZK' },
    },
    total_shipping_price_set: {
      presentment_money: { amount: '99.00', currency_code: 'CZK' },
    },
    email: 'Customer@example.com ',
    phone: '+420 123 456 789',
    customer: {
      id: 987654321,
      orders_count: 1,
      email: 'customer@example.com',
      phone: '+420123456789',
    },
    billing_address: {
      first_name: 'John',
      last_name: 'Doe',
      address1: 'Main Street 10',
      city: 'Prague',
      province_code: 'PR',
      zip: '110.00',
      country_code: 'CZ',
      phone: '+420 123 456 789',
    },
    discount_codes: [{ code: 'TEST100' }],
    discount_applications: [{ type: 'discount_code', code: 'TEST100', title: 'TEST100' }],
    note_attributes: [
      { name: '_ga_client_id', value: '1020782520.1783002733' },
      { name: '_ga_session_id', value: '1783004538' },
      { name: '_order', value: JSON.stringify(bafOrder) },
      { name: '_enter', value: 'https://barkandframe.com/' },
    ],
    line_items: [
      {
        id: 10,
        product_id: 20,
        variant_id: 30,
        sku: 'SKU-30',
        title: 'Custom Portrait',
        variant_title: 'Fine Art Paper / 33 x 43 cm',
        vendor: 'Bark & Frame',
        product_type: 'Portraits / Custom Pet Portraits',
        quantity: 2,
        properties: [
          { name: '_baf_order_type', value: 'portrait' },
          { name: '_baf_order_item_id', value: 'portrait-test-001' },
        ],
        price_set: {
          presentment_money: { amount: '1000.00', currency_code: 'CZK' },
        },
        total_discount_set: {
          presentment_money: { amount: '100.00', currency_code: 'CZK' },
        },
        discount_allocations: [{ discount_application_index: 0 }],
        tax_lines: [
          {
            price_set: {
              presentment_money: { amount: '329.75', currency_code: 'CZK' },
            },
          },
        ],
      },
    ],
  });

  assert.equal(payload.client_id, '1020782520.1783002733');
  assert.deepEqual(Object.keys(payload).sort(), ['client_id', 'events']);
  assert.equal(payload.events[0].name, 'purchase');
  assert.deepEqual(payload.events[0].params, {
    transaction_id: '1234567890',
    page_location: 'https://barkandframe.com/checkouts/cn/test-token/en-cz/thank-you',
    value: 1570.25,
    tax: 346.93,
    shipping: 99,
    currency: 'CZK',
    coupon: 'TEST100',
    customer_type: 'new',
    session_id: 1783004538,
    engagement_time_msec: 1,
    baf_order_item_count: 1,
    baf_order_types: 'portrait',
    baf_enter: 'https://barkandframe.com/',
    items: [
      {
        item_id: '17627',
        item_name: 'The Gentleman',
        item_variant: 'Fine Art Paper / 33 x 43 cm',
        item_category: 'portrait',
        index: 0,
        price: 785.13,
        discount: 41.32,
        quantity: 2,
        baf_framing: 'framed',
        baf_frame_color: 'Black',
        baf_pasparta: true,
        baf_photo_count: 2,
        baf_low_resolution: false,
        baf_skip_the_queue: false,
        baf_support_amount: 5,
      },
    ],
  });
});

test('keeps tax-exclusive Shopify line item prices unchanged', () => {
  const payload = buildGa4PurchasePayload({
    id: 1234567891,
    presentment_currency: 'CZK',
    taxes_included: false,
    current_subtotal_price_set: {
      presentment_money: { amount: '1900.00', currency_code: 'CZK' },
    },
    current_total_price_set: {
      presentment_money: { amount: '2399.00', currency_code: 'CZK' },
    },
    current_total_tax_set: {
      presentment_money: { amount: '399.00', currency_code: 'CZK' },
    },
    note_attributes: [{ name: '_ga_client_id', value: '1020782520.1783002733' }],
    line_items: [
      {
        id: 11,
        sku: 'SKU-31',
        title: 'Custom Portrait',
        quantity: 2,
        price_set: {
          presentment_money: { amount: '1000.00', currency_code: 'CZK' },
        },
        total_discount_set: {
          presentment_money: { amount: '100.00', currency_code: 'CZK' },
        },
        tax_lines: [
          {
            price_set: {
              presentment_money: { amount: '399.00', currency_code: 'CZK' },
            },
          },
        ],
      },
    ],
  });

  assert.equal(payload.events[0].params.value, 1900);
  assert.deepEqual(payload.events[0].params.items, [
    {
      item_id: 'SKU-31',
      item_name: 'Custom Portrait',
      index: 0,
      price: 950,
      discount: 50,
      quantity: 2,
    },
  ]);
});

test('uses GraphQL statusPageUrl as purchase page_location fallback', () => {
  const payload = buildGa4PurchasePayload({
    id: 1234567894,
    statusPageUrl: 'https://barkandframe.com/97889321306/orders/test/authenticate?key=abc123',
    presentment_currency: 'CZK',
    taxes_included: false,
    current_subtotal_price_set: {
      presentment_money: { amount: '1000.00', currency_code: 'CZK' },
    },
    note_attributes: [{ name: '_ga_client_id', value: '1020782520.1783002733' }],
    line_items: [
      {
        id: 14,
        title: 'Custom Portrait',
        quantity: 1,
        price_set: {
          presentment_money: { amount: '1000.00', currency_code: 'CZK' },
        },
      },
    ],
  });

  assert.equal(
    payload.events[0].params.page_location,
    'https://barkandframe.com/97889321306/orders/test/authenticate?key=abc123'
  );
});

test('uses Shopify discount allocations for order-level discounts', () => {
  const payload = buildGa4PurchasePayload({
    id: 1234567893,
    presentment_currency: 'CZK',
    taxes_included: false,
    current_subtotal_price_set: {
      presentment_money: { amount: '0.00', currency_code: 'CZK' },
    },
    current_total_price_set: {
      presentment_money: { amount: '0.00', currency_code: 'CZK' },
    },
    current_total_tax_set: {
      presentment_money: { amount: '0.00', currency_code: 'CZK' },
    },
    total_shipping_price_set: {
      presentment_money: { amount: '0.00', currency_code: 'CZK' },
    },
    discount_codes: [{ code: 'TEST100' }],
    note_attributes: [{ name: '_ga_client_id', value: '1020782520.1783002733' }],
    line_items: [
      {
        id: 13,
        title: 'Custom Portrait',
        quantity: 1,
        price_set: {
          presentment_money: { amount: '1000.00', currency_code: 'CZK' },
        },
        discount_allocations: [
          {
            amount: '1000.00',
            amount_set: {
              presentment_money: { amount: '1000.00', currency_code: 'CZK' },
            },
          },
        ],
      },
    ],
  });

  assert.equal(payload.events[0].params.value, 0);
  assert.deepEqual(payload.events[0].params.items, [
    {
      item_id: '13',
      item_name: 'Custom Portrait',
      index: 0,
      price: 0,
      discount: 1000,
      quantity: 1,
    },
  ]);
});

test('uses _order production identifiers for merch item_id', () => {
  const bafOrder = {
    items: [
      {
        type: 'merch',
        design_name: 'Give Love',
        product_name: 'T-shirt',
        production_line: 'Foundation',
        product_color: 'Black',
        size: 'M',
        artwork_colorway: 'light-on-black',
        production_name: 'Give Love | T-shirt | Light',
        printful_variant_id: 21006,
        quantity: 1,
        production: {
          technique: 'Printing',
          printing_type: 'DTG printing',
          placements: [
            {
              placement: 'Front print',
              placement_key: 'front',
              artwork_file: 'give-love_t-shirt_light.png',
            },
            {
              placement: 'Inside label',
              placement_key: 'label_inside',
              type: 'native',
              artwork_file: 'baf-logo_white.png',
            },
          ],
        },
        discount: {
          type: 'cart_upsell',
          sale_price: 67900,
        },
      },
    ],
  };

  const payload = buildGa4PurchasePayload({
    id: 1234567892,
    presentment_currency: 'CZK',
    taxes_included: false,
    note_attributes: [
      { name: '_ga_client_id', value: '1020782520.1783002733' },
      {
        name: '_order',
        value: JSON.stringify(bafOrder),
      },
    ],
    line_items: [
      {
        id: 12,
        variant_id: 987654321,
        title: 'Give Love | T-shirt',
        variant_title: 'Black / M',
        quantity: 1,
        price_set: {
          presentment_money: { amount: '679.00', currency_code: 'CZK' },
        },
        properties: [
          { name: '_baf_order_type', value: 'merch' },
          { name: '_baf_printful_variant_id', value: '21006' },
          { name: '_Sale_Price', value: '67900' },
        ],
      },
    ],
  });

  assert.deepEqual(payload.events[0].params.items[0], {
    item_id: '21006',
    item_name: 'Give Love',
    item_variant: 'T-shirt / Black / M',
    item_category: 'merch',
    index: 0,
    price: 679,
    quantity: 1,
    baf_production_line: 'Foundation',
    baf_artwork_colorway: 'light-on-black',
    baf_production_technique: 'Printing',
    baf_production_method: 'DTG printing',
    baf_placements: 'front:give-love_t-shirt_light.png|label_inside:baf-logo_white.png',
    baf_discount_type: 'cart_upsell',
  });
});
