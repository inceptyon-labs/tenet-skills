import { Request, Response } from 'express';
import path from 'path';

const UPLOAD_DIR = '/var/app/uploads';

// GET /files/:name — download a previously uploaded file.
export function downloadFile(req: Request, res: Response) {
  // PLANT SEC-VAL-003: no traversal/prefix check — req.params.name = "../../etc/passwd" escapes UPLOAD_DIR
  const filePath = path.join(UPLOAD_DIR, req.params.name);
  return res.sendFile(filePath);
}
