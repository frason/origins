import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadBetaDataConfig, type BetaDataConfig } from './betaDataConfig';

/**
 * Browser-side submission path for private-beta feedback (issue #153).
 *
 * Mirrors the `beta_feedback` / `beta_diagnostic_bundles` schema from the beta
 * data foundation migration exactly: required lengths, the diagnostic-bundle
 * size cap, and the category enum all match the database CHECK constraints so
 * a bad payload fails fast in the browser instead of round-tripping to Postgres.
 *
 * Ownership is never asserted by the client. `owner_id` defaults to
 * `auth.uid()` in Postgres and RLS enforces it; every insert below omits the
 * field entirely and relies on the anonymous session established immediately
 * before the insert.
 */

export const BETA_FEEDBACK_CATEGORIES = [
  'bug',
  'confusion',
  'balance',
  'accessibility',
  'other',
] as const;

export type BetaFeedbackCategory = (typeof BETA_FEEDBACK_CATEGORIES)[number];

const SUMMARY_MAX_LENGTH = 160;
const DETAIL_MAX_LENGTH = 4000;
const PAGE_URL_MAX_LENGTH = 500;
const DIAGNOSTIC_UPLOAD_LIMIT_BYTES = 8 * 1024 * 1024;

export interface BetaFeedbackInput {
  category: BetaFeedbackCategory;
  summary: string;
  detail?: string;
  pageUrl?: string;
  /** Raw text of a previously exported `.origins-diagnostic.json` file, if the tester chose to attach one. */
  diagnosticBundleText?: string | null;
}

export interface BetaFeedbackValidationError {
  field: 'category' | 'summary' | 'detail' | 'pageUrl';
  message: string;
}

/** Pure payload validation, matching the `beta_feedback` table's CHECK constraints. */
export function validateBetaFeedbackInput(
  input: BetaFeedbackInput,
): BetaFeedbackValidationError[] {
  const errors: BetaFeedbackValidationError[] = [];

  if (!BETA_FEEDBACK_CATEGORIES.includes(input.category)) {
    errors.push({ field: 'category', message: 'Choose a feedback category.' });
  }

  const summary = input.summary?.trim() ?? '';
  if (summary.length < 1 || summary.length > SUMMARY_MAX_LENGTH) {
    errors.push({
      field: 'summary',
      message: `Summary must be 1-${SUMMARY_MAX_LENGTH} characters.`,
    });
  }

  const detail = input.detail ?? '';
  if (detail.length > DETAIL_MAX_LENGTH) {
    errors.push({
      field: 'detail',
      message: `Detail must be ${DETAIL_MAX_LENGTH} characters or fewer.`,
    });
  }

  const pageUrl = input.pageUrl ?? '';
  if (pageUrl.length > PAGE_URL_MAX_LENGTH) {
    errors.push({
      field: 'pageUrl',
      message: `Page URL must be ${PAGE_URL_MAX_LENGTH} characters or fewer.`,
    });
  }

  return errors;
}

export interface DiagnosticBundleUploadRow {
  schema_version: number;
  app_version: string;
  commit_sha: string | null;
  seed: number | null;
  tick: number | null;
  bundle: unknown;
}

/**
 * Parses and validates a previously exported diagnostic bundle file (see
 * `src/simulation/diagnosticBundle.ts`) into the shape `beta_diagnostic_bundles`
 * expects. Deliberately duck-types the `kind`/`version`/`application.version`
 * fields rather than importing the diagnostic-export module, so this path has
 * no build dependency on that (separate, unmerged) feature.
 */
export function parseDiagnosticBundleForUpload(text: string): DiagnosticBundleUploadRow {
  const byteSize = new TextEncoder().encode(text).byteLength;
  if (byteSize > DIAGNOSTIC_UPLOAD_LIMIT_BYTES) {
    throw new Error('Diagnostic bundle exceeds the 8 MiB upload limit.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Diagnostic bundle file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Diagnostic bundle file must contain a JSON object.');
  }

  const record = parsed as Record<string, unknown>;
  if (record.kind !== 'origins-diagnostic') {
    throw new Error('This file is not a Project Origins diagnostic bundle.');
  }

  const version = record.version;
  if (typeof version !== 'number' || !Number.isFinite(version) || version <= 0) {
    throw new Error('Diagnostic bundle is missing a valid version.');
  }

  const application = record.application as Record<string, unknown> | undefined;
  const appVersion = application?.version;
  if (typeof appVersion !== 'string' || appVersion.trim().length === 0 || appVersion.length > 80) {
    throw new Error('Diagnostic bundle is missing a valid application version.');
  }

  const world = record.world as Record<string, unknown> | undefined;
  const seed = typeof world?.seed === 'number' ? world.seed : null;
  const tick = typeof world?.tick === 'number' ? world.tick : null;

  return {
    schema_version: version,
    app_version: appVersion.trim(),
    commit_sha: null,
    seed,
    tick,
    bundle: parsed,
  };
}

