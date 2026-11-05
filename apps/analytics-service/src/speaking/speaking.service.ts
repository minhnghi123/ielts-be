import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { KcRating } from '../mastery/kc-rating.entity';
import { masteryLevel } from '../mastery/mastery.service';
import { SPEAKING_LEVELS, SpeakingExercise, type SpeakingLevel } from './speaking-exercise.entity';
import { SpeakingAttempt, type WordResult } from './speaking-attempt.entity';

/** Mẹo tiếng Việt cho các âm người Việt hay sai (ARPAbet). */
export const SOUND_TIPS_VI: Record<string, { label: string; tip: string }> = {
    TH: { label: '/θ/ (think)', tip: 'Đặt đầu lưỡi giữa hai hàm răng rồi thổi hơi, không rung dây thanh; đừng đọc thành /t/ hay /s/.' },
    DH: { label: '/ð/ (this)', tip: 'Như /θ/ nhưng rung dây thanh; đừng đọc thành /d/ hay /z/.' },
    SH: { label: '/ʃ/ (she)', tip: 'Môi chu tròn, lưỡi lùi về sau; phân biệt với /s/ (see).' },
    ZH: { label: '/ʒ/ (vision)', tip: 'Như /ʃ/ nhưng rung dây thanh.' },
    CH: { label: '/tʃ/ (chair)', tip: 'Bắt đầu bằng /t/ rồi bật ra /ʃ/; đừng đọc như "ch" tiếng Việt (quá mềm).' },
    JH: { label: '/dʒ/ (job)', tip: 'Như /tʃ/ nhưng rung dây thanh; đừng đọc thành /z/ hay "gi".' },
    Z: { label: '/z/ (zoo)', tip: 'Rung dây thanh khi phát âm /s/; âm cuối -s của danh từ số nhiều thường là /z/.' },
    S: { label: '/s/', tip: 'Âm cuối /s/ phải được bật ra rõ (books, cats) — người Việt hay bỏ âm cuối.' },
    T: { label: '/t/', tip: 'Âm cuối /t/ cần bật nhẹ hơi (want, night); đừng nuốt mất.' },
    D: { label: '/d/', tip: 'Âm cuối /d/ cần rung nhẹ và bật ra (need, played).' },
    K: { label: '/k/', tip: 'Âm cuối /k/ cần bật ra (book, think).' },
    V: { label: '/v/ (very)', tip: 'Răng trên chạm môi dưới và rung; đừng đọc thành /w/ hay "d".' },
    W: { label: '/w/ (we)', tip: 'Chu tròn môi rồi mở ra; đừng đọc thành /v/.' },
    R: { label: '/r/', tip: 'Cuộn nhẹ lưỡi, không chạm vòm miệng; đừng đọc thành /z/ hay /l/.' },
    L: { label: '/l/', tip: 'Âm cuối /l/ (feel, will): đầu lưỡi chạm lợi trên; đừng đọc thành /n/ hay bỏ mất.' },
    N: { label: '/n/', tip: 'Phân biệt với /l/; âm cuối /n/ rõ (ten, sun).' },
    NG: { label: '/ŋ/ (sing)', tip: 'Âm mũi, lưỡi sau nâng lên; đừng thêm /g/ phía sau.' },
    IY: { label: '/iː/ (sheep)', tip: 'Kéo dài, căng môi; phân biệt với /ɪ/ (ship).' },
    IH: { label: '/ɪ/ (ship)', tip: 'Ngắn, miệng hơi mở; đừng kéo dài thành /iː/.' },
    AE: { label: '/æ/ (cat)', tip: 'Mở miệng rộng, lưỡi thấp; phân biệt với /e/ (bed).' },
    EH: { label: '/e/ (bed)', tip: 'Miệng mở vừa; đừng mở quá rộng thành /æ/.' },
    AH: { label: '/ʌ/ (cup)', tip: 'Ngắn, giữa miệng; phân biệt với /ɑː/ (car).' },
    UW: { label: '/uː/ (food)', tip: 'Chu môi, kéo dài; phân biệt với /ʊ/ (good).' },
    UH: { label: '/ʊ/ (good)', tip: 'Ngắn, môi hơi tròn; đừng kéo dài thành /uː/.' },
    ER: { label: '/ɜː/ (bird)', tip: 'Lưỡi cuộn nhẹ, kéo dài; đừng đọc thành "ơ" ngắn.' },
    OW: { label: '/əʊ/ (go)', tip: 'Nguyên âm đôi: bắt đầu /ə/ trượt sang /ʊ/; đừng đọc "ô" phẳng.' },
    EY: { label: '/eɪ/ (say)', tip: 'Nguyên âm đôi: /e/ trượt sang /ɪ/; đừng đọc "ê" phẳng.' },
};

