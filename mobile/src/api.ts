import Constants from 'expo-constants';

import type { EnrichResponse } from './types';

// Resolve API base URL.
// - If EXPO_PUBLIC_API_URL is set in .env, use it.
// - Otherwise, derive the dev host from Expo so this works in the iOS
//   Simulator, Android Emulator, and Expo Go on a physical device.
function resolveApiUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit;

  const hostUri =
    Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:3001`;
}

export const API_URL = resolveApiUrl();

export async function enrich(input: {
  email: string;
  website: string;
}): Promise<EnrichResponse> {
  const response = await fetch(`${API_URL}/enrich`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Enrichment failed (${response.status})`);
  }

  return response.json();
}
