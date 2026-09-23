import { deriveChartFacts, describeOccupants } from "./facts.js";

const TOOL_NAME = "write_reading_sections";

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
  const model = env.CLAUDE_MODEL || "claude-sonnet-5";
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
        description: "Submit the written sections of the personalized StarChart13 astrology reading.",
        input_schema: {
          type: "object",
          properties: Object.fromEntries(sectionFields.map((f) => [f, { type: "string" }])),
          required: sectionFields,
        },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
  };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

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
    "You are writing a personalized StarChart13 astrology reading PDF. StarChart13 uses the real " +
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
      "StarChart13's interpretive framework from established astronomical fact where relevant (e.g. Ophiuchus's " +
      "existence as a constellation the ecliptic passes through is astronomy; what it means for someone is " +
      "interpretation). Avoid disclaimers, hedging, or repeating the same paragraph across sections. Write as a " +
      "confident, experienced astrologer."
  );
  lines.push("");
  lines.push(`Call the ${TOOL_NAME} tool with exactly these fields: ${sectionFields.join(", ")}.`);
  lines.push("Field guide:");
  lines.push("- chartGlance: concise chart summary — Ascendant, Sun, Moon, and the most significant placements.");
  if (sectionFields.includes("ophiuchusSection")) {
    lines.push("- ophiuchusSection: discuss the listed Ophiuchus placement(s) prominently, by exact planet/point and house.");
  }
  lines.push("- house13Section: dedicated section on the 13th house — its sign/area, occupants (or lack of them), and what that means in the StarChart13 framework. Never collapse this into a 12-house chart.");
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

function fixedNoOphiuchusText() {
  return (
    "None of your calculated placements fall within Ophiuchus this time — your Sun, Moon, Ascendant, and " +
    "other points land in the twelve more commonly recognized true-sky constellations. Ophiuchus is real " +
    "astronomical territory the ecliptic passes through, and StarChart13 always checks for it, but it simply " +
    "isn't part of your personal signature. That doesn't make your chart less \"true sky\" — every placement " +
    "here still reflects the sky's real constellation boundaries rather than the older 12-sign approximation."
  );
}
