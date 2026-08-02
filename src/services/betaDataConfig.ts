export const BETA_DATA_ENV_KEYS = {
  url: 'VITE_SUPABASE_URL',
  publishableKey: 'VITE_SUPABASE_PUBLISHABLE_KEY',
} as const;

export interface BetaDataConfig {
  url: string;
  publishableKey: string;
}

export type BetaDataEnvironment = Readonly<Record<string, string | undefined>>;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Reads the public browser configuration without creating a Supabase client.
 * Missing configuration intentionally leaves Origins in local-only mode.
 */
export function readBetaDataConfig(
  environment: BetaDataEnvironment,
): BetaDataConfig | null {
  const rawUrl = environment[BETA_DATA_ENV_KEYS.url]?.trim() ?? '';
  const publishableKey =
    environment[BETA_DATA_ENV_KEYS.publishableKey]?.trim() ?? '';

  if (!rawUrl && !publishableKey) {
    return null;
  }

  if (!rawUrl || !publishableKey) {
    throw new Error(
      'Beta data requires both the Supabase URL and publishable key.',
    );
  }

  if (!publishableKey.startsWith('sb_publishable_')) {
    throw new Error(
      'Beta data only accepts a Supabase publishable key in browser code.',
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error('The Supabase URL is invalid.');
  }

  const isLocal = LOCAL_HOSTS.has(parsedUrl.hostname);
  if (parsedUrl.protocol !== 'https:' && !isLocal) {
    throw new Error('The Supabase URL must use HTTPS outside local development.');
  }

  if (
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash ||
    (parsedUrl.pathname !== '/' && parsedUrl.pathname !== '')
  ) {
    throw new Error('The Supabase URL must be a clean project base URL.');
  }

  return {
    url: parsedUrl.origin,
    publishableKey,
  };
}

export function loadBetaDataConfig(): BetaDataConfig | null {
  return readBetaDataConfig(import.meta.env);
}
