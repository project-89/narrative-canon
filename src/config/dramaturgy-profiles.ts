/**
 * DRAMATURGY PROFILES (docs/DRAMATURGY_DESIGN.md §3) — per-medium vocabulary
 * for ONE dramaturgy model. Film acts vs comic chapters differ in label,
 * weight unit, and template vocabulary; they are CONFIG, never a schema fork
 * (two Beat schemas is how two dramaturgy models slowly stop agreeing about
 * what a beat is).
 */

export interface DramaturgyProfile {
  /** The group rail heading ("Act", "Chapter"). */
  groupLabel: string;
  groupKind: 'act' | 'issue' | 'episode' | 'chapter' | 'sequence';
  /** The unit Beat.weight is read in. */
  weightUnit: 'min' | 'pages' | 'panels' | 'sec';
  /** Suggested functionTag vocabularies — SUGGESTIONS, never slots. */
  templates: string[];
}

export const DRAMATURGY_PROFILES: Record<string, DramaturgyProfile> = {
  film: { groupLabel: 'Act', groupKind: 'act', weightUnit: 'min', templates: ['three-act', 'save-the-cat', 'sequence-8', 'free'] },
  episode: { groupLabel: 'Act', groupKind: 'act', weightUnit: 'min', templates: ['teaser-4act', 'three-act', 'free'] },
  comic: { groupLabel: 'Chapter', groupKind: 'chapter', weightUnit: 'pages', templates: ['issue-22', 'five-part', 'free'] },
  shorts: { groupLabel: 'Beat run', groupKind: 'sequence', weightUnit: 'sec', templates: ['hook-payoff', 'free'] },
  // Episodes-as-scenes serial: beats group into runs of episodes; the charge
  // curve saws upward (every episode exits on an unresolved spike).
  microdrama: { groupLabel: 'Beat run', groupKind: 'sequence', weightUnit: 'sec', templates: ['hook-cliffhanger', 'format-gag', 'hook-payoff', 'free'] },
};

export function profileFor(format?: string): DramaturgyProfile {
  return DRAMATURGY_PROFILES[String(format || 'film')] || DRAMATURGY_PROFILES.film;
}
