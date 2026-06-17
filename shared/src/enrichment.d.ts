export type EnrichRequest = {
  email: string;
  website: string;
};

export type NormalizedEnrichInput = {
  email: string;
  website: string;
  domain: string;
};

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

export type EnrichmentSource = 'Companies House' | 'Company Website';

export type CompanyField = keyof CompanyData;

export type FieldEnrichment = {
  sources: EnrichmentSource[];
  confidence: Confidence;
  reason: string;
};

export type EnrichmentMetadata = {
  sources: EnrichmentSource[];
  fields: Partial<Record<CompanyField, FieldEnrichment>>;
  warnings?: string[];
};

export type EnrichResponse = {
  input: NormalizedEnrichInput;
  company: CompanyData;
  enrichment: EnrichmentMetadata;
};
