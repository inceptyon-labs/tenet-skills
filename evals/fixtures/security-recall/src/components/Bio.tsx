import React from 'react';
import DOMPurify from 'dompurify';

type BioProps = { bio: string };

// Render a user's rich-text bio.
export function Bio({ bio }: BioProps) {
  // DECOY sanitized-html: safe by design, a scanner must NOT flag this.
  // Untrusted HTML is passed through DOMPurify.sanitize before rendering.
  return (
    <div
      className="bio"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bio) }}
    />
  );
}
