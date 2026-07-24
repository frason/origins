import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExtinctionActions, getReplayTicks } from '../ui/ExtinctionSummary';

describe('extinction summary replay points', () => {
  it('offers tick zero and retained checkpoints newest-first', () => {
    expect(getReplayTicks([0, 10, 20, 20, 30], 35)).toEqual([30, 20, 10, 0]);
  });

  it('does not offer the ended tick or future checkpoints', () => {
    expect(getReplayTicks([10, 20, 30, 40], 30)).toEqual([20, 10, 0]);
  });

  it('renders two end-state actions with an accessible split replay control', () => {
    const html = renderToStaticMarkup(
      <ExtinctionActions
        onNewWorld={() => undefined}
        onReplayWorld={() => undefined}
        onReplayFromTick={() => null}
        checkpointTicks={[0, 10, 20, 30]}
        endTick={35}
      />
    );

    expect(html).toContain('New world');
    expect(html).toContain('Replay current world');
    expect(html).toContain('aria-label="Choose a tick to replay from"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
  });
});
