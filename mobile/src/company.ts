import type { CompanyData, FieldEnrichment } from './types';
import type { EditableCompanyField } from './reviewFields';

export function getCompanyFieldValue(
  company: CompanyData,
  key: EditableCompanyField,
): string {
  switch (key) {
    case 'registeredAddress.line1':
      return company.registeredAddress?.line1 ?? '';
    case 'registeredAddress.line2':
      return company.registeredAddress?.line2 ?? '';
    case 'registeredAddress.city':
      return company.registeredAddress?.city ?? '';
    case 'registeredAddress.region':
      return company.registeredAddress?.region ?? '';
    case 'registeredAddress.postalCode':
      return company.registeredAddress?.postalCode ?? '';
    case 'registeredAddress.country':
      return company.registeredAddress?.country ?? '';
    case 'registeredAddress':
      return '';
    default:
      return company[key] ?? '';
  }
}

export function updateCompanyField(
  company: CompanyData,
  key: EditableCompanyField,
  value: string,
): CompanyData {
  switch (key) {
    case 'registeredAddress.line1':
      return {
        ...company,
        registeredAddress: { ...company.registeredAddress, line1: value },
      };
    case 'registeredAddress.line2':
      return {
        ...company,
        registeredAddress: { ...company.registeredAddress, line2: value },
      };
    case 'registeredAddress.city':
      return {
        ...company,
        registeredAddress: { ...company.registeredAddress, city: value },
      };
    case 'registeredAddress.region':
      return {
        ...company,
        registeredAddress: { ...company.registeredAddress, region: value },
      };
    case 'registeredAddress.postalCode':
      return {
        ...company,
        registeredAddress: { ...company.registeredAddress, postalCode: value },
      };
    case 'registeredAddress.country':
      return {
        ...company,
        registeredAddress: { ...company.registeredAddress, country: value },
      };
    case 'registeredAddress':
      return company;
    default:
      return { ...company, [key]: value };
  }
}

export function formatSources(metadata?: FieldEnrichment): string {
  return metadata?.sources.length
    ? metadata.sources.join(', ')
    : 'No source returned';
}

export function formatConfidence(metadata?: FieldEnrichment): string {
  return metadata ? metadata.confidence : 'unknown';
}
