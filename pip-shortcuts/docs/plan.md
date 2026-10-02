# Document PiP Implementation Plan

> **For agentic workers:** Use test-driven development for behavioral changes; implement inline with independent final review. User authorizes autonomous development and testing.

**Goal:** Deliver a separate loadable PiP shortcut extension and verified compatibility report.
**Architecture:** One persistent host page owns PiP; a serialized worker controls visibility and validates navigation.
**Tech Stack:** MV3, plain ES modules, Node built-in tests; no dependencies.
**Spec:** docs/design.md

## Global Constraints

Only pip-shortcuts files changed. No NTP override, injection, host permissions, flags or profile edits. 40 default entries; max 1000; HTTP/HTTPS without credentials. Chrome 130 minimum. UI text in Chinese without parenthetical em dashes.

## Review Focus

- Foreign/video PiP during creation must never be manipulated.
- Pending navigation and moved/inactive tabs must reject shortcut navigation.
- Source close, reload and worker restart must clear or revalidate session.
- Rapid tab/focus events must converge to current state without stealing focus.
- Failure to hide/restore must be explicit, never silently leave automatic mode running.

### Task 1: Pure core

Files: extension/core.js, tests/core.test.mjs. Produces isNativeNtp(tab), validateShortcuts(document), findPipWindow(before, after, hostUrl), navigationMode(event), validateBounds(value).

- [x] Write and run failing tests for exact NTP/pendingUrl rules, 40 items, malformed/unsafe data, unique PiP identity, modifier precedence and bounds.
- [x] Implement helpers and run node --test tests/core.test.mjs.

### Task 2: Lifecycle and navigation

Files: extension/controller.js, tests/controller.test.mjs. Produces createController(api, shortcuts) with register, reconcile, openShortcut, clear, status. Consumes Task 1 helpers. Inject real API-shaped fakes only at Chrome boundary.

- [x] Write failure-first tests for visibility, PiP focus retention, inactive/pending/moved target rejection, missing windows, worker restore, API failure and event revision race.
- [x] Implement serialized controller with session storage, validate source/window identity, requery before navigation, no focused:true calls.
- [x] Run all node tests.

### Task 3: Host and packaging

Files: extension/worker.js, host.js, host.html, styles.css, manifest.json, shortcuts.json, icons; scripts/check.mjs, package.json, README.md.

- [x] Connect real user gesture requestWindow; populate DOM using textContent and offline stylesheet; identify unique new PiP window.
- [x] Wire toolbar and worker events, trusted host messages; persistent JSON editor and pause/stop/status controls.
- [x] Check JS syntax, resources, permissions and run root and subsystem tests.

### Task 4: Browser verification and review

Files: validation/report.md, validation/review.md, validation test output; ZIP in this subfolder.

- [ ] Load isolated extension when allowed; verify actual PiP identity, show/hide, native input, 40th entry, modified click, close/restart, multiwindow and fullscreen.
- [x] Independently review full source, fix material issues with regression tests and rerun suites.
- [x] Package source, record observed results and unverified boundaries, link entry documentation.
