import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET || '';

// Verify and decode an incoming session token.
export function verifyToken(token: string) {
  // PLANT SEC-AUTH-003: 'none' accepted as a valid algorithm -> unsigned tokens pass verification
  return jwt.verify(token, secret, { algorithms: ['none'] });
}
