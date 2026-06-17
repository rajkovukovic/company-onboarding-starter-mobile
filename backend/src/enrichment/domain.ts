const EMAIL_PATTERN = /^[^\s@]+@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/;

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

const PERSONAL_EMAIL_DOMAINS = new Set([
  'aol.com',
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'me.com',
  'msn.com',
  'outlook.com',
  'proton.me',
  'protonmail.com',
  'yahoo.com',
  'yahoo.co.uk',
]);

export type NormalizedWebsite = {
  website: string;
  domain: string;
};

export function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(email.trim());
}

/**
 * Converts user-entered website text into a stable HTTPS URL and hostname.
 * Query strings and hashes are dropped because they do not identify the company.
 */
export function normalizeWebsite(rawWebsite: string): NormalizedWebsite {
  if (rawWebsite.includes('@')) {
    throw new Error('Website must not contain an @ symbol');
  }

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
export function companySearchTermFromDomain(domain: string): string {
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

export function companyNameFromDomain(domain: string): string {
  return titleCaseCompanyName(companySearchTermFromDomain(domain));
}

function titleCaseCompanyName(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function domainFromEmail(email: string): string {
  const parts = email.trim().split('@');
  return parts[parts.length - 1]?.toLowerCase() ?? '';
}

function domainsAppearRelated(emailDomain: string, websiteDomain: string) {
  return (
    emailDomain === websiteDomain ||
    emailDomain.endsWith(`.${websiteDomain}`) ||
    websiteDomain.endsWith(`.${emailDomain}`)
  );
}

export function getEmailDomainWarnings(email: string, websiteDomain: string) {
  const emailDomain = domainFromEmail(email);

  if (PERSONAL_EMAIL_DOMAINS.has(emailDomain)) {
    return [
      'Personal email domains are less reliable for company matching; please review the company details carefully.',
    ];
  }

  if (!domainsAppearRelated(emailDomain, websiteDomain)) {
    return [
      `Email domain "${emailDomain}" does not match website domain "${websiteDomain}"; please confirm this is the right company.`,
    ];
  }

  return [];
}