export const SPEAKING_ERROR_CAUSES = ['sound_substitution', 'final_consonant', 'word_stress', 'omission', 'pace'] as const;

/** Quy đổi fluency đo được → band ước lượng (công khai trong docs/research/05). */
export function fluencyBand(wpm: number | null, pausesPerMinute: number | null, fillersPerMinute: number | null): number | null {
    if (wpm == null || wpm <= 0) return null;
    let band = wpm >= 130 ? 7.5 : wpm >= 110 ? 7 : wpm >= 90 ? 6 : wpm >= 70 ? 5 : 4;
    if (pausesPerMinute != null && pausesPerMinute > 6) band -= 1;
    else if (pausesPerMinute != null && pausesPerMinute > 3) band -= 0.5;
    if (fillersPerMinute != null && fillersPerMinute > 6) band -= 0.5;
    return Math.max(3, Math.min(8, Math.round(band * 2) / 2));
}

/** Điểm tổng 0–100 cho bài scripted từ word_results + fluency (0.6 / 0.25 / 0.15). */
export function scriptedScore(words: WordResult[], wpm: number | null, pauses: number | null, durationS: number | null) {
    const ref = words.filter((w) => w.status !== 'inserted');
    const correct = ref.filter((w) => w.status === 'correct').length;
    const accuracy = ref.length ? correct / ref.length : 0;
    const completeness = ref.length ? ref.filter((w) => w.status !== 'omitted').length / ref.length : 0;
    let fluency = 1;
    if (wpm != null && ref.length >= 6) fluency = wpm >= 100 && wpm <= 160 ? 1 : wpm >= 80 && wpm <= 180 ? 0.8 : 0.6;
    if (pauses != null && durationS && durationS > 0 && pauses / (durationS / 60) > 4) fluency -= 0.2;
    fluency = Math.max(0, fluency);
    const overall = Math.round(100 * (0.6 * accuracy + 0.25 * fluency + 0.15 * completeness));
    return { accuracy: Math.round(accuracy * 100), completeness: Math.round(completeness * 100), fluency: Math.round(fluency * 100), overall };
}

const K = 24;
const expected = (a: number, b: number) => 1 / (1 + Math.pow(10, (b - a) / 400));

export interface RecordAttemptInput {
    exerciseId?: string | null;
    level: SpeakingLevel;
    audioUrl?: string | null;
    transcript?: string | null;
    durationS?: number | null;
    wpm?: number | null;
    pauses?: number | null;
    fillers?: number | null;
    wordResults?: WordResult[] | null;
    scores?: Record<string, number | string | null>;
    errorsJson?: unknown[] | null;
    provider?: string;
}

@Injectable()
export class SpeakingService {
    constructor(
        @InjectRepository(SpeakingExercise) private readonly exRepo: Repository<SpeakingExercise>,
        @InjectRepository(SpeakingAttempt) private readonly atRepo: Repository<SpeakingAttempt>,
        @InjectRepository(KcRating) private readonly kcRepo: Repository<KcRating>,
    ) {}

    async listExercises(q: { level?: string; topic?: string; sound?: string; difficulty?: number; limit?: number; offset?: number }) {
        const qb = this.exRepo.createQueryBuilder('e').where('e.is_active = true');
        if (q.level) { if (!SPEAKING_LEVELS.includes(q.level as SpeakingLevel)) throw new BadRequestException('level không hợp lệ'); qb.andWhere('e.level = :level', { level: q.level }); }
        if (q.topic) qb.andWhere('e.topic = :topic', { topic: q.topic });
        if (q.sound) qb.andWhere(':sound = ANY(e.target_sounds)', { sound: q.sound });
        if (q.difficulty) qb.andWhere('e.difficulty = :d', { d: q.difficulty });
        const limit = Math.min(100, Math.max(1, q.limit ?? 20));
        qb.orderBy('e.difficulty', 'ASC').addOrderBy('e.created_at', 'ASC').take(limit).skip(Math.max(0, q.offset ?? 0));
        const [items, total] = await qb.getManyAndCount();
        return { items, total };
    }

