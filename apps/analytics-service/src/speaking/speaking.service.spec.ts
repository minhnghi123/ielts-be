import { fluencyBand, scriptedScore, shuffleDeterministic, SpeakingService, stripStress } from './speaking.service';

describe('speaking scoring helpers', () => {
    it('fluencyBand follows wpm with penalties for pauses/fillers', () => {
        expect(fluencyBand(null, null, null)).toBeNull();
        expect(fluencyBand(120, 1, 0)).toBe(7);
        expect(fluencyBand(120, 7, 0)).toBe(6);
        expect(fluencyBand(60, 0, 10)).toBe(3.5);
    });
    it('scriptedScore weights accuracy 0.6 / fluency 0.25 / completeness 0.15', () => {
        const words = [
            { word: 'i', status: 'correct' as const }, { word: 'think', status: 'substituted' as const, heard: 'tink' },
            { word: 'so', status: 'correct' as const }, { word: 'too', status: 'omitted' as const },
        ];
        const s = scriptedScore(words, null, null, null);
        expect(s.accuracy).toBe(50); expect(s.completeness).toBe(75); expect(s.overall).toBe(Math.round(100 * (0.3 + 0.25 + 0.1125)));
    });
    it('shuffleDeterministic is stable and never returns the original order', () => {
        const t = ['I', 'usually', 'study', 'English'];
        expect(shuffleDeterministic(t)).toEqual(shuffleDeterministic(t));
        expect(shuffleDeterministic(t).join(' ')).not.toBe(t.join(' '));
        expect([...shuffleDeterministic(t)].sort()).toEqual([...t].sort());
    });
    it('stripStress removes ARPAbet stress digits', () => { expect(stripStress('ih1')).toBe('IH'); });
    it('soundOutcomes marks mispronounced sounds as misses and clean target sounds as hits', () => {
        const svc = new SpeakingService({} as never, {} as never, {} as never);
        const out = svc.soundOutcomes([
            { word: 'think', status: 'substituted', heard: 'tink', sounds: [{ expected: 'TH', actual: 'T' }] },
            { word: 'books', status: 'correct' },
        ], ['TH', 'S']);
        expect(out).toEqual([{ sound: 'TH', correct: false }, { sound: 'S', correct: true }]);
    });
    it('recordAttempt ignores client-sent scores for scripted levels', async () => {
        const saved: any[] = [];
        const atRepo = { create: (x: any) => x, save: async (x: any) => { saved.push(x); return { ...x, id: 'a1' }; } };
        const kcRepo = { find: async () => [], create: (x: any) => x, save: async (x: any) => x };
        const svc = new SpeakingService({} as never, atRepo as never, kcRepo as never);
        const r = await svc.recordAttempt('learner', {
            level: 'word', wordResults: [{ word: 'think', status: 'substituted', heard: 'tink', sounds: [{ expected: 'TH', actual: 'T' }] }],
            scores: { overall: 99, accuracy: 99 },
        });
        expect(r.attempt.scores.overall).toBe(Math.round(100 * (0 + 0.25 + 0.15)));
        expect(r.attempt.scores.accuracy).toBe(0);
    });
});
