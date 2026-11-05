import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MIN_OBS_FOR_FIT, fitScale, halfLifeHours, nextReviewAfterHours, recallProbability } from './hlr';
import { LearnerMemoryParams, MemoryReview } from './memory-review.entity';

export interface MemoryItem { correctCount: number; lapseCount: number; halfLifeH: number | null; lastReviewedAt: Date | null; nextReviewAt: Date | null; createdAt?: Date | null }
export interface MemoryUpdate { halfLifeH: number; pPred: number; lagH: number; nextReviewAt: Date; correctCount: number; lapseCount: number }

/** Shared forgetting model for words and notebook mistakes: predicts recall, reschedules, logs every review for later fitting. */
@Injectable()
export class MemoryService {
    constructor(
        @InjectRepository(MemoryReview) private readonly reviewRepo: Repository<MemoryReview>,
        @InjectRepository(LearnerMemoryParams) private readonly paramsRepo: Repository<LearnerMemoryParams>,
        private readonly dataSource: DataSource,
    ) {}

    async scale(learnerId: string): Promise<number> {
        const p = await this.paramsRepo.findOne({ where: { learnerId } });
        return p ? Number(p.scale) : 1;
    }

    /** Apply one review outcome; `quality` 'easy' counts as two successes. Caller persists the returned fields on its own entity. */
    async review(learnerId: string, itemType: 'word' | 'mistake', itemId: string, item: MemoryItem, quality: 'again' | 'good' | 'easy', now = new Date()): Promise<MemoryUpdate> {
        const scale = await this.scale(learnerId);
        const before = item.halfLifeH ?? halfLifeHours(item.correctCount, item.lapseCount, scale);
        // Same anchor as forecast(): last review, else when the item was created (so the logged lag matches the shown prediction).
        const anchor = item.lastReviewedAt ?? item.createdAt ?? (item.nextReviewAt ? new Date(item.nextReviewAt.getTime() - before * 3_600_000) : null);
        const lagH = anchor ? Math.max(0, (now.getTime() - anchor.getTime()) / 3_600_000) : before;
        const pPred = recallProbability(lagH, before);
        const outcome = quality !== 'again';
        const correctCount = item.correctCount + (quality === 'easy' ? 2 : quality === 'good' ? 1 : 0);
        const lapseCount = item.lapseCount + (quality === 'again' ? 1 : 0);
        const halfLifeH = Math.round(halfLifeHours(correctCount, lapseCount, scale) * 100) / 100;
        const nextReviewAt = new Date(now.getTime() + nextReviewAfterHours(halfLifeH) * 3_600_000);
        await this.reviewRepo.save(this.reviewRepo.create({ learnerId, itemType, itemId, lagH: Math.round(lagH * 100) / 100, pPred: Math.round(pPred * 10000) / 10000, outcome, halfLifeBeforeH: Math.round(before * 100) / 100, halfLifeAfterH: halfLifeH }));
        return { halfLifeH, pPred, lagH, nextReviewAt, correctCount, lapseCount };
    }

