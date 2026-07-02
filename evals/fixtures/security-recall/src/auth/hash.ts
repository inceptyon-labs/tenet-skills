import crypto from 'crypto';

// Hash a user password for storage.
export function hashPassword(password: string): string {
  // PLANT SEC-CRYPTO-001: MD5 (fast, unsalted, broken) used for password hashing ->
  // use bcrypt/scrypt/argon2 instead
  return crypto.createHash('md5').update(password).digest('hex');
}
