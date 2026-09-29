const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
export const money = (n: number) => aud.format(n);
/* Prices are GST-inclusive, as they are in store. */
export const gstIn = (total: number) => Math.round((total / 11) * 100) / 100;
