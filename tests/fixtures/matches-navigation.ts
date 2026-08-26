export function useRouter() {
  return { refresh() { globalThis.__matchesRefreshes = (globalThis.__matchesRefreshes ?? 0) + 1; } };
}
