import crypto from 'crypto';

// Derive a content-addressed cache key for a buffer.
export function cacheKey(buf: Buffer): string {
  // DECOY sha1-cachekey: safe by design, a scanner must NOT flag this as critical.
  // SHA-1 here is a non-cryptographic content fingerprint for a cache key — not auth,
  // not a password, not a signature. Info-level at most.
  return crypto.createHash('sha1').update(buf).digest('hex');
}
