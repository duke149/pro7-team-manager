export function useRouter() {
  return { refresh() { globalThis.__overviewRefreshes = (globalThis.__overviewRefreshes ?? 0) + 1; } };
}
