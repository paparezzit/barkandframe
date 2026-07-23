export default function run(input) {
  const operations = [];
  const presentmentCurrencyRate = Number(input.presentmentCurrencyRate ?? 1);
  const rate = Number.isFinite(presentmentCurrencyRate) && presentmentCurrencyRate > 0
    ? presentmentCurrencyRate
    : 1;

  for (const line of input.cart.lines) {
    if (line.sellingPlanAllocation) continue;

    const value = line.salePrice?.value ?? line.shopCurrencyPrice?.value ?? line.legacyPrice?.value;
    const cents = parsePositiveCents(value);
    if (!cents) continue;

    const hasShopCurrencyPrice = Boolean(line.salePrice?.value ?? line.shopCurrencyPrice?.value);
    const priceCents = hasShopCurrencyPrice
      ? Math.round(cents * rate)
      : cents;
    const amount = (priceCents / 100).toFixed(2);

    operations.push({
      lineUpdate: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount },
          },
        },
      },
    });
  }

  return { operations };
}

function parsePositiveCents(value) {
  if (typeof value !== 'string') return 0;

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return 0;

  const cents = Number(normalized);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : 0;
}
