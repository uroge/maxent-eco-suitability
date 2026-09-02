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
  incomingRequestId && requestIdPattern.test(incomingRequestId)
    ? incomingRequestId
    : randomUUID();

const constantTimeBearerTokenEquals = (authorization, expected) => {
  const provided = Buffer.from(
    authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '',
  );
  const expectedToken = Buffer.from(expected);

  return (
    provided.length === expectedToken.length &&
    timingSafeEqual(provided, expectedToken)
  );
};

const loadLuaScript = (directory, filename) =>
  readFileSync(join(directory, filename), 'utf8');

module.exports = {
  constantTimeBearerTokenEquals,
  loadLuaScript,
  resolveRequestId,
  withTimeout,
};
