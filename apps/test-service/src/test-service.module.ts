import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
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
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
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
