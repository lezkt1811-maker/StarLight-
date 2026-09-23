import Stripe from "stripe";
import { buildReadingPdf } from "./pdf.js";
import { generateInterpretation } from "./interpret.js";
import { sendReadingEmail, notifyOwner } from "./email.js";

const ORDER_TTL_SECONDS = 60 * 60 * 24; // 24h — long enough to cover an abandoned-then-resumed checkout

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    return new Response("Not found", { status: 404 });
  },
};

/* Called by the browser right before it opens the Stripe Payment Link.
   Stores the already-computed chart data (the browser did the astronomy math)
   under a short-lived order id, which we pass to Stripe as client_reference_id
   so the webhook can find it again after payment — a Payment Link URL can't
   carry the full chart JSON directly. */
async function handlePrepare(request, env) {
  const headers = { ...corsHeaders(env), "Content-Type": "application/json" };
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }
  if (!payload || payload.schema !== "starchart13-detailed-reading" || !Array.isArray(payload.points)) {
    return new Response(JSON.stringify({ error: "Unrecognized report payload" }), { status: 400, headers });
  }

  const orderId = crypto.randomUUID();
  await env.ORDERS.put(orderId, JSON.stringify(payload), { expirationTtl: ORDER_TTL_SECONDS });
  return new Response(JSON.stringify({ orderId }), { status: 200, headers });
}

async function handleWebhook(request, env, ctx) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: "2024-06-20",
  });

  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe signature verification failed", err.message);
    return new Response("Signature verification failed", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    // Acknowledge the webhook immediately (Stripe retries on timeout/non-2xx) and do the
    // slow work — AI writing, PDF rendering, email — in the background via waitUntil.
    ctx.waitUntil(fulfillOrder(env, event.data.object));
  }

  return new Response("ok", { status: 200 });
}

async function fulfillOrder(env, session) {
  const orderId = session.client_reference_id;
  const email = session.customer_details?.email || session.customer_email;
  const orderRef = session.id;

  try {
    if (!orderId) throw new Error("Checkout session had no client_reference_id");
    if (!email) throw new Error("Checkout session had no customer email");

    const raw = await env.ORDERS.get(orderId);
    if (!raw) throw new Error(`No stored chart payload found for order ${orderId}`);
    const payload = JSON.parse(raw);

    let interpretation = null;
    try {
      interpretation = await generateInterpretation(env, payload);
    } catch (err) {
      console.error("AI interpretation failed, falling back to templated PDF text:", err.message);
    }

    const pdfBytes = await buildReadingPdf(payload, interpretation);
    await sendReadingEmail(env, {
      toEmail: email,
      customerName: payload.customer?.name,
      pdfBytes,
      orderRef,
    });
    await env.ORDERS.delete(orderId);
  } catch (err) {
    console.error("Order fulfillment failed", orderRef, err.message);
    await notifyOwner(env, { orderRef, email, error: err.message });
  }
}
