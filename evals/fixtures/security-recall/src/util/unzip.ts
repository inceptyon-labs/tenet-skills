import path from 'path';
import fs from 'fs';

type ZipEntry = { name: string; data: Buffer };

// Extract archive entries into destDir.
export function extractAll(entries: ZipEntry[], destDir: string) {
  for (const entry of entries) {
    // PLANT SEC-PARSE-002: zip-slip — entry.name ("../../etc/cron.d/x") joined with no
    // prefix validation lets an archive write outside destDir
    const outPath = path.join(destDir, entry.name);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, entry.data);
  }
}
