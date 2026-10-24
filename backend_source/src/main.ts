import { NestFactory } from '@nestjs/core';
// IMPORT the real module from the file next door
import { AppModule } from './app.module'; 
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AUTH, readSession, allowedOrigin } from './auth/session';

async function bootstrap() {
  // Use the REAL AppModule here
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '10mb' });
    // "Send to HServer" posts whole web pages as a form
  app.useBodyParser('urlencoded', { limit: '30mb', extended: true });
   // CORS: the app (port 5173 / 3001) can call this with your login cookie; other sites can't
  app.enableCors({
    origin: (origin, done) => done(null, allowedOrigin(origin)),
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });
  // Files (/uploads/...) need the login too — they aren't API routes, so the login check is here
  app.use('/uploads', (req: any, res: any, next: any) => {
    if (AUTH.off || readSession(req)) return next();
    res.status(401).type('text').send('Log in to HServer first');
  });
  app.setGlobalPrefix('api');

  // "Nuclear Fix": Read PORT directly to prevent startup crashes
  const port = process.env.PORT || 3000;

  console.log(`HServer Backend starting on port ${port}...`);
  
  // Listen on 0.0.0.0 so Docker exposes it to the outside world
  await app.listen(port, '0.0.0.0');
}
bootstrap();
