import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SubmissionServiceController } from './submission-service.controller';
import { SubmissionServiceService } from './submission-service.service';
import { TestAttempt } from './entities/test-attempt.entity';
import { QuestionAttempt } from './entities/question-attempt.entity';
import { WritingSubmission } from './entities/writing-submission.entity';
import { SpeakingSubmission } from './entities/speaking-submission.entity';
import { WritingScore } from './entities/writing-score.entity';
import { SpeakingScore } from './entities/speaking-score.entity';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: './apps/submission-service/.env',
        }),
        // Use forRootAsync so ConfigModule finishes loading BEFORE TypeORM reads env vars
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const username = config.get<string>('DB_USERNAME') || process.env.DB_USERNAME;
                console.log(`[SUBMISSION-DB] Connecting with user: ${username}`);
                return {
                    type: 'postgres',
                    host: config.get<string>('DB_HOST') || process.env.DB_HOST,
                    port: parseInt(config.get<string>('DB_PORT') || process.env.DB_PORT || '6543', 10),
                    username,
                    password: config.get<string>('DB_PASSWORD') || process.env.DB_PASSWORD,
                    database: config.get<string>('DB_NAME') || process.env.DB_NAME,
                    ssl: { rejectUnauthorized: false },
                    entities: [
                        TestAttempt,
                        QuestionAttempt,
                        WritingSubmission,
                        SpeakingSubmission,
                        WritingScore,
                        SpeakingScore,
                    ],
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
            TestAttempt,
            QuestionAttempt,
            WritingSubmission,
            SpeakingSubmission,
            WritingScore,
            SpeakingScore,
        ]),
    ],
    controllers: [SubmissionServiceController],
    providers: [SubmissionServiceService],
})
export class SubmissionServiceModule { }
