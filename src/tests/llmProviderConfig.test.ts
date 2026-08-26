// @vitest-environment jsdom
/**
 * Tests for LLM Provider Configuration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getLLMProviderSettings,
  setLLMProviderSettings,
  clearLLMProviderSettings,
  validateLLMProviderSettings,
  createLLMProviderSettings,
  PROVIDER_DEFAULTS,
  type LLMProviderSettings,
} from '../services/llmProviderConfig';

describe('LLM Provider Config', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    // Clean up after each test
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  describe('getLLMProviderSettings', () => {
    it('returns null when no settings stored', () => {
      const settings = getLLMProviderSettings();
      expect(settings).toBeNull();
    });

    it('retrieves stored settings from localStorage', () => {
      const testSettings: LLMProviderSettings = {
        provider: 'openai',
        apiKey: 'test-key-123',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      setLLMProviderSettings(testSettings);
      const retrieved = getLLMProviderSettings();

      expect(retrieved).toEqual(testSettings);
    });

    it('handles corrupted JSON gracefully', () => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('origins_llm_provider_config', 'invalid json{]');
      }

      const settings = getLLMProviderSettings();
      expect(settings).toBeNull();
    });
  });

  describe('setLLMProviderSettings', () => {
    it('saves settings to localStorage', () => {
      const testSettings: LLMProviderSettings = {
        provider: 'anthropic',
        apiKey: 'sk-ant-test',
        baseUrl: 'https://api.anthropic.com/v1',
        modelName: 'claude-3-opus-20240229',
        dailySpendLimitUSD: 5,
      };

      setLLMProviderSettings(testSettings);
      const retrieved = getLLMProviderSettings();

      expect(retrieved).toEqual(testSettings);
    });

    it('overwrites previous settings', () => {
      const settings1: LLMProviderSettings = {
        provider: 'openai',
        apiKey: 'key1',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      const settings2: LLMProviderSettings = {
        provider: 'custom',
        apiKey: 'key2',
        baseUrl: 'http://localhost:8000/v1',
        modelName: 'local-model',
        dailySpendLimitUSD: 0,
      };

      setLLMProviderSettings(settings1);
      expect(getLLMProviderSettings()?.provider).toBe('openai');

      setLLMProviderSettings(settings2);
      expect(getLLMProviderSettings()?.provider).toBe('custom');
    });
  });

  describe('clearLLMProviderSettings', () => {
    it('removes settings from localStorage', () => {
      const testSettings: LLMProviderSettings = {
        provider: 'openai',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      setLLMProviderSettings(testSettings);
      expect(getLLMProviderSettings()).not.toBeNull();

      clearLLMProviderSettings();
      expect(getLLMProviderSettings()).toBeNull();
    });
  });

  describe('validateLLMProviderSettings', () => {
    it('accepts valid settings', () => {
      const settings: LLMProviderSettings = {
        provider: 'openai',
        apiKey: 'sk-test-123',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      const error = validateLLMProviderSettings(settings);
      expect(error).toBeNull();
    });

    it('rejects missing provider', () => {
      const settings: Partial<LLMProviderSettings> = {
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      const error = validateLLMProviderSettings(settings);
      expect(error).toBe('Provider is required');
    });

    it('rejects empty API key', () => {
      const settings: Partial<LLMProviderSettings> = {
        provider: 'openai',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      const error = validateLLMProviderSettings(settings);
      expect(error).toBe('API key is required');
    });

    it('rejects empty base URL', () => {
      const settings: Partial<LLMProviderSettings> = {
        provider: 'openai',
        apiKey: 'test-key',
        baseUrl: '',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      const error = validateLLMProviderSettings(settings);
      expect(error).toBe('Base URL is required');
    });

    it('rejects empty model name', () => {
      const settings: Partial<LLMProviderSettings> = {
        provider: 'openai',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
        modelName: '',
        dailySpendLimitUSD: 10,
      };

      const error = validateLLMProviderSettings(settings);
      expect(error).toBe('Model name is required');
    });

    it('rejects zero or negative spend limit', () => {
      const settings: Partial<LLMProviderSettings> = {
        provider: 'openai',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 0,
      };

      const error = validateLLMProviderSettings(settings);
      expect(error).toMatch('must be a positive number');

      const settings2: Partial<LLMProviderSettings> = {
        ...settings,
        dailySpendLimitUSD: -5,
      };

      const error2 = validateLLMProviderSettings(settings2);
      expect(error2).toMatch('must be a positive number');
    });

    it('rejects missing spend limit', () => {
      const settings: Partial<LLMProviderSettings> = {
        provider: 'openai',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
      };

      const error = validateLLMProviderSettings(settings);
      expect(error).toMatch('must be a positive number');
    });
  });

  describe('createLLMProviderSettings', () => {
    it('creates OpenAI settings with defaults', () => {
      const settings = createLLMProviderSettings('openai', 'sk-test', 10);

      expect(settings.provider).toBe('openai');
      expect(settings.apiKey).toBe('sk-test');
      expect(settings.baseUrl).toBe(PROVIDER_DEFAULTS.openai.baseUrl);
      expect(settings.modelName).toBe(PROVIDER_DEFAULTS.openai.modelName);
      expect(settings.dailySpendLimitUSD).toBe(10);
    });

    it('creates Anthropic settings with defaults', () => {
      const settings = createLLMProviderSettings('anthropic', 'sk-ant-test', 5);

      expect(settings.provider).toBe('anthropic');
      expect(settings.apiKey).toBe('sk-ant-test');
      expect(settings.baseUrl).toBe(PROVIDER_DEFAULTS.anthropic.baseUrl);
      expect(settings.modelName).toBe(PROVIDER_DEFAULTS.anthropic.modelName);
      expect(settings.dailySpendLimitUSD).toBe(5);
    });

    it('creates custom settings with provided overrides', () => {
      const settings = createLLMProviderSettings('custom', 'key', 0, {
        baseUrl: 'http://localhost:8000/v1',
        modelName: 'my-custom-model',
      });

      expect(settings.provider).toBe('custom');
      expect(settings.baseUrl).toBe('http://localhost:8000/v1');
      expect(settings.modelName).toBe('my-custom-model');
    });

    it('allows partial overrides on default providers', () => {
      const settings = createLLMProviderSettings('openai', 'key', 20, {
        modelName: 'gpt-4-turbo',
      });

      expect(settings.baseUrl).toBe(PROVIDER_DEFAULTS.openai.baseUrl);
      expect(settings.modelName).toBe('gpt-4-turbo');
    });
  });

  describe('PROVIDER_DEFAULTS', () => {
    it('defines defaults for all providers', () => {
      expect(PROVIDER_DEFAULTS.openai).toBeDefined();
      expect(PROVIDER_DEFAULTS.anthropic).toBeDefined();
      expect(PROVIDER_DEFAULTS.custom).toBeDefined();
    });

    it('OpenAI defaults are correct', () => {
      expect(PROVIDER_DEFAULTS.openai.baseUrl).toBe('https://api.openai.com/v1');
      expect(PROVIDER_DEFAULTS.openai.modelName).toContain('gpt');
    });

    it('Anthropic defaults are correct', () => {
      expect(PROVIDER_DEFAULTS.anthropic.baseUrl).toBe('https://api.anthropic.com/v1');
      expect(PROVIDER_DEFAULTS.anthropic.modelName).toContain('claude');
    });

    it('Custom defaults use localhost', () => {
      expect(PROVIDER_DEFAULTS.custom.baseUrl).toContain('localhost');
    });
  });
});
