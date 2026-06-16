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
const ENRICH_TIMEOUT_MS = 10000;

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Fall back to a stable message below when the server does not return JSON.
  }

  return 'We could not enrich those company details. Please try again.';
}

export async function enrich(input: {
  email: string;
  website: string;
}): Promise<EnrichResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENRICH_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    try {
      return (await response.json()) as EnrichResponse;
    } catch {
      throw new Error('The server returned an unexpected response. Please try again.');
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The enrichment request timed out. Please try again.');
    }

    if (error instanceof TypeError) {
      throw new Error('Could not reach the backend. Check your connection and API URL.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
