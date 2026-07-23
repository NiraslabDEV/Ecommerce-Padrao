export type Cents = number & { __brand: 'cents' };

export const cents = (n: number): Cents => {
  if (!Number.isInteger(n) || n < 0) throw new Error('invalid cents');
  return n as Cents;
};

export const centsToDecimalString = (c: Cents): string => (c / 100).toFixed(2);

export const decimalStringToCents = (decimal: string): Cents =>
  cents(Math.round(parseFloat(decimal) * 100));

export const formatMT = (c: Cents): string =>
  `${(c / 100).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT`;

export const orderTotal = (items: { qty: number; unitPriceCents: Cents }[]): Cents =>
  cents(items.reduce((sum, i) => sum + i.qty * i.unitPriceCents, 0));
