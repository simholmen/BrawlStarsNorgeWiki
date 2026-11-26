"use client";

import { type ReactNode, useSyncExternalStore } from "react";

// "Ta med minis" on /topplister/: switches between the two sets of lists the server rendered
// (lib/toplistsBuild.ts lists / listsWithMinis). Only one set is in the page at a time, so the
// table-of-contents anchors stay unique. The choice is remembered in this browser.

const KEY = "topplister-minis";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function write(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Private mode etc.: the switch still works for this page view via the listeners below.
  }
  fallback = on;
  listeners.forEach((l) => l());
}

// Used when localStorage can't be written, so the checkbox still follows clicks.
let fallback: boolean | null = null;

export default function MinisSwitch({
  count,
  plain,
  withMinis,
}: {
  count: number;
  plain: ReactNode;
  withMinis: ReactNode;
}) {
  // Server render and first paint: without minis, then the remembered choice.
  const on = useSyncExternalStore(
    subscribe,
    () => fallback ?? read(),
    () => false,
  );
  if (count === 0) return <>{plain}</>;
  return (
    <>
      <label className="toplist-minis">
        <input type="checkbox" checked={on} onChange={(e) => write(e.target.checked)} />
        Ta med minis
        <span className="toplist-minis-note">
          {" "}
          ({count} mini-kontoer: 3v3-seire, Showdown-seire og XP legges til hovedkontoen; i de andre listene står
          miniene for seg selv)
        </span>
      </label>
      {on ? withMinis : plain}
    </>
  );
}
