const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

export function validateABN(raw: string): boolean {
  const digits = raw.replace(/\s/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const d = digits.split("").map(Number);
  d[0] -= 1;
  const sum = ABN_WEIGHTS.reduce((acc, w, i) => acc + w * d[i], 0);
  return sum % 89 === 0;
}
