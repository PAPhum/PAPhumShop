const SENSITIVE_KEY_PATTERN = /(password|passwd|secret|token|pin|salt|key)/i;

export function sanitizeForLog(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      item && typeof item === 'object' ? '[object]' : item
    );
  }

  const input = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(input)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[redacted]';
    } else if (val && typeof val === 'object') {
      sanitized[key] = '[object]';
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

export function logServerError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);

  const safeExtra = extra
    ? (sanitizeForLog(extra) as Record<string, unknown>)
    : {};

  console.error(
    JSON.stringify({
      level: 'error',
      context,
      message,
      ...safeExtra,
    })
  );
}