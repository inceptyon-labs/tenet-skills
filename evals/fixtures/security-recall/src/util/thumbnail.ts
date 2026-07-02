import { Request, Response } from 'express';
import { execFile } from 'child_process';

// Generate a thumbnail from an uploaded image.
export function makeThumbnail(file: string, res: Response) {
  // DECOY execFile-array: safe by design, a scanner must NOT flag this.
  // execFile with an argv array and no shell — arguments cannot break out into shell metachars.
  execFile('convert', [file, 'out.png'], (err) => {
    if (err) {
      return res.status(500).json({ error: 'thumbnail failed' });
    }
    return res.json({ ok: true });
  });
}
