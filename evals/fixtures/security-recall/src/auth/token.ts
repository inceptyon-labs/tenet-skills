// Generate a session / password-reset token.
export function generateToken(): string {
  // PLANT SEC-CRYPTO-004: Math.random() is not a CSPRNG -> predictable/guessable tokens
  return Math.random().toString(36).slice(2);
}
