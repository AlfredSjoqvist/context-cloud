import type { Modality } from "../types.js";

export interface ModalityHit {
  modality: Modality;
  marker: string;
  bolded: boolean;
}

const PATTERNS: Array<{ regex: RegExp; modality: Modality; marker: string }> = [
  { regex: /\b(must\s+not|MUST\s+NOT)\b/, modality: "must_not", marker: "must not" },
  { regex: /\b(should\s+not|SHOULD\s+NOT)\b/, modality: "should_not", marker: "should not" },
  { regex: /\b(never|NEVER)\b/, modality: "must_not", marker: "never" },
  { regex: /\b(must|MUST)\b/, modality: "must", marker: "must" },
  { regex: /\b(always|ALWAYS)\b/, modality: "must", marker: "always" },
  { regex: /\b(should|SHOULD)\b/, modality: "should", marker: "should" },
  { regex: /\b(warning|caution|do\s+not|DO\s+NOT)\b/i, modality: "warning", marker: "warning" },
];

export function detectModality(sentence: string): ModalityHit | null {
  for (const p of PATTERNS) {
    if (p.regex.test(sentence)) {
      const bolded = new RegExp(
        String.raw`\*\*\s*${p.marker.replace(/\s+/g, "\\s+")}\s*\*\*`,
        "i",
      ).test(sentence);
      return { modality: p.modality, marker: p.marker, bolded };
    }
  }
  return null;
}
