const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RSVP_PATH_PATTERN = /^\/teams\/[a-z0-9]+(?:-[a-z0-9]+)*\/matches\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/rsvp$/u;
const EVENT_KINDS = new Set(["invitation", "manual_reminder", "configured_reminder", "two_hour_reminder"]);

function exact(value, keys) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function bounded(value, minimum, maximum) {
  return typeof value === "string" && value === value.trim() && value.length >= minimum && value.length <= maximum;
}

function pushPayload(value) {
  if (!exact(value, ["version", "outboxId", "eventKind", "title", "body", "url", "tag"])) return null;
  if (
    value.version !== 1 ||
    typeof value.outboxId !== "string" ||
    !UUID_PATTERN.test(value.outboxId) ||
    typeof value.eventKind !== "string" ||
    !EVENT_KINDS.has(value.eventKind) ||
    !bounded(value.title, 1, 120) ||
    !bounded(value.body, 1, 500) ||
    typeof value.url !== "string" ||
    !RSVP_PATH_PATTERN.test(value.url) ||
    value.tag !== `pro7-match-${value.outboxId}`
  ) return null;
  return value;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = null;
  try {
    payload = event.data ? pushPayload(event.data.json()) : null;
  } catch {
    payload = null;
  }
  event.waitUntil(payload
    ? self.registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        icon: "/favicon.svg",
        badge: "/favicon.svg",
        data: { url: payload.url },
      })
    : Promise.resolve());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification?.data?.url;
  if (typeof path !== "string" || !RSVP_PATH_PATTERN.test(path)) {
    event.waitUntil(Promise.resolve());
    return;
  }
  const target = new URL(path, self.location.origin);
  if (target.origin !== self.location.origin) {
    event.waitUntil(Promise.resolve());
    return;
  }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === target.origin);
    if (existing) {
      if (typeof existing.navigate === "function") await existing.navigate(target.href);
      await existing.focus();
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});
