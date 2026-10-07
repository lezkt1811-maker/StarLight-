import { deriveChartFacts, describeOccupants } from "./facts.js";

const TOOL_NAME = "write_reading_sections";

/* A missing or corrupted secret makes fetch() throw a bare "Invalid header value"
   with no indication of which header or why -- nearly impossible to diagnose from a
   KV-stored lastError alone, and a plain .trim() only catches corruption at the
   edges of the string, not a stray character/line-break baked into the middle of it
   (confirmed in production: trim() alone did not fix a real failing key). A real
   Anthropic key is only letters, digits, hyphens and underscores, so strip anything
   else from anywhere in the string rather than trying to guess where it is. */
function requireAnthropicKey(env) {
  const raw = env.ANTHROPIC_API_KEY || "";
  const key = raw.replace(/[^A-Za-z0-9_-]/g, "");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (or is empty after removing invalid characters) on this worker — check the Cloudflare secret.");
  if (key.length !== raw.trim().length) {
    console.error(
      `ANTHROPIC_API_KEY contained ${raw.length - key.length} invalid character(s) that were stripped out -- ` +
        `the stored secret is corrupted (not just edge whitespace) and should be re-copied from the Anthropic Console.`
    );
  }
  return key;
}

/* A real order sat stuck in "generating" for 18+ minutes with no error recorded --
   the fetch() to Anthropic had no timeout, so a hung or silent-forever response left
   the order with no success, no failure, no alert, nothing. AbortController guarantees
   this call eventually rejects (which the retry loop and hold-on-failure logic already
   know how to handle) instead of just never resolving. */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Anthropic API call timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* Every section the AI is asked to write. "ophiuchusSection" is added to the
   schema dynamically (see below) — when the chart has no Ophiuchus placement
   we never ask the AI to write about it at all, and use a fixed, honest
   fallback instead. That's a code-level guarantee, not a prompt request. */
const BASE_SECTION_FIELDS = [
  "chartGlance",
  "house13Section",
  "coreSelf",
  "emotionalNature",
  "mindCommunication",
  "loveRelationships",
  "purposeGrowth",
  "outerPlanets",
  "lilithEveAxis",
  "allHousesNarrative",
  "aspectPatterns",
  "tropicalDifferential",
  "integratedSynthesis",
];

/* Calls Claude with the customer's actual chart facts and forces a tool call
   so the response comes back as structured JSON instead of free-form prose
   we'd have to parse. The chart JSON itself is never sent for the AI to
   recompute — only derived, already-calculated facts, and the AI is told
   explicitly not to invent placements beyond them. Throws on any failure —
   the caller (index.js) falls back to deterministic, data-only text. */
export async function generateInterpretation(env, payload) {
  const model = env.CLAUDE_MODEL || "claude-sonnet-5-5";
  const facts = deriveChartFacts(payload);
  const sectionFields = facts.hasOphiuchus
    ? [...BASE_SECTION_FIELDS.slice(0, 1), "ophiuchusSection", ...BASE_SECTION_FIELDS.slice(1)]
    : BASE_SECTION_FIELDS;

  const body = {
    model,
    max_tokens: 6000,
    messages: [
      {
        role: "user",
        content: buildPrompt(payload, facts, sectionFields),
      },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description: "Submit the written sections of the personalized Lilith and Eve Astrology astrology reading.",
        strict: true,
        input_schema: {
          type: "object",
          properties: Object.fromEntries(sectionFields.map((f) => [f, { type: "string" }])),
          required: sectionFields,
          additionalProperties: false,
        },
      },
    ],
    // Claude Sonnet 5.5 (and other 5.x-generation models) reject forced tool_choice
    // ("tool"/"any") outright with a 400 -- confirmed against Anthropic's own docs.
    // "auto" + strict:true on the tool is the supported way to still guarantee
    // schema-valid output; buildPrompt() explicitly tells the model to call the tool
    // so "auto" doesn't just reply with plain text instead.
    tool_choice: { type: "auto" },
  };

  const resp = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": requireAnthropicKey(env),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    },
    55000
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const toolUse = (data.content || []).find(
    (block) => block.type === "tool_use" && block.name === TOOL_NAME
  );
  if (!toolUse) throw new Error("Anthropic response had no tool_use block");

  const sections = toolUse.input;
  for (const field of sectionFields) {
    if (typeof sections[field] !== "string" || !sections[field].trim()) {
      throw new Error(`Anthropic response missing required section "${field}"`);
    }
  }

  // Deterministic override: never trust AI-generated prose for whether Ophiuchus is
  // present. If the chart has no Ophiuchus placement, ignore whatever the model
  // might otherwise have said (we didn't even ask it to write this field) and use a
  // fixed, factually-correct paragraph instead.
  sections.ophiuchusSection = facts.hasOphiuchus
    ? sections.ophiuchusSection
    : fixedNoOphiuchusText();

  return sections;
}

