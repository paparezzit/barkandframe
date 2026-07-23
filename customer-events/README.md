# Shopify Customer Events / GTM Bridge

## Rules for future edits

- Do not replace the whole custom pixel when adding a new event.
- Start from the currently working bridge in `gtm-consent-bridge.custom-pixel.js`.
- Add only the new `analytics.subscribe(...)` block or the smallest required helper change.
- Keep the existing parts unless there is a verified bug:
  - `window.dataLayer = window.dataLayer || [];`
  - Consent Mode default/update.
  - GTM loader for `GTM-58GKRKRZ`.
  - Existing `photo_upload`, `generate_lead`, `clicked` / `click_on` subscriptions.
  - Existing `baf_add_to_cart` subscription mapped to `add_to_cart`.
  - Existing `baf_begin_checkout` subscription mapped to `begin_checkout`.

## Customer privacy setting

The `GTM + Consent Bridge` custom pixel must not require specific Customer privacy purposes in Shopify Admin.
Its live storefront config should expose `privacyPurposes: []`.

Do not set the pixel to require `Marketing`, `Analytics`, or data sale permission. If those purposes are required
in the pixel configuration, Shopify blocks the whole Customer Events sandbox before the GTM loader and Consent Mode
code can run. That prevents partial consent states such as analytics-only (`G101`) or marketing-only (`G110`).

## Correct verification path

Use the Shopify Customer Events sandbox, not the normal storefront `window.dataLayer`.

### Test contract

Every test run must be created fresh. A previous sandbox URL, previous `scriptVersion`, or a fixed version such as `@12`, `@13`, or `@14` is not a valid test input.

The test is valid only if it does all of this in the same run:

1. Fetches the live storefront again.
2. Finds the current `GTM + Consent Bridge` pixel ID and web-pixels hash again.
3. Reads the highest `scriptVersion` currently visible in storefront HTML only as a starting point.
4. Probes the next sandbox versions for that same pixel ID and hash.
5. Tests the highest available sandbox version, not merely the highest version returned by cached storefront HTML.
6. Prints the tested `sandboxUrl`, `scriptVersion`, `privacyPurposes`, `observedScriptVersions`, `observedPrivacyPurposes`, `probedScriptVersions`, `subscriptions`, `checks`, and `missing`.

If a newly saved pixel is not visible in storefront HTML yet, do not stop on the older storefront version. First probe the next sandbox versions. Shopify can serve `web-pixel-PIXEL_ID@NEW_VERSION` before the storefront HTML consistently reports that new version.

1. Fetch the live storefront HTML from `https://barkandframe.com/`.
2. Find the `webPixelsConfigList` entry named `GTM + Consent Bridge`.
   - Do not hardcode the pixel script version.
   - Read `scriptVersion` from the current live storefront HTML on every test.
   - Confirm `privacyPurposes` is an empty array (`[]`), so partial consent does not block the sandbox from starting.
   - Because Shopify edge HTML can lag behind a newly saved Customer Events script, use that version only as the starting point and probe the next sandbox versions. Test the highest available sandbox version.
3. Build and fetch its sandbox URL:
   `/web-pixels@HASH/custom/web-pixel-PIXEL_ID@SCRIPT_VERSION/sandbox/modern/`
4. Verify the sandbox HTML contains:
   - `window.dataLayer = window.dataLayer || []`
   - `GTM-58GKRKRZ`
   - `googletagmanager.com/gtm.js`
   - `analytics.subscribe("photo_upload", ...)`
   - `analytics.subscribe("generate_lead", ...)`
   - `analytics.subscribe("baf_add_to_cart", ...)`
   - `analytics.subscribe("baf_begin_checkout", ...)`
   - `analytics.subscribe("clicked", ...)`
   - `event: "add_to_cart"`
   - `event: "begin_checkout"`
   - `_Order`
   - `_Enter`
   - `event: "click_on"`
   - `event: "gtm_consent"`
5. For runtime checks, first accept the Shopify cookie banner in a clean test profile.
6. Confirm consent after accept:
   - `analytics: "yes"`
   - `marketing: "yes"`
   - `preferences: "yes"`
   - `Shopify.customerPrivacy.userCanBeTracked() === true`
7. Then confirm the `GTM + Consent Bridge` iframe exists in the storefront DOM.

Fast command for the sandbox-code part:

```sh
node customer-events/verify-gtm-sandbox.mjs
```

## Known bad checks

- Do not use the main storefront `window.dataLayer` as the source of truth.
- Do not reuse a previous `sandboxUrl` or a previous `scriptVersion`.
- Do not stop at the version listed in storefront HTML when a newer sandbox version exists.
- Do not document a fixed "current version" as the expected version. It must be discovered on every run.
- Do not conclude failure only because the parent page target did not show the GTM request.
- Do not test without accepting the cookie banner first.
- Do not open the sandbox URL standalone and expect the full Web Pixels callback behavior; Shopify normally runs it through the Web Pixels Manager.

## When adding a new event

Before calling the test complete, update both places:

- `gtm-consent-bridge.custom-pixel.js`: add only the new subscription/helper needed for the new event.
- `verify-gtm-sandbox.mjs`: add a required check for the new subscription and the final `dataLayer.push` event name.

Then run:

```sh
node customer-events/verify-gtm-sandbox.mjs
```

The result is accepted only when `ok` is `true` and `missing` is an empty array. If `missing` contains the new event, inspect the printed highest available `sandboxUrl` first. Do not assume the Shopify editor, old storefront HTML, or the parent-page console is the source of truth.

## Expected current bridge

After saving the Customer Events custom pixel in Shopify Admin, Shopify should serve a new `scriptVersion`.
The verification script prints the actual current version, for example `web-pixel-PIXEL_ID@SCRIPT_VERSION`.
The sandbox code should contain:

- `dataLayer` initialization.
- GTM loader for `GTM-58GKRKRZ`.
- `gtm_consent`.
- `photo_upload`.
- `generate_lead`.
- `baf_add_to_cart` mapped to `add_to_cart`.
- `baf_begin_checkout` mapped to `begin_checkout`.
- `clicked` mapped to `click_on`.
