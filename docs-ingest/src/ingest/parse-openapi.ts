import SwaggerParser from "@apidevtools/swagger-parser";
import type { ParsedDoc, ParsedSection } from "./parse-md.js";

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

function isHttpMethod(s: string): s is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(s);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asArray(v: unknown): unknown[] | undefined {
  return Array.isArray(v) ? v : undefined;
}

interface OpenApiInfoView {
  title: string;
  description: string | undefined;
}

function readInfo(doc: Record<string, unknown>): OpenApiInfoView {
  const info = isObject(doc["info"]) ? doc["info"] : {};
  return {
    title: asString(info["title"]) ?? "",
    description: asString(info["description"]),
  };
}

function firstSecuritySchemeName(security: unknown): string | undefined {
  const arr = asArray(security);
  if (!arr || arr.length === 0) return undefined;
  for (const entry of arr) {
    if (!isObject(entry)) continue;
    const keys = Object.keys(entry);
    if (keys.length > 0) return keys[0];
  }
  return undefined;
}

interface ParameterView {
  name: string;
  location: string;
  required: boolean;
  description: string | undefined;
}

function readParameters(op: Record<string, unknown>): ParameterView[] {
  const params = asArray(op["parameters"]);
  if (!params) return [];
  const out: ParameterView[] = [];
  for (const p of params) {
    if (!isObject(p)) continue;
    const name = asString(p["name"]);
    if (!name) continue;
    out.push({
      name,
      location: asString(p["in"]) ?? "",
      required: p["required"] === true,
      description: asString(p["description"]),
    });
  }
  return out;
}

interface RequestBodyView {
  required: boolean;
  fields: Array<{ name: string; description: string | undefined }>;
}

function readRequestBody(op: Record<string, unknown>): RequestBodyView | null {
  const rb = op["requestBody"];
  if (!isObject(rb)) return null;
  const required = rb["required"] === true;
  const content = isObject(rb["content"]) ? rb["content"] : null;
  if (!content) return { required, fields: [] };

  // Pick the first JSON-ish media type's schema if present, otherwise the first.
  const mediaTypes = Object.keys(content);
  const preferred =
    mediaTypes.find((m) => /json/i.test(m)) ?? mediaTypes[0];
  if (!preferred) return { required, fields: [] };

  const media = content[preferred];
  if (!isObject(media)) return { required, fields: [] };
  const schema = media["schema"];
  if (!isObject(schema)) return { required, fields: [] };

  const requiredList = asArray(schema["required"]) ?? [];
  const requiredNames = new Set(
    requiredList.filter((x): x is string => typeof x === "string"),
  );
  const properties = isObject(schema["properties"]) ? schema["properties"] : {};

  const fields: Array<{ name: string; description: string | undefined }> = [];
  for (const name of requiredNames) {
    const prop = properties[name];
    fields.push({
      name,
      description: isObject(prop) ? asString(prop["description"]) : undefined,
    });
  }
  return { required, fields };
}

function buildEndpointBody(
  method: string,
  pathTemplate: string,
  op: Record<string, unknown>,
): string {
  const lines: string[] = [];
  const summary = asString(op["summary"]);
  const description = asString(op["description"]);

  lines.push(`# ${method.toUpperCase()} ${pathTemplate}`);
  lines.push("");

  if (summary) {
    lines.push(`Summary: ${summary}`);
    lines.push("");
  }
  if (description) {
    lines.push(description.trim());
    lines.push("");
  }

  // Imperative scaffolding so the rule extractor has signal.
  lines.push(
    `Callers MUST send a request to \`${method.toUpperCase()} ${pathTemplate}\` exactly as documented.`,
  );

  const schemeName = firstSecuritySchemeName(op["security"]);
  if (schemeName) {
    lines.push("");
    lines.push(`Authentication: ${schemeName}`);
    lines.push(
      `Callers MUST authenticate this request using the \`${schemeName}\` security scheme. Servers MUST reject unauthenticated requests.`,
    );
  }

  const params = readParameters(op);
  const requiredParams = params.filter((p) => p.required);
  if (requiredParams.length > 0) {
    lines.push("");
    lines.push("Required parameters:");
    for (const p of requiredParams) {
      const desc = p.description ? ` — ${p.description.trim()}` : "";
      lines.push(`- \`${p.name}\` (in: ${p.location}): MUST be provided${desc}`);
    }
  }

  const body = readRequestBody(op);
  if (body && body.fields.length > 0) {
    lines.push("");
    lines.push("Required request body fields:");
    for (const f of body.fields) {
      const desc = f.description ? ` — ${f.description.trim()}` : "";
      lines.push(`- \`${f.name}\`: MUST be provided${desc}`);
    }
  } else if (body && body.required) {
    lines.push("");
    lines.push("A request body MUST be provided.");
  }

  return lines.join("\n").trim();
}

