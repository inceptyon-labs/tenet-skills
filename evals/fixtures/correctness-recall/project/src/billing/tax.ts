const RATE_BASIS_POINTS = 825;

export function taxFor(subtotalCents: number): number {
  return Math.round((subtotalCents * RATE_BASIS_POINTS) / 10_000);
}
