export function inviteLink(inviterName: string, inviteeEmail: string): string {
  const base = "https://club.example.org/join";
  return `${base}?email=${encodeURIComponent(inviteeEmail)}&name=${encodeURIComponent(inviterName)}`;
}
