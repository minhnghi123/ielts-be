/**
 * Canonical IELTS question-type codes shared by every service.
 *
 * Historically each layer used its own spelling (`matching_headings` in the
 * DOCX importer, `matching_heading` in the web builder, `true_false_ng` in
 * analytics SQL…), which split one skill into several buckets in mastery
 * reports. Everything that writes `questions.question_type` must go through
 * `normalizeQuestionType()`; everything that reads it should too.
 */
export const QUESTION_TYPES = [
  'multiple_choice',
  'fill_in_blank',
  'short_answer',
  'true_false_not_given',
  'yes_no_not_given',
  'matching_heading',
  'matching',
  'matching_features',
  'sentence_ending',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Legacy / free-form spellings → canonical code. Keys are already slugified. */
const QUESTION_TYPE_ALIASES: Record<string, QuestionType> = {
  mcq: 'multiple_choice',
  multiple_choices: 'multiple_choice',
  single_choice: 'multiple_choice',
  fill_blank: 'fill_in_blank',
  fill_in_the_blank: 'fill_in_blank',
  fill_in_the_blanks: 'fill_in_blank',
  gap_fill: 'fill_in_blank',
  completion: 'fill_in_blank',
  sentence_completion: 'fill_in_blank',
  summary_completion: 'fill_in_blank',
  note_completion: 'fill_in_blank',
  table_completion: 'fill_in_blank',
  form_completion: 'fill_in_blank',
  flow_chart_completion: 'fill_in_blank',
  diagram_label_completion: 'fill_in_blank',
  short_answer_question: 'short_answer',
  short_answer_questions: 'short_answer',
  tfng: 'true_false_not_given',
  true_false: 'true_false_not_given',
  true_false_ng: 'true_false_not_given',
  true_false_notgiven: 'true_false_not_given',
  ynng: 'yes_no_not_given',
  yes_no: 'yes_no_not_given',
  yes_no_ng: 'yes_no_not_given',
  yes_no_notgiven: 'yes_no_not_given',
  heading_matching: 'matching_heading',
  matching_headings: 'matching_heading',
  match_heading: 'matching_heading',
  match_headings: 'matching_heading',
  matching_information: 'matching',
  matching_paragraph_information: 'matching',
  match_information: 'matching',
  matching_feature: 'matching_features',
  match_features: 'matching_features',
  match_feature: 'matching_features',
  sentence_endings: 'sentence_ending',
  matching_sentence_ending: 'sentence_ending',
  matching_sentence_endings: 'sentence_ending',
};

export function isQuestionType(value: unknown): value is QuestionType {
  return (
    typeof value === 'string' &&
    (QUESTION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Returns the canonical code for any known spelling, or `null` when the value
 * cannot be mapped. Never throws so callers decide how strict to be.
 */
export function normalizeQuestionType(raw: unknown): QuestionType | null {
  if (typeof raw !== 'string') return null;
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, '_')
    .replace(/[^a-z_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!slug) return null;
  if (isQuestionType(slug)) return slug;
  return QUESTION_TYPE_ALIASES[slug] ?? null;
}

/** English labels used in admin/teacher tooling and API docs. */
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  fill_in_blank: 'Completion (fill in the blank)',
  short_answer: 'Short Answer',
  true_false_not_given: 'True / False / Not Given',
  yes_no_not_given: 'Yes / No / Not Given',
  matching_heading: 'Matching Headings',
  matching: 'Matching Information',
  matching_features: 'Matching Features',
  sentence_ending: 'Matching Sentence Endings',
};
