import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { normalizeQuestionType } from '@app/common';
import { KcRating } from './kc-rating.entity';
import { SavedWord } from './saved-word.entity';

export type MasteryLevel = 'chua_du_du_lieu' | 'yeu' | 'dang_hoc' | 'vung' | 'thanh_thao';
const K_LEARNER = 32;
const K_QUESTION = 16;
const expected = (a: number, b: number) => 1 / (1 + Math.pow(10, (b - a) / 400));

export function masteryLevel(rating: number, attempts: number): MasteryLevel {
    if (attempts < 3) return 'chua_du_du_lieu';
    if (rating < 1400) return 'yeu';
    if (rating < 1550) return 'dang_hoc';
    if (rating < 1700) return 'vung';
    return 'thanh_thao';
}

/** SM-2 light for saved words: again → 1 day, ease −0.2; good → interval×ease; easy → interval×ease×1.3, ease +0.1. */
export function nextWordSchedule(w: { srsIntervalDays: number; srsEase: number; reviewCount: number }, quality: 'again' | 'good' | 'easy') {
    let ease = Number(w.srsEase);
    let interval: number;
    if (quality === 'again') { ease = Math.max(1.3, ease - 0.2); interval = 1; }
    else {
        interval = w.reviewCount === 0 ? (quality === 'easy' ? 4 : 2) : Math.round(w.srsIntervalDays * ease * (quality === 'easy' ? 1.3 : 1));
        if (quality === 'easy') ease = Math.min(3.0, ease + 0.1);
        interval = Math.min(interval, 180);
    }
    return { interval: Math.max(1, interval), ease: Math.round(ease * 100) / 100 };
}

@Injectable()
export class MasteryService {
    constructor(
        @InjectRepository(KcRating) private readonly kcRepo: Repository<KcRating>,
        @InjectRepository(SavedWord) private readonly wordRepo: Repository<SavedWord>,
        private readonly dataSource: DataSource,
    ) {}

    /**
     * Elo update per answered question. Learner rating per (skill, kc) vs question's
     * `elo_rating` (1500 = unknown; author `difficulty` 1–5 seeds it when still 1500).
     * Both sides move; the question's K is halved so one learner cannot swing it.
     */
    async rate(learnerId: string, skill: string, items: Array<{ questionId: string; kc?: string | null; correct: boolean }>) {
        const ids = [...new Set(items.map((i) => i.questionId))];
        if (ids.length === 0) return { updated: 0 };
        const qrows: Array<{ id: string; elo_rating: string | null; difficulty: number | null; question_type: string | null }> = await this.dataSource.query(
            `SELECT id, elo_rating, difficulty, question_type FROM questions WHERE id = ANY($1::uuid[])`, [ids]);
        const qmap = new Map(qrows.map((q) => [q.id, q]));
        const ratings = new Map<string, KcRating>();
        let updated = 0;
        for (const it of items) {
            const q = qmap.get(it.questionId);
            if (!q) continue;
            const kc = normalizeQuestionType(it.kc ?? q.question_type) ?? (it.kc ?? q.question_type);
            if (!kc) continue;
            let r = ratings.get(kc) ?? (await this.kcRepo.findOne({ where: { learnerId, skill, kc } })) ?? this.kcRepo.create({ learnerId, skill, kc, rating: 1500, attempts: 0, correct: 0 });
            ratings.set(kc, r);
            let qElo = q.elo_rating != null ? Number(q.elo_rating) : 1500;
            if (qElo === 1500 && q.difficulty) qElo = 1500 + (q.difficulty - 3) * 100;
            const e = expected(Number(r.rating), qElo);
            const s = it.correct ? 1 : 0;
            r.rating = Math.round((Number(r.rating) + K_LEARNER * (s - e)) * 100) / 100;
            r.attempts += 1;
            r.correct += s;
            const newQ = Math.round((qElo + K_QUESTION * ((1 - s) - (1 - e))) * 100) / 100;
            await this.dataSource.query(`UPDATE questions SET elo_rating = $2 WHERE id = $1`, [q.id, newQ]);
            updated++;
        }
        await this.kcRepo.save([...ratings.values()]);
        return { updated };
    }

    async mastery(learnerId: string, skill?: string) {
        const rows = await this.kcRepo.find({ where: skill ? { learnerId, skill } : { learnerId }, order: { rating: 'ASC' } });
        return rows.map((r) => ({
            skill: r.skill, kc: r.kc, rating: Number(r.rating), attempts: r.attempts, correct: r.correct,
            accuracy: r.attempts ? Math.round((r.correct / r.attempts) * 100) : null,
            level: masteryLevel(Number(r.rating), r.attempts),
        }));
    }

    // ── saved words ──
    async listWords(learnerId: string, dueOnly = false) {
        const qb = this.wordRepo.createQueryBuilder('w').where('w.learner_id = :learnerId', { learnerId });
        if (dueOnly) qb.andWhere('(w.next_review_at IS NULL OR w.next_review_at <= now())');
        return qb.orderBy('w.next_review_at', 'ASC', 'NULLS FIRST').addOrderBy('w.created_at', 'DESC').getMany();
    }

    async addWord(learnerId: string, dto: { word: string; context?: string | null; meaningVi?: string | null; testId?: string | null }) {
        const word = dto.word.trim().toLowerCase().slice(0, 80);
        const existing = await this.wordRepo.findOne({ where: { learnerId, word } });
        if (existing) {
            if (dto.meaningVi && !existing.meaningVi) existing.meaningVi = dto.meaningVi;
            if (dto.context && !existing.context) existing.context = dto.context;
            return this.wordRepo.save(existing);
        }
        return this.wordRepo.save(this.wordRepo.create({ learnerId, word, context: dto.context ?? null, meaningVi: dto.meaningVi ?? null, testId: dto.testId ?? null, nextReviewAt: new Date() }));
    }

    async updateWord(id: string, learnerId: string, patch: { meaningVi?: string | null; context?: string | null }) {
        const w = await this.wordRepo.findOne({ where: { id, learnerId } });
        if (!w) throw new NotFoundException('Word not found');
        if (patch.meaningVi !== undefined) w.meaningVi = patch.meaningVi;
        if (patch.context !== undefined) w.context = patch.context;
        return this.wordRepo.save(w);
    }

    async deleteWord(id: string, learnerId: string) {
        const res = await this.wordRepo.delete({ id, learnerId });
        if (!res.affected) throw new NotFoundException('Word not found');
        return { deleted: true };
    }

    async reviewWord(id: string, learnerId: string, quality: 'again' | 'good' | 'easy') {
        const w = await this.wordRepo.findOne({ where: { id, learnerId } });
        if (!w) throw new NotFoundException('Word not found');
        const { interval, ease } = nextWordSchedule(w, quality);
        w.srsIntervalDays = interval;
        w.srsEase = ease;
        w.reviewCount += 1;
        w.nextReviewAt = new Date(Date.now() + interval * 86_400_000);
        return this.wordRepo.save(w);
    }
}
