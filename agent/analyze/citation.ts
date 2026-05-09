import type { NiaClient } from "../tools/niaClient.js";
import type { Finding } from "./types.js";

export type CitationResult = { ok: true } | { ok: false; reason: string };

export interface VerifyCitationArgs {
  readonly finding: Finding;
  readonly nia: NiaClient;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export async function verifyCitation(args: VerifyCitationArgs): Promise<CitationResult> {
  const { finding, nia } = args;

  let body: string;
  try {
    body = await nia.readFile(finding.path);
  } catch (err) {
    return { ok: false, reason: `code: cannot read ${finding.path} (${(err as Error).message})` };
  }

  const lines = body.split("\n");
  const lineIdx = finding.codeCite.line - 1;
  if (lineIdx < 0 || lineIdx >= lines.length) {
    return {
      ok: false,
      reason: `code: line ${finding.codeCite.line} out of range (file has ${lines.length} lines)`,
    };
  }
  const actual = normalize(lines[lineIdx]!);
  const expected = normalize(finding.codeCite.excerpt);
  if (!actual.includes(expected) && !expected.includes(actual)) {
    return {
      ok: false,
      reason: `code: line ${finding.codeCite.line} excerpt does not match`,
    };
  }

  const constraintOk = await nia.verifyConstraintCite(
    finding.constraintCite.mdFile,
    finding.constraintCite.line,
    finding.constraintCite.text,
  );
  if (!constraintOk) {
    return {
      ok: false,
      reason: `constraint: ${finding.constraintCite.mdFile}:${finding.constraintCite.line} text mismatch`,
    };
  }

  return { ok: true };
}
