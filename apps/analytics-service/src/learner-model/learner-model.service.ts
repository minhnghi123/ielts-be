import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { KcRating } from '../mastery/kc-rating.entity';
import { masteryLevel } from '../mastery/mastery.service';
import { KcFeedback } from './kc-feedback.entity';

const SKILLS = ['listening', 'reading', 'writing', 'speaking'] as const;
export type Skill = (typeof SKILLS)[number];
const FEEDBACK_DELTA = 50;
const FEEDBACK_COOLDOWN_DAYS = 7;
const MIN_ATTEMPTS_FOR_ESTIMATE = 15;

/** Elo rating → IELTS-like band: 1200 ≈ 4.0, +150 per band, clipped to 3.0–9.0, 0.5 steps. Documented in docs/research/06. */
export function ratingToBand(rating: number): number {
    const b = 4 + (rating - 1200) / 150;
    return Math.max(3, Math.min(9, Math.round(b * 2) / 2));
}

/**
 * Honest band estimate for one skill from per-KC Elo ratings: attempts-weighted mean rating → band,
 * half-width shrinks with evidence (±1.5 at 15 answers → ±0.5 at ≥135). Below 15 answers: no estimate.
 */
export function estimateBand(kcs: Array<{ rating: number; attempts: number }>): { low: number; high: number; mid: number; attempts: number } | { attempts: number; low?: undefined } {
    const attempts = kcs.reduce((s, k) => s + k.attempts, 0);
    if (attempts < MIN_ATTEMPTS_FOR_ESTIMATE) return { attempts };
    const mean = kcs.reduce((s, k) => s + k.rating * k.attempts, 0) / attempts;
    const half = Math.max(0.5, Math.min(1.5, 1.5 * Math.sqrt(MIN_ATTEMPTS_FOR_ESTIMATE / attempts) * 1.0));
    const mid = ratingToBand(mean);
    return { low: Math.max(3, Math.round((mid - half) * 2) / 2), high: Math.min(9, Math.round((mid + half) * 2) / 2), mid, attempts };
}

@Injectable()
export class LearnerModelService {
    constructor(
        @InjectRepository(KcRating) private readonly kcRepo: Repository<KcRating>,
        @InjectRepository(KcFeedback) private readonly fbRepo: Repository<KcFeedback>,
        private readonly dataSource: DataSource,
    ) {}

    /** Everything the system currently believes about the learner, in one read — the open learner model. */
    async model(learnerId: string) {
        const kcs = await this.kcRepo.find({ where: { learnerId }, order: { rating: 'ASC' } });
        const bySkill = Object.fromEntries(SKILLS.map((s) => [s, [] as KcRating[]])) as Record<Skill, KcRating[]>;
        for (const k of kcs) if ((SKILLS as readonly string[]).includes(k.skill)) bySkill[k.skill as Skill].push(k);
        const skills = SKILLS.map((skill) => {
            const items = bySkill[skill].filter((k) => !k.kc.startsWith('ph:'));
            const est = estimateBand(items.map((k) => ({ rating: Number(k.rating), attempts: k.attempts })));
            return {
                skill,
                estimate: est.low != null ? { low: est.low, high: est.high, mid: est.mid } : null,
                answered: est.attempts,
                kcs: items.map((k) => ({ kc: k.kc, rating: Number(k.rating), attempts: k.attempts, correct: k.correct, accuracy: k.attempts ? Math.round((k.correct / k.attempts) * 100) : null, level: masteryLevel(Number(k.rating), k.attempts), updatedAt: k.updatedAt })),
            };
        });
        const sounds = bySkill.speaking.filter((k) => k.kc.startsWith('ph:')).map((k) => ({ sound: k.kc.slice(3), rating: Number(k.rating), attempts: k.attempts, correct: k.correct, level: masteryLevel(Number(k.rating), k.attempts) }));
        const words: Array<{ due: string; soon: string; total: string }> = await this.dataSource.query(
            `SELECT count(*) FILTER (WHERE next_review_at IS NULL OR next_review_at <= now()) due,
                    count(*) FILTER (WHERE next_review_at > now() AND next_review_at <= now() + interval '2 days') soon,
                    count(*) total FROM saved_words WHERE learner_id = $1`, [learnerId]);
        const mistakes: Array<{ error_cause: string | null; n: string }> = await this.dataSource.query(
            `SELECT error_cause, count(*) n FROM learner_mistakes WHERE learner_id = $1 AND status <> 'fixed' GROUP BY error_cause ORDER BY n DESC LIMIT 5`, [learnerId]);
        const recentFeedback = await this.fbRepo.find({ where: { learnerId }, order: { createdAt: 'DESC' }, take: 20 });
        return {
            skills,
            sounds,
            words: { due: Number(words[0]?.due ?? 0), soon: Number(words[0]?.soon ?? 0), total: Number(words[0]?.total ?? 0) },
            topErrorCauses: mistakes.map((m) => ({ cause: m.error_cause ?? 'unknown', n: Number(m.n) })),
            feedback: recentFeedback.map((f) => ({ skill: f.skill, kc: f.kc, verdict: f.verdict, at: f.createdAt })),
            method: { bandScale: 'Elo 1200 ≈ band 4.0, +150/band', minAnswers: MIN_ATTEMPTS_FOR_ESTIMATE },
        };
    }

    /** Learner disagrees with the model: nudge the KC rating ±50, at most once per KC per 7 days, and log it. */
    async feedback(learnerId: string, skill: string, kc: string, verdict: 'vung' | 'chua_vung') {
        if (!(SKILLS as readonly string[]).includes(skill)) throw new BadRequestException('skill không hợp lệ');
        if (verdict !== 'vung' && verdict !== 'chua_vung') throw new BadRequestException('verdict không hợp lệ');
        const r = await this.kcRepo.findOne({ where: { learnerId, skill, kc } });
        if (!r) throw new NotFoundException('Chưa có dữ liệu cho dạng này');
        const since = new Date(Date.now() - FEEDBACK_COOLDOWN_DAYS * 86400000);
        const recent = await this.fbRepo.findOne({ where: { learnerId, skill, kc, createdAt: MoreThan(since) } });
        if (recent) throw new BadRequestException(`Bạn đã phản hồi dạng này trong ${FEEDBACK_COOLDOWN_DAYS} ngày qua; hãy làm thêm vài câu để mô hình tự cập nhật.`);
        const before = Number(r.rating);
        const after = Math.round((before + (verdict === 'vung' ? FEEDBACK_DELTA : -FEEDBACK_DELTA)) * 100) / 100;
        r.rating = after;
        await this.kcRepo.save(r);
        await this.fbRepo.save(this.fbRepo.create({ learnerId, skill, kc, verdict, ratingBefore: before, ratingAfter: after }));
        return { kc, ratingBefore: before, ratingAfter: after, level: masteryLevel(after, r.attempts) };
    }
}
