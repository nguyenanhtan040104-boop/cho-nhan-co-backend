import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// Cloudflare IP ranges (cập nhật từ https://www.cloudflare.com/ips/)
const CLOUDFLARE_IPS = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  // IPv6
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  if (cidr.includes(':')) return false; // skip IPv6 for now
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits)) - 1) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(range) & mask);
}

function isCloudflareIp(ip: string): boolean {
  return CLOUDFLARE_IPS.some(cidr => isIpInCidr(ip, cidr));
}

@Injectable()
export class CloudflareMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Bỏ qua check nếu là môi trường development
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    const cfConnectingIp = req.headers['cf-connecting-ip'] as string;
    const realIp = req.headers['x-real-ip'] as string;
    const forwardedFor = req.headers['x-forwarded-for'] as string;
    const remoteIp = req.socket.remoteAddress || '';

    // Nếu có CF-Connecting-IP header → request đến qua Cloudflare
    if (cfConnectingIp) {
      return next();
    }

    // Kiểm tra IP nguồn có phải Cloudflare không
    const sourceIp = (forwardedFor?.split(',')[0] || realIp || remoteIp).trim().replace('::ffff:', '');
    if (isCloudflareIp(sourceIp)) {
      return next();
    }

    // Cho phép localhost (Railway internal health check)
    if (sourceIp === '127.0.0.1' || sourceIp === '::1' || sourceIp.startsWith('10.') || sourceIp.startsWith('172.')) {
      return next();
    }

    throw new ForbiddenException('Direct access not allowed');
  }
}
