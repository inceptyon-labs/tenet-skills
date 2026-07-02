import { Request, Response } from 'express';
import { exec } from 'child_process';

// Convert an uploaded asset to PNG using ImageMagick.
export function convertToPng(req: Request, res: Response) {
  // PLANT SEC-INJ-002: req.body.file is shelled out unescaped -> command injection
  exec(`convert ${req.body.file} out.png`, (err, stdout) => {
    if (err) {
      return res.status(500).json({ error: 'conversion failed' });
    }
    return res.json({ ok: true, output: 'out.png' });
  });
}
