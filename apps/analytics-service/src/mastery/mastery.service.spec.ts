import { masteryLevel, nextWordSchedule } from './mastery.service';

describe('masteryLevel', () => {
    it('needs 3 attempts before judging', () => expect(masteryLevel(1200, 2)).toBe('chua_du_du_lieu'));
    it('maps rating bands', () => {
        expect(masteryLevel(1350, 5)).toBe('yeu');
        expect(masteryLevel(1500, 5)).toBe('dang_hoc');
        expect(masteryLevel(1600, 5)).toBe('vung');
        expect(masteryLevel(1750, 5)).toBe('thanh_thao');
    });
});

describe('nextWordSchedule', () => {
    const w = { srsIntervalDays: 4, srsEase: 2.5, reviewCount: 2 };
    it('again resets to 1 day and lowers ease', () => expect(nextWordSchedule(w, 'again')).toEqual({ interval: 1, ease: 2.3 }));
    it('good multiplies by ease', () => expect(nextWordSchedule(w, 'good')).toEqual({ interval: 10, ease: 2.5 }));
    it('easy grows faster and raises ease', () => expect(nextWordSchedule(w, 'easy')).toEqual({ interval: 13, ease: 2.6 }));
    it('first review: good 2d, easy 4d', () => {
        expect(nextWordSchedule({ ...w, reviewCount: 0 }, 'good').interval).toBe(2);
        expect(nextWordSchedule({ ...w, reviewCount: 0 }, 'easy').interval).toBe(4);
    });
    it('ease never drops below 1.3', () => expect(nextWordSchedule({ ...w, srsEase: 1.3 }, 'again').ease).toBe(1.3));
});
