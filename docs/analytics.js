/*
  analytics.js — PostHog visitor analytics for every page: the Next.js wiki (loaded from
  web/app/layout.tsx) and the static pages Caddy serves from docs/ (index.html, rankedstats/).

  - Cookieless: PostHog sets no cookies and uses no local/session storage; visitors are counted
    with a daily-rotating server-side hash. So no consent banner is needed. Requires
    "Enable cookieless tracking" in the PostHog project (Settings > Project > Web analytics).
  - EU cloud, reached through our own domain: Caddy proxies /ingest/* to PostHog (deploy/Caddyfile),
    which also strips our cookies (the Supabase login) before forwarding.
  - Records pageviews (also Next.js client-side navigation), time on page ($pageleave) and clicks
    (autocapture). No session recording, no surveys, no person profiles.
  - Only runs on brawlstarsnorge.com, so beta, localhost and the old GitHub Pages copy send nothing.

  Named events come from the pages themselves via window.posthog.capture(...) (web/lib/analytics.ts).
*/
(function () {
  "use strict";

  // Project API key (public by design, like the Supabase publishable key).
  var KEY = "phc_sW6ZKMpVoZs3iYWuDGJdmziBcGXEJB9hHn6VnFBBtMF6";
  if (!KEY || location.hostname !== "brawlstarsnorge.com" || window.posthog) return;

  var config = {
    api_host: location.origin + "/ingest",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-08-30",
    cookieless_mode: "always",
    person_profiles: "never",
    capture_pageview: "history_change",
    capture_pageleave: true,
    autocapture: true,
    disable_session_recording: true,
    disable_surveys: true,
  };

  // PostHog's snippet protocol, written out: calls made before the library has loaded are queued
  // on the window.posthog array, and the library replays them (and runs _i, the init) on load.
  var ph = (window.posthog = []);
  ["capture", "register"].forEach(function (method) {
    ph[method] = function () {
      ph.push([method].concat(Array.prototype.slice.call(arguments)));
    };
  });
  ph._i = [[KEY, config, undefined]];
  ph.__SV = 1;

  var script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = config.api_host + "/static/array.js";
  document.head.appendChild(script);
})();