    /** Recall forecast for everything the learner is memorising, weakest first. */
    async forecast(learnerId: string, now = new Date()) {
        const scale = await this.scale(learnerId);
        const words: Array<{ id: string; word: string; meaning_vi: string | null; correct_count: number; lapse_count: number; half_life_h: string | null; last_reviewed_at: Date | null; next_review_at: Date | null; created_at: Date }> =
            await this.dataSource.query(`SELECT id, word, meaning_vi, correct_count, lapse_count, half_life_h, last_reviewed_at, next_review_at, created_at FROM saved_words WHERE learner_id = $1`, [learnerId]);
        const mistakes: Array<{ id: string; question_id: string; skill: string | null; question_type: string | null; correct_count: number; lapse_count: number; half_life_h: string | null; last_reviewed_at: Date | null; next_review_at: Date | null; created_at: Date }> =
            await this.dataSource.query(`SELECT id, question_id, skill, question_type, correct_count, lapse_count, half_life_h, last_reviewed_at, next_review_at, created_at FROM learner_mistakes WHERE learner_id = $1 AND status <> 'fixed'`, [learnerId]);
        const p = (r: { correct_count: number; lapse_count: number; half_life_h: string | null; last_reviewed_at: Date | null; created_at: Date }) => {
            const h = r.half_life_h != null ? Number(r.half_life_h) : halfLifeHours(r.correct_count, r.lapse_count, scale);
            const anchor = r.last_reviewed_at ?? r.created_at;
            const lagH = Math.max(0, (now.getTime() - new Date(anchor).getTime()) / 3_600_000);
            return { h, pRecall: Math.round(recallProbability(lagH, h) * 100) / 100 };
        };
        const wordItems = words.map((w) => ({ type: 'word' as const, id: w.id, label: w.word, meaningVi: w.meaning_vi, ...p(w), nextReviewAt: w.next_review_at }));
        const mistakeItems = mistakes.map((m) => ({ type: 'mistake' as const, id: m.id, questionId: m.question_id, skill: m.skill, questionType: m.question_type, ...p(m), nextReviewAt: m.next_review_at }));
        const all = [...wordItems, ...mistakeItems].sort((a, b) => a.pRecall - b.pRecall);
        const atRisk = all.filter((x) => x.pRecall < 0.7);
        const [{ n }]: Array<{ n: string }> = await this.dataSource.query(`SELECT count(*) n FROM memory_reviews WHERE learner_id = $1`, [learnerId]);
        let params = await this.paramsRepo.findOne({ where: { learnerId } });
        // Self-maintaining: once there is enough logged data, (re)fit at most once a week while the learner is looking.
        const stale = !params?.fittedAt || now.getTime() - new Date(params.fittedAt).getTime() > 7 * 86_400_000;
        if (Number(n) >= MIN_OBS_FOR_FIT && stale) {
            await this.refit(learnerId);
            params = await this.paramsRepo.findOne({ where: { learnerId } });
        }
        return {
            items: all.slice(0, 50),
            counts: { words: wordItems.length, mistakes: mistakeItems.length, atRiskWords: atRisk.filter((x) => x.type === 'word').length, atRiskMistakes: atRisk.filter((x) => x.type === 'mistake').length },
            model: { scale, nObs: Number(n), fittedOn: params?.nObs ?? 0, logLoss: params?.logLoss != null ? Number(params.logLoss) : null, fittedAt: params?.fittedAt ?? null, minObs: MIN_OBS_FOR_FIT },
        };
    }

    /** Refit the learner's scale from logged reviews (≥ MIN_OBS). Returns null when there is not enough data. */
    async refit(learnerId: string) {
        const rows: Array<{ lag_h: string; outcome: boolean; half_life_before_h: string | null }> = await this.dataSource.query(
            `SELECT lag_h, outcome, half_life_before_h FROM memory_reviews WHERE learner_id = $1 ORDER BY created_at DESC LIMIT 2000`, [learnerId]);
        if (rows.length < MIN_OBS_FOR_FIT) return null;
        // Recover (correct, lapses) is not stored per review; the half-life before the review is, so fit on it directly.
        const obs = rows.map((r) => {
            const h = Number(r.half_life_before_h ?? 24);
            const expo = Math.log2(h / 24);
            return { lagH: Number(r.lag_h), outcome: r.outcome, correct: expo >= 0 ? Math.pow(expo / 1.6 + 1, 2) - 1 : 0, lapses: expo < 0 ? Math.pow(-expo / 1.6 + 1, 2) - 1 : 0 };
        });
        const fit = fitScale(obs);
        const params = (await this.paramsRepo.findOne({ where: { learnerId } })) ?? this.paramsRepo.create({ learnerId });
        params.scale = fit.scale; params.nObs = rows.length; params.logLoss = fit.logLoss; params.fittedAt = new Date();
        await this.paramsRepo.save(params);
        return { scale: fit.scale, nObs: rows.length, logLoss: fit.logLoss };
    }
}
