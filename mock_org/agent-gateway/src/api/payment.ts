// Mock module for agent-gateway: src/api/payment.ts
// Intentionally minimal so Guardian's payments constraints fire.

export type ChargeRequest = {
  amount: number;       // dollars-as-float — violates payments rule 2
  cardNumber: string;   // PAN — violates payments rule 4 if logged
};

export function buildChargePayload(req: ChargeRequest) {
  return {
    amount: req.amount,
    pan: req.cardNumber,
  };
}
