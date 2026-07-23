# Bark & Frame Shopify automations

Standalone Vercel endpoints for Shopify webhooks.

## GA4 purchase tracking

Endpoint: `/api/shopify-purchase`

Purpose: receive a Shopify order webhook and send a server-side GA4 `purchase` event through Measurement Protocol.

### Data flow

1. Theme JS reads GA cookies before checkout:
   - `_ga` -> cart attribute `_ga_client_id`
   - `_ga_L65K24HNWN` -> cart attribute `_ga_session_id`
2. Existing checkout/order flow already stores:
   - `_order`
   - `_enter`
3. Purchase tracking does not write `_order` or `_enter` again. It reads them from Shopify order `note_attributes`.
4. Shopify order webhook calls `/api/shopify-purchase`.
5. The endpoint sends GA4 `purchase`.

### GA4 purchase mapping

```txt
GA4 client_id      <- order note attribute _ga_client_id
GA4 session_id     <- order note attribute _ga_session_id
transaction_id     <- Shopify order id
page_location      <- Shopify order_status_url / Admin GraphQL statusPageUrl when available
baf_order_item_count <- number of parsed _order.items[]
baf_order_types      <- comma-separated unique _order.items[].type values
baf_enter            <- order note attribute _enter, capped to GA4 parameter value length
value              <- line item total after discounts, without VAT, excluding shipping
currency           <- Shopify order currency
tax                <- Shopify order tax
shipping           <- Shopify order shipping
coupon             <- Shopify discount codes
customer_type      <- Shopify customer orders_count mapped to new / returning when available
items              <- Shopify line_items enriched with production data from _order and tax-inclusive prices converted to amounts without VAT
```

No custom `order_id` parameter is sent. Shopify order id is sent in the standard GA4 parameter `transaction_id`.

The purchase webhook intentionally sends no customer identity object and no user-provided personal data object. Personal data from the Shopify order webhook is not forwarded to GA4.

GA4 `items[].item_id` is intentionally based on the `_order` note attribute instead of Shopify SKU. When `_order.items[].printful_variant_id` is available, the raw Printful variant ID is sent without `portrait:` or `printful:` prefixes. Shopify SKU/variant/product IDs are only emergency fallbacks when `_order` is missing.

Raw `_order` JSON is not sent as a GA4 parameter. `_order` is parsed and mapped into GA4 item fields and short summary event parameters.

Portrait items send `item_name` from `_order` style data, `item_variant` as product type plus size, and custom `baf_*` item parameters for frame, frame color, pasparta, photo count, low-resolution flag, skip queue, and support amount. The support organization is not sent because it is always Koninklijke Hondenbescherming.

Merch items send `item_name` from `_order.design_name`, `item_variant` as product name plus color plus size, and custom `baf_*` item parameters only for additional production data: production line, artwork colorway, production method, thread code, placements, and cart upsell discount type when present. Sale price is not duplicated because it is already sent as GA4 item `price`.

Measurement Protocol standard properties allow parameter values up to 100 characters and item arrays can include up to 27 custom parameters per item. The webhook keeps item-scoped `baf_*` fields below that limit.

### Shopify webhook

Add a Shopify webhook:

```txt
Event: Order payment
Format: JSON
URL: https://<deployment>/api/shopify-purchase
```

Use `Order create` instead only if purchase must be measured before payment is captured.

### GA4 environment variables

```txt
SHOPIFY_PURCHASE_WEBHOOK_SECRET=

GA4_MEASUREMENT_ID=G-L65K24HNWN
GA4_API_SECRET=
GA4_MP_ENDPOINT=https://region1.google-analytics.com/mp/collect

GA4_DEBUG_MODE=false
GA4_VALIDATE=false
GA4_PURCHASE_DRY_RUN=false
```

`SHOPIFY_PURCHASE_WEBHOOK_SECRET` is intentionally separate from `SHOPIFY_WEBHOOK_SECRET`, which is used by the refund webhook.

Use `GA4_VALIDATE=true` only for validation. It sends requests to the GA4 debug endpoint instead of collecting the event. The webhook payload also avoids reserved item parameter prefixes such as `google_`.

## Fakturoid refund automation

Endpoint: `/api/shopify-refund`

Handles Shopify `refunds/create` webhooks.

It creates a Fakturoid correction document for the original Fakturoid invoice and forces the correction document to use the configured D numbering series via `number_format_id`.

### Required setup

1. In the Shopify Fakturoid app, disable automatic correction document creation for order changes. Otherwise the app can create the correction first and the numbering series cannot be changed afterwards.
2. Deploy this service to Vercel or another HTTPS host.
3. Add a Shopify webhook:
   - Event: `Refund create`
   - Format: `JSON`
   - URL: `https://<deployment>/api/shopify-refund`
4. Configure environment variables.

### Refund environment variables

```txt
SHOPIFY_WEBHOOK_SECRET=
SHOPIFY_SHOP_DOMAIN=barkandframe.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=
SHOPIFY_API_VERSION=2026-07

FAKTUROID_ACCOUNT_SLUG=barkandframe
FAKTUROID_CLIENT_ID=
FAKTUROID_CLIENT_SECRET=
FAKTUROID_CORRECTION_NUMBER_FORMAT_ID=
FAKTUROID_USER_AGENT=BarkAndFrameRefundAutomation (invoices@barkandframe.com)

FAKTUROID_INVOICE_LOOKUP_PAGES=10
MARK_CORRECTION_PAID=true
DRY_RUN=false
```

### Refund notes

- Fakturoid allows only one correction document per invoice. If multiple refunds are needed for one Shopify order, the automation returns a conflict and requires manual accounting handling.
- The correction numbering series is controlled by `FAKTUROID_CORRECTION_NUMBER_FORMAT_ID`.
- `iban_visibility` is set to `always` on the created correction.
