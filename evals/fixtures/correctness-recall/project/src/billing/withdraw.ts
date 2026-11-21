import { debit, getBalance } from "./balance";

export async function withdraw(userId: string, amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("invalid amount");

  const balance = getBalance(userId);
  if (balance < amountCents) throw new Error("insufficient funds");

  return debit(userId, amountCents);
}
