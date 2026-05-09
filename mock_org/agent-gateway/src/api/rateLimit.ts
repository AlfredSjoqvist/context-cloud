const buckets = new Map<string, number>();

export function rateLimitKey(orgId: string, agentId: string, ip: string) {
  return `${orgId}:${agentId}:${ip}`;
}

export function consume(key: string, limit = 120) {
  const next = (buckets.get(key) ?? 0) + 1;
  buckets.set(key, next);
  return next <= limit;
}
