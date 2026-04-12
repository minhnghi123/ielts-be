import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthServiceController } from './auth-service.controller';
import { AuthServiceService } from './auth-service.service';
import { Account } from './entities/account.entity';
import { LearnerProfile } from './entities/learner-profile.entity';
import { AdminProfile } from './entities/admin-profile.entity';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: './apps/auth-service/.env',
    }),
    // Use forRootAsync so ConfigModule finishes loading BEFORE TypeORM reads env vars
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const username = config.get<string>('DB_USERNAME') || process.env.DB_USERNAME;
        console.log(`[AUTH-DB] Connecting with user: ${username}`);
        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST') || process.env.DB_HOST,
          port: parseInt(config.get<string>('DB_PORT') || process.env.DB_PORT || '6543', 10),
          username,
          password: config.get<string>('DB_PASSWORD') || process.env.DB_PASSWORD,
          database: config.get<string>('DB_NAME') || process.env.DB_NAME,
          ssl: { rejectUnauthorized: false },
          entities: [Account, LearnerProfile, AdminProfile],
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
    TypeOrmModule.forFeature([Account, LearnerProfile, AdminProfile]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'your-secret-key'),
        // Cast to 'any' — ConfigService returns plain string, but @nestjs/jwt
        // internally types expiresIn as the 'ms' library StringValue brand.
        // The value ('24h', '7d', etc.) is valid at runtime.
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '24h') as any },
      }),
    }),
  ],
  controllers: [AuthServiceController],
  providers: [AuthServiceService, JwtStrategy],
})
export class AuthServiceModule { }
