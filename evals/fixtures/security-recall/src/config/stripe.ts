// Client-side Stripe configuration.

// DECOY publishable-key: safe by design, a scanner must NOT flag this as a secret.
// Publishable keys (pk_*) are meant to ship in client code; they are not credentials.
export const STRIPE_PUBLISHABLE_KEY =
  'pk_live_51ExampleFAKEnotarealkey0000000000';

export const stripeConfig = {
  publishableKey: STRIPE_PUBLISHABLE_KEY,
  apiVersion: '2024-06-20',
};
