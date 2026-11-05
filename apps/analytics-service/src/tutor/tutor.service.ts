import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ErrorCause } from '@app/common';
import { LearnerMistake } from '../entities/learner-mistake.entity';
import { HintsVi, QuestionHint } from './question-hint.entity';

@Injectable()
export class TutorService {
    constructor(
        @InjectRepository(LearnerMistake) private readonly mistakeRepo: Repository<LearnerMistake>,
        @InjectRepository(QuestionHint) private readonly hintRepo: Repository<QuestionHint>,
    ) {}

    /** Learner tells us why they think they got it wrong; kept next to the automatic cause (never overwrites it). */
    async setSelfCause(learnerId: string, questionId: string, attemptId: string | null, selfCause: ErrorCause) {
        const where = attemptId ? { learnerId, questionId, attemptId } : { learnerId, questionId };
        const m = await this.mistakeRepo.findOne({ where, order: { createdAt: 'DESC' } });
        if (!m) throw new NotFoundException('Chưa có mục sổ lỗi cho câu này');
        m.selfCause = selfCause;
        m.updatedAt = new Date();
        await this.mistakeRepo.save(m);
        return { id: m.id, errorCause: m.errorCause, selfCause: m.selfCause, agrees: m.errorCause === selfCause };
    }

    getHints(questionId: string, contentHash: string) {
        return this.hintRepo.findOne({ where: { questionId, contentHash } });
    }

    putHints(questionId: string, contentHash: string, hintsVi: HintsVi, model: string | null) {
        return this.hintRepo.save(this.hintRepo.create({ questionId, contentHash, hintsVi, model }));
    }
}
