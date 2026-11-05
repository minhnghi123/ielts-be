import { taskKey, weekStartOf } from './plan.service';

describe('weekStartOf', () => {
    it('returns the Monday of the week (UTC)', () => {
        expect(weekStartOf(new Date('2026-11-03T10:00:00Z')).toISOString().slice(0, 10)).toBe('2026-11-02'); // Tue → Mon
        expect(weekStartOf(new Date('2026-11-08T23:00:00Z')).toISOString().slice(0, 10)).toBe('2026-11-02'); // Sun → same Mon
        expect(weekStartOf(new Date('2026-11-09T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-11-09'); // Mon → itself
    });
});

describe('taskKey', () => {
    it('treats one-off tasks of the same kind and skill as the same task', () => {
        expect(taskKey({ taskType: 'placement', skill: 'listening' })).toBe(taskKey({ taskType: 'placement', skill: 'listening', kc: null }));
        expect(taskKey({ taskType: 'mock', skill: 'reading' })).not.toBe(taskKey({ taskType: 'mock', skill: 'listening' }));
    });
    it('keeps speaking tasks on different sounds distinct from the free-speaking task', () => {
        expect(taskKey({ taskType: 'speaking', skill: 'speaking', kc: 'ph:TH' })).not.toBe(taskKey({ taskType: 'speaking', skill: 'speaking', kc: 'free' }));
        expect(taskKey({ taskType: 'speaking', skill: 'speaking', kc: 'ph:TH' })).toBe(taskKey({ taskType: 'speaking', skill: 'speaking', kc: 'ph:TH' }));
    });
    it('keeps drills on different question types distinct', () => {
        expect(taskKey({ taskType: 'drill', skill: 'reading', kc: 'matching_heading' })).not.toBe(taskKey({ taskType: 'drill', skill: 'reading', kc: 'true_false_not_given' }));
    });
});
