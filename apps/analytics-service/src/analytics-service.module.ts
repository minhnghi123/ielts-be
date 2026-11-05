import { KcRating } from './mastery/kc-rating.entity';
import { SavedWord } from './mastery/saved-word.entity';
import { MasteryController } from './mastery/mastery.controller';
import { MasteryService } from './mastery/mastery.service';
import { StudyTask } from './plan/study-task.entity';
import { SpeakingExercise } from './speaking/speaking-exercise.entity';
import { SpeakingAttempt } from './speaking/speaking-attempt.entity';
import { SpeakingService } from './speaking/speaking.service';
import { SpeakingController } from './speaking/speaking.controller';
import { PlanController } from './plan/plan.controller';
import { PlanService } from './plan/plan.service';
import { KcFeedback } from './learner-model/kc-feedback.entity';
import { LearnerModelService } from './learner-model/learner-model.service';
import { LearnerModelController } from './learner-model/learner-model.controller';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AnalyticsServiceController } from './analytics-service.controller';
import { AnalyticsServiceService } from './analytics-service.service';
import { LearnerBandProfile } from './entities/learner-band-profile.entity';
import { LearnerMistake } from './entities/learner-mistake.entity';
import { LearnerProgressSnapshot } from './entities/learner-progress-snapshot.entity';
import { LearnerGoal } from './entities/learner-goal.entity';
import { QuestionExplanation } from './entities/question-explanation.entity';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: './apps/analytics-service/.env',
        }),
        // Use forRootAsync so ConfigModule finishes loading BEFORE TypeORM reads env vars
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const username = config.get<string>('DB_USERNAME') || process.env.DB_USERNAME;
                console.log(`[ANALYTICS-DB] Connecting with user: ${username}`);
                return {
                    type: 'postgres',
                    host: config.get<string>('DB_HOST') || process.env.DB_HOST,
                    port: parseInt(config.get<string>('DB_PORT') || process.env.DB_PORT || '6543', 10),
                    username,
                    password: config.get<string>('DB_PASSWORD') || process.env.DB_PASSWORD,
                    database: config.get<string>('DB_NAME') || process.env.DB_NAME,
                    ssl: { rejectUnauthorized: false },
                    autoLoadEntities: true,
                    synchronize: false,
                    // Connection pool settings for Supabase PgBouncer (transaction mode)
                    extra: {
                        max: 5,
                        connectionTimeoutMillis: 10_000,
                        idleTimeoutMillis: 30_000,
                    },
                    retryAttempts: 5,
                    retryDelay: 3000,
                };
            },
        }),
        TypeOrmModule.forFeature([
            LearnerBandProfile,
            LearnerGoal,
            QuestionExplanation,
            LearnerMistake,
            LearnerProgressSnapshot,
            StudyTask,
            KcRating,
            SavedWord,
            SpeakingExercise,
            SpeakingAttempt,
            KcFeedback,
        ]),
    ],
    controllers: [AnalyticsServiceController, PlanController, MasteryController, SpeakingController, LearnerModelController],
    providers: [AnalyticsServiceService, PlanService, MasteryService, SpeakingService, LearnerModelService],
})
export class AnalyticsServiceModule { }
