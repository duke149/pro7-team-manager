export function useRouter() {
  return {
    refresh() {
      globalThis.__playerDetailRefresh?.();
    },
  };
}
