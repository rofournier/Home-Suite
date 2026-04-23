const STORAGE_KEY = "notes_offline_queue_v2";

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-300)));
}

function createKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function apiRequest(url, options = {}) {
  const request = {
    url,
    method: options.method || "GET",
    headers: options.headers || { "Content-Type": "application/json" },
    body: options.body || null,
    idempotency_key: createKey(),
    queued_at: Date.now(),
  };

  const isMutation = request.method !== "GET";
  if (!navigator.onLine && isMutation) {
    enqueueRequest(request);
    return { ok: true, queued: true };
  }

  try {
    return await fetch(url, options);
  } catch (error) {
    if (isMutation) {
      enqueueRequest(request);
      return { ok: true, queued: true };
    }
    throw error;
  }
}

export function enqueueRequest(request) {
  const queue = readQueue();
  queue.push(request);
  writeQueue(queue);
}

export async function flushQueue() {
  const queue = readQueue();
  if (!queue.length || !navigator.onLine) {
    return { flushed: 0, remaining: queue.length };
  }

  let flushed = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      if (response.ok) {
        flushed += 1;
      } else {
        remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  return { flushed, remaining: remaining.length };
}
