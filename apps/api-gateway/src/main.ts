import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SERVICES_PORTS } from '@app/common/constants';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from '@app/common/filters/http-exception.filter';
import { TransformInterceptor } from '@app/common/interceptors/transform.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const config = new DocumentBuilder()
    .setTitle('IELTS Platform — API Gateway')
    .setDescription(
      'Single entry-point proxy for auth, test, submission, and analytics services',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  app.enableCors({
    origin: 'http://localhost:3000',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  await app.listen(SERVICES_PORTS.API_GATEWAY);
  console.log(`API Gateway running on port ${SERVICES_PORTS.API_GATEWAY}`);
}
bootstrap();