function buildPrompt(payload, facts, sectionFields) {
  const lines = [];
  lines.push(
    "You are writing a personalized Lilith and Eve Astrology astrology reading PDF. Lilith and Eve Astrology uses the real " +
      "13-constellation \"true sky\" system (including Ophiuchus) as its primary chart, with 13 houses, " +
      "and shows a traditional 12-sign tropical comparison alongside it — never the other way around."
  );
  lines.push("");
  lines.push(`Customer name: ${payload.customer?.name || "the customer"}`);
  lines.push("");
  lines.push("=== GROUND TRUTH CHART FACTS (already calculated — do not recompute, do not contradict) ===");
  lines.push(
    `Ascendant: ${facts.ascendant?.constellation || "?"} ${Math.floor(facts.ascendant?.degree || 0)}°`
  );
  lines.push(
    `Midheaven: ${facts.midheaven?.constellation || "?"} ${Math.floor(facts.midheaven?.degree || 0)}°`
  );
  lines.push("");
  lines.push("All placements (true sky / tropical / house):");
  facts.points.forEach((p) => {
    lines.push(
      `- ${p.name}: House ${p.house}, True Sky ${p.trueSky.constellation} ${Math.floor(p.trueSky.degree)}° ` +
        `| Tropical ${p.tropical.sign} ${Math.floor(p.tropical.degree)}°${p.retrograde ? " (Retrograde)" : ""}`
    );
  });
  lines.push("");
  lines.push(
    facts.hasOphiuchus
      ? `Ophiuchus placements in this chart (write section 2 about EXACTLY these, no others): ${describeOccupants(facts.ophiuchusPlacements)}`
      : "This chart has NO placements in Ophiuchus. Do not ask for or write an Ophiuchus section — none is requested below."
  );
  lines.push(
    `13th house occupants (write the dedicated 13th-house section about exactly this): ${describeOccupants(facts.house13Occupants)}`
  );
  lines.push(
    facts.hasLilithOrEve
      ? `Lilith / Eve: ${facts.lilithPoint ? "Black Moon Lilith " + describeOccupants([facts.lilithPoint]) : "Lilith not calculated"}` +
          (facts.evePoint ? `; Eve ${describeOccupants([facts.evePoint])}` : "; Eve not calculated")
      : "Lilith and Eve were not calculated for this chart — write a brief, honest note that this axis isn't available rather than inventing placements."
  );
  lines.push("");
  lines.push("All 13 houses and their occupants (use this exact list for the all-houses section — do not omit or merge houses):");
  for (let h = 1; h <= 13; h++) {
    lines.push(`House ${h}: ${describeOccupants(facts.houseOccupants[h])}`);
  }
  lines.push("");
  lines.push("Aspects, grouped by type:");
  Object.keys(facts.aspectGroups).forEach((aspectName) => {
    const list = facts.aspectGroups[aspectName].map((a) => `${a.point1}-${a.point2} (orb ${a.orb}°)`).join(", ");
    lines.push(`- ${aspectName}: ${list}`);
  });
  lines.push("");
  lines.push(`Placements that changed sign between tropical and true sky (${facts.changedSignPlacements.length}):`);
  facts.changedSignPlacements.forEach((c) => {
    lines.push(`- ${c.point}: Tropical ${c.tropicalSign} -> True Sky ${c.trueSkyConstellation}`);
  });
  lines.push("=== END GROUND TRUTH ===");
  lines.push("");
  lines.push(
    "Write warm, specific, insightful astrological interpretation grounded ONLY in the facts above — " +
      "reference real planets, constellations, and houses from the data, never generic zodiac clichés, " +
      "never a placement not listed above, and never assume a traditional 12-house chart. Clearly distinguish " +
      "Lilith and Eve Astrology's interpretive framework from established astronomical fact where relevant (e.g. Ophiuchus's " +
      "existence as a constellation the ecliptic passes through is astronomy; what it means for someone is " +
      "interpretation). Avoid disclaimers, hedging, or repeating the same paragraph across sections. Write as a " +
      "confident, experienced astrologer."
  );
  lines.push("");
  lines.push(`Call the ${TOOL_NAME} tool now with exactly these fields: ${sectionFields.join(", ")}. Do not respond in plain text — submit your answer only as a call to this tool.`);
  lines.push("Field guide:");
  lines.push("- chartGlance: concise chart summary — Ascendant, Sun, Moon, and the most significant placements.");
  if (sectionFields.includes("ophiuchusSection")) {
    lines.push("- ophiuchusSection: discuss the listed Ophiuchus placement(s) prominently, by exact planet/point and house.");
  }
  lines.push("- house13Section: dedicated section on the 13th house — its sign/area, occupants (or lack of them), and what that means in the Lilith and Eve Astrology framework. Never collapse this into a 12-house chart.");
  lines.push("- coreSelf: Sun, Ascendant, and how the identity placements relate.");
  lines.push("- emotionalNature: Moon, its house, and its aspects.");
  lines.push("- mindCommunication: Mercury — sign, house, major aspects.");
  lines.push("- loveRelationships: Venus and Mars, their houses and major aspects.");
  lines.push("- purposeGrowth: Jupiter, Saturn, Midheaven, and the Nodes.");
  lines.push("- outerPlanets: Uranus, Neptune, Pluto — personalized by house/aspect, not generic generational text.");
  lines.push("- lilithEveAxis: interpret the Lilith/Eve axis using only the facts given above.");
  lines.push("- allHousesNarrative: a flowing overview of all 13 houses, prioritizing occupied/emphasized ones — you may reference the full per-house list, which is also rendered as a table in the PDF.");
  lines.push("- aspectPatterns: group and explain the major aspect patterns rather than listing them.");
  lines.push("- tropicalDifferential: concise — the most meaningful tropical vs. true-sky differences, framed with true-sky as primary.");
  lines.push("- integratedSynthesis: a coherent closing synthesis connecting the major patterns — do not repeat earlier paragraphs.");
  return lines.join("\n");
}

