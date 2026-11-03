import { weekStartOf } from './plan.service';

describe('weekStartOf', () => {
    it('returns the Monday of the week (UTC)', () => {
        expect(weekStartOf(new Date('2026-11-03T10:00:00Z')).toISOString().slice(0, 10)).toBe('2026-11-02'); // Tue → Mon
        expect(weekStartOf(new Date('2026-11-08T23:00:00Z')).toISOString().slice(0, 10)).toBe('2026-11-02'); // Sun → same Mon
        expect(weekStartOf(new Date('2026-11-09T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-11-09'); // Mon → itself
    });
});
