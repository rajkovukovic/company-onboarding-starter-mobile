import { Router, Request, Response } from 'express';

import type {
  CompanyData,
  CompanyField,
  Confidence,
  EnrichRequest,
  EnrichResponse,
  EnrichmentSource,
} from '../../../shared/src/enrichment';

const router = Router();

type CompaniesHouseSearchItem = {
  title?: string;
  company_number?: string;
  company_status?: string;
  company_type?: string;
  date_of_creation?: string;
  address?: CompaniesHouseAddress;
};

type CompaniesHouseSearchResponse = {
  items?: CompaniesHouseSearchItem[];
};

type CompaniesHouseCompanyProfile = {
  company_name?: string;
  company_number?: string;
  company_status?: string;
  type?: string;
  date_of_creation?: string;
  registered_office_address?: CompaniesHouseAddress;
};

type CompaniesHouseAddress = {
  address_line_1?: string;
  address_line_2?: string;
  locality?: string;
  region?: string;
  postal_code?: string;
  country?: string;
};

const DEFAULT_COMPANIES_HOUSE_BASE_URL =
  'https://api.company-information.service.gov.uk';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMMON_LEGAL_SUFFIXES = new Set([
  'limited',
  'ltd',
  'plc',
  'llp',
  'group',
  'holdings',
  'company',
  'co',
  'uk',
]);
const COMMON_SECOND_LEVEL_DOMAINS = new Set([
  'ac',
  'co',
  'com',
  'gov',
  'ltd',
  'me',
  'net',
  'nhs',
  'org',
  'plc',
  'sch',
]);
const WEBSITE_FETCH_TIMEOUT_MS = 3500;
const GENERIC_TITLE_PARTS = new Set([
  'home',
  'homepage',
  'welcome',
  'official website',
]);

/**
 * Converts user-entered website text into a stable HTTPS URL and hostname.
 * Query strings and hashes are dropped because they do not identify the company.
 */
function normalizeWebsite(rawWebsite: string): { website: string; domain: string } {
  const withProtocol = /^https?:\/\//i.test(rawWebsite)
    ? rawWebsite
    : `https://${rawWebsite}`;
  const parsed = new URL(withProtocol);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Website must use http or https');
  }

  const domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
    throw new Error('Website must include a valid domain');
  }

  parsed.protocol = 'https:';
  parsed.hostname = domain;
  parsed.pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';

  return {
    website: parsed.toString().replace(/\/$/, ''),
    domain,
  };
}

/**
 * Derives a Companies House search term from the normalized domain.
 * Handles common UK second-level domains so `acme.co.uk` searches for `acme`.
 */
function companySearchTermFromDomain(domain: string): string {
  const labels = domain.split('.').filter(Boolean);
  const suffixLength =
    labels.length >= 3 &&
    labels[labels.length - 1].length === 2 &&
    COMMON_SECOND_LEVEL_DOMAINS.has(labels[labels.length - 2])
      ? 2
      : 1;
  const registrableLabels = labels.slice(0, Math.max(1, labels.length - suffixLength));
  const label = registrableLabels[registrableLabels.length - 1] ?? domain;

  return label.replace(/[-_]+/g, ' ').trim();
}

function titleCaseCompanyName(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function companyNameFromDomain(domain: string): string {
  return titleCaseCompanyName(companySearchTermFromDomain(domain));
}

/**
 * Tokenizes a company name for matching, ignoring legal suffixes that often
 * differ between domains and registry names.
 */
function normalizeCompanyName(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !COMMON_LEGAL_SUFFIXES.has(token));
}

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
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Scores whether a Companies House search item appears to match the website.
 * The returned confidence is reused for legal registry fields sourced from it.
 */
function scoreCompaniesHouseMatch(
  item: CompaniesHouseSearchItem,
  searchTerm: string
): { score: number; confidence: Confidence; reason: string } {
  const titleTokens = normalizeCompanyName(item.title ?? '');
  const searchTokens = normalizeCompanyName(searchTerm);
  const title = titleTokens.join(' ');
  const search = searchTokens.join(' ');

  if (title && search && title === search) {
    return {
      score: 100,
      confidence: 'high',
      reason: 'exact Companies House name match for the normalized website domain',
    };
  }

  if (title && search && (title.includes(search) || search.includes(title))) {
    return {
      score: 80,
      confidence: 'high',
      reason: 'strong Companies House name match for the normalized website domain',
    };
  }

  const overlap = searchTokens.filter((token) => titleTokens.includes(token)).length;
  if (overlap > 0) {
    return {
      score: 40 + overlap,
      confidence: 'medium',
      reason:
        'partial Companies House name match for the normalized website domain',
    };
  }

  return {
    score: 0,
    confidence: 'low',
    reason: 'weak Companies House match for the normalized website domain',
  };
}

