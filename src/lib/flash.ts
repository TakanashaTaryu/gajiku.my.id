import type { Context } from 'hono';
import type { Env } from '../types';
import { parseCookies } from './auth';

export const FLASH_COOKIE_NAME = 'kas_flash';

export interface FlashMessage {
  type: 'success' | 'error' | 'warn';
  text: string;
}

export function setFlash(c: Context<{ Bindings: Env }>, flash: FlashMessage): void {
  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  const isProd = c.req.url.startsWith('https://');
  const val = encodeURIComponent(JSON.stringify(flash));
  let cookieStr = `${FLASH_COOKIE_NAME}=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=60`;
  if (isProd) {
    cookieStr += `; Domain=.${baseDomain}; Secure`;
  }
  c.header('Set-Cookie', cookieStr, { append: true });
}

export function consumeFlash(c: Context<{ Bindings: Env }>): FlashMessage | null {
  const cookies = parseCookies(c.req.header('Cookie') || null);
  const raw = cookies[FLASH_COOKIE_NAME];
  if (!raw) return null;

  const baseDomain = c.env.BASE_DOMAIN || 'gajiku.my.id';
  const isProd = c.req.url.startsWith('https://');
  let clearStr = `${FLASH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  if (isProd) {
    clearStr += `; Domain=.${baseDomain}; Secure`;
  }
  c.header('Set-Cookie', clearStr, { append: true });

  try {
    const parsed = JSON.parse(raw) as FlashMessage;
    if (parsed && typeof parsed.text === 'string' && ['success', 'error', 'warn'].includes(parsed.type)) {
      return parsed;
    }
  } catch {
    // Ignore malformed flash cookie
  }
  return null;
}

export function redirectWithFlash(
  c: Context<{ Bindings: Env }>,
  url: string,
  type: FlashMessage['type'],
  text: string
): Response {
  setFlash(c, { type, text });
  return c.redirect(url);
}
