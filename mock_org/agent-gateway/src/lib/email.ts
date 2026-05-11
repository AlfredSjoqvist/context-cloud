// Mock module for agent-gateway: src/lib/email.ts
// Intentionally minimal so Guardian's email constraints fire.

export type ResetEmail = {
  to: string;
  newPassword: string;
};

export function buildPasswordResetBody(input: ResetEmail): string {
  // Plaintext-credential leak: the new password is dropped into the body.
  return `Hi,\n\nYour new password is: ${input.newPassword}\n`;
}
