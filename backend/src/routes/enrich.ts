import { Router, Request, Response } from 'express';

import type {
  CompanyData,
  CompanyField,
  Confidence,
  EnrichRequest,
  EnrichResponse,
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

const COMPANIES_HOUSE_BASE_URL =
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
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    throw new Error('COMPANIES_HOUSE_API_KEY is not configured');
  }

  const response = await fetch(`${COMPANIES_HOUSE_BASE_URL}${path}`, {
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
function setField(
  response: EnrichResponse,
  field: CompanyField,
  confidence: Confidence,
  reason: string
) {
  response.enrichment.fields[field] = {
    sources: ['Companies House'],
    confidence,
    reason,
  };
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
    response.enrichment.sources.push('Companies House');

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

    response.company = company;

    if (company.name) {
      setField(
        response,
        'name',
        bestMatch.match.confidence,
        bestMatch.match.reason
      );
    }

    const registryReason = `${bestMatch.match.reason}; value returned by Companies House legal registry`;
    if (company.registrationNumber) {
      setField(
        response,
        'registrationNumber',
        bestMatch.match.confidence,
        registryReason
      );
    }
    if (company.status) {
      setField(response, 'status', bestMatch.match.confidence, registryReason);
    }
    if (company.incorporationDate) {
      setField(
        response,
        'incorporationDate',
        bestMatch.match.confidence,
        registryReason
      );
    }
    if (company.companyType) {
      setField(
        response,
        'companyType',
        bestMatch.match.confidence,
        registryReason
      );
    }
    if (company.registeredAddress) {
      setField(
        response,
        'registeredAddress',
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
