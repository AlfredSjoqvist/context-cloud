import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile as fsReadFile } from "node:fs/promises";
import { join } from "node:path";
import type { Finding, Severity } from "./types.js";

const execFileAsync = promisify(execFile);

interface NpmAuditAdvisory {
  readonly source?: number;
  readonly name?: string;
  readonly title?: string;
  readonly url?: string;
  readonly severity?: string;
  readonly range?: string;
}

interface NpmAuditVulnerability {
  readonly name: string;
  readonly severity: string;
  readonly via?: ReadonlyArray<string | NpmAuditAdvisory>;
  readonly fixAvailable?: { name: string; version: string } | boolean;
}

interface NpmAuditOutput {
  readonly vulnerabilities?: Record<string, NpmAuditVulnerability>;
}

export interface AuditPackageJsonArgs {
  readonly cwd: string;
  readPackageJson?: () => Promise<string>;
  runAudit?: () => Promise<string>;
}

export async function auditPackageJson(args: AuditPackageJsonArgs): Promise<Finding[]> {
  const audit = await (args.runAudit ?? defaultRunAudit(args.cwd))();
  const pkg = await (args.readPackageJson ?? defaultReadPackageJson(args.cwd))();

  let parsed: NpmAuditOutput;
  try {
    parsed = JSON.parse(audit) as NpmAuditOutput;
  } catch {
    return [];
  }

  const vulns = Object.values(parsed.vulnerabilities ?? {});
  const findings: Finding[] = [];

  for (const v of vulns) {
    const advisory = (v.via ?? []).find(
      (entry): entry is NpmAuditAdvisory => typeof entry !== "string",
    );
    if (!advisory) continue;

    const line = findDependencyLine(pkg, v.name);
    const fixVersion =
      typeof v.fixAvailable === "object" && v.fixAvailable !== null
        ? v.fixAvailable.version
        : "";

    findings.push({
      path: "package.json",
      severity: normalizeSeverity(v.severity),
      category: "security",
      codeCite: {
        line,
        excerpt: `"${v.name}": ...`,
      },
      constraintCite: {
        mdFile: "npm-audit",
        line: advisory.source ?? 0,
        text: advisory.title ?? `Vulnerability in ${v.name}`,
      },
      reasoning: `CVE in dependency \`${v.name}\` (${v.severity}). ${
        advisory.title ?? ""
      } ${advisory.url ? `(${advisory.url})` : ""}`.trim(),
      suggestedFixDirection: fixVersion
        ? `Bump \`${v.name}\` to ${fixVersion} or later. Range affected: ${
            advisory.range ?? "n/a"
          }.`
        : `Upgrade or remove \`${v.name}\`. Range affected: ${advisory.range ?? "n/a"}.`,
    });
  }

  return findings;
}

function findDependencyLine(packageJson: string, depName: string): number {
  const lines = packageJson.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(`"${depName}"`)) return i + 1;
  }
  return 1;
}

function normalizeSeverity(s: string): Severity {
  const lower = s.toLowerCase();
  if (lower === "critical" || lower === "high" || lower === "medium" || lower === "low") {
    return lower;
  }
  return "medium";
}

function defaultRunAudit(cwd: string): () => Promise<string> {
  return async () => {
    try {
      const { stdout } = await execFileAsync("npm", ["audit", "--json"], { cwd });
      return stdout;
    } catch (err) {
      const e = err as { stdout?: string };
      if (e.stdout) return e.stdout;
      throw err;
    }
  };
}

function defaultReadPackageJson(cwd: string): () => Promise<string> {
  return () => fsReadFile(join(cwd, "package.json"), "utf8");
}
