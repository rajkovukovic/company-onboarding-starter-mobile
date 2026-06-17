import { Router, Request, Response } from 'express';

import type { EnrichRequest } from '../../../shared/src/enrichment';
import {
  companySearchTermFromDomain,
  getEmailDomainWarnings,
  isValidEmail,
  normalizeWebsite,
  type NormalizedWebsite,
} from '../enrichment/domain';
import {
  enrichFromCompaniesHouse,
  type CompaniesHouseSearchTerm,
} from '../enrichment/companiesHouse';
import { interpretWebsiteEvidence } from '../enrichment/openaiInterpreter';
import { createEnrichResponse } from '../enrichment/response';
import { enrichFromCompanyWebsite, type WebsiteEvidence } from '../enrichment/website';

const router = Router();

function addSearchTerm(
  terms: CompaniesHouseSearchTerm[],
  term: CompaniesHouseSearchTerm
) {
  if (
    term.value &&
    !terms.some((existing) => existing.value.toLowerCase() === term.value.toLowerCase())
  ) {
    terms.push(term);
  }
}

function buildCompaniesHouseSearchTerms(
  domain: string,
  websiteEvidence: WebsiteEvidence
): CompaniesHouseSearchTerm[] {
  const terms: CompaniesHouseSearchTerm[] = [];

  if (websiteEvidence.interpretedCompanyName) {
    addSearchTerm(terms, {
      value: websiteEvidence.interpretedCompanyName,
      reason: 'OpenAI interpretation of company website evidence',
      sources: ['Company Website', 'OpenAI'],
    });
  }

  for (const legalName of websiteEvidence.legalNames) {
    addSearchTerm(terms, {
      value: legalName,
      reason: 'company website legal text',
      sources: ['Company Website'],
    });
  }

  addSearchTerm(terms, {
    value: companySearchTermFromDomain(domain),
    reason: 'normalized website domain',
    sources: ['Domain'],
  });

  return terms;
}

router.post('/', async (req: Request<{}, {}, EnrichRequest>, res: Response) => {
  const { email, website } = req.body;

  if (!email?.trim() || !website?.trim()) {
    return res.status(400).json({ error: 'Email and website are required' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  let normalizedWebsite: NormalizedWebsite;
  try {
    normalizedWebsite = normalizeWebsite(website.trim());
  } catch {
    return res.status(400).json({ error: 'A valid company website is required' });
  }

  const response = createEnrichResponse(email, normalizedWebsite);
  response.enrichment.warnings?.push(
    ...getEmailDomainWarnings(email, normalizedWebsite.domain)
  );

  const websiteEvidence = await enrichFromCompanyWebsite(response, normalizedWebsite);
  await interpretWebsiteEvidence(response, normalizedWebsite, websiteEvidence);
  await enrichFromCompaniesHouse(
    response,
    buildCompaniesHouseSearchTerms(normalizedWebsite.domain, websiteEvidence)
  );

  res.json(response);
});

export { router as enrichRouter };
