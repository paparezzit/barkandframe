# Bark & Frame Fakturoid refund automation

Standalone endpoint for Shopify `refunds/create` webhooks.

It creates a Fakturoid correction document for the original Fakturoid invoice and forces the correction document to use the configured D numbering series via `number_format_id`.

## Required setup

1. In the Shopify Fakturoid app, disable automatic correction document creation for order changes. Otherwise the app can create the correction first and the numbering series cannot be changed afterwards.
2. Deploy this service to Vercel or another HTTPS host.
3. Add a Shopify webhook:
   - Event: `Refund create`
   - Format: `JSON`
   - URL: `https://<deployment>/api/shopify-refund`
4. Configure environment variables.

## Environment variables

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

## Notes

- Fakturoid allows only one correction document per invoice. If multiple refunds are needed for one Shopify order, the automation returns a conflict and requires manual accounting handling.
- The correction numbering series is controlled by `FAKTUROID_CORRECTION_NUMBER_FORMAT_ID`.
- `iban_visibility` is set to `always` on the created correction.
