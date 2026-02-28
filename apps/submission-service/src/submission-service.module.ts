import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
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
        TypeOrmModule.forRoot({
            type: 'postgres',
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '5432', 10),
            username: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            entities: [
                TestAttempt,
                QuestionAttempt,
                WritingSubmission,
                SpeakingSubmission,
                WritingScore,
                SpeakingScore,
            ],
            synchronize: false,
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
