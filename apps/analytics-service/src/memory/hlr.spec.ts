import { fitScale, halfLifeHours, nextReviewAfterHours, recallProbability } from './hlr';

describe('HLR-lite', () => {
    it('fresh item has a 24h half-life; successes lengthen, lapses shorten it', () => {
        expect(halfLifeHours(0, 0)).toBeCloseTo(24, 5);
        expect(halfLifeHours(3, 0)).toBeGreaterThan(60);
        expect(halfLifeHours(15, 0)).toBeGreaterThan(24 * 20);
        expect(halfLifeHours(3, 2)).toBeLessThan(halfLifeHours(3, 0));
        expect(halfLifeHours(100, 0)).toBeLessThanOrEqual(24 * 180);
        expect(halfLifeHours(0, 50)).toBeGreaterThanOrEqual(4);
    });
    it('recall halves at the half-life and the next review is scheduled there', () => {
        expect(recallProbability(24, 24)).toBeCloseTo(0.5, 5);
        expect(recallProbability(0, 24)).toBe(1);
        expect(nextReviewAfterHours(48)).toBeCloseTo(48, 5);
        expect(nextReviewAfterHours(48, 0.8)).toBeLessThan(48);
    });
    it('keeps scale 1 when the data cannot distinguish scales (fresh items, exponent 0)', () => {
        const obs = Array.from({ length: 60 }, (_, i) => ({ lagH: 72, correct: 0, lapses: 0, outcome: i % 10 !== 0 }));
        expect(fitScale(obs).scale).toBe(1);
    });
    it('fits a larger scale for a learner who remembers longer than the default predicts', () => {
        const obs = Array.from({ length: 60 }, (_, i) => ({ lagH: 72, correct: 2, lapses: 0, outcome: i % 10 !== 0 }));
        expect(fitScale(obs).scale).toBeGreaterThan(1);
        const forgetful = Array.from({ length: 60 }, (_, i) => ({ lagH: 12, correct: 2, lapses: 0, outcome: i % 3 === 0 }));
        expect(fitScale(forgetful).scale).toBeLessThan(1);
    });
});
