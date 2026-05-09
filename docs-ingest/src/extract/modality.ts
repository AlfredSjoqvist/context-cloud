import type { Modality } from "../types.js";

export interface ModalityHit {
  modality: Modality;
  marker: string;
  bolded: boolean;
}

const PATTERNS: Array<{ regex: RegExp; modality: Modality; marker: string }> = [
  { regex: /\bmust\s+not\b/i, modality: "must_not", marker: "must not" },
  { regex: /\bshould\s+not\b/i, modality: "should_not", marker: "should not" },
  { regex: /\bnever\b/i, modality: "must_not", marker: "never" },
  { regex: /\bmust\b/i, modality: "must", marker: "must" },
  { regex: /\balways\b/i, modality: "must", marker: "always" },
  { regex: /\bshould\b/i, modality: "should", marker: "should" },
  { regex: /\b(?:warning|caution|do\s+not)\b/i, modality: "warning", marker: "warning" },
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
