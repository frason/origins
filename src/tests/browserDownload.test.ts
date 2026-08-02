import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadJsonFile } from '../ui/browserDownload';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser JSON downloads', () => {
  it('clicks a named download and revokes its object URL after dispatch', () => {
    const link = {
      href: '',
      download: '',
      hidden: false,
      click: vi.fn(),
      remove: vi.fn(),
    };
    const appendChild = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:origins-diagnostic');
    const revokeObjectURL = vi.fn();

    vi.stubGlobal('document', {
      createElement: vi.fn(() => link),
      body: { appendChild },
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('window', {
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
    });

    downloadJsonFile('world.origins-diagnostic.json', '{"version":1}');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(link.download).toBe('world.origins-diagnostic.json');
    expect(link.href).toBe('blob:origins-diagnostic');
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:origins-diagnostic');
  });

  it('fails recoverably when downloads are unavailable', () => {
    vi.stubGlobal('document', undefined);

    expect(() => downloadJsonFile('world.json', '{}')).toThrow(
      'File downloads are unavailable',
    );
  });
});
