import { NestFactory } from '@nestjs/core';
import { SubmissionServiceModule } from './submission-service.module';
import { SERVICES_PORTS } from '@app/common/constants';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from '@app/common/filters/http-exception.filter';
import { TransformInterceptor } from '@app/common/interceptors/transform.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
    const app = await NestFactory.create(SubmissionServiceModule);

    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    const config = new DocumentBuilder()
        .setTitle('Submission Service API')
        .setDescription('Handles test attempts, grading and writing/speaking submissions')
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

    await app.listen(SERVICES_PORTS.SUBMISSION_SERVICE);
    console.log(`Submission Service running on port ${SERVICES_PORTS.SUBMISSION_SERVICE}`);
}
bootstrap();
