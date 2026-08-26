/**
 * BYOK (Bring Your Own Key) Provider Configuration
 *
 * Manages local-only storage of LLM provider settings:
 * - Provider type (OpenAI, Anthropic, Custom)
 * - API key (stored in localStorage/sessionStorage only, never sent to server)
 * - Base URL
 * - Model name
 * - Daily spend limit
 *
 * The API key is explicitly stored locally and never sent anywhere except
 * directly to the configured LLM provider.
 */

export type LLMProvider = 'openai' | 'anthropic' | 'custom';

export interface LLMProviderSettings {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  dailySpendLimitUSD: number; // Player-set limit in dollars
}

export const PROVIDER_DEFAULTS: Record<LLMProvider, { baseUrl: string; modelName: string }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-4',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    modelName: 'claude-3-opus-20240229',
  },
  custom: {
    baseUrl: 'http://localhost:8000/v1',
    modelName: 'local-model',
  },
};

const STORAGE_KEY = 'origins_llm_provider_config';

/**
 * Retrieve BYOK settings from browser localStorage.
 * Returns null if not configured.
 */
export function getLLMProviderSettings(): LLMProviderSettings | null {
  if (typeof window === 'undefined') return null;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as LLMProviderSettings;
  } catch {
    console.error('[LLM Config] Failed to parse stored provider settings');
    return null;
  }
}

/**
 * Save BYOK settings to browser localStorage.
 *
 * WARNING: API key is stored unencrypted in localStorage.
 * This is a client-side-only storage mechanism appropriate for testing/development.
 */
export function setLLMProviderSettings(settings: LLMProviderSettings): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('[LLM Config] Failed to save provider settings', err);
    throw err;
  }
}

/**
 * Clear stored BYOK settings from localStorage.
 */
export function clearLLMProviderSettings(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Validate that a provider configuration is well-formed.
 */
export function validateLLMProviderSettings(settings: Partial<LLMProviderSettings>): string | null {
  if (!settings.provider) return 'Provider is required';
  if (!settings.apiKey || settings.apiKey.trim().length === 0) return 'API key is required';
  if (!settings.baseUrl || settings.baseUrl.trim().length === 0) return 'Base URL is required';
  if (!settings.modelName || settings.modelName.trim().length === 0) return 'Model name is required';
  if (typeof settings.dailySpendLimitUSD !== 'number' || settings.dailySpendLimitUSD <= 0) {
    return 'Daily spend limit must be a positive number';
  }
  return null;
}

/**
 * Create a new LLMProviderSettings with defaults for the given provider type.
 */
export function createLLMProviderSettings(
  provider: LLMProvider,
  apiKey: string,
  dailySpendLimitUSD: number,
  overrides?: Partial<LLMProviderSettings>
): LLMProviderSettings {
  const defaults = PROVIDER_DEFAULTS[provider];
  return {
    provider,
    apiKey,
    baseUrl: overrides?.baseUrl ?? defaults.baseUrl,
    modelName: overrides?.modelName ?? defaults.modelName,
    dailySpendLimitUSD,
  };
}
