// StarChart13 — Reading Sales & Referral Configuration
// This is the ONLY place these values should be edited.
// index.html and thank-you.html both load this file, so a change here updates both pages.
//
// After editing, commit this file directly on GitHub (see the setup instructions
// you were given alongside this file for exact steps).

const READING_SALES_CONFIG = {
  price: 25,
  priceDisplay: "$25",

  // Your Cash App info — already filled in.
  cashAppCashtag: "$StarFort13",
  cashAppPaymentUrl: "https://cash.app/$StarFort13",

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
