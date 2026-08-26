// @vitest-environment jsdom
/**
 * Tests for LLM Provider Adapter
 *
 * Uses mocked fetch responses (no real API calls)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  callLLMProvider,
  estimateCallCost,
  isLLMError,
  formatLLMError,
  type LLMResponse,
  type LLMCallError,
} from '../services/llmProviderAdapter';
import type { LLMProviderSettings } from '../services/llmProviderConfig';

describe('LLM Provider Adapter', () => {
  let fetchMock: any;

  beforeEach(() => {
    // Mock fetch before each test
    fetchMock = vi.fn();
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).fetch = fetchMock;
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockSettings: LLMProviderSettings = {
    provider: 'openai',
    apiKey: 'sk-test-key-123',
    baseUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-4',
    dailySpendLimitUSD: 10,
  };

  const mockResponse: LLMResponse = {
    id: 'chatcmpl-test-123',
    object: 'chat.completion',
    created: 1234567890,
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'This is a test response.',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
  };

  describe('callLLMProvider', () => {
    it('makes a POST request to the correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await callLLMProvider(mockSettings, {
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('includes Authorization header with API key', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await callLLMProvider(mockSettings, {
        messages: [{ role: 'user', content: 'Test' }],
      });

      const call = fetchMock.mock.calls[0][1];
      expect(call.headers.Authorization).toBe('Bearer sk-test-key-123');
    });

    it('returns successful response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await callLLMProvider(mockSettings, {
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(result).toEqual(mockResponse);
    });

    it('uses provided model name in request', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await callLLMProvider(mockSettings, {
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.7,
      });

      const call = fetchMock.mock.calls[0][1];
      const body = JSON.parse(call.body);
      expect(body.model).toBe('gpt-4');
    });

    it('includes optional parameters in request', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await callLLMProvider(mockSettings, {
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.5,
        max_tokens: 100,
      });

      const call = fetchMock.mock.calls[0][1];
      const body = JSON.parse(call.body);
      expect(body.temperature).toBe(0.5);
      expect(body.max_tokens).toBe(100);
    });

    it('handles API error response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
      });

      const result = await callLLMProvider(mockSettings, {
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(isLLMError(result)).toBe(true);
      const error = result as LLMCallError;
      expect(error.code).toBe('api_error');
      expect(error.statusCode).toBe(401);
    });

    it('handles API error with plain text response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      });

      const result = await callLLMProvider(mockSettings, {
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(isLLMError(result)).toBe(true);
      const error = result as LLMCallError;
      expect(error.message).toContain('Server error');
    });

    it('handles network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await callLLMProvider(mockSettings, {
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(isLLMError(result)).toBe(true);
      const error = result as LLMCallError;
      expect(error.code).toBe('network_error');
    });

    it('handles AbortError (timeout/cancellation)', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      fetchMock.mockRejectedValueOnce(abortError);

      const result = await callLLMProvider(mockSettings, {
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(isLLMError(result)).toBe(true);
      const error = result as LLMCallError;
      expect(error.code).toBe('timeout');
    });

    it('passes abort signal to fetch', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const controller = new AbortController();
      await callLLMProvider(mockSettings, {
        messages: [{ role: 'user', content: 'Test' }],
      }, controller.signal);

      const call = fetchMock.mock.calls[0][1];
      expect(call.signal).toBe(controller.signal);
    });

    it('works with different providers (Anthropic)', async () => {
      const anthropicSettings: LLMProviderSettings = {
        provider: 'anthropic',
        apiKey: 'sk-ant-test',
        baseUrl: 'https://api.anthropic.com/v1',
        modelName: 'claude-3-opus-20240229',
        dailySpendLimitUSD: 5,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await callLLMProvider(anthropicSettings, {
        messages: [{ role: 'user', content: 'Test' }],
      });

      const call = fetchMock.mock.calls[0][0];
      expect(call).toContain('anthropic.com');
    });

    it('works with custom endpoint', async () => {
      const customSettings: LLMProviderSettings = {
        provider: 'custom',
        apiKey: 'local-key',
        baseUrl: 'http://localhost:8000/v1',
        modelName: 'local-model',
        dailySpendLimitUSD: 0,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await callLLMProvider(customSettings, {
        messages: [{ role: 'user', content: 'Test' }],
      });

      const call = fetchMock.mock.calls[0][0];
      expect(call).toContain('localhost:8000');
    });
  });

  describe('estimateCallCost', () => {
    it('estimates cost for OpenAI', () => {
      const cost = estimateCallCost('openai', 1000, 500);
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(0.02); // Rough estimate
    });

    it('estimates cost for Anthropic', () => {
      const cost = estimateCallCost('anthropic', 1000, 500);
      expect(cost).toBeGreaterThan(0);
    });

    it('returns 0 for custom provider', () => {
      const cost = estimateCallCost('custom', 1000, 500);
      expect(cost).toBe(0);
    });

    it('handles unknown provider', () => {
      const cost = estimateCallCost('unknown', 1000, 500);
      expect(cost).toBe(0); // Falls back to custom
    });

    it('scales with token count', () => {
      const cost1 = estimateCallCost('openai', 100, 100);
      const cost2 = estimateCallCost('openai', 1000, 1000);
      expect(cost2).toBeGreaterThan(cost1);
    });

    it('weights completion tokens higher than prompt tokens (for OpenAI)', () => {
      const promptHeavy = estimateCallCost('openai', 1000, 1);
      const completionHeavy = estimateCallCost('openai', 1, 1000);
      expect(completionHeavy).toBeGreaterThan(promptHeavy);
    });
  });

  describe('isLLMError', () => {
    it('returns true for error objects', () => {
      const error: LLMCallError = {
        code: 'api_error',
        message: 'Test error',
      };

      expect(isLLMError(error)).toBe(true);
    });

    it('returns true for errors with status code', () => {
      const error: LLMCallError = {
        code: 'network_error',
        message: 'Connection failed',
        statusCode: 500,
      };

      expect(isLLMError(error)).toBe(true);
    });

    it('returns false for valid response', () => {
      expect(isLLMError(mockResponse)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isLLMError(null)).toBe(false);
    });

    it('returns false for non-objects', () => {
      expect(isLLMError('error')).toBe(false);
      expect(isLLMError(123)).toBe(false);
    });
  });

  describe('formatLLMError', () => {
    it('formats API error', () => {
      const error: LLMCallError = {
        code: 'api_error',
        message: 'Rate limit exceeded',
        statusCode: 429,
      };

      const formatted = formatLLMError(error);
      expect(formatted).toContain('LLM provider returned an error');
      expect(formatted).toContain('429');
      expect(formatted).toContain('Rate limit exceeded');
    });

    it('formats network error', () => {
      const error: LLMCallError = {
        code: 'network_error',
        message: 'Connection timeout',
      };

      const formatted = formatLLMError(error);
      expect(formatted).toContain('Network error');
      expect(formatted).toContain('Connection timeout');
    });

    it('formats timeout error', () => {
      const error: LLMCallError = {
        code: 'timeout',
        message: 'Request exceeded 30s limit',
      };

      const formatted = formatLLMError(error);
      expect(formatted).toContain('timed out');
    });

    it('handles unknown error code', () => {
      const error = {
        code: 'unknown_error',
        message: 'Something went wrong',
      };

      const formatted = formatLLMError(error as LLMCallError);
      expect(formatted).toContain('Unknown LLM error');
    });

    it('omits status code when not present', () => {
      const error: LLMCallError = {
        code: 'network_error',
        message: 'Offline',
      };

      const formatted = formatLLMError(error);
      expect(formatted).not.toContain('undefined');
    });
  });

  describe('No real API calls in tests', () => {
    it('never makes actual HTTP requests', async () => {
      // This is a meta-test to ensure our mocking is working
      expect(fetchMock).not.toHaveBeenCalled();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await callLLMProvider(mockSettings, {
        messages: [{ role: 'user', content: 'Test' }],
      });

      // Mock was called, not real fetch
      expect(fetchMock).toHaveBeenCalled();
    });
  });
});
