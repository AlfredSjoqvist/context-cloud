import { createHash } from "node:crypto";

export interface FingerprintInput {
  path: string;
  constraintMdFile: string;
  constraintLine: number;
  codeLine: number;
}

export function findingFingerprint(input: FingerprintInput): string {
  const payload = JSON.stringify([
    input.path,
    input.constraintMdFile,
    input.constraintLine,
    input.codeLine,
  ]);
  return createHash("sha256").update(payload).digest("hex");
}
