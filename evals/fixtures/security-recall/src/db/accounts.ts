import { Request, Response } from 'express';
import { db } from './client';

// Look up an account by email.
export async function getAccountByEmail(req: Request, res: Response) {
  const { email } = req.body;

  // DECOY parameterized-query: safe by design, a scanner must NOT flag this.
  // Uses a bound parameter ($1), no string interpolation.
  const rows = await db.query(
    'SELECT id, email, status FROM accounts WHERE email = $1',
    [email]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'not found' });
  }
  return res.json(rows[0]);
}
