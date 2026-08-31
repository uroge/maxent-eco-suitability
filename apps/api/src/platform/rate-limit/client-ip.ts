import ipaddr from 'ipaddr.js';
import type { Request } from 'express';

export const normalizedClientIp = (request: Request): string => {
  const candidate = request.ip ?? request.socket.remoteAddress;

  if (!candidate || !ipaddr.isValid(candidate)) {
    return 'unknown';
  }

  return ipaddr.process(candidate).toNormalizedString();
};
