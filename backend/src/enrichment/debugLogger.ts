const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isEnrichmentDebugLoggingEnabled() {
  const value = process.env.ENRICHMENT_DEBUG_LOGGING?.trim().toLowerCase();
  return value ? TRUE_VALUES.has(value) : false;
}

export function logEnrichmentDebug(event: string, payload: unknown) {
  if (!isEnrichmentDebugLoggingEnabled()) {
    return;
  }

  console.debug(
    `[enrichment-debug] ${event}`,
    JSON.stringify(payload, null, 2)
  );
}
