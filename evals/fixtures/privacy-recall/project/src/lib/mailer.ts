import { Resend } from "resend";
import type { User } from "../db/models";

const resend = new Resend(process.env.RESEND_KEY);

export async function sendWelcome(user: User) {
  await resend.emails.send({ from: "club@example.org", to: user.email, subject: "Welcome", text: `Hi ${user.fullName}, you are in.` });
}

export async function sendReset(email: string, token: string) {
  await resend.emails.send({ from: "club@example.org", to: email, subject: "Reset your password", text: `https://club.example.org/reset#${token}` });
}
