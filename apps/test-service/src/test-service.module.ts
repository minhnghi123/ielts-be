import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TestServiceController } from './test-service.controller';
import { TestServiceService } from './test-service.service';
import { DocxParserService } from './import/docx-parser.service';
import { ImportTestService } from './import/import-test.service';
import { Test } from './entities/test.entity';
import { Section } from './entities/section.entity';
import { Question } from './entities/question.entity';
import { QuestionAnswer } from './entities/question-answer.entity';
import { WritingTask } from './entities/writing-task.entity';
import { SpeakingPart } from './entities/speaking-part.entity';
import { QuestionGroup } from './entities/question-group.entity';
import { TestAttempt } from './entities/test-attempt.entity';
import { QuestionAttempt } from './entities/question-attempt.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: './apps/test-service/.env',
    }),
    // Use forRootAsync so ConfigModule finishes loading BEFORE TypeORM reads env vars
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const username = config.get<string>('DB_USERNAME') || process.env.DB_USERNAME;
        console.log(`[TEST-DB] Connecting with user: ${username}`);
        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST') || process.env.DB_HOST,
          port: parseInt(config.get<string>('DB_PORT') || process.env.DB_PORT || '6543', 10),
          username,
          password: config.get<string>('DB_PASSWORD') || process.env.DB_PASSWORD,
          database: config.get<string>('DB_NAME') || process.env.DB_NAME,
          ssl: { rejectUnauthorized: false },
          entities: [
            Test,
            Section,
            QuestionGroup,
            Question,
            QuestionAnswer,
            WritingTask,
            SpeakingPart,
            TestAttempt,
            QuestionAttempt,
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
      Test,
      Section,
      QuestionGroup,
      Question,
      QuestionAnswer,
      WritingTask,
      SpeakingPart,
      TestAttempt,
      QuestionAttempt,
    ]),
    MulterModule.register({ limits: { fileSize: 50 * 1024 * 1024 } }),
  ],
  controllers: [TestServiceController],
  providers: [TestServiceService, DocxParserService, ImportTestService],
})
export class TestServiceModule { }
