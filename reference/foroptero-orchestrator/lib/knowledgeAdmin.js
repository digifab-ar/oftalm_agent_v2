import crypto from 'crypto';

export function bearerMatches(req, expectedToken) {
  if (!expectedToken?.trim()) {
    return false;
  }
  const auth = req.headers.authorization ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match !== null && match[1] === expectedToken.trim();
}

/**
 * @param {Buffer|string} rawBody
 * @param {string} signatureHeader — X-Hub-Signature-256
 * @param {string} secret
 */
export function verifyGithubWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret?.trim() || !signatureHeader) {
    return false;
  }
  const body =
    typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret.trim()).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureHeader)
    );
  } catch {
    return false;
  }
}

/**
 * @param {object} payload — GitHub push event
 */
export function isPushToMain(payload) {
  return payload?.ref === 'refs/heads/main';
}
