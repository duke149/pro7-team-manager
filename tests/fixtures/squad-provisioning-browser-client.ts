export function createBrowserSupabaseClient() {
  if (!globalThis.__provisioningClient) throw new Error("Missing provisioning client fixture");
  return globalThis.__provisioningClient;
}

declare global {
  var __provisioningClient: unknown;
}
