import { NestFactory } from '@nestjs/core';
// IMPORT the real module from the file next door
import { AppModule } from './app.module'; 
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  // Use the REAL AppModule here
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '10mb' });
    // "Send to HServer" posts whole web pages as a form
  app.useBodyParser('urlencoded', { limit: '30mb', extended: true });
  // Enable CORS so your Frontend (on port 3001/3002) can talk to this
  app.enableCors({
    origin: '*', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });
  app.setGlobalPrefix('api');

  // "Nuclear Fix": Read PORT directly to prevent startup crashes
  const port = process.env.PORT || 3000;

  console.log(`HServer Backend starting on port ${port}...`);
  
  // Listen on 0.0.0.0 so Docker exposes it to the outside world
  await app.listen(port, '0.0.0.0');
}
bootstrap();
