import { describe, expect, it, vi } from 'vitest';
import { createDrawScheduler } from '../ui/drawScheduler';

describe('event-driven canvas draw scheduler', () => {
  it('coalesces multiple visual changes into the latest single paint', () => {
    const frames: FrameRequestCallback[] = [];
    const request = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const cancel = vi.fn();
    const first = vi.fn();
    const latest = vi.fn();
    const scheduler = createDrawScheduler(request, cancel);

    scheduler.schedule(first);
    scheduler.schedule(latest);
    expect(request).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();

    frames[0](0);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('stays idle after painting and schedules again only for a new change', () => {
    const frames: FrameRequestCallback[] = [];
    const scheduler = createDrawScheduler(
      (callback) => { frames.push(callback); return frames.length; },
      vi.fn()
    );
    const draw = vi.fn();

    scheduler.schedule(draw);
    frames[0](0);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(1);

    scheduler.schedule(draw);
    expect(frames).toHaveLength(2);
    frames[1](1);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('cancels a queued paint when disposed', () => {
    const cancel = vi.fn();
    const draw = vi.fn();
    const scheduler = createDrawScheduler(() => 42, cancel);
    scheduler.schedule(draw);
    scheduler.dispose();
    expect(cancel).toHaveBeenCalledWith(42);
    expect(draw).not.toHaveBeenCalled();
  });
});
