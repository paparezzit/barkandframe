export default function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const value = line.attribute?.value;
    if (!value) continue;

    const cents = parseInt(value, 10);
    if (!cents || cents <= 0) continue;

    const whole = Math.floor(cents / 100);
    const frac = cents % 100;
    const amount = whole + '.' + (frac < 10 ? '0' + frac : '' + frac);

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
