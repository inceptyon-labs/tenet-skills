import { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from './drizzle';

// List reports owned by the current user.
export async function getReports(req: Request, res: Response) {
  const userId = req.user.id;

  // DECOY drizzle-tagged-template: safe by design, a scanner must NOT flag this.
  // Drizzle's sql`` tagged template parameterizes ${userId} — it is NOT raw interpolation.
  const rows = await db.execute(
    sql`SELECT id, title, created_at FROM reports WHERE owner = ${userId}`
  );

  return res.json({ reports: rows });
}
