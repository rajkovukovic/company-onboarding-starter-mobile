import type { Confidence, EnrichResponse } from '../../../shared/src/enrichment';

import type { NormalizedWebsite } from './domain';
import { setField } from './response';
import type { WebsiteEvidence } from './website';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_TIMEOUT_MS = 8000;
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

type WebsiteInterpretation = {
  companyName: string | null;
  industry: string | null;
  confidence: Confidence;
  reason: string;
  userFacingWarning: string | null;
  rejectedNames: string[];
};

function getOpenAIKey() {
  return process.env.OPENAI_API_KEY?.trim();
}

function getOpenAIModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

function buildPrompt(normalizedWebsite: NormalizedWebsite, evidence: WebsiteEvidence) {
  return JSON.stringify(
    {
      task:
        'Identify the primary company represented by this website and a concise industry category. Use only the supplied evidence. Do not invent facts.',
      rules: [
        'Prefer the company that owns or operates the submitted website.',
        'A copyright owner or first-party company statement is strong evidence.',
        'Do not choose third-party providers, regulators, partners, appointees, or companies mentioned only as service providers.',
        'If several related Seapoint entities are mentioned, prefer the entity tied to the submitted website and copyright owner unless stronger evidence says otherwise.',
        'Return null for companyName if the evidence does not support a primary company.',
        'Return a concise industry such as "Financial Technology / Payments" or "AI / Software Development".',
      ],
      normalizedWebsite,
      websiteEvidence: {
        titleOrSiteName: evidence.name,
        metaDescription: evidence.description,
        deterministicLegalNames: evidence.legalNames,
        legalSnippets: evidence.legalSnippets.slice(0, 12),
        visibleText: evidence.visibleText?.slice(0, 8000),
      },
    },
    null,
    2
  );
}

function extractResponseText(payload: any): string | undefined {
  if (typeof payload?.output_text === 'string') {
    return payload.output_text;
  }

  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        return content.text;
      }
    }
  }

  return undefined;
}

function isConfidence(value: unknown): value is Confidence {
  return value === 'high' || value === 'medium' || value === 'low';
}

function parseInterpretation(payload: unknown): WebsiteInterpretation | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const value = payload as Record<string, unknown>;

  if (!isConfidence(value.confidence) || typeof value.reason !== 'string') {
    return undefined;
  }

  return {
    companyName:
      typeof value.companyName === 'string' && value.companyName.trim()
        ? value.companyName.trim()
        : null,
    industry:
      typeof value.industry === 'string' && value.industry.trim()
        ? value.industry.trim()
        : null,
    confidence: value.confidence,
    reason: value.reason.trim(),
    userFacingWarning:
      typeof value.userFacingWarning === 'string' && value.userFacingWarning.trim()
        ? value.userFacingWarning.trim()
        : null,
    rejectedNames: Array.isArray(value.rejectedNames)
      ? value.rejectedNames.filter((name): name is string => typeof name === 'string')
      : [],
  };
}

async function requestWebsiteInterpretation(
  normalizedWebsite: NormalizedWebsite,
  evidence: WebsiteEvidence
): Promise<WebsiteInterpretation> {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: getOpenAIModel(),
        input: [
          {
            role: 'system',
            content:
              'You extract company onboarding evidence. You are an evidence interpreter, not a source of truth. Return only schema-valid JSON.',
          },
          {
            role: 'user',
            content: buildPrompt(normalizedWebsite, evidence),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'website_enrichment_interpretation',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                companyName: {
                  type: ['string', 'null'],
                  description: 'Primary company represented by the website, or null.',
                },
                industry: {
                  type: ['string', 'null'],
                  description: 'Concise industry category inferred from website evidence.',
                },
                confidence: {
                  type: 'string',
                  enum: ['high', 'medium', 'low'],
                },
                reason: {
                  type: 'string',
                },
                userFacingWarning: {
                  type: ['string', 'null'],
                },
                rejectedNames: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: [
                'companyName',
                'industry',
                'confidence',
                'reason',
                'userFacingWarning',
                'rejectedNames',
              ],
            },
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI returned ${response.status}`);
    }

    const payload = await response.json();
    const text = extractResponseText(payload);
    if (!text) {
      throw new Error('OpenAI returned no structured output');
    }

    const interpretation = parseInterpretation(JSON.parse(text));
    if (!interpretation) {
      throw new Error('OpenAI returned invalid website interpretation');
    }

    return interpretation;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenAI timed out after ${OPENAI_TIMEOUT_MS}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function interpretWebsiteEvidence(
  response: EnrichResponse,
  normalizedWebsite: NormalizedWebsite,
  evidence: WebsiteEvidence
) {
  if (!getOpenAIKey() || !evidence.visibleText) {
    return evidence;
  }

  try {
    const interpretation = await requestWebsiteInterpretation(
      normalizedWebsite,
      evidence
    );

    evidence.interpretedCompanyName = interpretation.companyName ?? undefined;
    evidence.interpretedIndustry = interpretation.industry ?? undefined;
    evidence.interpretationReason = interpretation.reason;

    if (interpretation.companyName && interpretation.confidence !== 'low') {
      response.company.name = interpretation.companyName;
      setField(
        response,
        'name',
        ['Company Website'],
        interpretation.confidence,
        `interpreted from company website evidence: ${interpretation.reason}`
      );
    }

    if (interpretation.industry) {
      response.company.industry = interpretation.industry;
      setField(
        response,
        'industry',
        ['Company Website'],
        interpretation.confidence,
        `interpreted from company website evidence: ${interpretation.reason}`
      );
    }

    if (interpretation.userFacingWarning) {
      response.enrichment.warnings?.push(interpretation.userFacingWarning);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    response.enrichment.warnings?.push(
      `OpenAI website interpretation unavailable: ${message}`
    );
  }

  return evidence;
}
