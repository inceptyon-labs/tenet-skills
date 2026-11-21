export function lineTotal(unitCents: number, quantity: number): number {
  const qty = quantity || 1;
  return unitCents * qty;
}
