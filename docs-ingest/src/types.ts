import { z } from "zod";

export const ScopeSchema = z.enum(["file", "module", "repo", "library"]);
export type Scope = z.infer<typeof ScopeSchema>;

export const SourceKindSchema = z.enum([
  "markdown_dir",
  "html_url",
  "openapi_spec",
]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const DocFormatSchema = z.enum(["md", "html", "openapi"]);
export type DocFormat = z.infer<typeof DocFormatSchema>;

export const ModalitySchema = z.enum([
  "must",
  "must_not",
  "should",
  "should_not",
  "warning",
]);
export type Modality = z.infer<typeof ModalitySchema>;

export const RuleCategorySchema = z.enum([
  "security",
  "correctness",
  "performance",
  "api_contract",
  "style",
]);
export type RuleCategory = z.infer<typeof RuleCategorySchema>;

export const DocSourceSchema = z.object({
  id: z.string(),
  kind: SourceKindSchema,
  uri: z.string(),
  defaultScope: ScopeSchema,
  defaultLibraryName: z.string().optional(),
  codebaseRoot: z.string(),
  outputRoot: z.string(),
  ingestedAt: z.string().datetime().optional(),
});
export type DocSource = z.infer<typeof DocSourceSchema>;

export interface RawDoc {
  id: string;
  sourceId: string;
  path: string;
  title: string;
  format: DocFormat;
  text: string;
  structuredPayload?: unknown;
}

export interface DocChunk {
  id: string;
  rawDocId: string;
  text: string;
  headingPath: string[];
  anchorRef: string;
  position: number;
}

export interface ExtractedRefs {
  chunkId: string;
  filePathRefs: string[];
  symbolRefs: string[];
  libraryRefs: string[];
  pathConventionMatches: string[];
  inferredScope: Scope;
}

export interface RuleCitation {
  sourceId: string;
  chunkId: string;
  anchorRef: string;
  originalText: string;
}

export interface ExtractedRule {
  id: string;
  chunkId: string;
  ruleText: string;
  modality: Modality;
  category: RuleCategory;
  confidence: number;
  citation: RuleCitation;
}

export interface OutputLeafFrontmatter {
  scope: Scope;
  library?: string;
  applies_to: string[];
  source_id: string;
  source_uri: string;
  chunk_id: string;
  extracted_at: string;
  rules: Array<{
    modality: Modality;
    category: RuleCategory;
    text: string;
  }>;
}

export interface OutputLeaf {
  relativePath: string;
  frontmatter: OutputLeafFrontmatter;
  body: string;
}

export interface IngestResult {
  sourceId: string;
  rawDocsIndexed: number;
  chunksIndexed: number;
  rulesExtracted: number;
  leavesWritten: number;
  errors: Array<{ stage: string; message: string; path?: string }>;
}

export interface SourceStatus {
  sourceId: string;
  lastIngestedAt: string | null;
  leafCount: number;
  ruleCount: number;
}