const MINI_TOOL_NAME = "write_mini_reading_sections";
const MINI_SECTION_FIELDS = ["lilithSection", "eveSection", "axisSynthesis"];

/* Short-form counterpart to generateInterpretation() for the $7 "Lilith & Eve
   Placement Reading" — same Claude tool-call pattern, a much smaller schema and
   prompt since this product covers only Black Moon Lilith, Eve, and the axis
   between them (never the full 13-sign chart the $25 reading promises). */
export async function generateMiniInterpretation(env, payload) {
  const model = env.CLAUDE_MODEL || "claude-sonnet-5-5";
  const facts = deriveChartFacts(payload);

  const body = {
    model,
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: buildMiniPrompt(payload, facts),
      },
    ],
    tools: [
      {
        name: MINI_TOOL_NAME,
        description: "Submit the written sections of the personalized Lilith & Eve Placement Reading.",
        strict: true,
        input_schema: {
          type: "object",
          properties: Object.fromEntries(MINI_SECTION_FIELDS.map((f) => [f, { type: "string" }])),
          required: MINI_SECTION_FIELDS,
          additionalProperties: false,
        },
      },
    ],
    // See the matching comment in generateInterpretation() -- forced tool_choice is
    // rejected on this model generation; "auto" + strict:true is the supported fix.
    tool_choice: { type: "auto" },
  };

  const resp = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": requireAnthropicKey(env),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    },
    55000
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const toolUse = (data.content || []).find(
    (block) => block.type === "tool_use" && block.name === MINI_TOOL_NAME
  );
  if (!toolUse) throw new Error("Anthropic response had no tool_use block");

  const sections = toolUse.input;
  for (const field of MINI_SECTION_FIELDS) {
    if (typeof sections[field] !== "string" || !sections[field].trim()) {
      throw new Error(`Anthropic response missing required section "${field}"`);
    }
  }
  return sections;
}

