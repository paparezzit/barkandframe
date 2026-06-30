const ENTRY_ATTRIBUTE = '_enter';
const ENTRY_COOKIE = 'baf_entry_url';
const MAX_ENTRY_LENGTH = 1500;

let syncPromise = null;
let submittingAfterSync = false;

function getCookie(name) {
  const cookies = document.cookie ? document.cookie.split('; ') : [];
  const prefix = `${name}=`;

  for (const cookie of cookies) {
    if (!cookie.startsWith(prefix)) continue;

    try {
      return decodeURIComponent(cookie.slice(prefix.length));
    } catch {
      return '';
    }
  }

  return '';
}

function setCookie(name, value) {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax${secure}`;
  } catch {
    // Ignore cookie failures; checkout can continue without attribution.
  }
}

function normalizeEntryUrl(value) {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  return trimmed.length > MAX_ENTRY_LENGTH ? trimmed.slice(0, MAX_ENTRY_LENGTH) : trimmed;
}

function captureEntryUrlCookie() {
  const existingEntryUrl = normalizeEntryUrl(getCookie(ENTRY_COOKIE));
  if (existingEntryUrl) return existingEntryUrl;

  const entryUrl = normalizeEntryUrl(window.location.href);
  if (entryUrl) setCookie(ENTRY_COOKIE, entryUrl);

  return entryUrl;
}

function getEntryUrlFromCookie() {
  return normalizeEntryUrl(getCookie(ENTRY_COOKIE));
}

function hasCheckoutTarget() {
  return Boolean(document.querySelector('#checkout, form[action="/cart"] [name="checkout"]'));
}

async function syncEntryAttribute() {
  const entryUrl = getEntryUrlFromCookie();
  if (!entryUrl) return;

  const response = await fetch('/cart/update.js', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      attributes: {
        [ENTRY_ATTRIBUTE]: entryUrl,
      },
    }),
  });

  if (!response.ok) throw new Error('Could not update entry attribution.');
}

function scheduleEntrySync() {
  if (syncPromise) return syncPromise;

  syncPromise = syncEntryAttribute()
    .catch((error) => {
      console.error(error);
    })
    .finally(() => {
      syncPromise = null;
    });

  return syncPromise;
}

function handleReady() {
  if (hasCheckoutTarget()) scheduleEntrySync();
}

function isCheckoutSubmit(event) {
  const submitter = event.submitter;
  if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
    return submitter.name === 'checkout' || submitter.id === 'checkout';
  }

  return event.target instanceof HTMLFormElement && Boolean(event.target.querySelector('[name="checkout"], #checkout'));
}

function submitCheckoutForm(form, submitter) {
  if (submitter instanceof HTMLElement && typeof form.requestSubmit === 'function') {
    form.requestSubmit(submitter);
    return;
  }

  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit();
    return;
  }

  let checkoutInput = form.querySelector('input[name="checkout"][data-baf-entry-submit]');
  if (!(checkoutInput instanceof HTMLInputElement)) {
    checkoutInput = document.createElement('input');
    checkoutInput.type = 'hidden';
    checkoutInput.name = 'checkout';
    checkoutInput.value = 'Checkout';
    checkoutInput.dataset.bafEntrySubmit = 'true';
    form.appendChild(checkoutInput);
  }

  form.submit();
}

captureEntryUrlCookie();

document.addEventListener('cart:update', () => scheduleEntrySync());

document.addEventListener(
  'submit',
  (event) => {
    if (submittingAfterSync) {
      submittingAfterSync = false;
      return;
    }

    if (!isCheckoutSubmit(event)) return;

    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const entryUrl = getEntryUrlFromCookie();
    if (!entryUrl) return;

    event.preventDefault();

    scheduleEntrySync().finally(() => {
      submittingAfterSync = true;
      submitCheckoutForm(form, event.submitter);
    });
  },
  true
);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', handleReady, { once: true });
} else {
  handleReady();
}
