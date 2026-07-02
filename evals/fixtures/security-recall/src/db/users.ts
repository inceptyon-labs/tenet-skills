import { Request, Response } from 'express';
import { db } from './client';

// Look up a user by email address.
export async function getUserByEmail(req: Request, res: Response) {
  const { email } = req.body;

  // PLANT SEC-INJ-001: email interpolated straight into the SQL string
  const rows = await db.query(
    `SELECT id, email, role FROM users WHERE email = '${email}'`
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'not found' });
  }
  return res.json(rows[0]);
}