    async getExercise(id: string) {
        const ex = await this.exRepo.findOne({ where: { id } });
        if (!ex) throw new NotFoundException('Không tìm thấy bài luyện nói');
        return ex;
    }

    /** Admin/teacher: create or update; (level, lower(text)) is unique so re-import is idempotent. */
    async upsertExercises(items: Array<Partial<SpeakingExercise> & { level: SpeakingLevel; text: string }>, createdBy: string | null) {
        let created = 0, updated = 0;
        for (const it of items) {
            if (!SPEAKING_LEVELS.includes(it.level)) throw new BadRequestException(`level không hợp lệ: ${String(it.level)}`);
            const text = it.text.trim();
            if (!text) throw new BadRequestException('text trống');
            if (it.level === 'sentence_build' && (!it.shuffledTokens || it.shuffledTokens.length < 2)) {
                it.shuffledTokens = shuffleDeterministic(text.replace(/[.?!,]/g, '').split(/\s+/));
            }
            const existing = await this.exRepo.createQueryBuilder('e').where('e.level = :level AND lower(e.text) = lower(:text)', { level: it.level, text }).getOne();
            const row = this.exRepo.create({ ...(existing ?? {}), ...it, text, createdBy: existing?.createdBy ?? createdBy, difficulty: Math.min(5, Math.max(1, it.difficulty ?? existing?.difficulty ?? 2)) });
            await this.exRepo.save(row);
            if (existing) updated++; else created++;
        }
        return { created, updated };
    }

    async setActive(id: string, isActive: boolean) {
        const ex = await this.getExercise(id);
        ex.isActive = isActive;
        return this.exRepo.save(ex);
    }

    /**
     * Save a scored attempt (scoring happens in the FE route that talks to Groq) and move the
     * learner's per-sound Elo: each target/mispronounced sound is a KC `ph:<ARPAbet>`.
     */
    async recordAttempt(learnerId: string, input: RecordAttemptInput) {
        if (!SPEAKING_LEVELS.includes(input.level)) throw new BadRequestException('level không hợp lệ');
        const ex = input.exerciseId ? await this.exRepo.findOne({ where: { id: input.exerciseId } }) : null;
        if (input.exerciseId && !ex) throw new NotFoundException('Không tìm thấy bài luyện nói');
        const words = input.wordResults ?? null;
        let scores = input.scores ?? {};
        if (words && input.level !== 'free') scores = { ...scriptedScore(words, input.wpm ?? null, input.pauses ?? null, input.durationS ?? null), ...scores };
        if (input.level === 'free' && input.durationS && input.durationS > 0) {
            const perMin = (n: number | null | undefined) => (n == null ? null : n / (input.durationS! / 60));
            const fb = fluencyBand(input.wpm ?? null, perMin(input.pauses), perMin(input.fillers));
            if (fb != null) scores = { fluencyBand: fb, ...scores };
        }
        const attempt = await this.atRepo.save(this.atRepo.create({
            learnerId, exerciseId: ex?.id ?? null, level: input.level, audioUrl: input.audioUrl ?? null, transcript: input.transcript ?? null,
            durationS: input.durationS ?? null, wpm: input.wpm ?? null, pauses: input.pauses ?? null, fillers: input.fillers ?? null,
            wordResults: words, scores, errorsJson: input.errorsJson ?? null, provider: input.provider ?? 'groq',
            expiresAt: input.audioUrl ? new Date(Date.now() + 30 * 24 * 3600 * 1000) : null,
        }));
        const soundOutcomes = this.soundOutcomes(words, ex?.targetSounds ?? []);
        await this.rateSounds(learnerId, soundOutcomes);
        return { attempt, sounds: soundOutcomes };
    }

    /** From word results: every expected sound that was mispronounced counts as a miss; target sounds in correct words count as hits. */
    soundOutcomes(words: WordResult[] | null, targetSounds: string[]): Array<{ sound: string; correct: boolean }> {
        const out: Array<{ sound: string; correct: boolean }> = [];
        if (!words) return out;
        const missed = new Set<string>();
        for (const w of words) for (const s of w.sounds ?? []) if (s.expected && s.actual !== s.expected) missed.add(stripStress(s.expected));
        for (const m of missed) out.push({ sound: m, correct: false });
        const anyCorrect = words.some((w) => w.status === 'correct');
        for (const t of targetSounds) { const s = stripStress(t); if (!missed.has(s) && anyCorrect) out.push({ sound: s, correct: true }); }
        return out;
    }

