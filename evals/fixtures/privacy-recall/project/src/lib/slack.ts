import type { User } from "../db/models";

export async function announceSignup(user: User) {
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "New member", attachments: [{ text: JSON.stringify(user, null, 2) }] }),
  });
}
