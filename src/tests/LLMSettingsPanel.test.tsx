// @vitest-environment jsdom
/**
 * Tests for LLM Settings Panel UI
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LLMSettingsPanel from '../ui/LLMSettingsPanel';
import {
  setLLMProviderSettings,
  clearLLMProviderSettings,
  type LLMProviderSettings,
} from '../services/llmProviderConfig';

describe('LLM Settings Panel', () => {
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

  describe('Provider Selection', () => {
    it('renders with OpenAI selected by default', () => {
      render(<LLMSettingsPanel />);
      const select = screen.getByLabelText(/Provider:/i) as HTMLSelectElement;
      expect(select.value).toBe('openai');
    });

    it('allows changing provider', async () => {
      const user = userEvent.setup();
      render(<LLMSettingsPanel />);

      const select = screen.getByLabelText(/Provider:/i) as HTMLSelectElement;
      await user.selectOptions(select, 'anthropic');

      expect(select.value).toBe('anthropic');
    });

    it('updates base URL when provider changes', async () => {
      const user = userEvent.setup();
      render(<LLMSettingsPanel />);

      const select = screen.getByLabelText(/Provider:/i) as HTMLSelectElement;
      const urlInput = screen.getByLabelText(/Base URL:/i) as HTMLInputElement;

      expect(urlInput.value).toContain('openai.com');

      await user.selectOptions(select, 'anthropic');
      expect(urlInput.value).toContain('anthropic.com');
    });

    it('updates model name when provider changes', async () => {
      const user = userEvent.setup();
      render(<LLMSettingsPanel />);

      const select = screen.getByLabelText(/Provider:/i) as HTMLSelectElement;
      const modelInput = screen.getByLabelText(/Model Name:/i) as HTMLInputElement;

      const originalModel = modelInput.value;

      await user.selectOptions(select, 'custom');
      const newModel = modelInput.value;

      expect(newModel).not.toBe(originalModel);
    });
  });

  describe('API Key Input', () => {
    it('renders password input for API key', () => {
      render(<LLMSettingsPanel />);
      const input = screen.getByLabelText(/API Key:/i) as HTMLInputElement;
      expect(input.type).toBe('password');
    });

    it('allows entering API key', async () => {
      const user = userEvent.setup();
      render(<LLMSettingsPanel />);

      const input = screen.getByLabelText(/API Key:/i) as HTMLInputElement;
      await user.type(input, 'sk-test-key-123');

      expect(input.value).toBe('sk-test-key-123');
    });
  });

  describe('Save and Clear', () => {
    it('shows save button', () => {
      render(<LLMSettingsPanel />);
      const button = screen.getByText(/Save Settings/i);
      expect(button).toBeInTheDocument();
    });

    it('does not show clear button when no settings stored', () => {
      render(<LLMSettingsPanel />);
      const clearButton = screen.queryByText(/Clear Settings/i);
      expect(clearButton).not.toBeInTheDocument();
    });

    it('shows clear button when settings are loaded', () => {
      const settings: LLMProviderSettings = {
        provider: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      setLLMProviderSettings(settings);
      render(<LLMSettingsPanel />);

      const clearButton = screen.queryByText(/Clear Settings/i);
      expect(clearButton).toBeInTheDocument();
    });

    it('validates API key on save', async () => {
      const user = userEvent.setup();
      render(<LLMSettingsPanel />);

      const saveButton = screen.getByText(/Save Settings/i);
      await user.click(saveButton);

      const error = await screen.findByText(/API key is required/i);
      expect(error).toBeInTheDocument();
    });

    it('saves valid settings', async () => {
      const user = userEvent.setup();
      const onSettingsChange = vi.fn();

      render(<LLMSettingsPanel onSettingsChange={onSettingsChange} />);

      const apiKeyInput = screen.getByLabelText(/API Key:/i);
      const limitInput = screen.getByLabelText(/Daily Spend Limit/i);
      const saveButton = screen.getByText(/Save Settings/i);

      await user.type(apiKeyInput, 'sk-test-123');
      await user.clear(limitInput);
      await user.type(limitInput, '5.50');

      await user.click(saveButton);

      await waitFor(() => {
        expect(onSettingsChange).toHaveBeenCalled();
      });

      const success = screen.getByText(/Settings saved successfully!/i);
      expect(success).toBeInTheDocument();
    });

    it('clears settings with confirmation', async () => {
      const user = userEvent.setup();

      const settings: LLMProviderSettings = {
        provider: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      setLLMProviderSettings(settings);
      render(<LLMSettingsPanel />);

      // Mock window.confirm to return true
      vi.spyOn(window, 'confirm').mockReturnValueOnce(true);

      const clearButton = screen.getByText(/Clear Settings/i);
      await user.click(clearButton);

      await waitFor(() => {
        const apiKeyInput = screen.getByLabelText(/API Key:/i) as HTMLInputElement;
        expect(apiKeyInput.value).toBe('');
      });
    });
  });

  describe('Budget Display', () => {
    it('shows budget section when settings are loaded', async () => {
      const settings: LLMProviderSettings = {
        provider: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      setLLMProviderSettings(settings);
      render(<LLMSettingsPanel />);

      const budgetTitle = await screen.findByText(/Budget Status/i);
      expect(budgetTitle).toBeInTheDocument();
    });

    it('displays budget information', async () => {
      const settings: LLMProviderSettings = {
        provider: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      setLLMProviderSettings(settings);
      render(<LLMSettingsPanel />);

      await waitFor(() => {
        expect(screen.getByText(/Spent \(24h window\):/i)).toBeInTheDocument();
        expect(screen.getByText(/Daily Limit:/i)).toBeInTheDocument();
        expect(screen.getByText(/Remaining:/i)).toBeInTheDocument();
      });
    });

    it('shows raise limit button', async () => {
      const settings: LLMProviderSettings = {
        provider: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      setLLMProviderSettings(settings);
      render(<LLMSettingsPanel />);

      const raiseButton = await screen.findByText(/Raise Limit/i);
      expect(raiseButton).toBeInTheDocument();
    });
  });

  describe('Configuration Status', () => {
    it('shows unconfigured status when no settings', () => {
      render(<LLMSettingsPanel />);
      expect(screen.getByText(/No LLM provider configured/i)).toBeInTheDocument();
    });

    it('shows configured status when settings saved', async () => {
      const settings: LLMProviderSettings = {
        provider: 'openai',
        apiKey: 'sk-test-key-123',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      setLLMProviderSettings(settings);
      render(<LLMSettingsPanel />);

      await waitFor(() => {
        expect(screen.getByText(/LLM provider configured and ready/i)).toBeInTheDocument();
      });
    });

    it('displays configuration details', async () => {
      const settings: LLMProviderSettings = {
        provider: 'openai',
        apiKey: 'sk-test-key-123',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      setLLMProviderSettings(settings);
      render(<LLMSettingsPanel />);

      await waitFor(() => {
        // Look for provider in the configuration status section (more specific than just /openai/i)
        expect(screen.getByText(/configured and ready/i)).toBeInTheDocument();
        // Look for model name, which is less ambiguous
        expect(screen.getByText(/gpt-4/i)).toBeInTheDocument();
      });
    });

    it('masks API key in configuration display', async () => {
      const settings: LLMProviderSettings = {
        provider: 'openai',
        apiKey: 'sk-1234567890-secret-key',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4',
        dailySpendLimitUSD: 10,
      };

      setLLMProviderSettings(settings);
      render(<LLMSettingsPanel />);

      await waitFor(() => {
        // Should show masked key: •••••key
        expect(screen.getByText(/•••••key/i)).toBeInTheDocument();
      });
    });
  });

  describe('Disclosure', () => {
    it('shows security disclosure', () => {
      render(<LLMSettingsPanel />);
      expect(screen.getByText(/directly from your browser/i)).toBeInTheDocument();
      expect(screen.getByText(/never sent to or stored on this game/i)).toBeInTheDocument();
    });

    it('shows provider-specific help text for OpenAI', async () => {
      const user = userEvent.setup();
      render(<LLMSettingsPanel />);

      const helpText = screen.getByText(/platform.openai.com/i);
      expect(helpText).toBeInTheDocument();
    });

    it('shows provider-specific help text for Anthropic', async () => {
      const user = userEvent.setup();
      render(<LLMSettingsPanel />);

      const select = screen.getByLabelText(/Provider:/i) as HTMLSelectElement;
      await user.selectOptions(select, 'anthropic');

      const helpText = screen.getByText(/console.anthropic.com/i);
      expect(helpText).toBeInTheDocument();
    });

    it('shows provider-specific help text for Custom', async () => {
      const user = userEvent.setup();
      render(<LLMSettingsPanel />);

      const select = screen.getByLabelText(/Provider:/i) as HTMLSelectElement;
      await user.selectOptions(select, 'custom');

      const helpText = screen.getByText(/Ollama/i);
      expect(helpText).toBeInTheDocument();
    });
  });

  describe('Spend Limit Handling', () => {
    it('defaults to reasonable limit', () => {
      render(<LLMSettingsPanel />);
      const input = screen.getByLabelText(/Daily Spend Limit/i) as HTMLInputElement;
      expect(parseFloat(input.value)).toBeGreaterThan(0);
    });

    it('rejects zero limit on save', async () => {
      const user = userEvent.setup();
      render(<LLMSettingsPanel />);

      const apiKeyInput = screen.getByLabelText(/API Key:/i);
      const limitInput = screen.getByLabelText(/Daily Spend Limit/i);
      const saveButton = screen.getByText(/Save Settings/i);

      await user.type(apiKeyInput, 'sk-test-123');
      await user.clear(limitInput);
      await user.type(limitInput, '0');

      await user.click(saveButton);

      const error = await screen.findByText(/must be a positive number/i);
      expect(error).toBeInTheDocument();
    });

    it('accepts decimal limits', async () => {
      const user = userEvent.setup();
      render(<LLMSettingsPanel />);

      const apiKeyInput = screen.getByLabelText(/API Key:/i);
      const limitInput = screen.getByLabelText(/Daily Spend Limit/i);
      const saveButton = screen.getByText(/Save Settings/i);

      await user.type(apiKeyInput, 'sk-test-123');
      await user.clear(limitInput);
      await user.type(limitInput, '0.50');

      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/Settings saved successfully!/i)).toBeInTheDocument();
      });
    });
  });
});
