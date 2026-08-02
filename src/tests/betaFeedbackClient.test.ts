import { describe, expect, it, vi } from 'vitest';
import {
  parseDiagnosticBundleForUpload,
  submitBetaFeedback,
  validateBetaFeedbackInput,
  type BetaFeedbackBackend,
  type BetaFeedbackInput,
} from '../services/betaFeedbackClient';

const validInput: BetaFeedbackInput = {
  category: 'bug',
  summary: 'World stops rendering after tick 500',
  detail: 'Canvas goes black, console shows no errors.',
  pageUrl: 'https://origins.example/app',
};

function fakeBundleText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: 'origins-diagnostic',
    version: 1,
    application: { name: 'Project Origins', version: '0.1.0' },
    world: { name: 'Juniperhaven', seed: 12345, tick: 236 },
    ...overrides,
  });
}

describe('validateBetaFeedbackInput', () => {
  it('accepts a well-formed payload', () => {
    expect(validateBetaFeedbackInput(validInput)).toEqual([]);
  });

  it('rejects a category outside the beta_feedback CHECK constraint', () => {
    const errors = validateBetaFeedbackInput({ ...validInput, category: 'spam' as never });
    expect(errors).toContainEqual({ field: 'category', message: expect.any(String) });
  });

  it('rejects an empty or over-length summary (1-160 chars)', () => {
    expect(validateBetaFeedbackInput({ ...validInput, summary: '' })).toContainEqual({
      field: 'summary',
      message: expect.any(String),
    });
    expect(validateBetaFeedbackInput({ ...validInput, summary: '   ' })).toContainEqual({
      field: 'summary',
      message: expect.any(String),
    });
    expect(
      validateBetaFeedbackInput({ ...validInput, summary: 'x'.repeat(161) }),
    ).toContainEqual({ field: 'summary', message: expect.any(String) });
    expect(validateBetaFeedbackInput({ ...validInput, summary: 'x'.repeat(160) })).toEqual([]);
  });

  it('rejects detail over 4000 chars', () => {
    expect(
      validateBetaFeedbackInput({ ...validInput, detail: 'x'.repeat(4001) }),
    ).toContainEqual({ field: 'detail', message: expect.any(String) });
    expect(validateBetaFeedbackInput({ ...validInput, detail: 'x'.repeat(4000) })).toEqual([]);
  });

  it('rejects a page URL over 500 chars', () => {
    expect(
      validateBetaFeedbackInput({ ...validInput, pageUrl: 'https://x/' + 'a'.repeat(500) }),
    ).toContainEqual({ field: 'pageUrl', message: expect.any(String) });
  });
});

describe('parseDiagnosticBundleForUpload', () => {
  it('extracts the columns beta_diagnostic_bundles requires from a valid bundle', () => {
    const row = parseDiagnosticBundleForUpload(fakeBundleText());
    expect(row).toEqual({
      schema_version: 1,
      app_version: '0.1.0',
      commit_sha: null,
      seed: 12345,
      tick: 236,
      bundle: expect.objectContaining({ kind: 'origins-diagnostic' }),
    });
  });

  it('rejects invalid JSON', () => {
    expect(() => parseDiagnosticBundleForUpload('not json')).toThrow(/not valid JSON/i);
  });

  it('rejects a file that is not an origins-diagnostic bundle', () => {
    expect(() => parseDiagnosticBundleForUpload(JSON.stringify({ kind: 'something-else' }))).toThrow(
      /not a Project Origins diagnostic bundle/i,
    );
  });

  it('rejects a bundle missing a valid version', () => {
    expect(() =>
      parseDiagnosticBundleForUpload(fakeBundleText({ version: 0 })),
    ).toThrow(/valid version/i);
    expect(() =>
      parseDiagnosticBundleForUpload(fakeBundleText({ version: 'one' })),
    ).toThrow(/valid version/i);
  });

  it('rejects a bundle missing a valid application version', () => {
    expect(() =>
      parseDiagnosticBundleForUpload(fakeBundleText({ application: { name: 'x' } })),
    ).toThrow(/application version/i);
  });

  it('rejects a bundle larger than the 8 MiB upload limit', () => {
    const oversized = fakeBundleText({ padding: 'x'.repeat(9 * 1024 * 1024) });
    expect(() => parseDiagnosticBundleForUpload(oversized)).toThrow(/8 MiB/i);
  });

  it('tolerates a bundle with no world seed/tick', () => {
    const row = parseDiagnosticBundleForUpload(fakeBundleText({ world: undefined }));
    expect(row.seed).toBeNull();
    expect(row.tick).toBeNull();
  });
});

function fakeBackend(overrides: Partial<BetaFeedbackBackend> = {}): BetaFeedbackBackend {
  return {
    ensureAnonymousUserId: vi.fn().mockResolvedValue('anon-user-1'),
    insertDiagnosticBundle: vi.fn().mockResolvedValue('diagnostic-1'),
    insertFeedback: vi.fn().mockResolvedValue('feedback-1'),
    ...overrides,
  };
}

