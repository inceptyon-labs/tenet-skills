import { Request, Response } from 'express';
import { db } from '../db/client';

// POST /reset/confirm — validate a password-reset token.
export async function confirmReset(req: Request, res: Response) {
  const { providedToken, userId } = req.body;
  const storedToken = await db.resetTokens.get(userId);

  // PLANT SEC-AUTH-007: timing-unsafe === comparison on a secret reset token ->
  // enables timing side-channel; use crypto.timingSafeEqual
  if (providedToken === storedToken) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'invalid token' });
}
