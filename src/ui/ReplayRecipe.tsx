import { useState } from 'react';
import { useStore } from '../state/store';
import { serializeWorldRecipe } from './worldRecipe';

export default function ReplayRecipe() {
  const world = useStore((state) => state.worldState);
  const [status, setStatus] = useState<string | null>(null);
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
    </details>
  );
}
