import {
  classifyErrorCause,
  levenshtein,
  wordLimitFromInstructions,
} from './error-cause';

describe('classifyErrorCause', () => {
  const fill = (userAnswer: string, correct: string[], instructions?: string) =>
    classifyErrorCause({
      questionType: 'fill_in_blank',
      userAnswer,
      correctAnswers: correct,
      instructions,
    });

  it('detects skipped vs time management', () => {
    expect(fill('', ['x'])).toBe('skipped');
    expect(
      classifyErrorCause({
        questionType: 'fill_in_blank',
        userAnswer: ' ',
        correctAnswers: ['x'],
        trailingSkipped: true,
      }),
    ).toBe('time_management');
  });

  it('detects spelling and inflection slips', () => {
    expect(fill('enviroment', ['environment'])).toBe('spelling');
    expect(fill('tomato', ['tomatoes'])).toBe('spelling');
  });

  it('detects word-limit violations', () => {
    expect(
      fill(
        'the red car',
        ['red car'],
        'Write NO MORE THAN TWO WORDS for each answer',
      ),
    ).toBe('word_limit');
    expect(wordLimitFromInstructions('<p>ONE WORD ONLY</p>')).toBe(1);
    expect(wordLimitFromInstructions('Choose the correct letter')).toBeNull();
  });

  it('detects number formats', () => {
    expect(fill('50', ['15'])).toBe('number_format');
  });

  it('uses the question type for closed formats', () => {
    expect(
      classifyErrorCause({
        questionType: 'true_false_not_given',
        userAnswer: 'FALSE',
        correctAnswers: ['NOT GIVEN'],
      }),
    ).toBe('tfng_confusion');
    expect(
      classifyErrorCause({
        questionType: 'matching_headings',
        userAnswer: 'ii',
        correctAnswers: ['v'],
      }),
    ).toBe('location_miss');
    expect(
      classifyErrorCause({
        questionType: 'multiple_choice',
        userAnswer: 'A',
        correctAnswers: ['C'],
      }),
    ).toBe('inference');
  });

  it('handles answer-key templates', () => {
    expect(fill('automobile', ['(THE) CAR [OR] AUTO'])).toBe('paraphrase_miss');
    expect(fill('autos', ['(THE) CAR [OR] AUTO'])).toBe('spelling');
  });

  it('levenshtein basics', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});
