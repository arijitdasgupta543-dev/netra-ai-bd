import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Radix Slider measures itself; jsdom has no ResizeObserver.
if (!("ResizeObserver" in window)) {
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, "ResizeObserver", { writable: true, value: RO });
  Object.defineProperty(globalThis, "ResizeObserver", { writable: true, value: RO });
}
