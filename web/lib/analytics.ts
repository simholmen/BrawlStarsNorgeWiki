// Named analytics events, sent through PostHog (loaded by docs/analytics.js, which only runs on
// brawlstarsnorge.com). Everywhere else window.posthog is undefined and these do nothing.

type PostHog = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  register: (properties: Record<string, unknown>) => void;
};

function posthog(): PostHog | undefined {
  return typeof window === "undefined" ? undefined : (window as { posthog?: PostHog }).posthog;
}

export function track(event: string, properties?: Record<string, unknown>) {
  posthog()?.capture(event, properties);
}

/** Tags every later event with who is browsing, so editors' own visits can be filtered out. */
export function setViewerRole(role: "anonym" | "innlogget" | "editor" | "admin") {
  posthog()?.register({ viewer_role: role });
}
