import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { TestServiceController } from './test-service.controller';
import { TestServiceService } from './test-service.service';
import { Test } from './entities/test.entity';
import { Section } from './entities/section.entity';
import { Question } from './entities/question.entity';
import { QuestionAnswer } from './entities/question-answer.entity';
import { WritingTask } from './entities/writing-task.entity';
import { SpeakingPart } from './entities/speaking-part.entity';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: './apps/test-service/.env',
        }),
        TypeOrmModule.forRoot({
            type: 'postgres',
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432', 10),
            username: process.env.DB_USERNAME || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            database: process.env.DB_NAME || 'postgres',
            entities: [Test, Section, Question, QuestionAnswer, WritingTask, SpeakingPart],
            synchronize: false, // DB schema is managed by db/database_schema.sql
        }),
        TypeOrmModule.forFeature([
            Test,
            Section,
            Question,
            QuestionAnswer,
            WritingTask,
            SpeakingPart,
        ]),
    ],
    controllers: [TestServiceController],
    providers: [TestServiceService],
})
export class TestServiceModule { }
