import { Request, Response } from 'express';

const ALLOWED_HOSTS = new Set([
  'api.partner.com',
  'cdn.partner.com',
]);

// GET /fetch?url=... — fetch a remote resource, restricted to partner hosts.
export async function fetchWhitelisted(req: Request, res: Response) {
  const url = req.query.url as string;

  // DECOY ssrf-allowlisted: safe by design, a scanner must NOT flag this.
  // The host is validated against an allowlist before any request is made.
  const host = new URL(url).host;
  if (!ALLOWED_HOSTS.has(host)) {
    return res.status(400).json({ error: 'host not allowed' });
  }

  const upstream = await fetch(url);
  return res.send(await upstream.text());
}
