/**
 * HLR-lite (after Settles & Meeder 2016, "half-life regression"): the memory half-life of an item grows with
 * successful recalls and shrinks with lapses; recall probability decays as 2^(-lag/half-life).
 *   h = H0 · 2^( scale · (A·√(1+correct) − B·√(1+lapses)) )          (hours)
 *   p(recall after lag) = 2^(−lag / h)
 * A fresh item (0 correct, 0 lapses) has h = H0 = 24 h. With A = B = 1.6: 1 correct → 38 h, 3 → 3 d, 8 → 9 d, 15 → 28 d.
 * `scale` is the only per-learner parameter (fit by grid search on logged reviews); 1.0 until ≥ MIN_OBS reviews exist.
 */
export const H0_HOURS = 24;
export const A_CORRECT = 1.6;
export const B_LAPSE = 1.6;
export const MIN_H = 4;           // never shorter than 4 hours
export const MAX_H = 24 * 180;    // never longer than 180 days
export const MIN_OBS_FOR_FIT = 50;

export function halfLifeHours(correct: number, lapses: number, scale = 1): number {
    const expo = scale * (A_CORRECT * Math.sqrt(1 + Math.max(0, correct)) - B_LAPSE * Math.sqrt(1 + Math.max(0, lapses)));
    return Math.min(MAX_H, Math.max(MIN_H, H0_HOURS * Math.pow(2, expo)));
}

export function recallProbability(lagHours: number, halfLifeH: number): number {
    if (!(halfLifeH > 0)) return 0.5;
    return Math.pow(2, -Math.max(0, lagHours) / halfLifeH);
}

/** Next review when recall is predicted to drop to `target` (default: the half-life itself, p = 0.5). */
export function nextReviewAfterHours(halfLifeH: number, target = 0.5): number {
    return halfLifeH * Math.log2(1 / target);
}

export interface ReviewObs { lagH: number; correct: number; lapses: number; outcome: boolean }

/** Grid-search the per-learner scale minimising log loss over logged reviews (counts are the item's counts *before* that review). */
export function fitScale(obs: ReviewObs[]): { scale: number; logLoss: number } {
    let best = { scale: 1, logLoss: Number.POSITIVE_INFINITY };
    for (let s = 0.5; s <= 2.0001; s += 0.1) {
        let loss = 0;
        for (const o of obs) {
            const p = Math.min(0.999, Math.max(0.001, recallProbability(o.lagH, halfLifeHours(o.correct, o.lapses, s))));
            loss += o.outcome ? -Math.log(p) : -Math.log(1 - p);
        }
        loss /= Math.max(1, obs.length);
        if (loss < best.logLoss - 1e-9) best = { scale: Math.round(s * 100) / 100, logLoss: Math.round(loss * 10000) / 10000 };
    }
    return best;
}
