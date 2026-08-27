export function useRouter() {
  return {
    push(href) {
      globalThis.__squadToolbarPushes?.push(href);
    },
  };
}
