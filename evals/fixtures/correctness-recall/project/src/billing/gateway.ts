/**
 * Thin client for the card processor.
 * Every amount is an integer number of cents, as the processor requires.
 */
export async function capture(orderId: string, amountCents: number): Promise<{ id: string }> {
  const res = await fetch("https://processor.example/v1/captures", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.PROCESSOR_KEY}` },
    body: JSON.stringify({ reference: orderId, amount: amountCents, currency: "usd" }),
  });
  if (!res.ok) throw new Error(`capture failed: ${res.status}`);
  return res.json();
}

export async function refundCapture(captureId: string, amountCents: number): Promise<void> {
  const res = await fetch(`https://processor.example/v1/captures/${captureId}/refunds`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.PROCESSOR_KEY}` },
    body: JSON.stringify({ amount: amountCents }),
  });
  if (!res.ok) throw new Error(`refund failed: ${res.status}`);
}
