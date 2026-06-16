import type { CompanyField } from './types';

export type EditableCompanyField =
  | CompanyField
  | 'registeredAddress.line1'
  | 'registeredAddress.line2'
  | 'registeredAddress.city'
  | 'registeredAddress.region'
  | 'registeredAddress.postalCode'
  | 'registeredAddress.country';

export type ReviewFieldConfig = {
  key: EditableCompanyField;
  metadataKey: CompanyField;
  label: string;
  placeholder: string;
  keyboardType?: 'default' | 'numbers-and-punctuation';
  multiline?: boolean;
  required?: boolean;
  datePicker?: boolean;
};

export const REVIEW_FIELDS: ReviewFieldConfig[] = [
  {
    key: 'name',
    metadataKey: 'name',
    label: 'Company name',
    placeholder: 'Company name',
    multiline: true,
    required: true,
  },
  {
    key: 'registrationNumber',
    metadataKey: 'registrationNumber',
    label: 'Registration number',
    placeholder: 'Registration number',
    required: true,
  },
  {
    key: 'registeredAddress.line1',
    metadataKey: 'registeredAddress',
    label: 'Registered address line 1',
    placeholder: 'Address line 1',
    multiline: true,
    required: true,
  },
  {
    key: 'registeredAddress.line2',
    metadataKey: 'registeredAddress',
    label: 'Registered address line 2',
    placeholder: 'Address line 2',
    multiline: true,
  },
  {
    key: 'registeredAddress.city',
    metadataKey: 'registeredAddress',
    label: 'City',
    placeholder: 'City',
    required: true,
  },
  {
    key: 'registeredAddress.region',
    metadataKey: 'registeredAddress',
    label: 'Region',
    placeholder: 'Region',
  },
  {
    key: 'registeredAddress.postalCode',
    metadataKey: 'registeredAddress',
    label: 'Postal code',
    placeholder: 'Postal code',
    keyboardType: 'numbers-and-punctuation',
    required: true,
  },
  {
    key: 'registeredAddress.country',
    metadataKey: 'registeredAddress',
    label: 'Country',
    placeholder: 'Country',
    required: true,
  },
  {
    key: 'incorporationDate',
    metadataKey: 'incorporationDate',
    label: 'Incorporation date',
    placeholder: 'Select a date',
    datePicker: true,
    required: true,
  },
  {
    key: 'companyType',
    metadataKey: 'companyType',
    label: 'Company type',
    placeholder: 'Company type',
    required: true,
  },
  {
    key: 'industry',
    metadataKey: 'industry',
    label: 'Industry',
    placeholder: 'Industry',
    required: true,
  },
  {
    key: 'status',
    metadataKey: 'status',
    label: 'Status',
    placeholder: 'Status',
    required: true,
  },
];

export const REGISTERED_ADDRESS_FIELDS = REVIEW_FIELDS.filter(
  (field) => field.metadataKey === 'registeredAddress',
);
