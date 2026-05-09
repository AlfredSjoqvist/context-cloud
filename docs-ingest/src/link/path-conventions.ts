import path from "node:path";

/**
 * Derive `applies_to` glob candidates from a doc's path using common
 * documentation-to-source layout conventions.
 *
 * Examples (POSIX paths):
 *   "docs/api/payments.md"      → ["src/api/payments/**", "src/api/payments*"]
 *   "docs/components/Button.md" → ["src/components/Button/**", "src/components/Button*"]
 *   "routes/payments.md"        → ["src/routes/payments/**", "src/routes/payments*"]
 *   "security-best-practices.md"→ []     (no path structure to leverage)
 */
export function derivePathGlobs(docPath: string): string[] {
  if (!docPath) return [];

  const posix = docPath.split(path.sep).join("/");
  // Strip leading "./", "/" and any "docs/" prefix (one or more times).
  let inner = posix.replace(/^(?:\.\/|\/)+/, "");
  // Allow "docs/", "doc/", or "documentation/" as the docs-root marker.
  inner = inner.replace(/^(?:docs|doc|documentation)\//i, "");

  // Strip extension.
  const stripped = inner.replace(/\.[^./]+$/, "");
  if (!stripped || !stripped.includes("/") && !looksLikeIdentifier(stripped)) {
    return [];
  }

  // We only emit globs when the doc has a directory structure OR an
  // identifier-shaped basename (e.g., "Button"). Bare topical filenames
  // like "security-best-practices" produce no candidates because they
  // aren't a path convention signal.
  const parts = stripped.split("/").filter((p) => p.length > 0);
  if (parts.length === 0) return [];

  if (parts.length === 1) {
    const base = parts[0]!;
    if (!looksLikeIdentifier(base)) return [];
    return [`src/${base}/**`, `src/${base}*`];
  }

  const joined = parts.join("/");
  return [`src/${joined}/**`, `src/${joined}*`];
}

/**
 * A "path-convention" signal is only meaningful when the basename looks
 * like a code identifier (route name, component name, module name) — not
 * a topical title with hyphens like "security-best-practices".
 */
function looksLikeIdentifier(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(name);
}
