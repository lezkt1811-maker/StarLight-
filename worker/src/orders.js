/* Order records live in KV under order:<orderId> as a single JSON blob.
   A second key, session:<stripeSessionId>, maps back to the orderId so the
   success page can poll status using only the Checkout Session ID Stripe
   puts in the redirect URL — nothing else about the order is retrievable
   from that endpoint (see index.js's /status handler). */

const ORDER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — long enough to investigate/retry a failed paid order
const SESSION_INDEX_TTL_SECONDS = 60 * 60 * 24 * 30;

export const STATUS = {
  PREPARED: "prepared",
  PAID: "paid",
  GENERATING: "generating",
  GENERATED: "generated",
  EMAILING: "emailing",
  FULFILLED: "fulfilled",
  FAILED: "failed",
};

function orderKey(orderId) {
  return `order:${orderId}`;
}
function sessionKey(sessionId) {
  return `session:${sessionId}`;
}

export async function createOrder(env, orderId, payload) {
  const now = new Date().toISOString();
  const record = {
    orderId,
    status: STATUS.PREPARED,
    schemaVersion: payload.schemaVersion || 1,
    payload,
    stripeSessionId: null,
    customerEmail: null,
    attempts: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  await env.ORDERS.put(orderKey(orderId), JSON.stringify(record), { expirationTtl: ORDER_TTL_SECONDS });
  return record;
}

export async function getOrder(env, orderId) {
  const raw = await env.ORDERS.get(orderKey(orderId));
  return raw ? JSON.parse(raw) : null;
}

export async function getOrderIdBySession(env, sessionId) {
  return env.ORDERS.get(sessionKey(sessionId));
}

export async function saveOrder(env, record) {
  record.updatedAt = new Date().toISOString();
  await env.ORDERS.put(orderKey(record.orderId), JSON.stringify(record), { expirationTtl: ORDER_TTL_SECONDS });
  if (record.stripeSessionId) {
    await env.ORDERS.put(sessionKey(record.stripeSessionId), record.orderId, { expirationTtl: SESSION_INDEX_TTL_SECONDS });
  }
}

export async function setStatus(env, record, status, extra = {}) {
  Object.assign(record, extra, { status });
  await saveOrder(env, record);
  return record;
}
