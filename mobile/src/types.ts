export type CompanyData = {
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

export type Confidence = 'high' | 'medium' | 'low';

export type EnrichmentMetadata = {
  sources: string[];
  confidence: Record<string, Confidence>;
};

export type EnrichResponse = {
  company: CompanyData;
  enrichment: EnrichmentMetadata;
};
