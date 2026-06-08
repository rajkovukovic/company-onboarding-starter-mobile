import { Router, Request, Response } from 'express';

const router = Router();

type EnrichRequest = {
  email: string;
  website: string;
};

type CompanyData = {
  name?: string;
  registrationNumber?: string;
  registeredAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  };
  incorporationDate?: string;
  companyType?: string;
  industry?: string;
  status?: string;
};

type EnrichmentMetadata = {
  sources: string[];
  confidence: Record<string, 'high' | 'medium' | 'low'>;
};

type EnrichResponse = {
  company: CompanyData;
  enrichment: EnrichmentMetadata;
};

router.post('/', async (req: Request<{}, {}, EnrichRequest>, res: Response) => {
  const { email, website } = req.body;

  if (!email || !website) {
    return res.status(400).json({ error: 'Email and website are required' });
  }

  // TODO: Implement your enrichment logic here
  //
  // 1. Extract domain from website
  // 2. Query data sources (Companies House, web search, website scraping, etc.)
  // 3. Merge and validate results
  // 4. Return enriched company data with confidence scores
  //
  // Example response structure:
  // {
  //   company: {
  //     name: "Acme Ltd",
  //     registrationNumber: "12345678",
  //     ...
  //   },
  //   enrichment: {
  //     sources: ["Companies House", "Website"],
  //     confidence: {
  //       name: "high",
  //       industry: "medium"
  //     }
  //   }
  // }

  const response: EnrichResponse = {
    company: {},
    enrichment: {
      sources: [],
      confidence: {},
    },
  };

  res.json(response);
});

export { router as enrichRouter };
