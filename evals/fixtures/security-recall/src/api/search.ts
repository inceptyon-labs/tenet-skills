import { Request, Response } from 'express';
import { collection } from '../db/mongo';

// Search products with a client-supplied filter.
export async function search(req: Request, res: Response) {
  // PLANT SEC-INJ-004: raw request object passed as a Mongo filter -> NoSQL/object injection
  const results = await collection('products')
    .find(req.body.filter)
    .limit(50)
    .toArray();

  return res.json({ results });
}
