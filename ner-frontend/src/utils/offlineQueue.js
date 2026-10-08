// Offline-first queue for field reports. Field officials often submit
// reports from spots with no signal at all -- this lets a report be
// captured locally (with its own id + timestamp, generated on-device)
// and sent later without the user having to remember to resend it.
//
// The matching server side is db.create_field_report's report_id
// dedup (ON CONFLICT DO NOTHING) -- so retrying a queued report that
// actually did make it through last time is always safe.
import { api } from '../api.js';

const STORAGE_KEY = 'ner_pending_field_reports';

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  // Lets the status banner show "N reports waiting" without polling.
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ner-queue-changed', { detail: { pending: queue.length } }));
}

// Builds a payload with a client-generated id + captured_at, so it's
// safe to submit now or queue for later -- either way the server sees
// the same identity.
export function buildFieldReportPayload(fields) {
  return {
    id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    captured_at: new Date().toISOString(),
    ...fields,
  };
}

// Tries to submit now; if the network call fails (offline, DNS error,
// server unreachable -- not a validation 4xx from the server, which
// still throws and should be shown to the user), the report is queued
// instead and this resolves normally so the UI can say "saved, will
// sync later" rather than showing an error.
export async function submitOrQueue(payload) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    queueReport(payload);
    return { queued: true };
  }
  try {
    await api.submitFieldReport(payload);
    return { queued: false };
  } catch (err) {
    // A thrown Error from a non-2xx response (e.g. bad report_type)
    // means the server was reachable and rejected it -- don't queue
    // something the server has already told us is invalid.
    if (err instanceof TypeError || err?.isNetworkError) {
      // fetch() throws TypeError for actual network failures; api.js flags the
      // same condition with isNetworkError (weak signal: navigator.onLine can be true).
      queueReport(payload);
      return { queued: true };
    }
    throw err;
  }
}

function queueReport(payload) {
  const queue = readQueue();
  queue.push(payload);
  try {
    writeQueue(queue);
  } catch {
    // localStorage is full (photos are stored as base64). A report without its
    // photo is far better than a report lost -- drop the photo and retry.
    queue[queue.length - 1] = { ...payload, photo_base64: undefined, photo_dropped_offline: true };
    writeQueue(queue);
  }
}

// ---- other actions (e.g. road-name submissions): same idea, one generic queue ----
const ACTIONS_KEY = 'ner_pending_actions';
const ACTION_HANDLERS = {
  road_name: (payload) => api.submitRoadName(payload),
};

function readActions() {
  try { return JSON.parse(localStorage.getItem(ACTIONS_KEY)) || []; } catch { return []; }
}
function writeActions(list) {
  localStorage.setItem(ACTIONS_KEY, JSON.stringify(list));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ner-queue-changed', { detail: { pending: pendingCount() } }));
}

// Try now; if there is no connection, keep it on the device and send it later.
// A real server rejection (4xx) still throws so the UI can show it.
export async function submitActionOrQueue(type, payload) {
  const handler = ACTION_HANDLERS[type];
  if (!handler) throw new Error(`Unknown offline action: ${type}`);
  const entry = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`, type, payload, queued_at: new Date().toISOString() };
  const queueIt = () => { const list = readActions(); list.push(entry); writeActions(list); return { queued: true }; };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return queueIt();
  try {
    await handler(payload);
    return { queued: false };
  } catch (err) {
    if (err instanceof TypeError || err?.isNetworkError) return queueIt();
    throw err;
  }
}

export function pendingCount() {
  return readQueue().length + readActions().length;
}

// Call once at app start and again on the browser's 'online' event.
// Sends every queued report; anything that still fails (still
// offline, or a genuine server error) stays queued for next time.
export async function flushQueue() {
  const queue = readQueue();
  const actions = readActions();
  if (queue.length === 0 && actions.length === 0) return { sent: 0, remaining: 0 };

  // Queued actions first (small, quick); anything that still fails stays queued.
  const actionsLeft = [];
  let actionsSent = 0;
  for (const entry of actions) {
    try { await ACTION_HANDLERS[entry.type](entry.payload); actionsSent += 1; } catch { actionsLeft.push(entry); }
  }
  if (actions.length) writeActions(actionsLeft);
  if (queue.length === 0) return { sent: actionsSent, remaining: actionsLeft.length };

  const stillPending = [];
  let sent = 0;
  for (const payload of queue) {
    try {
      await api.submitFieldReport(payload);
      sent += 1;
    } catch {
      stillPending.push(payload);
    }
  }
  writeQueue(stillPending);
  return { sent: sent + actionsSent, remaining: stillPending.length + actionsLeft.length };
}