function buildMiniPrompt(payload, facts) {
  const lines = [];
  lines.push(
    "You are writing a short, personalized \"Lilith & Eve Placement Reading\" — a focused " +
      "$7 mini reading from Lilith and Eve Astrology covering only Black Moon Lilith and Eve " +
      "(lunar apogee/perigee interpretive points) in the customer's True-Sky chart."
  );
  lines.push("");
  lines.push(`Customer name: ${payload.customer?.name || "the customer"}`);
  lines.push("");
  lines.push("=== GROUND TRUTH (already calculated — do not recompute, do not contradict) ===");
  lines.push(
    facts.lilithPoint
      ? `Black Moon Lilith: House ${facts.lilithPoint.house}, True Sky ${facts.lilithPoint.trueSky.constellation} ${Math.floor(facts.lilithPoint.trueSky.degree)}°`
      : "Black Moon Lilith: not calculated for this chart."
  );
  lines.push(
    facts.evePoint
      ? `Eve: House ${facts.evePoint.house}, True Sky ${facts.evePoint.trueSky.constellation} ${Math.floor(facts.evePoint.trueSky.degree)}°`
      : "Eve: not calculated for this chart."
  );
  if (facts.ascendant) {
    lines.push(`For context, Ascendant: ${facts.ascendant.constellation} ${Math.floor(facts.ascendant.degree)}°`);
  }
  lines.push("=== END GROUND TRUTH ===");
  lines.push("");
  lines.push(
    "Write warm, specific, insightful interpretation grounded ONLY in the facts above. Never invent " +
      "a placement not listed. Keep this clearly symbolic/astrological interpretation, not scientific " +
      "fact. Avoid disclaimers, hedging, or generic zodiac clichés. Write as a confident, experienced " +
      "astrologer."
  );
  lines.push("");
  lines.push(`Call the ${MINI_TOOL_NAME} tool now with exactly these fields: ${MINI_SECTION_FIELDS.join(", ")}. Do not respond in plain text — submit your answer only as a call to this tool.`);
  lines.push("Field guide:");
  lines.push("- lilithSection: 2-3 sentences on this person's Black Moon Lilith placement (sign, house) and what it means for autonomy, instinct, and what they refuse to suppress.");
  lines.push("- eveSection: 2-3 sentences on this person's Eve placement (sign, house) and what it means for embodiment, closeness, and intimacy.");
  lines.push("- axisSynthesis: 2-3 sentences tying Lilith and Eve together as a polarity in this specific chart — how this person might balance autonomy and connection.");
  return lines.join("\n");
}

function fixedNoOphiuchusText() {
  return (
    "None of your calculated placements fall within Ophiuchus this time — your Sun, Moon, Ascendant, and " +
    "other points land in the twelve more commonly recognized true-sky constellations. Ophiuchus is real " +
    "astronomical territory the ecliptic passes through, and Lilith and Eve Astrology always checks for it, but it simply " +
    "isn't part of your personal signature. That doesn't make your chart less \"true sky\" — every placement " +
    "here still reflects the sky's real constellation boundaries rather than the older 12-sign approximation."
  );
}
