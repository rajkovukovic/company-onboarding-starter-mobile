import type { EnrichResponse } from '../../../shared/src/enrichment';

import { companyNameFromDomain, type NormalizedWebsite } from './domain';
import { setField } from './response';

const WEBSITE_FETCH_TIMEOUT_MS = 3500;
const MAX_LEGAL_NAME_LENGTH = 140;

const GENERIC_TITLE_PARTS = new Set([
  'home',
  'homepage',
  'welcome',
  'official website',
]);

const LEGAL_NAME_PATTERN =
  /(?:^|[\s(,.;:|/-])(?:copyright\s*)?(?:©\s*)?(?:\d{4}\s*)?([A-Z][A-Za-z0-9&.,'’ -]{1,140}?\s+(?:Limited|Ltd\.?|PLC|LLP))\b/gi;

export type WebsiteEvidence = {
  name?: string;
  description?: string;
  legalNames: string[];
  legalSnippets: string[];
  visibleText?: string;
  interpretedCompanyName?: string;
  interpretedIndustry?: string;
  interpretationReason?: string;
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function readHtmlAttribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(
    new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
  );

  return match?.[2] ?? match?.[3] ?? match?.[4];
}

function extractMetaContent(html: string, attribute: 'name' | 'property', value: string) {
  const metaPattern = /<meta\s+([^>]*?)>/gi;
  let match: RegExpExecArray | null;

  while ((match = metaPattern.exec(html))) {
    const attributes = match[1];
    if (readHtmlAttribute(attributes, attribute)?.toLowerCase() === value) {
      const content = readHtmlAttribute(attributes, 'content');
      if (content) return decodeHtmlEntities(content).trim();
    }
  }

  return undefined;
}

function htmlToTextBlocks(html: string) {
  const body =
    html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    html.replace(/<head[\s\S]*?<\/head>/gi, ' ');

  return decodeHtmlEntities(
    body
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<(?:br|p|div|li|footer|header|section|article|aside|nav|h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<\/(?:p|div|li|footer|header|section|article|aside|nav|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split(/\n+/)
    .map(compactWhitespace)
    .filter(Boolean);
}

function extractTitle(html: string): string | undefined {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!title) return undefined;

  const parts = decodeHtmlEntities(title)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+(?:\||-|:)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    parts.find((part) => !GENERIC_TITLE_PARTS.has(part.toLowerCase())) ??
    parts[0]
  );
}

function normalizeLegalName(value: string) {
  return compactWhitespace(
    value
      .replace(/^[\s©]*(?:copyright\s*)?(?:\d{4}\s*)?/i, '')
      .replace(/[.,;:|/-]+$/g, '')
  );
}

function isLikelyNavigationCandidate(value: string) {
  return /\b(?:privacy policy|terms|cookie|complaints|settings|legal)\b/i.test(value);
}

function extractLegalEvidence(textBlocks: string[]) {
  const legalNames: string[] = [];
  const legalSnippets: string[] = [];
  let match: RegExpExecArray | null;

  for (const text of textBlocks) {
    LEGAL_NAME_PATTERN.lastIndex = 0;
    while ((match = LEGAL_NAME_PATTERN.exec(text))) {
      const candidate = normalizeLegalName(match[1]);
      if (
        candidate.length <= MAX_LEGAL_NAME_LENGTH &&
        !isLikelyNavigationCandidate(candidate) &&
        !legalNames.some((name) => name.toLowerCase() === candidate.toLowerCase())
      ) {
        legalNames.push(candidate);
      }
    }

    if (
      /(?:company number|registered office|authorised|regulated|firm reference|FRN|©|copyright|limited|ltd\.?|plc|llp)/i.test(
        text
      ) &&
      !legalSnippets.includes(text)
    ) {
      legalSnippets.push(text);
    }
  }

  return { legalNames, legalSnippets };
}

async function fetchCompanyWebsiteEvidence(website: string): Promise<WebsiteEvidence> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(website, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'SeapointCompanyEnrichment/1.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(`company website blocked access with ${response.status}`);
      }

      throw new Error(`company website returned ${response.status}`);
    }

    const html = await response.text();
    const name =
      extractMetaContent(html, 'property', 'og:site_name') ??
      extractMetaContent(html, 'name', 'application-name') ??
      extractTitle(html);
    const description =
      extractMetaContent(html, 'name', 'description') ??
      extractMetaContent(html, 'property', 'og:description');
    const textBlocks = htmlToTextBlocks(html);
    const { legalNames, legalSnippets } = extractLegalEvidence(textBlocks);

    return {
      name,
      description,
      legalNames,
      legalSnippets,
      visibleText: textBlocks.join('\n').slice(0, 12000),
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`company website timed out after ${WEBSITE_FETCH_TIMEOUT_MS}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function enrichFromCompanyWebsite(
  response: EnrichResponse,
  normalizedWebsite: NormalizedWebsite
): Promise<WebsiteEvidence> {
  response.company.name = companyNameFromDomain(normalizedWebsite.domain);
  setField(
    response,
    'name',
    ['Company Website'],
    'low',
    'derived from the normalized company website domain'
  );

  try {
    const evidence = await fetchCompanyWebsiteEvidence(normalizedWebsite.website);
    const legalName = evidence.legalNames[0];

    if (legalName) {
      response.company.name = legalName;
      setField(
        response,
        'name',
        ['Company Website'],
        'medium',
        'found in company website legal text'
      );
    } else if (evidence.name) {
      response.company.name = evidence.name;
      setField(
        response,
        'name',
        ['Company Website'],
        'medium',
        'found in company website metadata or page title'
      );
    }

    if (evidence.description) {
      response.company.industry = evidence.description;
      setField(
        response,
        'industry',
        ['Company Website'],
        'low',
        'inferred from the company website meta description'
      );
    }

    return evidence;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    response.enrichment.warnings?.push(`Company website unavailable: ${message}`);

    return { legalNames: [], legalSnippets: [] };
  }
}
