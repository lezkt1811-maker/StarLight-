/* Deterministic facts derived straight from the chart payload the free-chart
   engine already computed. These never depend on the AI and are used two
   ways: (1) fed to Claude as ground truth it must not contradict, and
   (2) used directly to render the Ophiuchus / 13th-house / all-houses
   sections in the PDF, so a signature StarChart13 feature can never be
   silently dropped or fabricated by a prose-generation failure. */

export function deriveChartFacts(payload) {
  const points = payload.points || [];

  const ophiuchusPlacements = points.filter((p) => p.trueSky?.constellation === "Ophiuchus");

  const houseOccupants = {};
  for (let h = 1; h <= 13; h++) houseOccupants[h] = [];
  points.forEach((p) => {
    const h = Number(p.house);
    if (h >= 1 && h <= 13) houseOccupants[h].push(p);
  });

  const house13Occupants = houseOccupants[13] || [];

  const lilithPoint = points.find((p) => p.key === "BlackMoonLilith");
  const evePoint = points.find((p) => p.key === "Eve");

  const aspectGroups = {};
  (payload.aspects || []).forEach((a) => {
    aspectGroups[a.aspect] = aspectGroups[a.aspect] || [];
    aspectGroups[a.aspect].push(a);
  });

  const changedSignPlacements = (payload.tropicalComparison || []).filter((c) => c.changedSign);

  return {
    ascendant: payload.calculation?.ascendant || null,
    midheaven: payload.calculation?.midheaven || null,
    points,
    hasOphiuchus: ophiuchusPlacements.length > 0,
    ophiuchusPlacements,
    houseOccupants,
    house13Occupants,
    hasHouse13Occupants: house13Occupants.length > 0,
    hasLilithOrEve: !!(lilithPoint || evePoint),
    lilithPoint: lilithPoint || null,
    evePoint: evePoint || null,
    aspectGroups,
    changedSignPlacements,
  };
}

export function describeOccupants(occupants) {
  if (!occupants || !occupants.length) return "unoccupied";
  return occupants
    .map((p) => `${p.name}${p.retrograde ? " (Rx)" : ""} in ${p.trueSky.constellation} ${Math.floor(p.trueSky.degree)}°`)
    .join(", ");
}
