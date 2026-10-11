import { deriveChartFacts, describeOccupants, describeStelliums } from "./facts.js";
import { fetchWithTimeout } from "./http.js";

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

/* Every section the AI is asked to write. "ophiuchusSection" is added to the
   schema dynamically (see below) — when the chart has no Ophiuchus placement
   we never ask the AI to write about it at all, and use a fixed, honest
   fallback instead. That's a code-level guarantee, not a prompt request.
   Every planet/point gets its own dedicated field rather than being grouped
   with others (e.g. Sun and Ascendant used to share one "coreSelf" field) —
   each one covers that single point's constellation placement AND what its
   house means for this chart, never two points folded into one paragraph. */
const BASE_SECTION_FIELDS = [
  "chartGlance",
  "house13Section",
  "sunSection",
  "ascendantSection",
  "moonSection",
  "mercurySection",
  "venusSection",
  "marsSection",
  "jupiterSection",
  "saturnSection",
  "northNodeSection",
  "southNodeSection",
  "midheavenSection",
  "uranusSection",
  "neptuneSection",
  "plutoSection",
  "chironSection",
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
    // Splitting the old grouped sections (e.g. "coreSelf" covering Sun+Ascendant)
    // into one field per planet/point roughly doubled the field count (13 -> 22+),
    // so the budget that used to cover 13 longer sections now needs to cover more,
    // shorter ones. 16000 previously replaced a 6000 budget that was cutting the
    // response off mid-way; bumping again rather than risking the same truncation
    // with twice as many required fields. Anthropic's own guidance for a
    // non-streaming request like this one is to default generously rather than
    // lowball it.
    max_tokens: 20000,
    messages: [
      {
        role: "user",
        content: buildPrompt(payload, facts, sectionFields),
      },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description: "Submit the written sections of the personalized Star Chart 13 astrology reading.",
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
    // Processing now runs on the Cron Trigger (15-minute wall-clock budget), not
    // inside the webhook's waitUntil -- so there's real room here. 55s was sized for
    // the old constraint and risked timing out a response that's legitimately still
    // writing with the larger max_tokens above, not actually hung.
    170000
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
    "You are writing a personalized Star Chart 13 astrology reading PDF. Star Chart 13 uses the real " +
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
  lines.push(`Stelliums (3+ points sharing a house or true-sky sign): ${describeStelliums(facts.stelliums)}`);
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
      "Star Chart 13's interpretive framework from established astronomical fact where relevant (e.g. Ophiuchus's " +
      "existence as a constellation the ecliptic passes through is astronomy; what it means for someone is " +
      "interpretation). Avoid disclaimers, hedging, or repeating the same paragraph across sections — each planet " +
      "or point gets its own section below and must stand on its own, never folded into another point's section. " +
      "Write as a confident, experienced astrologer. Separate paragraphs within a field with a blank line (two " +
      "newlines). This is a formatting instruction only; it doesn't change what you say, just how it's broken up " +
      "for readability. Default to 1-2 focused paragraphs for a single-planet/point section and 2-4 for the " +
      "broader overview sections noted below — longer than that per point is padding, not depth."
  );
  lines.push("");
  lines.push(`Call the ${TOOL_NAME} tool now with exactly these fields: ${sectionFields.join(", ")}. Do not respond in plain text — submit your answer only as a call to this tool.`);
  lines.push("Field guide:");
  lines.push("- chartGlance (2-4 paragraphs): concise chart summary — Ascendant, Sun, Moon, and the most significant placements. If any stelliums are listed above, name them explicitly here (which points, which house or sign, and what that concentration of energy means) — never invent one if none is listed.");
  if (sectionFields.includes("ophiuchusSection")) {
    lines.push("- ophiuchusSection: discuss the listed Ophiuchus placement(s) prominently, by exact planet/point and house.");
  }
  lines.push("- house13Section (2-4 paragraphs): dedicated section on the 13th house — its sign/area, occupants (or lack of them), and what that means in the Star Chart 13 framework. Never collapse this into a 12-house chart.");
  lines.push("- sunSection: the Sun's true-sky constellation placement and what living through ITS house means for this person's core identity. Sun only — do not discuss the Ascendant here.");
  lines.push("- ascendantSection: the Ascendant's true-sky constellation and what it means for this person's outward expression and first impression. Ascendant only — do not repeat the Sun section.");
  lines.push("- moonSection: the Moon's constellation, its house, and its major aspects — emotional nature.");
  lines.push("- mercurySection: Mercury's constellation, its house, and its major aspects — mind and communication style.");
  lines.push("- venusSection: Venus's constellation and house — love, values, and attraction. Venus only — do not discuss Mars here.");
  lines.push("- marsSection: Mars's constellation and house — drive, assertion, and desire. Mars only — do not repeat the Venus section.");
  lines.push("- jupiterSection: Jupiter's constellation and house — growth, luck, and expansion. Jupiter only.");
  lines.push("- saturnSection: Saturn's constellation and house — discipline, responsibility, and lessons. Saturn only — do not repeat the Jupiter section.");
  lines.push("- northNodeSection: the North Node's constellation and house — the growth direction this person is being pulled toward.");
  lines.push("- southNodeSection: the South Node's constellation and house — the innate pattern or comfort zone this person is moving away from. Do not just restate the North Node section as its opposite; give it its own grounded description.");
  lines.push("- midheavenSection: the Midheaven's constellation — public reputation, career direction, and the role this person is built to be seen in.");
  lines.push("- uranusSection: Uranus personalized by this chart's specific house and aspects — not generic generational text. Uranus only.");
  lines.push("- neptuneSection: Neptune personalized by this chart's specific house and aspects — dreams, intuition, illusion. Neptune only — do not repeat the Uranus section.");
  lines.push("- plutoSection: Pluto personalized by this chart's specific house and aspects — transformation and power. Pluto only — do not repeat the Uranus or Neptune sections.");
  lines.push("- chironSection: Chiron's constellation and house — the \"wounded healer\" placement: the core wound this points to and the gift that comes from working with it.");
  lines.push("- lilithEveAxis (4-6 paragraphs): this is a signature section customers specifically pay for — write a longer, more in-depth exploration than the other sections, covering Black Moon Lilith's placement, Eve's placement, and how the polarity between them plays out in this specific chart, using only the facts given above.");
  lines.push("- allHousesNarrative (2-4 paragraphs): a flowing overview of all 13 houses, prioritizing occupied/emphasized ones — you may reference the full per-house list, which is also rendered as a table in the PDF.");
  lines.push("- aspectPatterns (2-4 paragraphs): group and explain the major aspect patterns rather than listing them.");
  lines.push("- tropicalDifferential (2-4 paragraphs): concise — the most meaningful tropical vs. true-sky differences, framed with true-sky as primary.");
  lines.push("- integratedSynthesis (2-4 paragraphs): a coherent closing synthesis connecting the major patterns across every section above — do not repeat earlier paragraphs.");
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
    max_tokens: 6000,
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
    // Smaller max_tokens than the full reading, but still generous now that
    // processing runs on the Cron Trigger rather than inside webhook waitUntil.
    90000
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
    "You are writing a personalized \"Lilith & Eve Placement Reading\" — a focused " +
      "$7 reading from Star Chart 13 covering only Black Moon Lilith and Eve " +
      "(lunar apogee/perigee interpretive points) in the customer's True-Sky chart, in real depth."
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
  lines.push("- lilithSection: 2-3 full paragraphs on this person's Black Moon Lilith placement (sign, house) and what it means for autonomy, instinct, and what they refuse to suppress.");
  lines.push("- eveSection: 2-3 full paragraphs on this person's Eve placement (sign, house) and what it means for embodiment, closeness, and intimacy.");
  lines.push("- axisSynthesis: 1-2 full paragraphs tying Lilith and Eve together as a polarity in this specific chart — how this person might balance autonomy and connection.");
  lines.push("Within each field, separate paragraphs with a blank line (two newlines). This is a formatting instruction only.");
  return lines.join("\n");
}

function fixedNoOphiuchusText() {
  return (
    "None of your calculated placements fall within Ophiuchus this time — your Sun, Moon, Ascendant, and " +
    "other points land in the twelve more commonly recognized true-sky constellations. Ophiuchus is real " +
    "astronomical territory the ecliptic passes through, and Star Chart 13 always checks for it, but it simply " +
    "isn't part of your personal signature. That doesn't make your chart less \"true sky\" — every placement " +
    "here still reflects the sky's real constellation boundaries rather than the older 12-sign approximation."
  );
}
