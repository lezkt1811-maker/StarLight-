# StarChart13 fulfillment worker

Handles what the static site can't: after someone pays for the $25 detailed
reading on [buy.stripe.com/bJedRb8Yk78ycSsgWOgjC00](https://buy.stripe.com/bJedRb8Yk78ycSsgWOgjC00),
this Cloudflare Worker verifies the payment, asks Claude to write the
personalized interpretation, renders the PDF, and emails it to the customer.
If anything in that chain fails, it emails **you** instead so the order can
be fulfilled by hand rather than the customer getting nothing.

## How it fits together

1. Browser generates the chart, then `POST /prepare` with the computed chart
   JSON. The worker stores it in KV under a random order id (24h TTL) and
   returns that id.
2. Browser opens the Stripe Payment Link with `?client_reference_id=<order id>`
   appended, so Stripe carries that id through checkout.
3. Stripe sends a `checkout.session.completed` webhook to `POST /webhook`.
4. The worker verifies Stripe's signature, looks up the stored chart JSON by
   `client_reference_id`, calls Claude to write the reading, builds the PDF
   with `pdf-lib`, and emails it via Resend to the address Stripe collected
   at checkout.
5. On any failure (missing payload, Claude down, Resend down, etc.) it emails
   `CONTACT_EMAIL` with the order id and the error so you can fulfill it
   manually — a $25 order should never just silently fail.

## One-time setup

You'll need accounts (all have free tiers that cover this): **Cloudflare**,
**Resend**, and an **Anthropic** API key. You already have Stripe.

```bash
cd worker
npm install
npx wrangler login          # opens a browser to connect your Cloudflare account
```

1. **Create the KV namespace** (stores chart data between "prepare" and "pay"):
   ```bash
   npx wrangler kv namespace create ORDERS
   ```
   Paste the `id` it prints into `wrangler.toml` under `[[kv_namespaces]]`.

2. **Set the secrets** (never put these in `wrangler.toml` or commit them):
   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY       # from dashboard.stripe.com/apikeys
   npx wrangler secret put STRIPE_WEBHOOK_SECRET    # see step 4 below
   npx wrangler secret put RESEND_API_KEY           # from resend.com/api-keys
   npx wrangler secret put ANTHROPIC_API_KEY        # from console.anthropic.com
   ```

3. **Deploy:**
   ```bash
   npx wrangler deploy
   ```
   This prints your worker's URL, e.g. `https://starchart13-fulfillment.<your-subdomain>.workers.dev`.

4. **Point Stripe at it.** In the Stripe Dashboard → Developers → Webhooks →
   Add endpoint:
   - URL: `<your worker URL>/webhook`
   - Event: `checkout.session.completed`
   - Copy the endpoint's **Signing secret** (`whsec_...`) and set it as
     `STRIPE_WEBHOOK_SECRET` (step 2), then redeploy so the new secret takes
     effect: `npx wrangler deploy`.

5. **Verify sending domain in Resend**, or use their default test domain
   while you're testing. Update `FROM_EMAIL` in `wrangler.toml` once your
   domain is verified.

6. **Wire the frontend to it.** Edit `../reading-config.js`:
   ```js
   fulfillmentApiBase: "https://starchart13-fulfillment.<your-subdomain>.workers.dev",
   ```

## Testing before going live

- Use a Stripe **test mode** secret key + a test Payment Link (or Stripe's
  test card `4242 4242 4242 4242`) so you don't spend real money testing.
- `npx wrangler tail` streams live logs from the deployed worker — watch it
  while you complete a test purchase to see each step (`/prepare` hit,
  webhook received, Claude call, email sent) or catch where it failed.
- The Stripe CLI can also replay a fake event directly at your worker:
  `stripe trigger checkout.session.completed` (after `stripe listen --forward-to <worker URL>/webhook`).

## Costs

All of this fits comfortably in free tiers at low volume: Cloudflare Workers
(100k requests/day free), Cloudflare KV (free tier plenty for this), Resend
(3,000 emails/month free). The only per-order cost is the Claude API call for
the interpretation — typically a few cents per reading.
