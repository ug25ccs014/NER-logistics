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
    if (err instanceof TypeError) {
      // fetch() throws TypeError for actual network failures.
      queueReport(payload);
      return { queued: true };
    }
    throw err;
  }
}

function queueReport(payload) {
  const queue = readQueue();
  queue.push(payload);
  writeQueue(queue);
}

export function pendingCount() {
  return readQueue().length;
}

// Call once at app start and again on the browser's 'online' event.
// Sends every queued report; anything that still fails (still
// offline, or a genuine server error) stays queued for next time.
export async function flushQueue() {
  const queue = readQueue();
  if (queue.length === 0) return { sent: 0, remaining: 0 };

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
  return { sent, remaining: stillPending.length };
}
