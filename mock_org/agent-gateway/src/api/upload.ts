// Mock module for agent-gateway: src/api/upload.ts
// Intentionally minimal so Guardian's file-uploads constraints fire.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

export type UploadInput = {
  filename: string;
  contentType: string;
  body: Buffer;
};

export function handleUpload(input: UploadInput, destDir: string): string {
  // Path-traversal sink: client-supplied filename is joined directly.
  const target = join(destDir, input.filename);
  writeFileSync(target, input.body);
  return target;
}
