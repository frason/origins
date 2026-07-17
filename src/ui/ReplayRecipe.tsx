import { useState } from 'react';
import { useStore } from '../state/store';
import {
  parseWorldRecipe,
  serializeWorldRecipe,
  type WorldRecipe,
} from './worldRecipe';

export default function ReplayRecipe({
  onReplay,
  replayStatus,
}: {
  onReplay?: (recipe: WorldRecipe) => string | null;
  replayStatus?: string | null;
}) {
  const world = useStore((state) => state.worldState);
  const [status, setStatus] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const text = serializeWorldRecipe(world);
  if (!text) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('World recipe copied');
    } catch {
      setStatus('Copy unavailable — select the recipe text below');
    }
  };

  return (
    <details style={{ border: '1px solid #3a4145', borderRadius: 7, padding: '0.55rem', marginBottom: '0.7rem' }}>
      <summary style={{ cursor: 'pointer', color: '#b8ccd4', fontWeight: 600 }}>
        Reproduce this world
      </summary>
      <p style={{ color: '#858d91', fontSize: '0.68rem', lineHeight: 1.4 }}>
        Seed, starting settings, and timed God Mode actions for this history.
      </p>
      <textarea
        readOnly
        aria-label="Reproducible world recipe"
        value={text}
        rows={8}
        onFocus={(event) => event.currentTarget.select()}
        style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', background: '#17191b', color: '#aeb7bb', border: '1px solid #444', borderRadius: 5, padding: '0.45rem', fontSize: '0.65rem' }}
      />
      <button
        type="button"
        onClick={copy}
        style={{ marginTop: '0.4rem', border: '1px solid #555', borderRadius: 5, padding: '0.35rem 0.6rem', background: '#30363a', color: '#eee', cursor: 'pointer' }}
      >
        Copy recipe
      </button>
      <span role="status" style={{ marginLeft: '0.5rem', color: '#79b98a', fontSize: '0.68rem' }}>
        {status}
      </span>
      {onReplay && (
        <div style={{ borderTop: '1px solid #343a3d', marginTop: '0.65rem', paddingTop: '0.65rem' }}>
          <label htmlFor="recipe-import" style={{ display: 'block', color: '#9ca6aa', fontSize: '0.68rem', marginBottom: '0.3rem' }}>
            Paste a world recipe to replay
          </label>
          <textarea
            id="recipe-import"
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setStatus(null);
            }}
            rows={4}
            style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', background: '#17191b', color: '#aeb7bb', border: '1px solid #444', borderRadius: 5, padding: '0.45rem', fontSize: '0.65rem' }}
          />
          <button
            type="button"
            onClick={() => {
              const parsed = parseWorldRecipe(importText);
              if (!parsed.recipe) {
                setStatus(parsed.error);
                return;
              }
              const error = onReplay(parsed.recipe);
              setStatus(error ?? `Replay started for seed ${parsed.recipe.seed.toLocaleString()}`);
            }}
            style={{ marginTop: '0.4rem', border: '1px solid #557267', borderRadius: 5, padding: '0.35rem 0.6rem', background: '#2b443b', color: '#eee', cursor: 'pointer' }}
          >
            Start replay
          </button>
        </div>
      )}
      {replayStatus && (
        <div role="status" style={{ color: replayStatus.includes('complete') ? '#79dc89' : '#9dc6d8', fontSize: '0.68rem', marginTop: '0.45rem' }}>
          {replayStatus}
        </div>
      )}
    </details>
  );
}
