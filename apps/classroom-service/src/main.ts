import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SERVICES_PORTS } from '@app/common/constants';
import { RMQ_QUEUES, rmqUrls } from '@app/common';
import { AllExceptionsFilter } from '@app/common/filters/http-exception.filter';
import { TransformInterceptor } from '@app/common/interceptors/transform.interceptor';
import { ClassroomServiceModule } from './classroom-service.module';

async function bootstrap() {
  const app = await NestFactory.create(ClassroomServiceModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Classroom Service API')
    .setDescription('Teacher classes, members, assignments, gradebook')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, config),
  );

  app.enableCors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: rmqUrls(),
      queue: RMQ_QUEUES.CLASSROOM,
      queueOptions: { durable: true },
      noAck: false,
      prefetchCount: 1,
    },
  });

  await app.startAllMicroservices();
  const port =
    parseInt(process.env.PORT || '', 10) || SERVICES_PORTS.CLASSROOM_SERVICE;
  await app.listen(port);
  console.log(`Classroom Service running on port ${port}`);
}
bootstrap();
