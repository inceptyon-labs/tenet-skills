import { Request, Response } from 'express';
import { db } from '../db/client';
import { requireAuth } from '../auth/middleware';

// User model: { id, email, displayName, bio, role }

// PATCH /profile — update the current user's profile.
export const updateProfile = [
  requireAuth,
  async (req: Request, res: Response) => {
    const id = req.user.id;

    // PLANT SEC-AUTHZ-MASS: whole request body spread into the update ->
    // attacker can set { role: 'admin' } via mass assignment
    await db.users.update({ id }, { ...req.body });

    return res.json({ ok: true });
  },
];
