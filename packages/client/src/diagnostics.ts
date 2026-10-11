// Diagnostics: an OPT-IN, on-device log of the last few events that explain
// "why did push / reload / connection misbehave on THIS phone".
//
// WHY IT EXISTS. Push for a member's Edge phone broke silently on 2026-10-10
// and the cause was never proven, because nothing on the device recorded what
// happened and the server only sees the final result. This lets a member turn
// on a short log, then hand it to an admin when something goes wrong.
//
// RULES (Bunjie, 2026-10-11, all of them are load-bearing):
//  - OFF by default. Nothing is recorded until the member turns it on.
//  - Rolling: only the last MAX_EVENTS events are kept.
//  - Expires on its own: MAX_AGE_MS after being switched on it turns itself
//    off and deletes the log.
//  - NO message text, and nothing about who the member talks to. Events are
//    short fixed kinds plus a clipped technical detail (an error's name and
//    message, a push service host, a reload reason). No user id, no channel
//    or server ids.
//  - Never sent on its own. The member presses Copy or Send.
//  - Sent reports are deleted by the server after 30 days (nac-server
//    scripts/host/nac-diag-purge.*).
//
// Storage is localStorage on purpose (per device, never synced to the account).
// Every access is wrapped: diagnostics must never break the app.

const ON_KEY = "nac:diag-on";
const LOG_KEY = "nac:diag-log";

export const MAX_EVENTS = 200;
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DETAIL = 160;

export interface DiagEvent {
  /** Epoch ms */
  t: number;
  /** Short fixed kind, e.g. "reload", "push-registered", "connection-dropped" */
  k: string;
  /** Clipped technical detail, never message content */
  d?: string;
}

function readOnSince(): number | null {
  try {
    const raw = localStorage.getItem(ON_KEY);
    if (!raw) return null;
    const since = Number(raw);
    return Number.isFinite(since) ? since : null;
  } catch {
    return null;
  }
}

function clear(): void {
  try {
    localStorage.removeItem(ON_KEY);
    localStorage.removeItem(LOG_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/** True while diagnostics is switched on and has not yet expired. */
export function diagnosticsEnabled(): boolean {
  const since = readOnSince();
  if (since === null) return false;
  if (Date.now() - since > MAX_AGE_MS) {
    clear();
    return false;
  }
  return true;
}

/** When diagnostics will turn itself off, or null if it is off. */
export function diagnosticsExpiresAt(): number | null {
  const since = readOnSince();
  return since === null ? null : since + MAX_AGE_MS;
}

export function setDiagnosticsEnabled(on: boolean): void {
  if (!on) {
    clear();
    return;
  }
  try {
    localStorage.setItem(ON_KEY, String(Date.now()));
    record("diagnostics-on", userAgentSummary());
    recordStartup();
  } catch {
    // Without storage there is nothing to record into.
  }
}

function clip(detail: unknown): string | undefined {
  if (detail === undefined || detail === null) return undefined;
  const text =
    typeof detail === "string"
      ? detail
      : (() => {
          const e = detail as { name?: string; message?: string };
          return `${e.name ?? typeof detail}: ${String(e.message ?? detail)}`;
        })();
  // Reduce anything that could identify a person or a conversation:
  //  - a JSON parse error quotes a snippet of the text it choked on, which
  //    could be message content, so keep only the error's name;
  //  - a URL keeps its host only (paths carry channel/user ids, queries tokens);
  //  - any bare path or 26-character id is masked.
  if (/JSON|Unexpected token/i.test(text)) return text.split(":")[0].slice(0, 40);
  return text
    .replace(/https?:\/\/([^\s\/"')?#]+)[^\s"')]*/g, "$1")
    .replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/g, "<id>")
    .replace(/\/[A-Za-z0-9_.~%-]+(?:\/[A-Za-z0-9_.~%-]+)+/g, "/…")
    .slice(0, MAX_DETAIL);
}

function record(kind: string, detail?: unknown): void {
  try {
    // Re-checked here, not only in diag(): the async parts of recordStartup
    // finish later, and must not recreate a log the member has since switched
    // off or that has expired.
    if (!diagnosticsEnabled()) return;
    const events = getDiagnosticsEvents();
    events.push({ t: Date.now(), k: kind, d: clip(detail) });
    localStorage.setItem(LOG_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Quota or storage disabled: drop the event, never throw.
  }
}

/** Record one event. A no-op unless diagnostics is on. */
export function diag(kind: string, detail?: unknown): void {
  if (!diagnosticsEnabled()) return;
  record(kind, detail);
}

export function getDiagnosticsEvents(): DiagEvent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function userAgentSummary(): string {
  const standalone =
    typeof matchMedia === "function" &&
    matchMedia("(display-mode: standalone)").matches;
  return `${navigator.userAgent.slice(0, 110)} | ${standalone ? "installed app" : "browser tab"}`;
}

/** What push looks like on this device right now. */
function recordStartup(): void {
  try {
    const permission =
      "Notification" in window ? Notification.permission : "unsupported";
    record("notification-permission", permission);
    if (!("serviceWorker" in navigator)) {
      record("push-state", "no service worker support");
      return;
    }
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        if (!registration) {
          record("push-state", "no service worker registration");
          return undefined;
        }
        return registration.pushManager.getSubscription().then((sub) => {
          let host = "none";
          if (sub) {
            try {
              host = new URL(sub.endpoint).host;
            } catch {
              host = "unparsable endpoint";
            }
          }
          record("push-state", `subscription: ${host}`);
        });
      })
      .catch((error) => record("push-state-error", error));
  } catch (error) {
    record("push-state-error", error);
  }
}

// Page-level signals, attached once. Each is a no-op while diagnostics is off.
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => diag("error", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) =>
    diag("unhandled-rejection", e.reason),
  );
  window.addEventListener("online", () => diag("device-online"));
  window.addEventListener("offline", () => diag("device-offline"));
  // One line per page load while it is on, so reloads show up even when the
  // reload itself was not the thing that logged.
  if (diagnosticsEnabled()) {
    record("page-load");
    recordStartup();
  }
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function stamp(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** A short code the member can quote to an admin instead of any identity. */
export function newReportCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Plain text of the log, for Copy and for Send. */
export function formatDiagnosticsReport(code: string): string {
  const events = getDiagnosticsEvents();
  return [
    "NAC diagnostics report",
    `Report code: ${code}`,
    `Created: ${stamp(Date.now())}`,
    `Events: ${events.length}`,
    "",
    ...events.map((e) => `${stamp(e.t)}  ${e.k}${e.d ? `  ${e.d}` : ""}`),
  ].join("\n");
}

/** Send the report to NAC admins. Resolves to true only if the server took it. */
export async function sendDiagnosticsReport(code: string): Promise<boolean> {
  try {
    const response = await fetch("/__nac-diag", {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: formatDiagnosticsReport(code),
      signal: AbortSignal.timeout(15_000),
    });
    // Only the intake's own 204 counts. Anything else (a 200 page from a
    // server that does not have the intake yet) would show "Sent" and lose
    // the report.
    return response.status === 204;
  } catch {
    return false;
  }
}