function buildSecuritySchemeBody(
  schemeName: string,
  scheme: Record<string, unknown>,
): string {
  const lines: string[] = [];
  lines.push(`# Security scheme: ${schemeName}`);
  lines.push("");
  const type = asString(scheme["type"]);
  const httpScheme = asString(scheme["scheme"]);
  const bearerFormat = asString(scheme["bearerFormat"]);
  const description = asString(scheme["description"]);
  const inLoc = asString(scheme["in"]);
  const name = asString(scheme["name"]);

  if (type) lines.push(`Type: ${type}`);
  if (httpScheme) lines.push(`Scheme: ${httpScheme}`);
  if (bearerFormat) lines.push(`Bearer format: ${bearerFormat}`);
  if (inLoc) lines.push(`Location: ${inLoc}`);
  if (name) lines.push(`Header/parameter name: ${name}`);

  if (description) {
    lines.push("");
    lines.push(description.trim());
  }

  lines.push("");
  lines.push(
    `Callers MUST authenticate using the \`${schemeName}\` scheme. Servers MUST validate the credential before processing the request and MUST reject invalid credentials with HTTP 401.`,
  );

  return lines.join("\n").trim();
}

export async function parseOpenApi(
  rawText: string,
  docPath: string,
): Promise<ParsedDoc> {
  // swagger-parser accepts a parsed object too — parse YAML/JSON ourselves
  // is fragile, but it accepts file paths only. Easiest path: write to a temp
  // path is overkill; instead we hand it the already-parsed structure by
  // letting it parse the spec via its own YAML/JSON parsers using a string
  // fallback. The library actually requires a path or pre-parsed object, so
  // we parse the raw text by reusing its built-in parsers via `parse`/`bundle`
  // which accept an object. We rely on a tiny YAML/JSON shim by trying JSON
  // first and falling back to the YAML parser bundled inside the library.
  //
  // In practice, `validate` accepts an OpenAPI.Document object directly, so
  // we parse the raw text ourselves with a minimal strategy: try JSON, and
  // if that fails use the YAML parser that ships transitively with
  // swagger-parser via the `js-yaml` dependency.
  const parsed = await parseRawSpec(rawText);

  const Parser = SwaggerParser as unknown as {
    validate: (api: unknown) => Promise<unknown>;
  };
  const apiUnknown: unknown = await Parser.validate(parsed);
  if (!isObject(apiUnknown)) {
    throw new Error(`OpenAPI parser returned a non-object document.`);
  }
  const api = apiUnknown;

  const info = readInfo(api);
  const title = info.title || docPath;

  const sections: ParsedSection[] = [];

  // Endpoints
  const paths = isObject(api["paths"]) ? api["paths"] : {};
  for (const [pathTemplate, pathItemRaw] of Object.entries(paths)) {
    if (!isObject(pathItemRaw)) continue;
    for (const key of Object.keys(pathItemRaw)) {
      if (!isHttpMethod(key)) continue;
      const op = pathItemRaw[key];
      if (!isObject(op)) continue;
      const body = buildEndpointBody(key, pathTemplate, op);
      sections.push({
        headingPath: [title, "Endpoints", `${key.toUpperCase()} ${pathTemplate}`],
        anchorRef: `${docPath}#${key}-${slug(pathTemplate)}`,
        body,
      });
    }
  }

  // Security schemes
  const components = isObject(api["components"]) ? api["components"] : {};
  const schemes = isObject(components["securitySchemes"])
    ? components["securitySchemes"]
    : {};
  for (const [schemeName, schemeRaw] of Object.entries(schemes)) {
    if (!isObject(schemeRaw)) continue;
    sections.push({
      headingPath: [title, "Security Schemes", schemeName],
      anchorRef: `${docPath}#security-${slug(schemeName)}`,
      body: buildSecuritySchemeBody(schemeName, schemeRaw),
    });
  }

  if (sections.length === 0) {
    sections.push({
      headingPath: [title],
      anchorRef: docPath,
      body: rawText.trim(),
    });
  }

  return { title, sections };
}

async function parseRawSpec(rawText: string): Promise<unknown> {
  const trimmed = rawText.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(rawText);
  }
  // Use the YAML parser that ships with swagger-parser's dependency tree.
  // We import dynamically to avoid declaring js-yaml as a direct dependency,
  // and reference it via a computed specifier so TypeScript does not try to
  // resolve types for it at compile time.
  const yamlSpecifier = "js-yaml";
  const yamlMod = (await import(yamlSpecifier)) as unknown as {
    load?: (s: string) => unknown;
    default?: { load?: (s: string) => unknown };
  };
  const load = yamlMod.load ?? yamlMod.default?.load;
  if (typeof load !== "function") {
    throw new Error("js-yaml loader is unavailable");
  }
  return load(rawText);
}
