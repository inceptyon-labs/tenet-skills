import { z } from "zod";
import { findUser } from "./repo";

const IdSchema = z.string().uuid();

export async function displayName(rawId: string): Promise<string> {
  const id = IdSchema.parse(rawId);
  const user = await findUser(id);
  if (!user) return "Former member";
  return user.handle;
}
