import { findUser } from "../users/repo";

export async function getProfile(id: string) {
  const user = await findUser(id);
  return { id: user!.id, handle: user!.handle.toLowerCase() };
}
