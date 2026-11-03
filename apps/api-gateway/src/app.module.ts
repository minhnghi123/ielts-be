import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ProxyModule } from './proxy/proxy.module';
import { GatewayAuthGuard } from './auth/gateway-auth.guard';

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET must be set for the API gateway to verify tokens');
  }
  return secret;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: './apps/api-gateway/.env',
    }),
    JwtModule.registerAsync({ useFactory: () => ({ secret: requireJwtSecret() }) }),
    ProxyModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: GatewayAuthGuard }],
})
export class AppModule { }
