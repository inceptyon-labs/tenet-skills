/**
 * Splits are rounded half DOWN on purpose: the shop absorbs the odd cent instead of
 * charging it to the customer. See rounding.test.ts.
 */
export function roundHalfDown(value: number): number {
  const floor = Math.floor(value);
  return value - floor > 0.5 ? floor + 1 : floor;
}
