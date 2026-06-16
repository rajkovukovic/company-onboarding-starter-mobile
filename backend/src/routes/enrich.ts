import { Router, Request, Response } from 'express';

import type { EnrichRequest } from '../../../shared/src/enrichment';
import {
  companySearchTermFromDomain,
  getEmailDomainWarnings,
  isValidEmail,
  normalizeWebsite,
  type NormalizedWebsite,
} from '../enrichment/domain';
import { enrichFromCompaniesHouse } from '../enrichment/companiesHouse';
import { createEnrichResponse } from '../enrichment/response';
import { enrichFromCompanyWebsite } from '../enrichment/website';

const router = Router();

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

  await enrichFromCompanyWebsite(response, normalizedWebsite);
  await enrichFromCompaniesHouse(
    response,
    companySearchTermFromDomain(normalizedWebsite.domain)
  );

  res.json(response);
});

export { router as enrichRouter };
