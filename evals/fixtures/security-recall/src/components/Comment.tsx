import React from 'react';

type CommentProps = {
  comment: { id: string; author: string; body: string };
};

// Render a single user comment.
export function Comment({ comment }: CommentProps) {
  // PLANT SEC-INJ-003: raw user comment body injected as HTML with no sanitizer -> stored XSS
  return (
    <div className="comment">
      <span className="author">{comment.author}</span>
      <div
        className="body"
        dangerouslySetInnerHTML={{ __html: comment.body }}
      />
    </div>
  );
}
