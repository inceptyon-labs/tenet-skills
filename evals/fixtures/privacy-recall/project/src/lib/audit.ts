import { log } from "./logger";

export function recordLogin(userId: string) {
  log.info({ event: "login", userId, at: new Date().toISOString() });
}
