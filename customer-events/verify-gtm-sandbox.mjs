/**
 * Shopify Customer Events sandbox verification contract:
 *
 * - Never hardcode or reuse a previous web-pixel @version.
 * - Fetch the storefront on every run only to discover the pixel ID, hash, and
 *   the lowest likely current scriptVersion.
 * - Probe higher sandbox versions for that same pixel ID/hash because Shopify
 *   edge HTML can lag behind the saved Customer Events script.
 * - Verify the highest available sandbox version and print every version that
 *   was observed/probed so a stale test cannot be mistaken for the current one.
 * - When a new event is added to the custom pixel, add a required check here in
 *   the same change. A test is complete only when `ok: true` and `missing: []`.
 */

const STOREFRONT_FETCH_ATTEMPTS = 8;
const SANDBOX_VERSION_PROBE_AHEAD = 6;
const storefrontBaseUrl = 'https://barkandframe.com/';

function finish(result) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

function compareScriptVersion(a, b) {
  const numberA = Number(a.scriptVersion);
  const numberB = Number(b.scriptVersion);

  if (Number.isFinite(numberA) && Number.isFinite(numberB)) {
    return numberA - numberB;
  }

  return String(a.scriptVersion).localeCompare(String(b.scriptVersion));
}

async function fetchStorefrontSnapshot(attempt) {
  const storefrontUrl = `${storefrontBaseUrl}?baf_pixel_check=${Date.now()}_${attempt}`;
  const storefrontResponse = await fetch(storefrontUrl, {
    redirect: 'follow',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
  const html = await storefrontResponse.text();
  const hashMatch =
    html.match(/web-pixels@([^/"']+)/) ||
    html.match(/"hashVersion":"([^"]+)"/) ||
    html.match(/,"https:\/\/barkandframe\.com\/cdn","([^"]+)"/);
  const configs = [
    ...html.matchAll(
      /\{"id":"([^"]+)","eventPayloadVersion":"1","runtimeContext":"LAX","scriptVersion":"([^"]+)","type":"CUSTOM","privacyPurposes":(\[[^\]]*\]),"name":"GTM \+ Consent Bridge"\}/g
    ),
  ].map((match) => ({
    storefrontUrl,
    hash: hashMatch ? hashMatch[1] : '',
    pixelId: match[1],
    scriptVersion: match[2],
    privacyPurposes: JSON.parse(match[3]),
  }));

  return {
    storefrontUrl,
    hash: hashMatch ? hashMatch[1] : '',
    configs,
  };
}

async function fetchSandboxVersion(hash, pixelId, scriptVersion) {
  const sandboxUrl = `https://barkandframe.com/web-pixels@${hash}/custom/web-pixel-${pixelId}@${scriptVersion}/sandbox/modern/?baf_pixel_check=${Date.now()}_${scriptVersion}`;
  const response = await fetch(sandboxUrl, { redirect: 'follow' });
  const html = await response.text();

  return {
    scriptVersion: String(scriptVersion),
    sandboxUrl,
    status: response.status,
    html,
    available: response.ok && html.includes('Web Pixels Manager Sandbox'),
  };
}

const snapshots = [];

for (let attempt = 0; attempt < STOREFRONT_FETCH_ATTEMPTS; attempt += 1) {
  snapshots.push(await fetchStorefrontSnapshot(attempt));
}

const configs = snapshots.flatMap((snapshot) => snapshot.configs);
const observedScriptVersions = [...new Set(configs.map((config) => config.scriptVersion))];
const highestConfig = [...configs].sort(compareScriptVersion).pop();
const selectedConfig = highestConfig
  ? configs
      .filter((config) => config.scriptVersion === highestConfig.scriptVersion)
      .sort((a, b) => a.privacyPurposes.length - b.privacyPurposes.length)
      .shift()
  : null;
const observedPrivacyPurposes = [
  ...new Set(configs.map((config) => JSON.stringify(config.privacyPurposes))),
].map((value) => JSON.parse(value));

if (!snapshots.some((snapshot) => snapshot.hash)) {
  finish({
    ok: false,
    message: 'Shopify web-pixels hash was not found in storefront HTML.',
    attempts: snapshots.map((snapshot) => snapshot.storefrontUrl),
  });
}

if (!selectedConfig) {
  finish({
    ok: false,
    message: 'Custom pixel "GTM + Consent Bridge" was not found in storefront HTML.',
    attempts: snapshots.map((snapshot) => snapshot.storefrontUrl),
  });
}

const hash = selectedConfig.hash || snapshots.find((snapshot) => snapshot.hash).hash;
const pixelId = selectedConfig.pixelId;
const highestObservedVersion = Number(selectedConfig.scriptVersion);
let sandboxCandidates = [];

if (Number.isFinite(highestObservedVersion)) {
  for (
    let scriptVersion = highestObservedVersion;
    scriptVersion <= highestObservedVersion + SANDBOX_VERSION_PROBE_AHEAD;
    scriptVersion += 1
  ) {
    sandboxCandidates.push(await fetchSandboxVersion(hash, pixelId, scriptVersion));
  }
} else {
  sandboxCandidates.push(await fetchSandboxVersion(hash, pixelId, selectedConfig.scriptVersion));
}

const selectedSandbox = sandboxCandidates.filter((candidate) => candidate.available).pop();

if (!selectedSandbox) {
  finish({
    ok: false,
    message: 'No available Shopify Customer Events sandbox version was found.',
    pixelId,
    observedScriptVersions,
    probedScriptVersions: sandboxCandidates.map((candidate) => ({
      scriptVersion: candidate.scriptVersion,
      status: candidate.status,
      available: candidate.available,
    })),
  });
}

const scriptVersion = selectedSandbox.scriptVersion;
const sandboxUrl = selectedSandbox.sandboxUrl;
const sandboxHtml = selectedSandbox.html;
const subscriptions = [
  ...sandboxHtml.matchAll(/analytics\.subscribe\(["']([^"']+)["']/g),
].map((match) => match[1]);

const checks = [
  [
    'partialConsentPrivacyGateDisabled',
    Array.isArray(selectedConfig.privacyPurposes) && selectedConfig.privacyPurposes.length === 0,
  ],
  ['dataLayerInit', /window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\]/.test(sandboxHtml)],
  ['pageContextHelper', sandboxHtml.includes('function pageContext')],
  ['pageContextUsesEventContext', sandboxHtml.includes('event.context')],
  [
    'pageContextPush',
    sandboxHtml.includes('event: "baf_page_context"') ||
      sandboxHtml.includes("event: 'baf_page_context'"),
  ],
  ['pageLocationPush', sandboxHtml.includes('page_location')],
  ['pagePathPush', sandboxHtml.includes('page_path')],
  ['gtmContainer', sandboxHtml.includes('GTM-58GKRKRZ')],
  ['gtmLoader', sandboxHtml.includes('googletagmanager.com/gtm.js')],
  ['photoUploadSubscribe', /analytics\.subscribe\(["']photo_upload["']/.test(sandboxHtml)],
  ['generateLeadSubscribe', /analytics\.subscribe\(["']generate_lead["']/.test(sandboxHtml)],
  ['bafAddToCartSubscribe', /analytics\.subscribe\(["']baf_add_to_cart["']/.test(sandboxHtml)],
  ['addToCartPush', sandboxHtml.includes('event: "add_to_cart"') || sandboxHtml.includes("event: 'add_to_cart'")],
  ['addToCartCurrencyPush', sandboxHtml.includes('currency: ecommerce.currency')],
  ['addToCartValuePush', sandboxHtml.includes('value: ecommerce.value')],
  ['addToCartItemsPush', sandboxHtml.includes('items: ecommerce.items')],
  ['addToCartEcommercePush', sandboxHtml.includes('ecommerce: ecommerce')],
  ['bafBeginCheckoutSubscribe', /analytics\.subscribe\(["']baf_begin_checkout["']/.test(sandboxHtml)],
  [
    'beginCheckoutPush',
    sandboxHtml.includes('event: "begin_checkout"') || sandboxHtml.includes("event: 'begin_checkout'"),
  ],
  ['beginCheckoutCurrencyPush', sandboxHtml.includes('currency: ecommerce.currency')],
  ['beginCheckoutValuePush', sandboxHtml.includes('value: ecommerce.value')],
  ['beginCheckoutItemsPush', sandboxHtml.includes('items: ecommerce.items')],
  ['beginCheckoutEcommercePush', sandboxHtml.includes('ecommerce: ecommerce')],
  ['ecommerceClearPush', sandboxHtml.includes('window.dataLayer.push({ ecommerce: null })')],
  ['orderAttributePush', sandboxHtml.includes('_Order')],
  ['enterAttributePush', sandboxHtml.includes('_Enter')],
  ['clickedSubscribe', /analytics\.subscribe\(["']clicked["']/.test(sandboxHtml)],
  ['clickOnPush', sandboxHtml.includes('event: "click_on"') || sandboxHtml.includes("event: 'click_on'")],
  ['gtmConsentPush', sandboxHtml.includes('event: "gtm_consent"') || sandboxHtml.includes("event: 'gtm_consent'")],
];

const missing = checks.filter(([, passed]) => !passed).map(([name]) => name);

finish({
  ok: missing.length === 0,
  storefrontUrl: selectedConfig.storefrontUrl,
  sandboxUrl,
  pixelId,
  scriptVersion,
  privacyPurposes: selectedConfig.privacyPurposes,
  observedScriptVersions,
  observedPrivacyPurposes,
  probedScriptVersions: sandboxCandidates.map((candidate) => ({
    scriptVersion: candidate.scriptVersion,
    status: candidate.status,
    available: candidate.available,
  })),
  subscriptions,
  checks: Object.fromEntries(checks),
  missing,
  conclusion:
    missing.length === 0
      ? 'Sandbox contains the complete GTM bridge code.'
      : 'Sandbox is missing required GTM bridge code.',
});