describe('submitBetaFeedback', () => {
  it('never submits when validation fails, and never touches the backend', async () => {
    const backend = fakeBackend();
    const result = await submitBetaFeedback({ ...validInput, summary: '' }, backend);
    expect(result).toEqual({ status: 'invalid', errors: expect.any(Array) });
    expect(backend.ensureAnonymousUserId).not.toHaveBeenCalled();
  });

  it('reports unavailable, non-blocking, when no backend is configured', async () => {
    const result = await submitBetaFeedback(validInput, null);
    expect(result).toEqual({
      status: 'unavailable',
      reason: expect.stringContaining('not configured'),
    });
  });

  it('submits successfully with no diagnostic attachment', async () => {
    const backend = fakeBackend();
    const result = await submitBetaFeedback(validInput, backend);
    expect(result).toEqual({
      status: 'success',
      feedbackId: 'feedback-1',
      diagnosticId: null,
      diagnosticWarning: null,
    });
    expect(backend.insertDiagnosticBundle).not.toHaveBeenCalled();
    expect(backend.insertFeedback).toHaveBeenCalledWith({
      category: 'bug',
      summary: validInput.summary,
      detail: validInput.detail,
      page_url: validInput.pageUrl,
      diagnostic_id: null,
    });
  });

  it('establishes an anonymous session before inserting, and never sends an owner_id from the client', async () => {
    const calls: string[] = [];
    const backend = fakeBackend({
      ensureAnonymousUserId: vi.fn().mockImplementation(async () => {
        calls.push('auth');
        return 'anon-user-1';
      }),
      insertFeedback: vi.fn().mockImplementation(async (row) => {
        calls.push('feedback');
        expect(row).not.toHaveProperty('owner_id');
        return 'feedback-1';
      }),
    });
    await submitBetaFeedback(validInput, backend);
    expect(calls).toEqual(['auth', 'feedback']);
  });

  it('uploads and links a valid attached diagnostic bundle', async () => {
    const backend = fakeBackend();
    const result = await submitBetaFeedback(
      { ...validInput, diagnosticBundleText: fakeBundleText() },
      backend,
    );
    expect(result).toEqual({
      status: 'success',
      feedbackId: 'feedback-1',
      diagnosticId: 'diagnostic-1',
      diagnosticWarning: null,
    });
    expect(backend.insertDiagnosticBundle).toHaveBeenCalledWith(
      expect.objectContaining({ schema_version: 1, app_version: '0.1.0' }),
    );
    expect(backend.insertFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ diagnostic_id: 'diagnostic-1' }),
    );
  });

  it('does not send a client-chosen diagnostic id: it always comes from the insert result', async () => {
    const backend = fakeBackend({
      insertDiagnosticBundle: vi.fn().mockResolvedValue('server-assigned-id'),
    });
    const result = await submitBetaFeedback(
      { ...validInput, diagnosticBundleText: fakeBundleText() },
      backend,
    );
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.diagnosticId).toBe('server-assigned-id');
    }
  });

  it('still submits feedback, with a warning, when the diagnostic attachment is invalid', async () => {
    const backend = fakeBackend();
    const result = await submitBetaFeedback(
      { ...validInput, diagnosticBundleText: 'not json' },
      backend,
    );
    expect(result).toEqual({
      status: 'success',
      feedbackId: 'feedback-1',
      diagnosticId: null,
      diagnosticWarning: expect.stringContaining('not valid JSON'),
    });
    expect(backend.insertFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ diagnostic_id: null }),
    );
  });

  it('still submits feedback, with a warning, when the diagnostic upload itself fails', async () => {
    const backend = fakeBackend({
      insertDiagnosticBundle: vi.fn().mockRejectedValue(new Error('row too large')),
    });
    const result = await submitBetaFeedback(
      { ...validInput, diagnosticBundleText: fakeBundleText() },
      backend,
    );
    expect(result).toEqual({
      status: 'success',
      feedbackId: 'feedback-1',
      diagnosticId: null,
      diagnosticWarning: 'row too large',
    });
  });

  it('fails non-blocking when anonymous sign-in fails (e.g. Supabase outage)', async () => {
    const backend = fakeBackend({
      ensureAnonymousUserId: vi.fn().mockRejectedValue(new Error('network error')),
    });
    const result = await submitBetaFeedback(validInput, backend);
    expect(result).toEqual({ status: 'error', message: 'network error', retryable: true });
    expect(backend.insertFeedback).not.toHaveBeenCalled();
  });

  it('reports a retryable error when the feedback insert itself fails', async () => {
    const backend = fakeBackend({
      insertFeedback: vi.fn().mockRejectedValue(new Error('RLS denied insert')),
    });
    const result = await submitBetaFeedback(validInput, backend);
    expect(result).toEqual({ status: 'error', message: 'RLS denied insert', retryable: true });
  });

  it('never throws, even when the backend rejects with a non-Error value', async () => {
    const backend = fakeBackend({
      ensureAnonymousUserId: vi.fn().mockRejectedValue('boom'),
    });
    await expect(submitBetaFeedback(validInput, backend)).resolves.toMatchObject({
      status: 'error',
    });
  });
});
