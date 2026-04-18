if (typeof window === "undefined") {
  const storage = globalThis.localStorage as { getItem?: unknown } | undefined;

  if (storage && typeof storage.getItem !== "function") {
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  }
}
