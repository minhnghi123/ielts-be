import {
  QUESTION_TYPES,
  isQuestionType,
  normalizeQuestionType,
} from './question-types';

describe('normalizeQuestionType', () => {
  it('keeps canonical codes unchanged', () => {
    for (const t of QUESTION_TYPES) expect(normalizeQuestionType(t)).toBe(t);
  });

  it('maps the legacy spellings used by the DOCX importer and analytics', () => {
    expect(normalizeQuestionType('matching_headings')).toBe('matching_heading');
    expect(normalizeQuestionType('true_false_ng')).toBe('true_false_not_given');
    expect(normalizeQuestionType('yes_no_ng')).toBe('yes_no_not_given');
    expect(normalizeQuestionType('short_answer')).toBe('short_answer');
  });

  it('is tolerant to case, spaces and hyphens', () => {
    expect(normalizeQuestionType(' Matching-Headings ')).toBe(
      'matching_heading',
    );
    expect(normalizeQuestionType('TRUE FALSE NOT GIVEN')).toBe(
      'true_false_not_given',
    );
    expect(normalizeQuestionType('Sentence Completion')).toBe('fill_in_blank');
  });

  it('returns null for unknown or non-string input', () => {
    expect(normalizeQuestionType('essay')).toBeNull();
    expect(normalizeQuestionType('')).toBeNull();
    expect(normalizeQuestionType(undefined)).toBeNull();
    expect(normalizeQuestionType(42)).toBeNull();
  });

  it('isQuestionType only accepts canonical codes', () => {
    expect(isQuestionType('matching_heading')).toBe(true);
    expect(isQuestionType('matching_headings')).toBe(false);
  });
});
