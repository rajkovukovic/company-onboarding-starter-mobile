import type { EnrichResponse } from '../../../shared/src/enrichment';

import { companyNameFromDomain, type NormalizedWebsite } from './domain';
import { setField } from './response';

const WEBSITE_FETCH_TIMEOUT_MS = 3500;

const GENERIC_TITLE_PARTS = new Set([
  'home',
  'homepage',
  'welcome',
  'official website',
]);

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
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

async function fetchCompanyWebsiteMetadata(website: string) {
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

    return { name, description };
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
) {
  response.company.name = companyNameFromDomain(normalizedWebsite.domain);
  setField(
    response,
    'name',
    ['Company Website'],
    'low',
    'derived from the normalized company website domain'
  );

  try {
    const metadata = await fetchCompanyWebsiteMetadata(normalizedWebsite.website);
    if (metadata.name) {
      response.company.name = metadata.name;
      setField(
        response,
        'name',
        ['Company Website'],
        'medium',
        'found in company website metadata or page title'
      );
    }

    if (metadata.description) {
      response.company.industry = metadata.description;
      setField(
        response,
        'industry',
        ['Company Website'],
        'low',
        'inferred from the company website meta description'
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    response.enrichment.warnings?.push(`Company website unavailable: ${message}`);
  }
}
