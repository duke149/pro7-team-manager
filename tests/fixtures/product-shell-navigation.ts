export function usePathname(): string {
  return globalThis.__productShellPathname;
}

export function useRouter() {
  return { refresh() {} };
}
