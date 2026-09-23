import { buildReadingPdf } from "./pdf.js";
import { generateInterpretation } from "./interpret.js";
import { sendReadingEmail, notifyOwner } from "./email.js";
import { STATUS, createOrder, getOrder, getOrderIdBySession, setStatus } from "./orders.js";
import { verifyStripeSignature } from "./verifyStripeSignature.js";

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (url.pathname === "/prepare" && request.method === "POST") {
      return handlePrepare(request, env);
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      return handleWebhook(request, env, ctx);
    }

    if (url.pathname === "/status" && request.method === "GET") {
      return handleStatus(url, env);
    }

    return new Response("Not found", { status: 404 });
  },
};

/* Called by the browser right before it opens the Stripe Payment Link. Stores the
   already-computed chart data (the browser did the astronomy math — this worker
   never recalculates it) under a short-lived order id, which we pass to Stripe as
   client_reference_id so the webhook can find it again after payment. A Payment
   Link URL can't carry the full chart JSON directly, and we never want birth data
   sitting in a URL or a Stripe field anyway. */
async function handlePrepare(request, env) {
  const headers = { ...corsHeaders(env), "Content-Type": "application/json" };
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }
  if (!payload || payload.schema !== "starchart13-detailed-reading" || !Array.isArray(payload.points) || !payload.points.length) {
    return new Response(JSON.stringify({ error: "Unrecognized or empty report payload — generate your chart first." }), { status: 400, headers });
  }

  const orderId = crypto.randomUUID();
  await createOrder(env, orderId, payload);
  return new Response(JSON.stringify({ orderId }), { status: 200, headers });
}

/* A lightweight, privacy-safe status check the success page can poll using only the
   Stripe Checkout Session ID (which Stripe substitutes into the redirect URL) — it
   never returns birth data or the chart payload, only the fulfillment status. */
async function handleStatus(url, env) {
  const headers = { ...corsHeaders(env), "Content-Type": "application/json" };
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "session_id is required" }), { status: 400, headers });
  }
  const orderId = await getOrderIdBySession(env, sessionId);
  if (!orderId) {
    return new Response(JSON.stringify({ status: "pending" }), { status: 200, headers });
  }
  const order = await getOrder(env, orderId);
  if (!order) {
    return new Response(JSON.stringify({ status: "pending" }), { status: 200, headers });
  }
  return new Response(JSON.stringify({ status: order.status, updatedAt: order.updatedAt }), { status: 200, headers });
}

async function handleWebhook(request, env, ctx) {
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event;
  try {
    event = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe signature verification failed", err.message);
    return new Response("Signature verification failed", { status: 400 });
  }

  // Only a completed Checkout Session with payment actually collected triggers fulfillment.
  // (Delayed-notification methods report success via this same event once payment clears,
  // so checking payment_status here also covers "async payment succeeded" cases.)
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status === "paid") {
      // Acknowledge the webhook immediately (Stripe retries on timeout/non-2xx) and do the
      // slow work — AI writing, PDF rendering, email — in the background via waitUntil.
      ctx.waitUntil(fulfillOrder(env, session));
    } else {
      console.log("checkout.session.completed received but not yet paid", session.id, session.payment_status);
    }
  }

  return new Response("ok", { status: 200 });
}

async function fulfillOrder(env, session) {
  const orderId = session.client_reference_id;
  const email = session.customer_details?.email || session.customer_email;
  const stripeSessionId = session.id;

  if (!orderId) {
    console.error("Checkout session had no client_reference_id", stripeSessionId);
    await notifyOwner(env, { orderRef: stripeSessionId, email, error: "Checkout session had no client_reference_id — cannot locate chart data." });
    return;
  }

  let order = await getOrder(env, orderId);
  if (!order) {
    console.error("No stored order found for orderId", orderId, stripeSessionId);
    await notifyOwner(env, { orderRef: stripeSessionId, email, error: `No stored order found for order id ${orderId}.` });
    return;
  }

  // Idempotency: Stripe retries webhooks it didn't get a fast 2xx for, and can also send the
  // same logical event more than once. If this order already reached a terminal fulfilled
  // state for this exact Stripe session, treat this as a duplicate delivery and do nothing —
  // no second email, no false "fulfillment failed" alert to the owner.
  if (order.status === STATUS.FULFILLED && order.stripeSessionId === stripeSessionId) {
    console.log("Duplicate webhook for already-fulfilled order — skipping", orderId, stripeSessionId);
    return;
  }
  // Also guard against two near-simultaneous deliveries both starting fulfillment at once.
  if (order.status === STATUS.GENERATING || order.status === STATUS.EMAILING) {
    console.log("Order already being fulfilled — skipping concurrent duplicate webhook", orderId, stripeSessionId);
    return;
  }

  try {
    if (!email) throw new Error("Checkout session had no customer email");

    order = await setStatus(env, order, STATUS.PAID, { stripeSessionId, customerEmail: email });
    order = await setStatus(env, order, STATUS.GENERATING, { attempts: order.attempts + 1 });

    let interpretation = null;
    try {
      interpretation = await generateInterpretation(env, order.payload);
    } catch (err) {
      console.error("AI interpretation failed, falling back to deterministic PDF text:", err.message);
    }

    const pdfBytes = await buildReadingPdf(order.payload, interpretation);
    order = await setStatus(env, order, STATUS.GENERATED);

    order = await setStatus(env, order, STATUS.EMAILING);
    await sendReadingEmail(env, {
      toEmail: email,
      customerName: order.payload.customer?.name,
      pdfBytes,
      orderRef: stripeSessionId,
    });

    await setStatus(env, order, STATUS.FULFILLED, { lastError: null });
  } catch (err) {
    console.error("Order fulfillment failed", orderId, stripeSessionId, err.message);
    await setStatus(env, order, STATUS.FAILED, { lastError: err.message });
    await notifyOwner(env, { orderRef: stripeSessionId, email, error: err.message });
  }
}
