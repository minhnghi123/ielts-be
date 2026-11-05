import { estimateBand, ratingToBand } from './learner-model.service';

describe('learner model band estimate', () => {
    it('maps Elo to band in 0.5 steps, clipped', () => {
        expect(ratingToBand(1200)).toBe(4); expect(ratingToBand(1500)).toBe(6); expect(ratingToBand(1650)).toBe(7); expect(ratingToBand(3000)).toBe(9); expect(ratingToBand(0)).toBe(3);
    });
    it('refuses to estimate below 15 answers', () => {
        expect(estimateBand([{ rating: 1500, attempts: 14 }]).low).toBeUndefined();
    });
    it('narrows the interval as evidence grows', () => {
        const a = estimateBand([{ rating: 1500, attempts: 15 }]); const b = estimateBand([{ rating: 1500, attempts: 150 }]);
        expect(a.low).toBeDefined(); expect(b.low).toBeDefined();
        expect((a as any).high - (a as any).low).toBeGreaterThan((b as any).high - (b as any).low);
        expect((b as any).mid).toBe(6);
    });
});
