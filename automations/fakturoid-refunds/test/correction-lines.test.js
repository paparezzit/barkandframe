import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCorrectionLines, variableSymbolFromOrderName } from '../api/shopify-refund.js';

test('uses Shopify order number without hash as variable symbol', () => {
  assert.equal(variableSymbolFromOrderName('#1086'), '1086');
  assert.equal(variableSymbolFromOrderName('1086'), '1086');
});

test('builds correction lines from refunded line items in target currency', () => {
  const lines = buildCorrectionLines(
    {
      refund_line_items: [
        {
          quantity: 2,
          subtotal_set: {
            shop_money: { amount: '20.00', currency_code: 'EUR' },
            presentment_money: { amount: '500.00', currency_code: 'CZK' },
          },
          total_tax_set: {
            shop_money: { amount: '4.20', currency_code: 'EUR' },
            presentment_money: { amount: '86.78', currency_code: 'CZK' },
          },
          line_item: {
            title: 'Bloom | Crewneck',
            variant_title: 'Black / S',
          },
        },
      ],
    },
    'CZK'
  );

  assert.deepEqual(lines, [
    {
      name: 'Bloom | Crewneck - Black / S',
      quantity: '2',
      unit_name: 'ks',
      unit_price: '-250',
      vat_rate: '21',
    },
  ]);
});

test('treats Shopify tax-inclusive refund subtotals as gross amounts', () => {
  const lines = buildCorrectionLines(
    {
      refund_line_items: [
        {
          quantity: 1,
          subtotal_set: {
            presentment_money: { amount: '5903.69', currency_code: 'CZK' },
          },
          total_tax_set: {
            presentment_money: { amount: '1024.61', currency_code: 'CZK' },
          },
          line_item: {
            title: 'Fine Art Paper',
            variant_title: 'Oak / 50x70 cm',
          },
        },
      ],
    },
    'CZK'
  );

  assert.equal(lines[0].unit_price, '-5903.69');
  assert.equal(lines[0].vat_rate, '21');
});

test('builds correction lines from order adjustments', () => {
  const lines = buildCorrectionLines(
    {
      refund_line_items: [],
      order_adjustments: [
        {
          reason: 'Shipping refund',
          amount_set: {
            presentment_money: { amount: '-100.00', currency_code: 'CZK' },
          },
          tax_amount_set: {
            presentment_money: { amount: '-17.36', currency_code: 'CZK' },
          },
        },
      ],
    },
    'CZK'
  );

  assert.deepEqual(lines, [
    {
      name: 'Shipping refund',
      quantity: '1',
      unit_name: '',
      unit_price: '-100',
      vat_rate: '21',
    },
  ]);
});
