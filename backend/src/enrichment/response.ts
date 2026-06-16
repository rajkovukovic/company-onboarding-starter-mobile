import type {
  CompanyField,
  Confidence,
  EnrichResponse,
  EnrichmentSource,
} from '../../../shared/src/enrichment';

import type { NormalizedWebsite } from './domain';

export function createEnrichResponse(
  email: string,
  normalizedWebsite: NormalizedWebsite
): EnrichResponse {
  return {
    input: {
      email: email.trim(),
      website: normalizedWebsite.website,
      domain: normalizedWebsite.domain,
    },
    company: {},
    enrichment: {
      sources: [],
      fields: {},
      warnings: [],
    },
  };
}

/**
 * Records the field-level source, confidence, and explanation required by the
 * assessment review criteria.
 */
export function setField(
  response: EnrichResponse,
  field: CompanyField,
  sources: EnrichmentSource[],
  confidence: Confidence,
  reason: string
) {
  for (const source of sources) {
    addSource(response, source);
  }

  response.enrichment.fields[field] = {
    sources,
    confidence,
    reason,
  };
}

function addSource(response: EnrichResponse, source: EnrichmentSource) {
  if (!response.enrichment.sources.includes(source)) {
    response.enrichment.sources.push(source);
  }
}
