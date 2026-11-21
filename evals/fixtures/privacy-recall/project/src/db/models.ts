export type User = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  dateOfBirth: string | null;
  plan: "member" | "coach" | "admin";
};

export type PaymentMethod = { id: string; userId: string; cardLast4: string; processorToken: string };
