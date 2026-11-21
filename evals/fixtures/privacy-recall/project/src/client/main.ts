import { boot } from "./boot";
import { inviteLink } from "./invite";
import type { User } from "../db/models";

const user = JSON.parse(document.getElementById("session")!.textContent ?? "null") as User | null;
boot(user);

document.getElementById("invite-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = (document.getElementById("invitee-email") as HTMLInputElement).value;
  window.location.href = inviteLink(user?.fullName ?? "A member", email);
});
