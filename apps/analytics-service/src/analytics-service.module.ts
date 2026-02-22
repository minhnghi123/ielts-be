import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsServiceController } from './analytics-service.controller';
import { AnalyticsServiceService } from './analytics-service.service';
import { LearnerBandProfile } from './entities/learner-band-profile.entity';
import { LearnerMistake } from './entities/learner-mistake.entity';
import { LearnerProgressSnapshot } from './entities/learner-progress-snapshot.entity';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: './apps/analytics-service/.env',
        }),
        TypeOrmModule.forRoot({
            type: 'postgres',
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432', 10),
            username: process.env.DB_USERNAME || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            database: process.env.DB_NAME || 'postgres',
            entities: [LearnerBandProfile, LearnerMistake, LearnerProgressSnapshot],
            synchronize: false,
        }),
        TypeOrmModule.forFeature([
            LearnerBandProfile,
            LearnerMistake,
            LearnerProgressSnapshot,
        ]),
    ],
    controllers: [AnalyticsServiceController],
    providers: [AnalyticsServiceService],
})
export class AnalyticsServiceModule { }
