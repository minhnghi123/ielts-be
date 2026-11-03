import { normalizeQuestionType } from '../constants/question-types';

/** Why a Reading/Listening answer was wrong. Stored in learner_mistakes.error_cause. */
export const ERROR_CAUSES = [
  'spelling',
  'word_limit',
  'paraphrase_miss',
  'tfng_confusion',
  'distractor',
  'number_format',
  'location_miss',
  'inference',
  'skipped',
  'time_management',
  'unknown',
] as const;
export type ErrorCause = (typeof ERROR_CAUSES)[number];

export interface ClassifyInput {
  questionType: string | null | undefined;
  userAnswer: string | null | undefined;
  correctAnswers: string[];
  /** Group instructions, e.g. "NO MORE THAN TWO WORDS AND/OR A NUMBER" */
  instructions?: string | null;
  /** True when the learner left several trailing questions blank (time ran out). */
  trailingSkipped?: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export function wordLimitFromInstructions(
  instructions: string | null | undefined,
): number | null {
  if (!instructions) return null;
  const text = instructions.replace(/<[^>]+>/g, ' ').toLowerCase();
  const m = /(?:no more than|not more than|maximum of)\s+(\w+)\s+words?/.exec(
    text,
  );
  if (m) return NUMBER_WORDS[m[1]] ?? (parseInt(m[1], 10) || null);
  const one = /\bone word only\b|\bonly one word\b/.exec(text);
  return one ? 1 : null;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const countWords = (s: string) =>
  norm(s)
    .split(/[\s-]+/)
    .filter((w) => /[a-z0-9]/i.test(w)).length;
/** Strip template markup used in answer keys: "(THE) CAR [OR] AUTO" → ["the car", "car", "auto"] */
function keyForms(key: string): string[] {
  const out = new Set<string>();
  for (const alt of key.split(/\s*\[OR\]\s*|\s*\/\s*/i)) {
    const withOpt = norm(alt.replace(/[()]/g, ''));
    const withoutOpt = norm(alt.replace(/\([^)]*\)/g, ''));
    if (withOpt) out.add(withOpt);
    if (withoutOpt) out.add(withoutOpt);
  }
  return [...out];
}

/**
 * Rule-based first pass. Deterministic and cheap; the AI explanation may refine
 * `unknown` into paraphrase_miss / location_miss / inference later.
 */
export function classifyErrorCause(input: ClassifyInput): ErrorCause {
  const given = norm(input.userAnswer ?? '');
  const type = normalizeQuestionType(input.questionType);
  if (!given) return input.trailingSkipped ? 'time_management' : 'skipped';

  const forms = input.correctAnswers.flatMap(keyForms);
  if (forms.includes(given)) return 'unknown'; // graded wrong for another reason (case-sensitive key)

  if (type === 'true_false_not_given' || type === 'yes_no_not_given')
    return 'tfng_confusion';
  if (type === 'matching_heading' || type === 'matching')
    return 'location_miss';
  if (type === 'multiple_choice') return 'inference';
  if (type === 'matching_features' || type === 'sentence_ending')
    return 'paraphrase_miss';

  // Completion / short answer
  const limit = wordLimitFromInstructions(input.instructions);
  if (
    limit != null &&
    countWords(given) > limit &&
    forms.some((f) => given.includes(f) || f.includes(given))
  ) {
    return 'word_limit';
  }
  const numeric = forms.some((f) => /\d/.test(f));
  if (numeric && /\d/.test(given)) return 'number_format';
  for (const f of forms) {
    const d = levenshtein(given, f);
    if (d > 0 && d <= Math.max(1, Math.floor(f.length / 4))) return 'spelling';
    // same stem, different inflection (s/es/ed/ing)
    if (given.replace(/(es|s|ed|ing)$/, '') === f.replace(/(es|s|ed|ing)$/, ''))
      return 'spelling';
  }
  if (limit != null && countWords(given) > limit) return 'word_limit';
  return 'paraphrase_miss';
}
