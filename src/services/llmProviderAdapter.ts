/**
 * LLM Provider Adapter
 *
 * Sends requests directly from the browser to OpenAI-compatible
 * chat-completions endpoints (OpenAI, Anthropic via compatible gateway,
 * local Ollama/LM Studio, etc.).
 *
 * The API key is passed directly from the client to the provider;
 * it never passes through this game's backend infrastructure.
 */

import type { LLMProviderSettings } from './llmProviderConfig';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface LLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LLMCallError {
  code: string;
  message: string;
  statusCode?: number;
}

/**
 * Call an OpenAI-compatible LLM endpoint.
 *
 * The API key is sent directly in the Authorization header from the browser
 * to the configured provider — not through any game backend.
 *
 * @param settings Provider configuration (includes API key)
 * @param request Chat completion request
 * @param signal Optional AbortSignal for cancellation
 * @returns The LLM response or an error
 */
export async function callLLMProvider(
  settings: LLMProviderSettings,
  request: LLMRequest,
  signal?: AbortSignal
): Promise<LLMResponse | LLMCallError> {
  const url = `${settings.baseUrl}/chat/completions`;

  const body = {
    model: settings.modelName,
    ...request,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        // Couldn't parse as JSON, use raw text
      }

      return {
        code: 'api_error',
        message: errorData.error?.message || errorText || response.statusText,
        statusCode: response.status,
      };
    }

    const data = (await response.json()) as LLMResponse;
    return data;
  } catch (err: any) {
    // Network error or parsing error
    if (err.name === 'AbortError') {
      return {
        code: 'timeout',
        message: 'Request was cancelled or timed out',
      };
    }

    return {
      code: 'network_error',
      message: err?.message || 'Network error while contacting LLM provider',
    };
  }
}

/**
 * Estimate the cost of an LLM call based on token usage and provider.
 *
 * These are rough estimates for testing/development.
 * Actual costs depend on the specific model and provider pricing.
 */
export function estimateCallCost(
  provider: string,
  promptTokens: number,
  completionTokens: number
): number {
  // Rough per-token rates (USD) for testing:
  // These are oversimplifications; real pricing varies by model
  const rates: Record<string, { input: number; output: number }> = {
    openai: {
      input: 0.000005, // $0.005/1K tokens
      output: 0.000015, // $0.015/1K tokens
    },
    anthropic: {
      input: 0.000003,
      output: 0.000015,
    },
    custom: {
      input: 0.0,
      output: 0.0,
    },
  };

  const rate = rates[provider] || rates.custom;
  return promptTokens * rate.input + completionTokens * rate.output;
}

/**
 * Check if a response object looks like an LLM error.
 */
export function isLLMError(value: any): value is LLMCallError {
  return Boolean(value && typeof value === 'object' && 'code' in value && 'message' in value);
}

/**
 * Format an LLM error for user display.
 */
export function formatLLMError(error: LLMCallError): string {
  const messages: Record<string, string> = {
    api_error: 'The LLM provider returned an error',
    network_error: 'Network error contacting the LLM provider',
    timeout: 'Request timed out while waiting for the LLM provider',
  };

  const baseMsg = messages[error.code] || 'Unknown LLM error';
  return error.statusCode ? `${baseMsg} (${error.statusCode}): ${error.message}` : `${baseMsg}: ${error.message}`;
}
