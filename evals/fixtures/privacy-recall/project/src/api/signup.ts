import { randomUUID } from "node:crypto";
import { sql } from "../db/client";
import type { User } from "../db/models";

export async function signup(input: { email: string; fullName: string; phone?: string; password: string }): Promise<User> {
  const id = randomUUID();
  const hash = await Bun.password.hash(input.password);
  await sql`insert into users (id, email, full_name, phone, password_hash)
            values (${id}, ${input.email}, ${input.fullName}, ${input.phone ?? null}, ${hash})`;
  console.log(`new signup: ${input.fullName} <${input.email}> phone=${input.phone}`);
  return { id, email: input.email, fullName: input.fullName, phone: input.phone ?? null, dateOfBirth: null, plan: "member" };
}
