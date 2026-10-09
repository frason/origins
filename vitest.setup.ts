import '@testing-library/jest-dom';
import NodeWorker from 'web-worker';

// Polyfill setImmediate for test environments where it might not be available
if (typeof globalThis !== 'undefined' && typeof globalThis.setImmediate === 'undefined') {
  if (typeof setTimeout !== 'undefined') {
    globalThis.setImmediate = (callback: () => void) => setTimeout(callback, 0) as any;
  }
}

// Polyfill Worker for jsdom/Node.js environments (enables testing with real worker mode)
// This allows EngineWorkerManager to use actual web-worker threads in tests
if (typeof globalThis !== 'undefined' && typeof globalThis.Worker === 'undefined') {
  globalThis.Worker = NodeWorker as any;
}

// Also polyfill window.Worker for jsdom environments
if (typeof window !== 'undefined' && !window.Worker) {
  (window as any).Worker = NodeWorker as any;
}

// Polyfill ResizeObserver for jsdom environments
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserverPolyfill {
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    private callback: ResizeObserverCallback;

    observe() {
      // No-op for tests
    }

    unobserve() {
      // No-op for tests
    }

    disconnect() {
      // No-op for tests
    }
  }

  window.ResizeObserver = ResizeObserverPolyfill as any;
}

// Polyfill localStorage for jsdom environments if not available
if (typeof window !== 'undefined' && !window.localStorage) {
  const store: Record<string, string> = {};

  window.localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const key in store) {
        delete store[key];
      }
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
    length: 0,
  } as unknown as Storage;

  // Update length property when store changes
  Object.defineProperty(window.localStorage, 'length', {
    get() {
      return Object.keys(store).length;
    },
  });
}
