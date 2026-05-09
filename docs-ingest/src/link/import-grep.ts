import { promises as fs } from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".context-map",
  ".next",
  ".turbo",
  "coverage",
]);

const CODE_EXT = /\.(?:[mc]?[jt]sx?)$/i;

async function* walkCode(root: string): AsyncIterable<string> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) yield* walkCode(full);
    else if (entry.isFile() && CODE_EXT.test(entry.name)) yield full;
  }
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildImportRegex(libName: string): RegExp {
  const lib = escapeForRegex(libName);
  // Matches: import ... from "lib" | "lib/sub"
  //          require("lib") | require("lib/sub")
  //          import("lib")
  return new RegExp(
    String.raw`(?:from|require\(|import\()\s*['"]${lib}(?:\/[^'"]*)?['"]`,
    "m",
  );
}

export interface ImportMatch {
  relativePath: string;
  matchedLines: number[];
}

export async function findImporters(
  codebaseRoot: string,
  libName: string,
  options: { searchDir?: string } = {},
): Promise<ImportMatch[]> {
  const searchRoot = path.join(codebaseRoot, options.searchDir ?? "src");
  const regex = buildImportRegex(libName);
  const matches: ImportMatch[] = [];

  for await (const file of walkCode(searchRoot)) {
    let body: string;
    try {
      body = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    if (!regex.test(body)) continue;

    const lines = body.split("\n");
    const matchedLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && regex.test(line)) matchedLines.push(i + 1);
    }
    matches.push({
      relativePath: path.relative(codebaseRoot, file),
      matchedLines,
    });
  }

  return matches;
}

export interface LibraryImportMap {
  library: string;
  matches: ImportMatch[];
  globs: string[];
}

export async function buildLibraryImportMap(
  codebaseRoot: string,
  libNames: string[],
): Promise<LibraryImportMap[]> {
  const out: LibraryImportMap[] = [];
  for (const lib of libNames) {
    const matches = await findImporters(codebaseRoot, lib);
    const globs = matches.length > 0
      ? matches.map((m) => m.relativePath)
      : [`src/**/*.{ts,tsx,js,mjs,cjs}`];
    out.push({ library: lib, matches, globs });
  }
  return out;
}