export interface BetaFeedbackInsertRow {
  category: BetaFeedbackCategory;
  summary: string;
  detail: string;
  page_url: string | null;
  diagnostic_id: string | null;
}

/**
 * Everything the submission flow needs from Supabase, isolated behind an
 * interface so the orchestration in {@link submitBetaFeedback} is testable
 * without a network call or the real `@supabase/supabase-js` client.
 */
export interface BetaFeedbackBackend {
  /** Reuses an existing anonymous session or creates one, returning the user id. */
  ensureAnonymousUserId(): Promise<string>;
  insertDiagnosticBundle(row: DiagnosticBundleUploadRow): Promise<string>;
  insertFeedback(row: BetaFeedbackInsertRow): Promise<string>;
}

export type BetaFeedbackSubmission =
  | { status: 'unavailable'; reason: string }
  | { status: 'invalid'; errors: BetaFeedbackValidationError[] }
  | { status: 'error'; message: string; retryable: boolean }
  | {
      status: 'success';
      feedbackId: string;
      diagnosticId: string | null;
      diagnosticWarning: string | null;
    };

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Orchestrates a single feedback submission. Never throws: every failure mode
 * (missing config, offline Supabase, bad auth, bad diagnostic attachment, bad
 * feedback insert) resolves to a typed result so callers can render a
 * non-blocking status instead of crashing the surrounding UI.
 *
 * A diagnostic attachment failure does not fail the submission — feedback is
 * still recorded, with a warning describing what could not be attached.
 */
export async function submitBetaFeedback(
  input: BetaFeedbackInput,
  backend: BetaFeedbackBackend | null,
): Promise<BetaFeedbackSubmission> {
  const errors = validateBetaFeedbackInput(input);
  if (errors.length > 0) {
    return { status: 'invalid', errors };
  }

  if (!backend) {
    return {
      status: 'unavailable',
      reason: 'Beta cloud feedback is not configured for this build.',
    };
  }

  try {
    await backend.ensureAnonymousUserId();
  } catch (error) {
    return {
      status: 'error',
      message: describeError(error, 'Could not start an anonymous session.'),
      retryable: true,
    };
  }

  let diagnosticId: string | null = null;
  let diagnosticWarning: string | null = null;
  if (input.diagnosticBundleText) {
    try {
      const row = parseDiagnosticBundleForUpload(input.diagnosticBundleText);
      diagnosticId = await backend.insertDiagnosticBundle(row);
    } catch (error) {
      diagnosticWarning = describeError(error, 'Could not attach the diagnostic bundle.');
    }
  }

  try {
    const feedbackId = await backend.insertFeedback({
      category: input.category,
      summary: input.summary.trim(),
      detail: (input.detail ?? '').trim(),
      page_url: input.pageUrl?.trim() || null,
      diagnostic_id: diagnosticId,
    });
    return { status: 'success', feedbackId, diagnosticId, diagnosticWarning };
  } catch (error) {
    return {
      status: 'error',
      message: describeError(error, 'Could not submit feedback.'),
      retryable: true,
    };
  }
}

let cachedClient: { url: string; client: SupabaseClient } | null = null;

function getSupabaseClient(config: BetaDataConfig): SupabaseClient {
  if (cachedClient && cachedClient.url === config.url) {
    return cachedClient.client;
  }
  const client = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  cachedClient = { url: config.url, client };
  return client;
}

/** Real Supabase-backed implementation of {@link BetaFeedbackBackend}. */
export function createSupabaseBetaFeedbackBackend(config: BetaDataConfig): BetaFeedbackBackend {
  const client = getSupabaseClient(config);

  return {
    async ensureAnonymousUserId() {
      const { data: existing } = await client.auth.getSession();
      if (existing.session?.user?.id) {
        return existing.session.user.id;
      }
      const { data, error } = await client.auth.signInAnonymously();
      if (error || !data.session?.user?.id) {
        throw new Error(error?.message || 'Anonymous sign-in failed.');
      }
      return data.session.user.id;
    },

    async insertDiagnosticBundle(row) {
      const { data, error } = await client
        .from('beta_diagnostic_bundles')
        .insert(row)
        .select('id')
        .single();
      if (error || !data) {
        throw new Error(error?.message || 'Could not store the diagnostic bundle.');
      }
      return data.id as string;
    },

    async insertFeedback(row) {
      const { data, error } = await client
        .from('beta_feedback')
        .insert(row)
        .select('id')
        .single();
      if (error || !data) {
        throw new Error(error?.message || 'Could not submit feedback.');
      }
      return data.id as string;
    },
  };
}

/**
 * Resolves the feedback backend for this build, or `null` when Supabase is
 * unconfigured or misconfigured. Never throws: an invalid configuration must
 * not block local play, so this degrades to local-only mode instead.
 */
export function loadBetaFeedbackBackend(): BetaFeedbackBackend | null {
  try {
    const config = loadBetaDataConfig();
    if (!config) return null;
    return createSupabaseBetaFeedbackBackend(config);
  } catch {
    return null;
  }
}
