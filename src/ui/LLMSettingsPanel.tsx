/**
 * LLM Settings Panel
 *
 * UI for configuring BYOK (Bring Your Own Key) settings:
 * - Provider selection (OpenAI, Anthropic, Custom)
 * - API key entry/clear
 * - Daily spend limit configuration
 * - Budget display
 *
 * Clear disclosure that requests go directly to the configured provider.
 */

import { useState, useEffect } from 'react';
import {
  getLLMProviderSettings,
  setLLMProviderSettings,
  clearLLMProviderSettings,
  createLLMProviderSettings,
  validateLLMProviderSettings,
  PROVIDER_DEFAULTS,
  type LLMProviderSettings,
  type LLMProvider,
} from '../services/llmProviderConfig';
import { getBudgetSummary } from '../services/spendTracker';

interface LLMSettingsPanelProps {
  onSettingsChange?: (settings: LLMProviderSettings | null) => void;
}

export default function LLMSettingsPanel({ onSettingsChange }: LLMSettingsPanelProps) {
  const [settings, setSettings] = useState<LLMProviderSettings | null>(null);
  const [provider, setProvider] = useState<LLMProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(PROVIDER_DEFAULTS.openai.baseUrl);
  const [modelName, setModelName] = useState(PROVIDER_DEFAULTS.openai.modelName);
  const [dailyLimit, setDailyLimit] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [budget, setBudget] = useState<ReturnType<typeof getBudgetSummary> | null>(null);

  // Load stored settings on mount
  useEffect(() => {
    const stored = getLLMProviderSettings();
    if (stored) {
      setSettings(stored);
      setProvider(stored.provider);
      setApiKey(stored.apiKey);
      setBaseUrl(stored.baseUrl);
      setModelName(stored.modelName);
      setDailyLimit(stored.dailySpendLimitUSD);
    }
  }, []);

  // Update budget summary periodically
  useEffect(() => {
    if (!settings) return;

    const updateBudget = () => {
      setBudget(getBudgetSummary(settings.dailySpendLimitUSD));
    };

    updateBudget();
    const timer = setInterval(updateBudget, 60000); // Update every minute

    return () => clearInterval(timer);
  }, [settings]);

  // Update base URL and model when provider changes
  const handleProviderChange = (newProvider: LLMProvider) => {
    setProvider(newProvider);
    const defaults = PROVIDER_DEFAULTS[newProvider];
    setBaseUrl(defaults.baseUrl);
    setModelName(defaults.modelName);
    setError(null);
  };

  // Save settings
  const handleSave = () => {
    setError(null);
    setSaved(false);

    const newSettings = createLLMProviderSettings(provider, apiKey, dailyLimit, {
      baseUrl,
      modelName,
    });

    const validationError = validateLLMProviderSettings(newSettings);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLLMProviderSettings(newSettings);
      setSettings(newSettings);
      setSaved(true);
      if (onSettingsChange) onSettingsChange(newSettings);

      // Clear success message after 2 seconds
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(`Failed to save settings: ${err}`);
    }
  };

  // Clear settings
  const handleClear = () => {
    if (!confirm('Clear all LLM settings? This cannot be undone.')) return;

    try {
      clearLLMProviderSettings();
      setSettings(null);
      setApiKey('');
      setError(null);
    } catch (err) {
      setError(`Failed to clear settings: ${err}`);
    }
  };

  // Raise limit
  const handleRaiseLimit = (newLimit: number) => {
    if (newLimit <= dailyLimit) {
      setError('New limit must be higher than current limit');
      return;
    }
    setDailyLimit(newLimit);
  };

  return (
    <div className="llm-settings-panel">
      <div className="llm-settings-section">
        <h3 className="llm-settings-title">LLM Provider Configuration</h3>

        <div className="llm-settings-disclosure">
          <p>
            <strong>⚠️ Important:</strong> Your API key will be sent directly from your browser to
            your configured LLM provider (OpenAI, Anthropic, or a custom endpoint). It is never
            sent to or stored on this game's servers.
          </p>
        </div>

        {error && <div className="llm-settings-error">{error}</div>}
        {saved && <div className="llm-settings-success">Settings saved successfully!</div>}

        <div className="llm-settings-form">
          {/* Provider Selection */}
          <div className="llm-settings-field">
            <label htmlFor="llm-provider">Provider:</label>
            <select
              id="llm-provider"
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
              className="llm-settings-select"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="custom">Custom Endpoint</option>
            </select>
          </div>

          {/* API Key Input */}
          <div className="llm-settings-field">
            <label htmlFor="llm-api-key">API Key:</label>
            <input
              id="llm-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError(null);
              }}
              placeholder="Your API key (never stored server-side)"
              className="llm-settings-input"
            />
            <small className="llm-settings-help">
              {provider === 'openai'
                ? 'Get your key from https://platform.openai.com/api-keys'
                : provider === 'anthropic'
                  ? 'Get your key from https://console.anthropic.com'
                  : 'Enter your local/custom endpoint API key (if required)'}
            </small>
          </div>

          {/* Base URL */}
          <div className="llm-settings-field">
            <label htmlFor="llm-base-url">Base URL:</label>
            <input
              id="llm-base-url"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="e.g., https://api.openai.com/v1"
              className="llm-settings-input"
            />
            {provider === 'custom' && (
              <small className="llm-settings-help">
                For local Ollama, use http://localhost:11434/v1; for LM Studio, check your
                server settings.
              </small>
            )}
          </div>

          {/* Model Name */}
          <div className="llm-settings-field">
            <label htmlFor="llm-model">Model Name:</label>
            <input
              id="llm-model"
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="e.g., gpt-4, claude-3-opus-20240229"
              className="llm-settings-input"
            />
          </div>

          {/* Daily Spend Limit */}
          <div className="llm-settings-field">
            <label htmlFor="llm-daily-limit">Daily Spend Limit ($):</label>
            <div className="llm-settings-limit-control">
              <input
                id="llm-daily-limit"
                type="number"
                min="0.01"
                step="0.01"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(parseFloat(e.target.value) || 0)}
                className="llm-settings-input"
              />
            </div>
            <small className="llm-settings-help">
              Set your own hard limit. When reached, Tier 2/3 responses become unavailable; Tier
              1 (free) remains always available.
            </small>
          </div>

          {/* Action Buttons */}
          <div className="llm-settings-actions">
            <button onClick={handleSave} className="llm-settings-button llm-settings-button--primary">
              Save Settings
            </button>
            {settings && (
              <button
                onClick={handleClear}
                className="llm-settings-button llm-settings-button--danger"
              >
                Clear Settings
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Budget Display */}
      {settings && budget && (
        <div className="llm-settings-section">
          <h3 className="llm-settings-title">Budget Status</h3>
          <div className="llm-settings-budget">
            <div className="llm-settings-budget-row">
              <span>Spent (24h window):</span>
              <strong>${budget.spent.toFixed(2)}</strong>
            </div>
            <div className="llm-settings-budget-row">
              <span>Daily Limit:</span>
              <strong>${budget.limit.toFixed(2)}</strong>
            </div>
            <div className="llm-settings-budget-row">
              <span>Remaining:</span>
              <strong className={budget.remaining < 1 ? 'text-danger' : ''}>
                ${budget.remaining.toFixed(2)}
              </strong>
            </div>
            <div className="llm-settings-budget-row">
              <span>Usage:</span>
              <strong>{budget.percentUsed}%</strong>
            </div>
            <div className="llm-settings-budget-row">
              <span>Window Resets In:</span>
              <strong>{budget.hoursUntilReset}h</strong>
            </div>

            {/* Raise Limit Option */}
            <div className="llm-settings-budget-actions">
              <button
                onClick={() => {
                  const newLimit = prompt(
                    `Current limit: $${budget.limit.toFixed(2)}\n\nEnter new limit (must be higher):`,
                    (budget.limit + 5).toFixed(2)
                  );
                  if (newLimit) {
                    const numLimit = parseFloat(newLimit);
                    if (!isNaN(numLimit) && numLimit > 0) {
                      handleRaiseLimit(numLimit);
                      // Auto-save the new limit
                      if (settings) {
                        const updated = { ...settings, dailySpendLimitUSD: numLimit };
                        setLLMProviderSettings(updated);
                        setSettings(updated);
                      }
                    }
                  }
                }}
                className="llm-settings-button llm-settings-button--secondary"
              >
                Raise Limit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Status */}
      <div className="llm-settings-section">
        <h3 className="llm-settings-title">Configuration Status</h3>
        {settings ? (
          <div className="llm-settings-status llm-settings-status--configured">
            <p>✓ LLM provider configured and ready</p>
            <ul className="llm-settings-details">
              <li>
                <strong>Provider:</strong> {settings.provider}
              </li>
              <li>
                <strong>Base URL:</strong> {settings.baseUrl}
              </li>
              <li>
                <strong>Model:</strong> {settings.modelName}
              </li>
              <li>
                <strong>Key:</strong> •••••{settings.apiKey.slice(-3)}
              </li>
            </ul>
          </div>
        ) : (
          <div className="llm-settings-status llm-settings-status--unconfigured">
            <p>⚠️ No LLM provider configured. Tier 2 & 3 responses will be unavailable.</p>
          </div>
        )}
      </div>
    </div>
  );
}
