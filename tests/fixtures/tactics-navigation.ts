export function useRouter() {
  return { refresh() { globalThis.__tacticsRefreshes = (globalThis.__tacticsRefreshes ?? 0) + 1; } };
}
