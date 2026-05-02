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
  for (const line of input.cart.lines) {
    const value = line.attribute?.value;
    if (!value) continue;
    const cents = parseInt(value, 10);
    if (!cents || cents <= 0) continue;
    const whole = Math.floor(cents / 100);
    const frac = cents % 100;
    const amount = whole + "." + (frac < 10 ? "0" + frac : "" + frac);
    operations.push({
      update: {
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
