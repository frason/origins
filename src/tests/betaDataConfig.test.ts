import { describe, expect, it } from 'vitest';
import {
  BETA_DATA_ENV_KEYS,
  readBetaDataConfig,
} from '../services/betaDataConfig';

const validEnvironment = {
  [BETA_DATA_ENV_KEYS.url]: 'https://origins-beta.supabase.co',
  [BETA_DATA_ENV_KEYS.publishableKey]: 'sb_publishable_example',
};

describe('beta data browser configuration', () => {
  it('keeps local-only mode when cloud configuration is absent', () => {
    expect(readBetaDataConfig({})).toBeNull();
  });

  it('accepts only a complete publishable browser configuration', () => {
    expect(readBetaDataConfig(validEnvironment)).toEqual({
      url: 'https://origins-beta.supabase.co',
      publishableKey: 'sb_publishable_example',
    });

    expect(
      readBetaDataConfig({
        ...validEnvironment,
        [BETA_DATA_ENV_KEYS.url]: '  https://origins-beta.supabase.co/  ',
      }),
    ).toEqual({
      url: 'https://origins-beta.supabase.co',
      publishableKey: 'sb_publishable_example',
    });
  });

  it('rejects partially configured environments', () => {
    expect(() =>
      readBetaDataConfig({
        [BETA_DATA_ENV_KEYS.url]: validEnvironment[BETA_DATA_ENV_KEYS.url],
      }),
    ).toThrow(/requires both/i);

    expect(() =>
      readBetaDataConfig({
        [BETA_DATA_ENV_KEYS.publishableKey]:
          validEnvironment[BETA_DATA_ENV_KEYS.publishableKey],
      }),
    ).toThrow(/requires both/i);
  });

  it.each([
    'sb_secret_example',
    'eyJhbGciOiJIUzI1NiJ9.legacy-jwt',
    'service_role_example',
  ])('rejects non-publishable key %s', (unsafeKey) => {
    expect(() =>
      readBetaDataConfig({
        ...validEnvironment,
        [BETA_DATA_ENV_KEYS.publishableKey]: unsafeKey,
      }),
    ).toThrow(/publishable key/i);
  });

  it('requires a clean HTTPS project URL outside local development', () => {
    for (const unsafeUrl of [
      'http://origins-beta.supabase.co',
      'https://user:password@origins-beta.supabase.co',
      'https://origins-beta.supabase.co/rest/v1',
      'https://origins-beta.supabase.co?token=unsafe',
    ]) {
      expect(() =>
        readBetaDataConfig({
          ...validEnvironment,
          [BETA_DATA_ENV_KEYS.url]: unsafeUrl,
        }),
      ).toThrow();
    }

    expect(
      readBetaDataConfig({
        ...validEnvironment,
        [BETA_DATA_ENV_KEYS.url]: 'http://localhost:54321',
      }),
    ).toEqual({
      url: 'http://localhost:54321',
      publishableKey: 'sb_publishable_example',
    });
  });
});
