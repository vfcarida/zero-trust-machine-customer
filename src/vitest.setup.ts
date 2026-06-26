import { vi } from 'vitest';

// Mock problematic CSS color package if it's causing issues in JSDOM
vi.mock('@asamuzakjp/css-color', () => ({
  default: () => ({}),
  parse: () => ({}),
}));

// Mock window.matchMedia for components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
