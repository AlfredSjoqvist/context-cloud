import crypto from "crypto";

export function verifyGitHubSignature(secret: string, body: string, signature: string | null) {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function parseWebhook(body: string) {
  return JSON.parse(body) as { action?: string; repository?: { full_name?: string } };
}
