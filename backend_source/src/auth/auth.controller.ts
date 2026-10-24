// ============================================================
// LOGIN ROUTES  (/api/auth/...)
// ============================================================
//   GET /api/auth/login?return=…    → Keycloak's HServer sign-in page
//   GET /api/auth/callback          ← Keycloak sends you back here; sets the hs_session cookie
//   GET /api/auth/me                who is logged in (401 if nobody)
//   GET /api/auth/logout?return=…   ends the session here and in Keycloak
//   GET /api/auth/clip-key          owner: key for the 📌 Send to HServer button
// The browser never sees the client secret: the backend swaps Keycloak's
// one-time code for the user's details itself (inside Docker).
// ============================================================

import { Controller, Get, Query, Req, Res, ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import { Public } from './public.decorator';
import {
  AUTH, SESSION_COOKIE, LOGIN_COOKIE, KNOWN_ROLES, LOCAL_USER, sign, unsign, readCookies, readSession,
  cookie, allowedOrigin, isOwner, clipKey, type SessionUser,
} from './session';

const LOGIN_MINUTES = 10;
const MIN_SESSION = 60 * 60;              // 1 hour
const MAX_SESSION = 30 * 24 * 60 * 60;    // 30 days ("Remember me")

interface LoginState { state: string; verifier: string; returnTo: string; exp: number }

const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

@Controller('auth')
export class AuthController {
  private oidc(publicSide: boolean) {
    return `${publicSide ? AUTH.publicUrl : AUTH.internalUrl}/realms/${encodeURIComponent(AUTH.realm)}/protocol/openid-connect`;
  }

  private isHttps(req: Request) {
    return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  }

  // Back to the app page you came from — only addresses of this server (no sending you to other sites)
  private safeReturn(value: unknown): string {
    const v = typeof value === 'string' ? value : '';
    try {
      const u = new URL(v);
      if (allowedOrigin(u.origin)) return u.href;
    } catch {}
    return AUTH.appUrl + '/';
  }

  private callbackUrl(req: Request) {
    return `${this.isHttps(req) ? 'https' : 'http'}://${req.get('host')}/api/auth/callback`;
  }

  // ------------------------------------------------------------
  @Public()
  @Get('login')
  login(@Query('return') returnTo: string, @Req() req: Request, @Res() res: Response) {
    if (AUTH.off) return res.redirect(this.safeReturn(returnTo));
    if (!AUTH.clientSecret) return this.page(res, 503, 'Login is not set up', 'KEYCLOAK_CLIENT_SECRET is empty for the backend. Add HSERVER_CLIENT_SECRET to .env and recreate backend_nest.');

    const state = crypto.randomBytes(16).toString('base64url');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const login: LoginState = { state, verifier, returnTo: this.safeReturn(returnTo), exp: Math.floor(Date.now() / 1000) + LOGIN_MINUTES * 60 };
    res.setHeader('Set-Cookie', cookie(LOGIN_COOKIE, sign('login', login), { maxAge: LOGIN_MINUTES * 60, path: '/api/auth', secure: this.isHttps(req) }));

    const q = new URLSearchParams({
      client_id: AUTH.clientId,
      response_type: 'code',
      scope: 'openid',
      redirect_uri: this.callbackUrl(req),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return res.redirect(`${this.oidc(true)}/auth?${q}`);
  }

  // ------------------------------------------------------------
  @Public()
  @Get('callback')
  async callback(@Query() query: any, @Req() req: Request, @Res() res: Response) {
    const login = unsign<LoginState>('login', readCookies(req.headers.cookie)[LOGIN_COOKIE]);
    const clearLogin = cookie(LOGIN_COOKIE, '', { maxAge: 0, path: '/api/auth', secure: this.isHttps(req) });
    const again = `/api/auth/login?return=${encodeURIComponent(login?.returnTo || AUTH.appUrl + '/')}`;

    if (query.error) {
      res.setHeader('Set-Cookie', clearLogin);
      return this.page(res, 400, 'Login cancelled', `Keycloak said: ${esc(query.error_description || query.error)}`, again);
    }
    if (!login || !query.code || query.state !== login.state) {
      res.setHeader('Set-Cookie', clearLogin);
      return this.page(res, 400, 'Login took too long', 'The login page was open too long or in another browser. Try again.', again);
    }

    // Swap the one-time code for the user's tokens (backend → Keycloak, inside Docker)
    let tokens: any;
    try {
      const r = await fetch(`${this.oidc(false)}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: String(query.code),
          redirect_uri: this.callbackUrl(req),
          client_id: AUTH.clientId,
          client_secret: AUTH.clientSecret,
          code_verifier: login.verifier,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      tokens = await r.json().catch(() => ({}));
      if (!r.ok || !tokens.access_token) throw new Error(tokens.error_description || tokens.error || `Keycloak answered ${r.status}`);
    } catch (e: any) {
      res.setHeader('Set-Cookie', clearLogin);
      console.warn(`[auth] login failed: ${e?.message}`);
      return this.page(res, 502, 'Login failed', `Couldn't finish the login with Keycloak: ${esc(e?.message || e)}`, again);
    }

    // The access token came straight from Keycloak over Docker's network, so its contents can be trusted
    const claims = JSON.parse(Buffer.from(String(tokens.access_token).split('.')[1] || '', 'base64url').toString('utf8') || '{}');
    const roles = (claims.realm_access?.roles || []).filter((r: string) => KNOWN_ROLES.includes(r));
    if (!roles.length) {
      res.setHeader('Set-Cookie', clearLogin);
      return this.page(res, 403, 'No access yet',
        `You logged in as <b>${esc(claims.preferred_username || '?')}</b>, but that account has no HServer role. The owner can add <b>owner</b> or <b>family</b> in Keycloak → hserver → Users → Role mapping.`,
        `/api/auth/logout?return=${encodeURIComponent(AUTH.appUrl + '/')}`, 'Log out');
    }

    // Stay logged in as long as Keycloak's session does (1 day, or 30 days with "Remember me")
    const seconds = Math.min(MAX_SESSION, Math.max(MIN_SESSION, Number(tokens.refresh_expires_in) || 24 * 60 * 60));
    const user: SessionUser = {
      sub: String(claims.sub || ''),
      username: String(claims.preferred_username || claims.sub || 'user'),
      name: claims.name || undefined,
      roles,
      exp: Math.floor(Date.now() / 1000) + seconds,
    };
    res.setHeader('Set-Cookie', [
      clearLogin,
      cookie(SESSION_COOKIE, sign('session', user), { maxAge: seconds, secure: this.isHttps(req) }),
    ]);
    console.log(`[auth] ${user.username} logged in (${roles.join(', ')})`);
    return res.redirect(login.returnTo);
  }

  // ------------------------------------------------------------
  @Public()
  @Get('me')
  me(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    if (AUTH.off) return res.json({ authMode: 'off', user: LOCAL_USER });
    if (!AUTH.clientSecret) return res.status(503).json({ message: 'Login is not set up: KEYCLOAK_CLIENT_SECRET is empty for the backend' });
    const user = readSession(req);
    if (!user) return res.status(401).json({ message: 'Not logged in', loginUrl: '/api/auth/login' });
    return res.json({ authMode: 'keycloak', user: { username: user.username, name: user.name, roles: user.roles } });
  }

  // ------------------------------------------------------------
  @Public()
  @Get('logout')
  logout(@Query('return') returnTo: string, @Req() req: Request, @Res() res: Response) {
    const back = this.safeReturn(returnTo);
    res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', { maxAge: 0, secure: this.isHttps(req) }));
    if (AUTH.off) return res.redirect(back);
    // Also end the Keycloak session (it asks "Do you want to log out?" once)
    const q = new URLSearchParams({ client_id: AUTH.clientId, post_logout_redirect_uri: back });
    return res.redirect(`${this.oidc(true)}/logout?${q}`);
  }

  // ------------------------------------------------------------
  @Get('clip-key')
  clipKey(@Req() req: Request) {
    const user = readSession(req);
    if (!isOwner(user)) throw new ForbiddenException('Only the owner can make a Send to HServer button');
    return { key: clipKey(user!.username) };
  }

  // ------------------------------------------------------------
  private page(res: Response, status: number, title: string, body: string, link?: string, linkText = 'Try again') {
    res.status(status).type('html').send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)} — HServer</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{background:#1e1e2e;color:#ddd;font:15px/1.6 system-ui,sans-serif;max-width:520px;margin:60px auto;padding:0 20px}
h1{color:#fff;font-size:22px}a{color:#60a5fa}</style></head>
<body><h1>${esc(title)}</h1><p>${body}</p>${link ? `<p><a href="${esc(link)}">${esc(linkText)}</a></p>` : ''}</body></html>`);
  }
}