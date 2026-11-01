// E2E builds (EXPO_PUBLIC_E2E=1) are release builds wired to the local
// Supabase stack. They must never reach a remote backend.
export const IS_E2E = process.env.EXPO_PUBLIC_E2E === "1";

// The e2e runner forwards the device's ports to the host with `adb reverse`,
// so a loopback address is the only valid backend for an e2e build
const E2E_ALLOWED_HOSTS = ["127.0.0.1", "localhost", "10.0.2.2"];

export function assertE2EBackend(url: string) {
  const host = url.match(/^https?:\/\/([^/:]+)/)?.[1];
  if (!host || !E2E_ALLOWED_HOSTS.includes(host)) {
    throw new Error(
      `E2E build refused to start: Supabase URL "${url}" is not a local address`,
    );
  }
}
