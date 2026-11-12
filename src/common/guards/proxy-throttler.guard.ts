import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit by the real client IP. Behind Render/Cloudflare `req.ip` is the proxy's
 * address (shared by every user), so read the forwarded headers first.
 * Order: CF-Connecting-IP (set by Cloudflare, not spoofable through it), then the
 * first X-Forwarded-For entry, then the socket address.
 */
@Injectable()
export class ProxyThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const headers = req?.headers || {};
    const cf = headers['cf-connecting-ip'];
    const xff = headers['x-forwarded-for'];
    const first = (v: unknown) => String(Array.isArray(v) ? v[0] : v || '').split(',')[0].trim();
    return first(cf) || first(xff) || req?.ip || req?.socket?.remoteAddress || 'unknown';
  }
}
