const SECRET_KEYS = [/authorization/i, /api[_-]?key/i, /token/i, /secret/i];

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEYS.some((pattern) => pattern.test(key)) ? "[REDACTED]" : redactSecrets(item),
    ]),
  );
}
