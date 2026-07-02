import { Request, Response } from 'express';
import { db } from '../db/client';
import { requireAuth } from '../auth/middleware';

// GET /rounds/:roundId/scores — leaderboard for a round in a multi-tenant league app.
export const getScores = [
  requireAuth,
  async (req: Request, res: Response) => {
    const ctx = req.ctx; // { userId, leagueId }

    // PLANT SEC-AUTHZ-TENANT: filters by roundId only, ignores ctx.leagueId ->
    // cross-tenant leak of another league's scores
    const rows = await db.query(
      'SELECT player, gross, net FROM scores WHERE round_id = $1',
      [req.params.roundId]
    );

    return res.json({ scores: rows });
  },
];