/**
 * Calls the Companies House API using Basic auth, where the API key is the
 * username and the password is empty per Companies House API conventions.
 */
async function getCompaniesHouse<T>(path: string): Promise<T> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('COMPANIES_HOUSE_API_KEY is not configured');
  }

  const baseUrl =
    process.env.COMPANIES_HOUSE_BASE_URL?.trim() ??
    DEFAULT_COMPANIES_HOUSE_BASE_URL;

  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Companies House returned ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Translates Companies House address fields into the response contract and
 * omits the address entirely when the registry response has no usable parts.
 */
function mapCompaniesHouseAddress(
  address?: CompaniesHouseAddress
): CompanyData['registeredAddress'] | undefined {
  if (!address) return undefined;

  const registeredAddress = {
    line1: address.address_line_1,
    line2: address.address_line_2,
    city: address.locality,
    region: address.region,
    postalCode: address.postal_code,
    country: address.country,
  };

  return Object.values(registeredAddress).some(Boolean)
    ? registeredAddress
    : undefined;
}

/**
 * Records the field-level source, confidence, and explanation required by the
 * assessment review criteria.
 */
function addSource(response: EnrichResponse, source: EnrichmentSource) {
  if (!response.enrichment.sources.includes(source)) {
    response.enrichment.sources.push(source);
  }
}

function setField(
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

async function enrichFromCompanyWebsite(
  response: EnrichResponse,
  normalizedWebsite: { website: string; domain: string }
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

router.post('/', async (req: Request<{}, {}, EnrichRequest>, res: Response) => {
  const { email, website } = req.body;

  if (!email?.trim() || !website?.trim()) {
    return res.status(400).json({ error: 'Email and website are required' });
  }

  if (!EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  let normalizedWebsite: { website: string; domain: string };
  try {
    normalizedWebsite = normalizeWebsite(website.trim());
  } catch {
    return res.status(400).json({ error: 'A valid company website is required' });
  }

  const response: EnrichResponse = {
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

  const searchTerm = companySearchTermFromDomain(normalizedWebsite.domain);

  await enrichFromCompanyWebsite(response, normalizedWebsite);

  try {
    const searchResults = await getCompaniesHouse<CompaniesHouseSearchResponse>(
      `/search/companies?q=${encodeURIComponent(searchTerm)}&items_per_page=5`
    );
    const rankedMatches = (searchResults.items ?? [])
      .map((item) => ({
        item,
        match: scoreCompaniesHouseMatch(item, searchTerm),
      }))
      .sort((a, b) => b.match.score - a.match.score);
    const bestMatch = rankedMatches[0];

    if (!bestMatch || bestMatch.match.score === 0 || !bestMatch.item.company_number) {
      response.enrichment.warnings?.push(
        `No usable Companies House match found for "${searchTerm}"`
      );
      return res.json(response);
    }

    const profile = await getCompaniesHouse<CompaniesHouseCompanyProfile>(
      `/company/${encodeURIComponent(bestMatch.item.company_number)}`
    );
    const company: CompanyData = {
      name: profile.company_name ?? bestMatch.item.title,
      registrationNumber:
        profile.company_number ?? bestMatch.item.company_number,
      status: profile.company_status ?? bestMatch.item.company_status,
      incorporationDate:
        profile.date_of_creation ?? bestMatch.item.date_of_creation,
      companyType: profile.type ?? bestMatch.item.company_type,
      registeredAddress:
        mapCompaniesHouseAddress(profile.registered_office_address) ??
        mapCompaniesHouseAddress(bestMatch.item.address),
    };

    response.company = {
      ...response.company,
      ...company,
    };

    if (company.name) {
      setField(
        response,
        'name',
        ['Companies House'],
        bestMatch.match.confidence,
        bestMatch.match.reason
      );
    }

    const registryReason = `${bestMatch.match.reason}; value returned by Companies House legal registry`;
    if (company.registrationNumber) {
      setField(
        response,
        'registrationNumber',
        ['Companies House'],
        bestMatch.match.confidence,
        registryReason
      );
    }
    if (company.status) {
      setField(
        response,
        'status',
        ['Companies House'],
        bestMatch.match.confidence,
        registryReason
      );
    }
    if (company.incorporationDate) {
      setField(
        response,
        'incorporationDate',
        ['Companies House'],
        bestMatch.match.confidence,
        registryReason
      );
    }
    if (company.companyType) {
      setField(
        response,
        'companyType',
        ['Companies House'],
        bestMatch.match.confidence,
        registryReason
      );
    }
    if (company.registeredAddress) {
      setField(
        response,
        'registeredAddress',
        ['Companies House'],
        bestMatch.match.confidence,
        registryReason
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    response.enrichment.warnings?.push(
      `Companies House unavailable: ${message}`
    );
  }

  res.json(response);
});

export { router as enrichRouter };
