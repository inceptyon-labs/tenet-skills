import { Request, Response } from 'express';
import { db } from '../db/client';
import { requireAuth } from '../auth/middleware';

// GET /invoices/:id — authenticated invoice detail.
export const getInvoice = [
  requireAuth,
  async (req: Request, res: Response) => {
    // DECOY scoped-query: safe by design, a scanner must NOT flag this.
    // Parameterized AND ownership-scoped (user_id = $2) — no IDOR, no injection.
    const rows = await db.query(
      'SELECT * FROM invoices WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'not found' });
    }
    return res.json(rows[0]);
  },
];
