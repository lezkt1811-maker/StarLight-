// StarChart13 — Reading Sales & Referral Configuration
// This is the ONLY place these values should be edited.
// index.html and thank-you.html both load this file, so a change here updates both pages.
//
// After editing, commit this file directly on GitHub (see the setup instructions
// you were given alongside this file for exact steps).

const READING_SALES_CONFIG = {
  price: 25,
  priceDisplay: "$25",

  // Stripe Payment Link for the $25 detailed reading purchase button.
  stripePaymentUrl: "https://buy.stripe.com/bJedRb8Yk78ycSsgWOgjC00",

  // $7 "True-Sky Mini Reading" — a lower-cost, faster-turnaround product shown
  // right after someone generates their free chart. This is a plain Stripe
  // Payment Link (no automated PDF pipeline like the $25 reading) since it's
  // delivered manually within 24 hours.
  miniReadingPrice: 7,
  miniReadingPriceDisplay: "$7",
  // REPLACE this placeholder before going live:
  miniReadingStripeUrl: "REPLACE_WITH_7_DOLLAR_STRIPE_PAYMENT_LINK",

  // Base URL of the Cloudflare Worker (see /worker) that stores the chart data before
  // checkout and emails the finished PDF after Stripe confirms payment.
  fulfillmentApiBase: "https://starchart13-fulfillment.lezkt1811.workers.dev",

  // Your Cash App info — already filled in.
  cashAppCashtag: "$StarFort13",
  cashAppPaymentUrl: "https://cash.app/pay/link/au85j9vj",

  // Private form endpoint (Formspree) — configured.
  formEndpoint: "https://formspree.io/f/mqedqbqa",

  // Contact email — configured.
  contactEmail: "katythomas96@yahoo.com",

  // REPLACE this placeholder before going live:
  affiliateApplicationUrl: "REPLACE_WITH_AFFILIATE_APPLICATION_URL", // e.g. a Google Form link for promoter applications

  // Referral tracking settings — safe to leave as-is.
  referralStorageKey: "starchart13_referral",
  referralDurationDays: 30
};
