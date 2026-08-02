import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BetaFeedbackPanel, { getFocusTrapTargetIndex } from '../ui/BetaFeedbackPanel';
import type { BetaFeedbackBackend } from '../services/betaFeedbackClient';

const noopBackend: BetaFeedbackBackend = {
  ensureAnonymousUserId: async () => 'anon-user-1',
  insertDiagnosticBundle: async () => 'diagnostic-1',
  insertFeedback: async () => 'feedback-1',
};

describe('BetaFeedbackPanel accessibility structure', () => {
  it('wraps keyboard focus only at the dialog boundaries', () => {
    expect(getFocusTrapTargetIndex(0, 4, true)).toBe(3);
    expect(getFocusTrapTargetIndex(3, 4, false)).toBe(0);
    expect(getFocusTrapTargetIndex(1, 4, false)).toBeNull();
    expect(getFocusTrapTargetIndex(-1, 4, false)).toBeNull();
  });

  it('exposes modal semantics and external BEM styling without inline CSS', () => {
    const html = renderToStaticMarkup(
      <BetaFeedbackPanel isOpen onClose={() => undefined} backend={noopBackend} />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Send beta feedback"');
    expect(html).toContain('beta-feedback__dialog sim-window beta-feedback__dialog--open');
    expect(html).not.toContain('style=');
  });

  it('lists every beta_feedback category as a select option', () => {
    const html = renderToStaticMarkup(
      <BetaFeedbackPanel isOpen onClose={() => undefined} backend={noopBackend} />,
    );

    expect(html).toContain('<option value="bug" selected="">Bug</option>');
    expect(html).toContain('<option value="confusion">Confusing</option>');
    expect(html).toContain('<option value="balance">Balance</option>');
    expect(html).toContain('<option value="accessibility">Accessibility</option>');
    expect(html).toContain('<option value="other">Other</option>');
  });

  it('surfaces a non-blocking notice when Supabase is unconfigured, instead of hiding the form', () => {
    const html = renderToStaticMarkup(
      <BetaFeedbackPanel isOpen onClose={() => undefined} backend={null} />,
    );

    expect(html).toContain('not configured for this build');
    expect(html).toContain('Local play and diagnostic');
    // The form itself still renders so a tester can see what feedback would look like / this is not a dead end.
    expect(html).toContain('id="beta-feedback-summary"');
    expect(html).toContain('Submit feedback');
  });

  it('stays out of the accessibility tree and off-canvas while closed', () => {
    const html = renderToStaticMarkup(
      <BetaFeedbackPanel isOpen={false} onClose={() => undefined} backend={noopBackend} />,
    );

    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('beta-feedback__dialog--open');
  });
});
