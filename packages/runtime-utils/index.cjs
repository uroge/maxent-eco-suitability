/* eslint-disable @typescript-eslint/no-require-imports -- This package is loaded by compiled CommonJS Nest applications. */

const { randomUUID, timingSafeEqual } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const withTimeout = async (operation, timeoutMs, message) => {
  let timeout;

  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const resolveRequestId = (incomingRequestId) =>
  incomingRequestId && requestIdPattern.test(incomingRequestId) ? incomingRequestId : randomUUID();

const constantTimeBearerTokenEquals = (authorization, expected) => {
  const provided = Buffer.from(
    authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : ''
  );
  const expectedToken = Buffer.from(expected);

  return provided.length === expectedToken.length && timingSafeEqual(provided, expectedToken);
};

const loadLuaScript = (directory, filename) => readFileSync(join(directory, filename), 'utf8');

const canonicalizeJson = (value) => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical JSON does not support non-finite numbers.');
    }

    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeJson(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`)
      .join(',')}}`;
  }

  throw new TypeError('Canonical JSON supports only JSON values.');
};

module.exports = {
  constantTimeBearerTokenEquals,
  canonicalizeJson,
  loadLuaScript,
  resolveRequestId,
  withTimeout,
};
