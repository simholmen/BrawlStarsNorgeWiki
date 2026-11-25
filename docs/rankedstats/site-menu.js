/*
  rankedstats/site-menu.js — the hamburger menu in the ranked page's top bar (#rmenu in stats.html).

  Same contents as the wiki header's menu (web/components/UserMenu.tsx): login state, the
  Wiki / Ranked stats switch, and for editors a quick "add ranked profile" form plus links to
  /ranked-profiler/ and /historikk/.

  Login state comes from GET /api/meg/ on the Next.js app, which shares this page's origin on
  beta (Caddy) and in `npm run dev`. If that request fails (old GitHub Pages site, file://), the
  account and editor parts simply stay hidden. Adding a profile POSTs JSON to /api/ranked-profiler/,
  which runs as the logged-in visitor, so the database's own rules decide.

  Self-contained on purpose: no dependency on the stats-*.js globals.
*/
(function () {
  "use strict";

  var root = document.getElementById("rmenu");
  if (!root) return;
  var button = document.getElementById("rmenu-button");
  var panel = document.getElementById("rmenu-panel");
  var account = document.getElementById("rmenu-account");
  var editor = document.getElementById("rmenu-editor");
  var logout = document.getElementById("rmenu-logout");
  var form = document.getElementById("rmenu-add");
  var status = document.getElementById("rmenu-status");

  function setOpen(open) {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Lukk meny" : "Åpne meny");
  }

  button.addEventListener("click", function () {
    setOpen(panel.hidden);
  });
  document.addEventListener("mousedown", function (e) {
    if (!panel.hidden && !root.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) setOpen(false);
  });

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function renderLoggedOut() {
    var next = encodeURIComponent(location.pathname + location.search);
    var link = el("a", "rmenu-login", "Logg inn med Discord");
    link.href = "/logg-inn/?next=" + next;
    account.replaceChildren(link);
    account.hidden = false;
  }

  function renderLoggedIn(me) {
    var link = el("a", "rmenu-user");
    link.href = "/konto/";
    if (me.avatar) {
      var img = el("img");
      img.src = me.avatar;
      img.alt = "";
      img.width = 32;
      img.height = 32;
      img.referrerPolicy = "no-referrer";
      link.appendChild(img);
    } else {
      link.appendChild(el("span", "rmenu-avatar", (me.name || "?").slice(0, 1).toUpperCase()));
    }
    var text = el("span", "rmenu-user-text");
    text.appendChild(el("strong", "", me.name));
    var roleLabel = me.role === "admin" ? "Admin" : me.role === "editor" ? "Redaktør" : "Innlogget";
    text.appendChild(el("span", "rmenu-muted", roleLabel + " · Min konto"));
    link.appendChild(text);
    account.replaceChildren(link);
    account.hidden = false;
    logout.hidden = false;
    editor.hidden = !(me.role === "editor" || me.role === "admin");
  }

  fetch("/api/meg/", { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then(function (r) {
      if (!r.ok || !(r.headers.get("content-type") || "").includes("application/json")) throw new Error();
      return r.json();
    })
    .then(function (me) {
      // Tag analytics events with who is browsing (docs/analytics.js), like the wiki does.
      if (window.posthog) {
        var role = me && me.status === "in" ? me.role || "innlogget" : "anonym";
        window.posthog.register({ viewer_role: role });
      }
      if (me && me.status === "in") renderLoggedIn(me);
      else renderLoggedOut();
    })
    .catch(function () {
      /* No Next.js app here: just the page links. */
    });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    status.className = "rmenu-status";
    status.textContent = "Legger til …";
    fetch("/api/ranked-profiler/", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ tag: form.elements.tag.value, name: form.elements.name.value }),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false, message: "Kunne ikke lagre. Prøv igjen." };
        });
      })
      .then(function (result) {
        status.className = "rmenu-status " + (result.ok ? "ok" : "bad");
        status.textContent = result.message;
        if (result.ok) {
          form.reset();
          if (window.posthog) window.posthog.capture("ranked_profile_added", { kind: "profil", via: "ranked-meny" });
        }
      })
      .catch(function () {
        status.className = "rmenu-status bad";
        status.textContent = "Kunne ikke lagre. Prøv igjen.";
      })
      .finally(function () {
        submit.disabled = false;
      });
  });
})();
