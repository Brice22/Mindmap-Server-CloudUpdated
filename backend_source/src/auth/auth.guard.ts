// ============================================================
// LOGIN CHECK for every API route
// ============================================================
// Runs before each /api/... request:
//   - routes marked @Public() → always allowed
//   - no valid hs_session cookie → 401 (the app sends you to the login page)
//   - family accounts → only looking (GET), no Network pages → 403
//   - 📌 Send to HServer posts → allowed with the button's key instead of the cookie
// Files in /uploads are checked in main.ts, live updates in mindmap.gateway.ts.
// ============================================================

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from './public.decorator';
import { AUTH, readSession, allowed, clipKeyUser } from './session';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;          // socket.io checks its own connections
    if (AUTH.off) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;

    const req = context.switchToHttp().getRequest();
    const path = String(req.path || req.url || '').split('?')[0];
    if (!AUTH.clientSecret) throw new ServiceUnavailableException('Login is not set up: KEYCLOAK_CLIENT_SECRET is empty for the backend');

    if (req.method === 'POST' && path === '/api/mindmap/clip/page' && clipKeyUser(req.body?.key)) return true;

    const user = readSession(req);
    if (!user) throw new UnauthorizedException('Log in to HServer first');
    if (!allowed(user, req.method, path)) throw new ForbiddenException('Your account can only look at this, not change it');
    req.user = user;
    return true;
  }
}