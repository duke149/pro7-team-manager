export function createBrowserSupabaseClient() {
  if (!globalThis.__loginUsernameClient) throw new Error("Missing login client fixture");
  return globalThis.__loginUsernameClient;
}

declare global {
  var __loginUsernameClient: unknown;
}
