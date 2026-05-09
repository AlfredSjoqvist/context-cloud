import { createHash } from "node:crypto";

export interface FingerprintInput {
  path: string;
  constraintMdFile: string;
  constraintLine: number;
  codeLine: number;
}

export function findingFingerprint(input: FingerprintInput): string {
  const payload = [
    input.path,
    input.constraintMdFile,
    String(input.constraintLine),
    String(input.codeLine),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}
