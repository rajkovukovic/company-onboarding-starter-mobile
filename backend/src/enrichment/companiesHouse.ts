import type {
  CompanyData,
  Confidence,
  EnrichResponse,
} from '../../../shared/src/enrichment';

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
    throw new CompaniesHouseRequestError(
      `Companies House returned ${response.status}`,
      response.status
    );
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
  searchTerm: string
) {
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
    const nextMatch = rankedMatches[1];

    if (!bestMatch || bestMatch.match.score === 0 || !bestMatch.item.company_number) {
      response.enrichment.warnings?.push(
        `No usable Companies House match found for "${searchTerm}"`
      );
      return;
    }

    if (nextMatch && nextMatch.match.score > 0) {
      response.enrichment.warnings?.push(
        `Multiple Companies House matches found for "${searchTerm}"; using "${bestMatch.item.title ?? bestMatch.item.company_number}" as the best match.`
      );
    }

    if (bestMatch.match.confidence !== 'high') {
      response.enrichment.warnings?.push(
        `Companies House match confidence is ${bestMatch.match.confidence}; please verify the registry details before continuing.`
      );
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
    response.enrichment.warnings?.push(getCompaniesHouseUnavailableWarning(error));
  }
}
