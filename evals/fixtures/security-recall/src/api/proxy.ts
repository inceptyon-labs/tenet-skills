import { Request, Response } from 'express';

// GET /proxy?url=... — fetch a remote resource on behalf of the client.
export async function proxy(req: Request, res: Response) {
  const url = req.query.url as string;

  // PLANT SEC-SSRF-001: user-controlled URL fetched server-side with no allowlist ->
  // SSRF to internal metadata endpoints (169.254.169.254), localhost, etc.
  const upstream = await fetch(url);
  const body = await upstream.text();

  res.set('content-type', upstream.headers.get('content-type') || 'text/plain');
  return res.send(body);
}
