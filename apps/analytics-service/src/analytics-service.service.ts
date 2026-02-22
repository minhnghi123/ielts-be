import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearnerBandProfile } from './entities/learner-band-profile.entity';
import { LearnerMistake } from './entities/learner-mistake.entity';
import { LearnerProgressSnapshot } from './entities/learner-progress-snapshot.entity';
import {
    UpsertBandProfileDto,
    CreateSnapshotDto,
    CreateMistakeDto,
} from './dto/analytics.dto';

@Injectable()
export class AnalyticsServiceService {
    constructor(
        @InjectRepository(LearnerBandProfile)
        private readonly bandProfileRepo: Repository<LearnerBandProfile>,
        @InjectRepository(LearnerMistake)
        private readonly mistakeRepo: Repository<LearnerMistake>,
        @InjectRepository(LearnerProgressSnapshot)
        private readonly snapshotRepo: Repository<LearnerProgressSnapshot>,
    ) { }

    // ─── Band Profiles ────────────────────────────────────────────────────────────

    async getBandProfiles(learnerId: string): Promise<LearnerBandProfile[]> {
        return this.bandProfileRepo.find({
            where: { learnerId },
            order: { skill: 'ASC' },
        });
    }

    async upsertBandProfile(dto: UpsertBandProfileDto): Promise<LearnerBandProfile> {
        let profile = await this.bandProfileRepo.findOne({
            where: { learnerId: dto.learnerId, skill: dto.skill as any },
        });

        if (profile) {
            if (dto.currentBand !== undefined) profile.currentBand = dto.currentBand;
            if (dto.targetBand !== undefined) profile.targetBand = dto.targetBand;
            profile.assessedAt = new Date();
        } else {
            profile = this.bandProfileRepo.create({
                learnerId: dto.learnerId,
                skill: dto.skill as any,
                currentBand: dto.currentBand,
                targetBand: dto.targetBand,
                assessedAt: new Date(),
            });
        }

        return this.bandProfileRepo.save(profile);
    }

    // ─── Progress Snapshots ───────────────────────────────────────────────────────

    async getProgressSnapshots(learnerId: string): Promise<LearnerProgressSnapshot[]> {
        return this.snapshotRepo.find({
            where: { learnerId },
            order: { snapshotAt: 'ASC' },
        });
    }

    async createSnapshot(dto: CreateSnapshotDto): Promise<LearnerProgressSnapshot> {
        const snapshot = this.snapshotRepo.create({
            learnerId: dto.learnerId,
            overallBand: dto.overallBand,
            snapshotAt: new Date(),
        });
        return this.snapshotRepo.save(snapshot);
    }

    // ─── Mistakes ─────────────────────────────────────────────────────────────────

    async getMistakes(learnerId: string): Promise<LearnerMistake[]> {
        return this.mistakeRepo.find({
            where: { learnerId },
            order: { createdAt: 'DESC' },
        });
    }

    async recordMistake(dto: CreateMistakeDto): Promise<LearnerMistake> {
        const mistake = this.mistakeRepo.create({
            learnerId: dto.learnerId,
            questionId: dto.questionId,
            mistakeType: dto.mistakeType,
            createdAt: new Date(),
        });
        return this.mistakeRepo.save(mistake);
    }

    // ─── Dashboard Summary ────────────────────────────────────────────────────────

    async getDashboardSummary(learnerId: string) {
        const [bandProfiles, snapshots, mistakes] = await Promise.all([
            this.getBandProfiles(learnerId),
            this.getProgressSnapshots(learnerId),
            this.getMistakes(learnerId),
        ]);

        const latestSnapshot = snapshots[snapshots.length - 1];
        const mistakesByType = mistakes.reduce(
            (acc, m) => {
                const type = m.mistakeType || 'unknown';
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>,
        );

        return {
            bandProfiles,
            latestOverallBand: latestSnapshot?.overallBand ?? null,
            progressHistory: snapshots,
            totalMistakes: mistakes.length,
            mistakesByType,
        };
    }
}
