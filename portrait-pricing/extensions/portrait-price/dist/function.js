var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// extensions/portrait-price/src/index.js
var src_exports = {};
__export(src_exports, {
  default: () => run
});
function run(input) {
  const operations = [];
  const presentmentCurrencyRate = Number(input.presentmentCurrencyRate ?? 1);
  const rate = Number.isFinite(presentmentCurrencyRate) && presentmentCurrencyRate > 0 ? presentmentCurrencyRate : 1;
  for (const line of input.cart.lines) {
    if (line.sellingPlanAllocation) continue;
    const value = line.salePrice?.value ?? line.shopCurrencyPrice?.value ?? line.legacyPrice?.value;
    const cents = parsePositiveCents(value);
    if (!cents) continue;
    const hasShopCurrencyPrice = Boolean(line.salePrice?.value ?? line.shopCurrencyPrice?.value);
    const priceCents = hasShopCurrencyPrice ? Math.round(cents * rate) : cents;
    const amount = (priceCents / 100).toFixed(2);
    operations.push({
      lineUpdate: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount }
          }
        }
      }
    });
  }
  return { operations };
}
function parsePositiveCents(value) {
  if (typeof value !== "string") return 0;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return 0;
  const cents = Number(normalized);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : 0;
}

// extensions/portrait-price/node_modules/@shopify/shopify_function/run.ts
function run_default(userfunction) {
  try {
    ShopifyFunction;
  } catch (e) {
    throw new Error(
      "ShopifyFunction is not defined. Please rebuild your function using the latest version of Shopify CLI."
    );
  }
  const input_obj = ShopifyFunction.readInput();
  const output_obj = userfunction(input_obj);
  ShopifyFunction.writeOutput(output_obj);
}

// extensions/portrait-price/node_modules/@shopify/shopify_function/index.ts
run_default(src_exports?.default);
