import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  BETA_FEEDBACK_CATEGORIES,
  submitBetaFeedback,
  validateBetaFeedbackInput,
  type BetaFeedbackBackend,
  type BetaFeedbackCategory,
  type BetaFeedbackSubmission,
} from '../services/betaFeedbackClient';

interface BetaFeedbackPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Resolved once by the host app; `null` means Supabase is unconfigured for this build. */
  backend: BetaFeedbackBackend | null;
  /** Overridable for tests; defaults to `window.location.href`. */
  pageUrl?: string;
}

const CATEGORY_LABELS: Record<BetaFeedbackCategory, string> = {
  bug: 'Bug',
  confusion: 'Confusing',
  balance: 'Balance',
  accessibility: 'Accessibility',
  other: 'Other',
};

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
].join(',');

export function getFocusTrapTargetIndex(
  activeIndex: number,
  focusableCount: number,
  shiftKey: boolean,
): number | null {
  if (focusableCount === 0) return null;
  if (shiftKey && activeIndex === 0) return focusableCount - 1;
  if (!shiftKey && activeIndex === focusableCount - 1) return 0;
  return null;
}

function currentPageUrl(): string {
  return typeof window === 'undefined' ? '' : window.location.href;
}

export default function BetaFeedbackPanel({
  isOpen,
  onClose,
  backend,
  pageUrl,
}: BetaFeedbackPanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const [category, setCategory] = useState<BetaFeedbackCategory>('bug');
  const [summary, setSummary] = useState('');
  const [detail, setDetail] = useState('');
  const [diagnosticBundleText, setDiagnosticBundleText] = useState<string | null>(null);
  const [diagnosticFileName, setDiagnosticFileName] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BetaFeedbackSubmission | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      returnFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  const resetForm = () => {
    setCategory('bug');
    setSummary('');
    setDetail('');
    setDiagnosticBundleText(null);
    setDiagnosticFileName(null);
    setAttachError(null);
    setResult(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusable.length === 0) return;

    const targetIndex = getFocusTrapTargetIndex(
      focusable.indexOf(document.activeElement as HTMLElement),
      focusable.length,
      event.shiftKey,
    );
    if (targetIndex !== null) {
      event.preventDefault();
      focusable[targetIndex].focus();
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    setAttachError(null);
    const file = event.target.files?.[0];
    if (!file) {
      setDiagnosticBundleText(null);
      setDiagnosticFileName(null);
      return;
    }
    try {
      const text = await file.text();
      setDiagnosticBundleText(text);
      setDiagnosticFileName(file.name);
    } catch {
      setAttachError('Could not read that file.');
      setDiagnosticBundleText(null);
      setDiagnosticFileName(null);
    }
    event.target.value = '';
  };

  const clearAttachment = () => {
    setDiagnosticBundleText(null);
    setDiagnosticFileName(null);
    setAttachError(null);
  };

  const fieldErrors = validateBetaFeedbackInput({ category, summary, detail, pageUrl });
  const errorFor = (field: 'category' | 'summary' | 'detail' | 'pageUrl') =>
    fieldErrors.find((error) => error.field === field)?.message ?? null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const submission = await submitBetaFeedback(
      {
        category,
        summary,
        detail,
        pageUrl: pageUrl ?? currentPageUrl(),
        diagnosticBundleText,
      },
      backend,
    );
    setSubmitting(false);
    setResult(submission);
    if (submission.status === 'success') {
      setSummary('');
      setDetail('');
      setDiagnosticBundleText(null);
      setDiagnosticFileName(null);
    }
  };

  return (
    <>
      <div
        ref={dialogRef}
        aria-hidden="true"
        onClick={handleClose}
        className={`beta-feedback__backdrop${isOpen ? ' beta-feedback__backdrop--open' : ''}`}
      />
      <div
        id="beta-feedback-panel"
        aria-label="Send beta feedback"
        aria-hidden={!isOpen}
        aria-modal="true"
        role="dialog"
        onKeyDown={trapFocus}
        className={`beta-feedback__dialog sim-window${isOpen ? ' beta-feedback__dialog--open' : ''}`}
      >
        <header className="beta-feedback__header sim-window__title-bar">
          <strong className="sim-window__title">Send feedback</strong>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            className="sim-button sim-button--compact"
            aria-label="Close feedback form"
          >
            Close
          </button>
        </header>
        <div className="beta-feedback__content">
          {backend === null && (
            <p className="beta-feedback__notice" role="status">
              Beta cloud feedback is not configured for this build. Local play and diagnostic
              export still work normally.
            </p>
          )}

          {result?.status === 'success' && (
            <p className="beta-feedback__notice beta-feedback__notice--success" role="status">
              Thanks — feedback submitted.
              {result.diagnosticWarning
                ? ` The diagnostic bundle could not be attached: ${result.diagnosticWarning}`
                : result.diagnosticId
                  ? ' Diagnostic bundle attached.'
                  : ''}
            </p>
          )}

          {result?.status === 'error' && (
            <p className="beta-feedback__notice beta-feedback__notice--error" role="alert">
              {result.message}
              {result.retryable ? ' You can try again.' : ''}
            </p>
          )}

          {result?.status === 'unavailable' && (
            <p className="beta-feedback__notice" role="status">
              {result.reason}
            </p>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="control-panel__field">
              <label htmlFor="beta-feedback-category">Category</label>
              <select
                id="beta-feedback-category"
                className="control-panel__input"
                value={category}
                onChange={(event) => setCategory(event.target.value as BetaFeedbackCategory)}
                disabled={submitting}
              >
                {BETA_FEEDBACK_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-panel__field">
              <label htmlFor="beta-feedback-summary">Summary</label>
              <input
                id="beta-feedback-summary"
                className="control-panel__input"
                type="text"
                maxLength={160}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                disabled={submitting}
                aria-describedby={errorFor('summary') ? 'beta-feedback-summary-error' : undefined}
              />
              {errorFor('summary') && summary.length > 0 && (
                <span id="beta-feedback-summary-error" className="beta-feedback__field-error">
                  {errorFor('summary')}
                </span>
              )}
            </div>

            <div className="control-panel__field">
              <label htmlFor="beta-feedback-detail">Detail (optional)</label>
              <textarea
                id="beta-feedback-detail"
                className="control-panel__input beta-feedback__textarea"
                maxLength={4000}
                rows={4}
                value={detail}
                onChange={(event) => setDetail(event.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="control-panel__field">
              <span id="beta-feedback-attach-label">Attach a diagnostic bundle (optional)</span>
              {diagnosticFileName ? (
                <div className="beta-feedback__attachment">
                  <span>{diagnosticFileName}</span>
                  <button
                    type="button"
                    className="sim-button sim-button--compact"
                    onClick={clearAttachment}
                    disabled={submitting}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <input
                  aria-labelledby="beta-feedback-attach-label"
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFileChange}
                  disabled={submitting}
                />
              )}
              {attachError && <span className="beta-feedback__field-error">{attachError}</span>}
              <p className="beta-feedback__help">
                Use a previously exported diagnostic file. If it can&rsquo;t be attached, your
                feedback is still submitted.
              </p>
            </div>

            <div className="beta-feedback__actions">
              <button
                type="submit"
                className="sim-button"
                disabled={submitting || summary.trim().length === 0}
              >
                {submitting ? 'Submitting…' : 'Submit feedback'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
