import { NestFactory } from '@nestjs/core';
// IMPORT the real module from the file next door
import { AppModule } from './app.module'; 

async function bootstrap() {
  // Use the REAL AppModule here
  const app = await NestFactory.create(AppModule);

  // Enable CORS so your Frontend (on port 3001/3002) can talk to this
  app.enableCors({
    origin: '*', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  // "Nuclear Fix": Read PORT directly to prevent startup crashes
  const port = process.env.PORT || 3000;

  console.log(`HServer Backend starting on port ${port}...`);
  
  // Listen on 0.0.0.0 so Docker exposes it to the outside world
  await app.listen(port, '0.0.0.0');
}
bootstrap();
