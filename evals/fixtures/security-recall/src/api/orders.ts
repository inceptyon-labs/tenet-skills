import { Request, Response } from 'express';
import { db } from '../db/client';
import { requireAuth } from '../auth/middleware';

// GET /orders/:id — authenticated order detail.
export const getOrder = [
  requireAuth,
  async (req: Request, res: Response) => {
    // NOTE: the query itself is parameterized and injection-safe ($1 + bind array).
    // PLANT SEC-AUTHZ-IDOR: no ownership predicate — any logged-in user can read any order by id
    const rows = await db.query(
      'SELECT * FROM orders WHERE id = $1',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'not found' });
    }
    return res.json(rows[0]);
  },
];
