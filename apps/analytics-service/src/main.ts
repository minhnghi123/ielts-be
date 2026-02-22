import { NestFactory } from '@nestjs/core';
import { AnalyticsServiceModule } from './analytics-service.module';
import { SERVICES_PORTS } from '@app/common/constants';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from '@app/common/filters/http-exception.filter';
import { TransformInterceptor } from '@app/common/interceptors/transform.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
    const app = await NestFactory.create(AnalyticsServiceModule);

    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    const config = new DocumentBuilder()
        .setTitle('Analytics Service API')
        .setDescription('Tracks learner band profiles, mistakes, and progress')
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

    await app.listen(SERVICES_PORTS.ANALYTICS_SERVICE);
    console.log(`Analytics Service running on port ${SERVICES_PORTS.ANALYTICS_SERVICE}`);
}
bootstrap();
