import type {
  CompanyData,
  Confidence,
  EnrichResponse,
  EnrichmentSource,
} from '../../../shared/src/enrichment';

import { logEnrichmentDebug } from './debugLogger';
import { setField } from './response';

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

export type CompaniesHouseSearchTerm = {
  value: string;
  reason: string;
  sources: Array<EnrichmentSource | 'Domain' | 'OpenAI'>;
};

const DEFAULT_COMPANIES_HOUSE_BASE_URL =
  'https://api.company-information.service.gov.uk';

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

class CompaniesHouseRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'CompaniesHouseRequestError';
  }
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
  searchTerm: CompaniesHouseSearchTerm
): { score: number; confidence: Confidence; reason: string } {
  const titleTokens = normalizeCompanyName(item.title ?? '');
  const searchTokens = normalizeCompanyName(searchTerm.value);
  const title = titleTokens.join(' ');
  const search = searchTokens.join(' ');
  const evidenceReason =
    searchTerm.sources.includes('Company Website') ||
    searchTerm.sources.includes('OpenAI')
      ? searchTerm.reason
      : 'normalized website domain';

  if (title && search && title === search) {
    return {
      score: 100,
      confidence: 'high',
      reason: `exact Companies House name match for ${evidenceReason}`,
    };
  }

  if (title && search && (title.includes(search) || search.includes(title))) {
    return {
      score: 80,
      confidence: 'high',
      reason: `strong Companies House name match for ${evidenceReason}`,
    };
  }

  const overlap = searchTokens.filter((token) => titleTokens.includes(token)).length;
  if (overlap > 0) {
    return {
      score: 40 + overlap,
      confidence: 'medium',
      reason:
        `partial Companies House name match for ${evidenceReason}`,
    };
  }

  return {
    score: 0,
    confidence: 'low',
    reason: `weak Companies House match for ${evidenceReason}`,
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
  const bodyText = await response.text();
  let body: unknown;

  try {
    body = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    body = bodyText;
  }

  logEnrichmentDebug('companies_house_response', {
    path,
    status: response.status,
    ok: response.ok,
    body,
  });

  if (!response.ok) {
    throw new CompaniesHouseRequestError(
      `Companies House returned ${response.status}`,
      response.status
    );
  }

  return body as T;
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

function getCompaniesHouseUnavailableWarning(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const isAuthError =
    error instanceof CompaniesHouseRequestError &&
    (error.status === 401 || error.status === 403);
  const configuredBaseUrl = process.env.COMPANIES_HOUSE_BASE_URL?.trim();

  return isAuthError && configuredBaseUrl
    ? `${message}. Check whether COMPANIES_HOUSE_BASE_URL matches the API key environment.`
    : `Companies House unavailable: ${message}`;
}

export async function enrichFromCompaniesHouse(
  response: EnrichResponse,
  searchTerms: CompaniesHouseSearchTerm[]
) {
  try {
    let selected:
      | {
          searchTerm: CompaniesHouseSearchTerm;
          bestMatch: {
            item: CompaniesHouseSearchItem;
            match: ReturnType<typeof scoreCompaniesHouseMatch>;
          };
          companyNumber: string;
          nextMatch?: {
            item: CompaniesHouseSearchItem;
            match: ReturnType<typeof scoreCompaniesHouseMatch>;
          };
        }
      | undefined;

    for (const searchTerm of searchTerms) {
      const searchResults = await getCompaniesHouse<CompaniesHouseSearchResponse>(
        `/search/companies?q=${encodeURIComponent(searchTerm.value)}&items_per_page=5`
      );
      const rankedMatches = (searchResults.items ?? [])
        .map((item) => ({
          item,
          match: scoreCompaniesHouseMatch(item, searchTerm),
        }))
        .sort((a, b) => b.match.score - a.match.score);
      logEnrichmentDebug('companies_house_ranked_matches', {
        searchTerm,
        rankedMatches,
      });
      const bestMatch = rankedMatches[0];

      if (bestMatch && bestMatch.match.score > 0 && bestMatch.item.company_number) {
        selected = {
          searchTerm,
          bestMatch,
          companyNumber: bestMatch.item.company_number,
          nextMatch: rankedMatches[1],
        };
        break;
      }
    }

    if (!selected) {
      const searchedTerms = searchTerms.map((term) => `"${term.value}"`).join(', ');
      response.enrichment.warnings?.push(
        `No usable Companies House match found for ${searchedTerms}`
      );
      return;
    }

    const { searchTerm, bestMatch, companyNumber, nextMatch } = selected;

    if (nextMatch && nextMatch.match.confidence === 'high') {
      const runnerUp = nextMatch.item.title ?? nextMatch.item.company_number ?? 'unknown';
      const gap = bestMatch.match.score - nextMatch.match.score;
      response.enrichment.warnings?.push(
        `Multiple Companies House matches found for "${searchTerm.value}". ` +
          `Using "${bestMatch.item.title ?? bestMatch.item.company_number}" as the best match ` +
          `(score gap: ${gap} over next candidate "${runnerUp}"); please verify this is the correct entity.`
      );
    }

    if (bestMatch.match.confidence !== 'high') {
      response.enrichment.warnings?.push(
        `Companies House match confidence is ${bestMatch.match.confidence}; please verify the registry details before continuing.`
      );
    }

    const profile = await getCompaniesHouse<CompaniesHouseCompanyProfile>(
      `/company/${encodeURIComponent(companyNumber)}`
    );
    const company: CompanyData = {
      name: profile.company_name ?? bestMatch.item.title,
      registrationNumber: profile.company_number ?? companyNumber,
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
      const nameSources: EnrichmentSource[] =
        searchTerm.sources.includes('Company Website') ||
        searchTerm.sources.includes('OpenAI')
          ? ['Company Website', 'Companies House']
          : ['Companies House'];

      setField(
        response,
        'name',
        nameSources,
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
    response.enrichment.warnings?.push(getCompaniesHouseUnavailableWarning(error));
  }
}
