export type FrameRequest = (callback: FrameRequestCallback) => number;
export type FrameCancel = (handle: number) => void;

export interface DrawScheduler {
  schedule: (draw: () => void) => void;
  dispose: () => void;
}

/** Coalesce visual changes into one deferred paint and remain idle between changes. */
export function createDrawScheduler(
  requestFrame: FrameRequest,
  cancelFrame: FrameCancel
): DrawScheduler {
  let frame: number | null = null;
  let pendingDraw: (() => void) | null = null;

  return {
    schedule(draw) {
      pendingDraw = draw;
      if (frame !== null) return;
      frame = requestFrame(() => {
        frame = null;
        const latestDraw = pendingDraw;
        pendingDraw = null;
        latestDraw?.();
      });
    },
    dispose() {
      if (frame !== null) cancelFrame(frame);
      frame = null;
      pendingDraw = null;
    },
  };
}
