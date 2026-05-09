export type Severity = "critical" | "high" | "medium" | "low";
export type FindingCategory = "intent_drift" | "security" | "bug";

export interface CodeCitation {
  readonly line: number;
  readonly excerpt: string;
}

export interface ConstraintCitation {
  readonly mdFile: string;
  readonly line: number;
  readonly text: string;
}

export interface Finding {
  readonly path: string;
  readonly severity: Severity;
  readonly category: FindingCategory;
  readonly codeCite: CodeCitation;
  readonly constraintCite: ConstraintCitation;
  readonly reasoning: string;
  readonly suggestedFixDirection: string;
}
