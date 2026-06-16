export default function run(input) {
  const operations = [];
  const presentmentCurrencyRate = Number(input.presentmentCurrencyRate ?? 1);
  const rate = Number.isFinite(presentmentCurrencyRate) && presentmentCurrencyRate > 0
    ? presentmentCurrencyRate
    : 1;

  for (const line of input.cart.lines) {
    const value = line.salePrice?.value ?? line.shopCurrencyPrice?.value ?? line.legacyPrice?.value;
    if (!value) continue;

    const cents = parseInt(value, 10);
    if (!cents || cents <= 0) continue;

    const hasShopCurrencyPrice = Boolean(line.salePrice?.value ?? line.shopCurrencyPrice?.value);
    const priceCents = hasShopCurrencyPrice
      ? Math.round(cents * rate)
      : cents;
    const amount = (priceCents / 100).toFixed(2);

    operations.push({
      update: {
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
