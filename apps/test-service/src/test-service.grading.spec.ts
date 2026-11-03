import { TestServiceService } from './test-service.service';

/**
 * Pure grading logic — no database. The service is instantiated with stub
 * repositories because only private helpers are exercised here.
 */
function makeService(): any {
  const stub = {} as any;
  return new TestServiceService(
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
  );
}

describe('IELTS answer-key matching', () => {
  const svc = makeService();
  const accepts = (template: string, input: string, caseSensitive = false) =>
    svc
      .buildAcceptableAnswers([template], caseSensitive)
      .has(svc.normaliseInput(input, caseSensitive));

  it('handles [OR] alternatives', () => {
    expect(accepts('MIDNIGHT [OR] 12(.00) A.M./AM', 'midnight')).toBe(true);
    expect(accepts('MIDNIGHT [OR] 12(.00) A.M./AM', '12 am')).toBe(true);
    expect(accepts('MIDNIGHT [OR] 12(.00) A.M./AM', '12.00 a.m.')).toBe(true);
    expect(accepts('MIDNIGHT [OR] 12(.00) A.M./AM', 'noon')).toBe(false);
  });

  it('treats parenthesised words as optional', () => {
    expect(accepts('(FREDERICK) FLEET', 'Fleet')).toBe(true);
    expect(accepts('(FREDERICK) FLEET', 'frederick  fleet')).toBe(true);
    expect(accepts('(FREDERICK) FLEET', 'frederick')).toBe(false);
  });

  it('resolves TFNG abbreviations', () => {
    expect(accepts('NOT GIVEN', 'NG')).toBe(true);
    expect(accepts('TRUE', 't')).toBe(true);
    expect(accepts('FALSE', 'true')).toBe(false);
  });

  it('respects case sensitivity when requested', () => {
    expect(accepts('Paris', 'paris', true)).toBe(false);
    expect(accepts('Paris', 'Paris', true)).toBe(true);
  });
});

describe('band conversion', () => {
  const svc = makeService();

  it('uses the official Listening table', () => {
    expect(svc.calculateListeningBand(40)).toBe(9);
    expect(svc.calculateListeningBand(30)).toBe(7);
    expect(svc.calculateListeningBand(23)).toBe(6);
    expect(svc.calculateListeningBand(0)).toBeLessThan(4);
  });

  it('uses the official Academic Reading table', () => {
    expect(svc.calculateReadingBand(39)).toBe(9);
    expect(svc.calculateReadingBand(30)).toBe(7);
    expect(svc.calculateReadingBand(23)).toBe(6);
    expect(svc.calculateReadingBand(15)).toBe(5);
  });

  it('rounds AI bands to the nearest half band within 0–9', () => {
    expect(svc.roundToHalfBand(6.2)).toBe(6);
    expect(svc.roundToHalfBand(6.3)).toBe(6.5);
    expect(svc.roundToHalfBand(9.7)).toBe(9);
    expect(svc.roundToHalfBand(-1)).toBe(0);
  });

  it('resolves official durations unless overridden', () => {
    expect(
      svc.resolveDurationMinutes({ skill: 'listening', durationMinutes: null }),
    ).toBe(30);
    expect(
      svc.resolveDurationMinutes({ skill: 'reading', durationMinutes: null }),
    ).toBe(60);
    expect(
      svc.resolveDurationMinutes({ skill: 'speaking', durationMinutes: 11 }),
    ).toBe(11);
  });
});
