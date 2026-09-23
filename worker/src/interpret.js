const TOOL_NAME = "write_reading_sections";

const SECTION_FIELDS = [
  "chartSignature",
  "coreIdentity",
  "planetarySynthesis",
  "lilithEveAxis",
  "majorAspectsNarrative",
  "loveRelationships",
  "purposeWorkCreation",
  "integratedMessage",
];

/* Calls Claude with the customer's actual chart data and forces a tool call
   so the response comes back as structured JSON instead of free-form prose
   we'd have to parse. Throws on any failure — the caller decides the fallback. */
export async function generateInterpretation(env, payload) {
  const model = env.CLAUDE_MODEL || "claude-sonnet-5";
  const chartSummary = summarizeChartForPrompt(payload);

  const body = {
    model,
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content:
          "You are writing a personalized StarChart13 astrology reading PDF. StarChart13 uses the real " +
          "13-constellation \"true sky\" system (including Ophiuchus) rather than the traditional 12-sign " +
          "tropical zodiac, and shows both side by side.\n\n" +
          "Customer name: " + (payload.customer?.name || "the customer") + "\n\n" +
          "Chart data (true-sky placements, houses, aspects, and tropical comparison):\n" +
          chartSummary + "\n\n" +
          "Write warm, specific, insightful astrological interpretation grounded in the actual placements " +
          "above — reference real planets, constellations, and houses from the data, not generic zodiac " +
          "clichés. Avoid disclaimers or hedging language; write as a confident, experienced astrologer. " +
          "Call the write_reading_sections tool with your text for each section (lilithEveAxis can be a short " +
          "note if Lilith/Eve placements aren't emphasized in the data).",
      },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description: "Submit the written sections of the personalized astrology reading.",
        input_schema: {
          type: "object",
          properties: Object.fromEntries(SECTION_FIELDS.map((f) => [f, { type: "string" }])),
          required: SECTION_FIELDS,
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
  return toolUse.input;
}

function summarizeChartForPrompt(payload) {
  const lines = [];
  const asc = payload.calculation?.ascendant;
  const mc = payload.calculation?.midheaven;
  lines.push(`Ascendant: ${asc?.constellation || "?"} ${Math.floor(asc?.degree || 0)}°`);
  lines.push(`Midheaven: ${mc?.constellation || "?"} ${Math.floor(mc?.degree || 0)}°`);
  lines.push("");
  lines.push("Placements (true sky / tropical):");
  (payload.points || []).forEach((p) => {
    lines.push(
      `- ${p.name}: House ${p.house}, True Sky ${p.trueSky.constellation} ${Math.floor(p.trueSky.degree)}° ` +
        `| Tropical ${p.tropical.sign} ${Math.floor(p.tropical.degree)}°${p.retrograde ? " (Retrograde)" : ""}`
    );
  });
  lines.push("");
  lines.push("Major aspects:");
  (payload.aspects || []).slice(0, 25).forEach((a) => {
    lines.push(`- ${a.point1} ${a.aspect} ${a.point2} (orb ${a.orb}°)`);
  });
  const changed = (payload.tropicalComparison || []).filter((c) => c.changedSign);
  lines.push("");
  lines.push(`Placements that changed sign between tropical and true sky (${changed.length}):`);
  changed.forEach((c) => {
    lines.push(`- ${c.point}: Tropical ${c.tropicalSign} -> True Sky ${c.trueSkyConstellation}`);
  });
  return lines.join("\n");
}
