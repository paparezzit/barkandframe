# GA4 purchase payload

Endpoint sends a GA4 Measurement Protocol request:

```txt
POST https://region1.google-analytics.com/mp/collect?measurement_id=G-L65K24HNWN&api_secret=***
```

## Payload structure

```json
{
  "client_id": "1020782520.1783002733",
  "events": [
    {
      "name": "purchase",
      "params": {
        "transaction_id": "1234567890",
        "page_location": "https://barkandframe.com/97889321306/orders/a6c4b8c5cb66395718108987e007d57f/authenticate?key=367e48d404a46d3c12da8b2dffbba76f",
        "value": 1570.26,
        "tax": 346.93,
        "shipping": 99,
        "currency": "CZK",
        "coupon": "TEST100",
        "customer_type": "new",
        "session_id": 1783004538,
        "engagement_time_msec": 1,
        "baf_order_item_count": 1,
        "baf_order_types": "portrait",
        "baf_enter": "https://barkandframe.com/",
        "items": [
          {
            "item_id": "17627",
            "item_name": "The Gentleman",
            "item_variant": "Fine Art Paper / 33 x 43 cm",
            "item_category": "portrait",
            "index": 0,
            "price": 785.13,
            "discount": 41.32,
            "quantity": 2,
            "baf_framing": "framed",
            "baf_frame_color": "Black",
            "baf_pasparta": true,
            "baf_photo_count": 2,
            "baf_low_resolution": false,
            "baf_skip_the_queue": false,
            "baf_support_amount": 5
          }
        ]
      }
    }
  ]
}
```

## Shopify to GA4 mapping

```txt
client_id        <- order.note_attributes._ga_client_id
session_id       <- order.note_attributes._ga_session_id
transaction_id   <- Shopify order.id
page_location    <- Shopify order.order_status_url / Admin GraphQL order.statusPageUrl when available
value            <- Shopify current_subtotal_price after discounts, without VAT when prices are tax-inclusive, excluding shipping
tax              <- Shopify current_total_tax / total_tax
shipping         <- Shopify total_shipping_price_set / shipping_lines
currency         <- Shopify presentment_currency / currency
coupon           <- Shopify discount_codes[].code
customer_type    <- order.customer.orders_count mapped to new / returning when available
baf_order_item_count <- number of parsed _order.items[]
baf_order_types      <- comma-separated unique _order.items[].type values
baf_enter            <- order.note_attributes._enter, capped to GA4 parameter value length
items            <- Shopify line_items enriched with production data from order.note_attributes._order
```

## items[] mapping

```txt
item_id       <- _order.items[].printful_variant_id, fallback Shopify line item id only if _order is unavailable
item_name     <- portrait: _order style_name/style_id; merch: _order design_name
item_variant  <- portrait: product_type / size; merch: product_name / product_color / size
item_category <- portrait / merch from _order.items[].type
index         <- line item order
price         <- line_item.price after discount, converted to amount without VAT when taxes_included=true
discount      <- max(line_item.total_discount, sum(line_item.discount_allocations)) / quantity, converted to amount without VAT when taxes_included=true
quantity      <- line_item.quantity

Portrait item custom parameters:

```txt
baf_framing
baf_frame_color
baf_pasparta
baf_photo_count
baf_low_resolution
baf_skip_the_queue
baf_support_amount
```

Merch item custom parameters:

```txt
baf_production_line
baf_artwork_colorway
baf_production_technique
baf_production_method
baf_thread_code
baf_placements
baf_discount_type
```
```

## Notes

- Event name is always `purchase`.
- `transaction_id` uses the standard GA4 purchase parameter. No separate custom `order_id` parameter is sent.
- `page_location` uses Shopify `order_status_url` from the order webhook payload. If the order is represented by Admin GraphQL data instead, the same value is read from `statusPageUrl`.
- Event `value` uses Shopify `current_subtotal_price` / `current_subtotal_price_set` as the source of truth for the final merchandise amount after discounts, excluding shipping. If prices are tax-inclusive, line item taxes are subtracted so `value` is without VAT.
- Item `discount` uses Shopify `total_discount` or `discount_allocations`, whichever carries the actual line-level discount amount. This keeps order-level and 100% discount codes reflected in `items[].price`.
- If Shopify sends tax-inclusive prices (`taxes_included: true`), item `price`, item `discount`, and event `value` are converted to amounts without VAT using line item `tax_lines`.
- GA4 item `item_id` is intentionally based on `_order`, not Shopify SKU. Shopify products do not carry the production identifiers reliably; `_order.items[]` is the source of truth for the product sent to production.
- GA4 item `item_id` is the raw Printful variant ID when `_order.items[].printful_variant_id` is available. The webhook does not add `portrait:` or `printful:` prefixes.
- The webhook intentionally sends no customer identity object and no user-provided personal data object. Personal data from the Shopify order webhook is not forwarded to GA4.
- Raw `_order` JSON is not sent as a GA4 parameter. `_order` is parsed and mapped into GA4 item fields and short summary event parameters.
- `baf_enter` is read from Shopify order note attribute `_enter` and capped to the GA4 parameter value length.
- Measurement Protocol standard properties allow parameter values up to 100 characters and item arrays can include up to 27 custom parameters per item. The webhook keeps item-scoped `baf_*` fields below that limit.
- If `client_id` is missing, the endpoint does not send the event to GA4 and returns `skipped: missing_ga_client_id`.
- `debug_mode` is sent only when `GA4_DEBUG_MODE=true`.
- `GA4_VALIDATE=true` sends the same payload shape to the GA4 debug endpoint for server-side validation.
- Item parameter names must not use reserved prefixes such as `google_`, so the webhook does not send `google_business_vertical`.
