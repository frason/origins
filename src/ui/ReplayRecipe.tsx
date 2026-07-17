import { useState } from 'react';
import { useStore } from '../state/store';
import {
  parseWorldRecipe,
  serializeWorldRecipe,
  type WorldRecipe,
} from './worldRecipe';
import { buildRecipePreview } from './recipePreview';

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
  const parsedImport = importText.trim() ? parseWorldRecipe(importText) : null;
  const preview = parsedImport?.recipe ? buildRecipePreview(parsedImport.recipe) : null;

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
          {parsedImport && !parsedImport.recipe && (
            <div role="alert" style={{ color: '#e7a16f', fontSize: '0.68rem', marginTop: '0.35rem' }}>
              {parsedImport.error}
            </div>
          )}
          {preview && (
            <div style={{ background: '#20272a', borderRadius: 6, padding: '0.55rem', marginTop: '0.45rem' }}>
              <strong style={{ color: '#b8d3dc', fontSize: '0.72rem' }}>
                Seed {preview.seed.toLocaleString()} · through tick {preview.throughTick.toLocaleString()}
              </strong>
              <div style={{ color: '#899398', fontSize: '0.66rem', marginTop: '0.2rem' }}>
                {preview.startingSettings.length > 0
                  ? `Starts with ${preview.startingSettings.join(' · ')}`
                  : 'Starts with shipped simulation settings'}
                {' · '}{preview.actionCount} {preview.actionCount === 1 ? 'action' : 'actions'}
              </div>
              {preview.actions.map((action, index) => (
                <div key={`${action.tick}-${index}`} style={{ borderTop: '1px solid #354044', paddingTop: '0.3rem', marginTop: '0.3rem', color: '#abb5b9', fontSize: '0.67rem' }}>
                  <span style={{ color: '#718087' }}>tick {action.tick}</span> — {action.text}
                </div>
              ))}
              {preview.remainingActions > 0 && (
                <div style={{ color: '#7f8a8f', fontSize: '0.65rem', marginTop: '0.3rem' }}>
                  +{preview.remainingActions} more timed actions
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            disabled={!preview}
            onClick={() => {
              if (!parsedImport?.recipe) return;
              const error = onReplay(parsedImport.recipe);
              setStatus(error ?? `Replay started for seed ${parsedImport.recipe.seed.toLocaleString()}`);
            }}
            style={{ marginTop: '0.4rem', border: '1px solid #557267', borderRadius: 5, padding: '0.35rem 0.6rem', background: preview ? '#2b443b' : '#2b3030', color: preview ? '#eee' : '#777', cursor: preview ? 'pointer' : 'not-allowed' }}
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