    private async rateSounds(learnerId: string, outcomes: Array<{ sound: string; correct: boolean }>) {
        if (outcomes.length === 0) return;
        const kcs = [...new Set(outcomes.map((o) => `ph:${o.sound}`))];
        const rows = await this.kcRepo.find({ where: { learnerId, skill: 'speaking', kc: In(kcs) } });
        const map = new Map(rows.map((r) => [r.kc, r]));
        for (const o of outcomes) {
            const kc = `ph:${o.sound}`;
            const r = map.get(kc) ?? this.kcRepo.create({ learnerId, skill: 'speaking', kc, rating: 1500, attempts: 0, correct: 0 });
            const e = expected(Number(r.rating), 1500);
            r.rating = Math.round((Number(r.rating) + K * ((o.correct ? 1 : 0) - e)) * 100) / 100;
            r.attempts += 1; if (o.correct) r.correct += 1;
            map.set(kc, r);
        }
        await this.kcRepo.save([...map.values()]);
    }

    async listAttempts(learnerId: string, q: { exerciseId?: string; level?: string; limit?: number }) {
        const where: Record<string, unknown> = { learnerId };
        if (q.exerciseId) where.exerciseId = q.exerciseId;
        if (q.level) where.level = q.level;
        return this.atRepo.find({ where, order: { createdAt: 'DESC' }, take: Math.min(100, Math.max(1, q.limit ?? 20)) });
    }

    async deleteAttemptAudio(learnerId: string, id: string) {
        const a = await this.atRepo.findOne({ where: { id } });
        if (!a) throw new NotFoundException('Không tìm thấy lượt luyện');
        if (a.learnerId !== learnerId) throw new ForbiddenException();
        a.audioUrl = null; a.expiresAt = null;
        return this.atRepo.save(a);
    }

    /** Progress per level + weak sounds (Elo) — what /speak shows at the top. */
    async summary(learnerId: string) {
        const rows: Array<{ level: SpeakingLevel; n: string; avg: string | null; last: string }> = await this.atRepo.query(
            `SELECT level, count(*) n, avg((scores->>'overall')::numeric) avg, max(created_at) last FROM speaking_attempts WHERE learner_id = $1 GROUP BY level`, [learnerId]);
        const byLevel = Object.fromEntries(SPEAKING_LEVELS.map((l) => [l, { attempts: 0, avgOverall: null as number | null, lastAt: null as string | null }]));
        for (const r of rows) byLevel[r.level] = { attempts: Number(r.n), avgOverall: r.avg == null ? null : Math.round(Number(r.avg)), lastAt: r.last };
        const kcs = await this.kcRepo.find({ where: { learnerId, skill: 'speaking' } });
        const sounds = kcs.filter((k) => k.kc.startsWith('ph:')).map((k) => {
            const sound = k.kc.slice(3);
            return { sound, label: SOUND_TIPS_VI[sound]?.label ?? sound, tipVi: SOUND_TIPS_VI[sound]?.tip ?? null, rating: Number(k.rating), attempts: k.attempts, correct: k.correct, level: masteryLevel(Number(k.rating), k.attempts) };
        }).sort((a, b) => a.rating - b.rating);
        return { byLevel, weakSounds: sounds.filter((s) => s.level === 'yeu' || s.level === 'dang_hoc').slice(0, 5), sounds };
    }
}

export function stripStress(arpa: string) { return arpa.replace(/[0-2]$/, '').toUpperCase(); }

/** Deterministic shuffle (seeded by text) so the same exercise always shows the same token order. */
export function shuffleDeterministic(tokens: string[]): string[] {
    const arr = [...tokens];
    let seed = 0; for (const t of tokens.join(' ')) seed = (seed * 31 + t.charCodeAt(0)) >>> 0;
    for (let i = arr.length - 1; i > 0; i--) { seed = (seed * 1103515245 + 12345) >>> 0; const j = seed % (i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    if (arr.length > 1 && arr.join(' ') === tokens.join(' ')) [arr[0], arr[1]] = [arr[1], arr[0]];
    return arr;
}
