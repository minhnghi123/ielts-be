import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from '@app/common';
import { ClassroomServiceController } from './classroom-service.controller';
import { ClassroomServiceService } from './classroom-service.service';
import { ClassEntity } from './entities/class.entity';
import { ClassMember } from './entities/class-member.entity';
import { ClassAssignment } from './entities/class-assignment.entity';
import { AssignmentSubmission } from './entities/assignment-submission.entity';
import { ClassPost } from './entities/class-post.entity';
import { AuthClient } from './clients/auth.client';
import { TestClient } from './clients/test.client';
import { AnalyticsClient } from './clients/analytics.client';

const ENTITIES = [
  ClassEntity,
  ClassMember,
  ClassAssignment,
  AssignmentSubmission,
  ClassPost,
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: './apps/classroom-service/.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST') || process.env.DB_HOST,
        port: parseInt(
          config.get<string>('DB_PORT') || process.env.DB_PORT || '6543',
          10,
        ),
        username: config.get<string>('DB_USERNAME') || process.env.DB_USERNAME,
        password: config.get<string>('DB_PASSWORD') || process.env.DB_PASSWORD,
        database: config.get<string>('DB_NAME') || process.env.DB_NAME,
        ssl: { rejectUnauthorized: false },
        entities: ENTITIES,
        synchronize: false,
        extra: {
          max: 5,
          connectionTimeoutMillis: 10_000,
          idleTimeoutMillis: 30_000,
        },
        retryAttempts: 5,
        retryDelay: 3000,
      }),
    }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  controllers: [ClassroomServiceController],
  providers: [
    ClassroomServiceService,
    AuthClient,
    TestClient,
    AnalyticsClient,
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class ClassroomServiceModule {}
