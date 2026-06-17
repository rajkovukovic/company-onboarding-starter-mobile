import Storage from 'expo-sqlite/kv-store';

import type { CompanyData, EnrichResponse } from './types';

export type PersistedStep = 'input' | 'review' | 'confirm';

export type PersistedOnboardingState = {
  version: 1;
  step: PersistedStep;
  email: string;
  website: string;
  result: EnrichResponse | null;
  editedCompany: CompanyData;
  saved: boolean;
};

const ONBOARDING_STORAGE_KEY = 'company-onboarding:v1';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPersistedStep(value: unknown): value is PersistedStep {
  return value === 'input' || value === 'review' || value === 'confirm';
}

function parsePersistedState(value: unknown): PersistedOnboardingState | null {
  if (!isObject(value) || value.version !== 1 || !isPersistedStep(value.step)) {
    return null;
  }

  if (typeof value.email !== 'string' || typeof value.website !== 'string') {
    return null;
  }

  if (value.result !== null && !isObject(value.result)) {
    return null;
  }

  if (!isObject(value.editedCompany)) {
    return null;
  }

  if ((value.step === 'review' || value.step === 'confirm') && value.result === null) {
    return null;
  }

  return {
    version: 1,
    step: value.step,
    email: value.email,
    website: value.website,
    result: value.result as EnrichResponse | null,
    editedCompany: value.editedCompany as CompanyData,
    saved: value.saved === true,
  };
}

export async function loadPersistedOnboardingState() {
  const rawState = await Storage.getItem(ONBOARDING_STORAGE_KEY);
  if (!rawState) return null;

  try {
    return parsePersistedState(JSON.parse(rawState));
  } catch {
    return null;
  }
}

export async function savePersistedOnboardingState(
  state: PersistedOnboardingState,
) {
  await Storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
}

export async function clearPersistedOnboardingState() {
  await Storage.removeItem(ONBOARDING_STORAGE_KEY);
}
