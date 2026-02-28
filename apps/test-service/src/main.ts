import { NestFactory } from '@nestjs/core';
import { TestServiceModule } from './test-service.module';
import { SERVICES_PORTS } from '@app/common/constants';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from '@app/common/filters/http-exception.filter';
import { TransformInterceptor } from '@app/common/interceptors/transform.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(TestServiceModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Test Service API')
    .setDescription('Manages IELTS tests, sections, questions and content')
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

  await app.listen(SERVICES_PORTS.TEST_SERVICE);
  console.log(`Test Service running on port ${SERVICES_PORTS.TEST_SERVICE}`);
}
bootstrap();
