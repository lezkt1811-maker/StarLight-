/* ============================================================================
   sc13Compare : "Tropical vs True Sky 13" comparison tool
   ----------------------------------------------------------------------------
   This file is 100% additive. It does NOT redefine or alter any existing
   StarChart13 function, constant, or DOM id. Every new name is prefixed
   sc13Compare / sc13CompareCanvas etc.

   It reuses, unchanged, these existing globals defined in index.html's main
   inline <script>:
     mod, D2R, R2D, eclToCW, GLYPHS, PLANET_COLOR, SACRED_LABELS,
     tzConv, getEcl, isRetrograde, getNorthNode, getChiron, getAsc, getMC,
     isDayBirth, getSacredLunarPoints, getPartOfFortune, getPartOfSpirit,
     signOf, houseOfCW, IAU, KIM_HW, packAnglesOnRing, drawEveGlyph,
     parseTimeInput

   THE CORE RULE THIS FILE OBEYS:
   Calculate the sky once (sc13CompareComputeRaw), then interpret those same
   raw ecliptic longitudes through two zodiac maps (tropical + true-sky-13).
   Nothing here calls a second astrology source or recomputes with different
   inputs for the two columns.
============================================================================ */

/* ---------------- Tropical zodiac constants (namespaced, untouched IAU) --- */
var sc13CompareTropicalSigns = [
  {n:"Aries",s:"♈"},{n:"Taurus",s:"♉"},{n:"Gemini",s:"♊"},{n:"Cancer",s:"♋"},
  {n:"Leo",s:"♌"},{n:"Virgo",s:"♍"},{n:"Libra",s:"♎"},{n:"Scorpio",s:"♏"},
  {n:"Sagittarius",s:"♐"},{n:"Capricorn",s:"♑"},{n:"Aquarius",s:"♒"},{n:"Pisces",s:"♓"}
];

/* Same rainbow-per-sign palette the wheel already uses for the true-sky ring,
   reused here for the comparison table's True Sky 13 column so the colors in
   the table visually match the colors in the wheel above it. */
var sc13CompareTrueSkyColors = ["#ff0000","#ff5500","#ffaa00","#ffdd00","#aaff00","#00ff44","#00ffaa","#00ddff","#0088ff","#4488ff","#6600ff","#aa00ff","#ff00aa"];
var sc13CompareTrueSkyColorMap = {};
(function(){ for(var i=0;i<IAU.length;i++){ sc13CompareTrueSkyColorMap[IAU[i].n] = sc13CompareTrueSkyColors[i]; } })();

/* Gold-family palette for the Tropical column (12 signs, alternating shades
   of gold so signs are still distinguishable, but stay in the "calmer,
   traditional" register that matches the tropical panel's gold border). */
var sc13CompareTropicalColors = ["#ffd700","#ffb347","#ffe066","#e8b400","#ffcf40","#f4a300","#ffdd55","#e0a800","#ffce3d","#f2b705","#ffe28a","#e6b800"];
var sc13CompareTropicalColorMap = {};
(function(){ for(var i=0;i<sc13CompareTropicalSigns.length;i++){ sc13CompareTropicalColorMap[sc13CompareTropicalSigns[i].n] = sc13CompareTropicalColors[i]; } })();

function sc13CompareTropicalSignOf(lon){
  var l = mod(lon);
  var idx = Math.floor(l/30);
  if(idx>11) idx = 11;
  return { sg: sc13CompareTropicalSigns[idx], d: l % 30, idx: idx };
}

/* Equal-house system: 12 x 30° houses measured clockwise from the Ascendant.
   This is the standard, simplest 12-house analog to the tropical zodiac's
   equal 30° signs, and keeps house math independent of a Placidus-style
   engine that this site does not implement. */
function sc13CompareTropicalHouseOfCW(cw){
  var h = Math.floor(mod(cw)/30) + 1;
  if(h > 12) h = 12;
  return h;
}

var sc13ComparePlacementDefs = [
  {key:"Ascendant", name:"Ascendant"},
  {key:"Sun", name:"Sun"},
  {key:"Moon", name:"Moon"},
  {key:"Mercury", name:"Mercury"},
  {key:"Venus", name:"Venus"},
  {key:"Mars", name:"Mars"},
  {key:"Jupiter", name:"Jupiter"},
  {key:"Saturn", name:"Saturn"},
  {key:"Uranus", name:"Uranus"},
  {key:"Neptune", name:"Neptune"},
  {key:"Pluto", name:"Pluto"},
  {key:"Chiron", name:"Chiron"},
  {key:"NorthNode", name:"North Node"},
  {key:"SouthNode", name:"South Node"},
  {key:"BlackMoonLilith", name:"Black Moon Lilith"},
  {key:"Eve", name:"Eve"},
  {key:"PartOfFortune", name:"Part of Fortune"},
  {key:"PartOfSpirit", name:"Part of Spirit"},
  {key:"MC", name:"Midheaven"}
];

window.sc13CompareData = null;

function sc13CompareGetBirthData(){
  var name = (document.getElementById("iName").value || "").trim();
  var city = (document.getElementById("cityInput").value || "").trim();
  var ds = document.getElementById("iDate").value;
  if(!ds) throw new Error("Please enter a birth date first.");
  parseTimeInput();
  var hh = +(document.getElementById("iHour").value) || 0;
  var mm = +(document.getElementById("iMin").value) || 0;
  var lat = parseFloat(document.getElementById("iLat").value);
  var lon = parseFloat(document.getElementById("iLon").value);
  var tz = document.getElementById("iTz").value.trim();
  if(isNaN(lat) || isNaN(lon)) throw new Error("Select your city from the dropdown first.");
  if(!tz) throw new Error("Timezone missing — tap 'Use Device Timezone'.");
  var parts = ds.split("-").map(Number);
  return { name:name, city:city, ds:ds, hh:hh, mm:mm, lat:lat, lon:lon, tz:tz, y:parts[0], m:parts[1], d:parts[2] };
}

/* Calculate every raw ecliptic longitude ONCE using the site's existing
   astronomy engine. This object is the single source of truth both zodiac
   maps are built from below. */
function sc13CompareComputeRaw(birth){
  var A = window.Astronomy;
  if(!A) throw new Error("Astronomy Engine still loading...");
  var tz = tzConv(birth.tz, birth.y, birth.m, birth.d, birth.hh, birth.mm);
  var time = A.MakeTime(tz.utc);

  var planetNames = ["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto"];
  var raw = {};
  planetNames.forEach(function(n){ raw[n] = { lon:getEcl(n,time), rx:isRetrograde(n,time) }; });

  var nnLon = getNorthNode(time);
  raw.NorthNode = { lon:nnLon, rx:true };
  raw.SouthNode = { lon:mod(nnLon+180), rx:true };

  var chironLon = getChiron(time);
  raw.Chiron = { lon:chironLon, rx:isRetrograde("Chiron",time) };

  var ascData = getAsc(time, birth.lat, birth.lon);
  var ascLon = ascData.ascLon;
  var mcLon = getMC(time, birth.lon);
  raw.Ascendant = { lon:ascLon, rx:false };
  raw.MC = { lon:mcLon, rx:false };

  var dayBirth = isDayBirth(time, birth.lat, birth.lon);
  var sacred = getSacredLunarPoints(time);
  raw.BlackMoonLilith = { lon:sacred.apogeeLon, rx:false };
  raw.Eve = { lon:sacred.perigeeLon, rx:false };

  var fortuneLon = getPartOfFortune(ascLon, raw.Sun.lon, raw.Moon.lon, dayBirth);
  var spiritLon = getPartOfSpirit(ascLon, raw.Sun.lon, raw.Moon.lon, dayBirth);
  raw.PartOfFortune = { lon:fortuneLon, rx:false };
  raw.PartOfSpirit = { lon:spiritLon, rx:false };

  return { time:time, utc:tz.utc, offH:tz.offH, ascLon:ascLon, mcLon:mcLon, raw:raw };
}

function sc13CompareBuildPlacements(raw, ascLon){
  return sc13ComparePlacementDefs.map(function(def){
    var r = raw[def.key];
    var lonV = r.lon;
    var cw = eclToCW(lonV, ascLon);

    var trop = sc13CompareTropicalSignOf(lonV);
    var tropHouse = sc13CompareTropicalHouseOfCW(cw);

    var ts = signOf(lonV);
    var tsHouse = houseOfCW(cw);

    return {
      key: def.key,
      name: def.name,
      symbol: GLYPHS[def.key] || "",
      rawLongitude: lonV,
      retrograde: !!r.rx,
      tropicalSign: trop.sg.n,
      tropicalSymbol: trop.sg.s,
      tropicalDegree: trop.d,
      tropicalHouse: tropHouse,
      trueSkySign: ts.sg.n,
      trueSkySymbol: ts.sg.s,
      trueSkyDegree: ts.d,
      trueSkyHouse: tsHouse,
      isOphiuchus: ts.sg.n === "Ophiuchus"
    };
  });
}

function sc13CompareOpen(){
  document.getElementById("sc13CompareSection").style.display = "block";
  document.getElementById("sc13CompareSection").scrollIntoView({behavior:"smooth", block:"start"});
  sc13CompareGenerate();
}

function sc13CompareGenerate(){
  var statusEl = document.getElementById("sc13CompareStatus");
  try{
    var birth = sc13CompareGetBirthData();
    var core = sc13CompareComputeRaw(birth);
    var placements = sc13CompareBuildPlacements(core.raw, core.ascLon);

    var differences = placements.filter(function(p){
      return p.tropicalSign !== p.trueSkySign || p.tropicalHouse !== p.trueSkyHouse;
    }).map(function(p){ return p.key; });

    window.sc13CompareData = {
      birthData: birth,
      rawPositions: core.raw,
      tropical: { angles:{asc:core.ascLon, mc:core.mcLon}, placements: placements, houses: [] },
      trueSky13: { angles:{asc:core.ascLon, mc:core.mcLon}, placements: placements, houses: [] },
      differences: differences
    };

    sc13CompareDrawWheel("cvTropical", core.ascLon, core.mcLon, placements, "tropical");
    sc13CompareDrawWheel("cvTrueSky", core.ascLon, core.mcLon, placements, "truesky");

    sc13CompareRenderBig3(placements);
    sc13CompareRenderTable();
    sc13CompareRenderSummary(placements);

    var birthLine = (birth.name || "Chart") + " · " + birth.city + " · " + birth.ds + " " +
      String(birth.hh).padStart(2,"0") + ":" + String(birth.mm).padStart(2,"0");
    document.getElementById("sc13CompareBirthLine").textContent = birthLine;

    if(statusEl){ statusEl.textContent = "✅ Both charts generated from the same sky data."; statusEl.className = "status st-ok"; }
  }catch(e){
    console.error(e);
    if(statusEl){ statusEl.textContent = "❌ " + e.message; statusEl.className = "status st-err"; }
  }
}

/* ------------------------------- Big 3 ----------------------------------- */
function sc13CompareRenderBig3(placements){
  var byKey = {}; placements.forEach(function(p){ byKey[p.key]=p; });
  function row(label, sign){ return '<div class="row"><span>'+label+'</span><span>'+sign+'</span></div>'; }
  var trop = byKey;
  document.getElementById("sc13CompareBig3Tropical").innerHTML =
    row("☉ Sun", trop.Sun.tropicalSign) + row("☽ Moon", trop.Moon.tropicalSign) + row("↑ Rising", trop.Ascendant.tropicalSign);
  document.getElementById("sc13CompareBig3TrueSky").innerHTML =
    row("☉ Sun", trop.Sun.trueSkySign) + row("☽ Moon", trop.Moon.trueSkySign) + row("↑ Rising", trop.Ascendant.trueSkySign);
}

/* ---------------------------- Comparison table ---------------------------- */
function sc13CompareFmt(sign, deg, house, isOphi){
  var d = Math.floor(deg);
  return sign + " " + d + "° · House " + house;
}

function sc13CompareRenderTable(){
  var data = window.sc13CompareData;
  if(!data) return;
  var placements = data.tropical.placements;
  var changedOnly = document.getElementById("sc13CompareChangedOnly").checked;
  var body = document.getElementById("sc13CompareTableBody");
  var rows = "";
  placements.forEach(function(p){
    var changed = (p.tropicalSign !== p.trueSkySign) || (p.tropicalHouse !== p.trueSkyHouse);
    if(changedOnly && !changed) return;

    var tropColor = sc13CompareTropicalColorMap[p.tropicalSign] || "#ffd700";
    var trueColor = sc13CompareTrueSkyColorMap[p.trueSkySign] || "#00e5ff";
    var trueClass = p.isOphiuchus ? "sc13Compare-trueCell sc13Compare-ophi" : "sc13Compare-trueCell";

    rows += '<tr class="' + (changed ? "sc13Compare-rowChanged" : "") + '">' +
      '<td class="sc13Compare-placementCell">' + p.name + '</td>' +
      '<td class="sc13Compare-tropCell" style="color:' + tropColor + '">' + sc13CompareFmt(p.tropicalSign, p.tropicalDegree, p.tropicalHouse) + '</td>' +
      '<td class="' + trueClass + '" style="color:' + trueColor + '">' + sc13CompareFmt(p.trueSkySign, p.trueSkyDegree, p.trueSkyHouse) + '</td>' +
      '</tr>';
  });
  if(!rows){
    rows = '<tr><td colspan="3" style="text-align:center;color:rgba(234,231,255,.5);padding:16px;">No changed placements to show — untoggle "changed only" to see everything.</td></tr>';
  }
  body.innerHTML = rows;
}

/* ----------------------------- Summary text -------------------------------- */
function sc13CompareRenderSummary(placements){
  var byKey = {}; placements.forEach(function(p){ byKey[p.key]=p; });
  var lines = [];
  function line(p, label){
    if(p.tropicalSign === p.trueSkySign){
      lines.push("Your " + label + " remains in " + p.tropicalSign + " in both systems.");
    } else {
      lines.push("Your " + label + " changes from " + p.tropicalSign + " to " + p.trueSkySign + (p.isOphiuchus ? " (Ophiuchus)" : "") + ".");
    }
  }
  line(byKey.Sun, "Sun");
  line(byKey.Moon, "Moon");
  line(byKey.Ascendant, "Ascendant");
  if(byKey.Eve.tropicalSign !== byKey.Eve.trueSkySign){
    lines.push("Eve moves from " + byKey.Eve.tropicalSign + " to " + byKey.Eve.trueSkySign + ".");
  } else {
    lines.push("Eve remains in " + byKey.Eve.tropicalSign + " in both systems.");
  }
  var changedCount = placements.filter(function(p){ return p.tropicalSign !== p.trueSkySign || p.tropicalHouse !== p.trueSkyHouse; }).length;
  lines.push(changedCount + " of " + placements.length + " placements shift sign or house between the two zodiac maps.");
  lines.push("This is a comparison between two zodiac frameworks applied to the same sky data — not a claim that either one is scientifically proven to determine personality.");
  document.getElementById("sc13CompareSummary").innerHTML = lines.map(function(l){ return "<div>" + l + "</div>"; }).join("");
}

/* ------------------------------ Full view toggle --------------------------- */
function sc13CompareToggleFull(){
  document.getElementById("sc13CompareSection").classList.toggle("sc13Compare-full");
  sc13CompareDrawWheel("cvTropical", window.sc13CompareData.tropical.angles.asc, window.sc13CompareData.tropical.angles.mc, window.sc13CompareData.tropical.placements, "tropical");
  sc13CompareDrawWheel("cvTrueSky", window.sc13CompareData.tropical.angles.asc, window.sc13CompareData.tropical.angles.mc, window.sc13CompareData.tropical.placements, "truesky");
}

function sc13CompareBackToSingle(){
  document.getElementById("sc13CompareSection").style.display = "none";
  document.getElementById("wheelRow").scrollIntoView({behavior:"smooth", block:"start"});
}

/* --------------------------------- Copy ------------------------------------ */
function sc13CompareCopyText(){
  var data = window.sc13CompareData;
  if(!data) return;
  var b = data.birthData;
  var lines = [];
  lines.push("TROPICAL vs 13-SIGN TRUE SKY — " + (b.name || "Chart"));
  lines.push(b.city + " · " + b.ds + " " + String(b.hh).padStart(2,"0") + ":" + String(b.mm).padStart(2,"0"));
  lines.push("");
  data.tropical.placements.forEach(function(p){
    lines.push(p.name + ": Tropical " + sc13CompareFmt(p.tropicalSign,p.tropicalDegree,p.tropicalHouse) + " | True Sky 13 " + sc13CompareFmt(p.trueSkySign,p.trueSkyDegree,p.trueSkyHouse));
  });
  lines.push("");
  lines.push("The planets stayed in the same sky. The zodiac map changed.");
  lines.push("StarChart13.com");
  var text = lines.join("\n");
  var statusEl = document.getElementById("sc13CompareStatus");
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){
      if(statusEl){ statusEl.textContent = "✅ Comparison copied to clipboard."; statusEl.className = "status st-ok"; }
    }).catch(function(){
      if(statusEl){ statusEl.textContent = "❌ Copy failed — select and copy manually."; statusEl.className = "status st-err"; }
    });
  }
}

/* ------------------------------ Wheel renderer ------------------------------
   A generic wheel drawer built in the same visual language as the site's
   existing draw() function (dark background, neon glyphs, house ring, sign
   ring), reused for BOTH the tropical and true-sky panels by switching which
   sign list / house-width list it draws. It is intentionally namespaced and
   separate from draw()/cv so the original single-chart generator is untouched.
------------------------------------------------------------------------------ */
function sc13CompareDrawWheel(canvasId, ascLon, mcLon, placements, mode){
  var cv = document.getElementById(canvasId);
  var box = cv.parentElement;
  var dpr = Math.min(3, window.devicePixelRatio || 1);
  var css = box.clientWidth || 480;
  cv.style.width = css + "px";
  cv.style.height = css + "px";
  cv.width = Math.round(css*dpr);
  cv.height = Math.round(css*dpr);
  var ctx = cv.getContext("2d");
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr,dpr);
  var W = css, cx = W/2, cy = W/2;
  var ca = function(cw){ return Math.PI - cw*(Math.PI/180); };
  ctx.clearRect(0,0,W,W);
  ctx.fillStyle = "#000"; ctx.fillRect(0,0,W,W);

  var Rmax = W*0.34, houseTh = W*0.032, RhO = Rmax, RhI = Rmax-houseTh;
  var constTh = W*0.11, RcO = RhI, RcI = RhI - constTh, Rin = RcI*0.95;

  var isTropical = mode === "tropical";
  var signs = isTropical ? sc13CompareTropicalSigns.map(function(s,i){ return {n:s.n,s:s.s,lo:i*30,span:30}; }) : IAU;
  var houseWidths = isTropical ? [30,30,30,30,30,30,30,30,30,30,30,30] : KIM_HW;
  var houseCount = houseWidths.length;
  var ringColor = isTropical ? "#ffd700" : "#ff2bd6";

  var HCOLt = ["#7a5b00","#5c4400","#7a5b00","#5c4400","#7a5b00","#5c4400","#7a5b00","#5c4400","#7a5b00","#5c4400","#7a5b00","#5c4400"];
  var HCOLs = ["#ff2bd6","#ff7a00","#ff0000","#00ff00","#005bff","#7c4dff","#ffe600","#ff7a00","#ff0000","#00ff00","#005bff","#7c4dff","#ffe600"];
  var HCOL = isTropical ? HCOLt : HCOLs;

  var hS = 0;
  for(var hi=0; hi<houseCount; hi++){
    var hw = houseWidths[hi];
    var a1 = ca(hS), a2 = ca(hS+hw);
    ctx.beginPath(); ctx.arc(cx,cy,RhO,a1,a2,true); ctx.arc(cx,cy,RhI,a2,a1,false); ctx.closePath();
    ctx.fillStyle = HCOL[hi % HCOL.length]; ctx.globalAlpha = isTropical ? 0.85 : 0.92; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(cx+Math.cos(a1)*RhI,cy+Math.sin(a1)*RhI); ctx.lineTo(cx+Math.cos(a1)*RhO,cy+Math.sin(a1)*RhO);
    ctx.strokeStyle="rgba(0,0,0,.85)"; ctx.lineWidth=1.1; ctx.stroke();
    var hm = hS+hw/2; var ang = ca(hm); var pr=(RhO+RhI)/2;
    var hx = cx+Math.cos(ang)*pr, hy=cy+Math.sin(ang)*pr;
    ctx.font = "900 "+(W/55)+"px Arial Black,Arial"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.lineWidth=1; ctx.strokeStyle="rgba(0,0,0,.75)"; ctx.strokeText(String(hi+1),hx,hy);
    ctx.fillStyle = "#fff"; ctx.fillText(String(hi+1),hx,hy);
    hS += hw;
  }
  [RhO,RhI].forEach(function(r){ ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.strokeStyle="rgba(255,255,255,.35)"; ctx.lineWidth=1.5; ctx.stroke(); });

  for(var ci=0; ci<signs.length; ci++){
    var sg = signs[ci];
    var cwS = eclToCW(sg.lo, ascLon), cwE = eclToCW(mod(sg.lo+sg.span), ascLon);
    var a1b=ca(cwS), a2b=ca(cwE);
    ctx.beginPath(); ctx.arc(cx,cy,RcO,a1b,a2b,true); ctx.arc(cx,cy,RcI,a2b,a1b,false); ctx.closePath();
    ctx.fillStyle="#000"; ctx.fill();
    ctx.strokeStyle = sg.n==="Ophiuchus" ? "rgba(255,43,214,.9)" : "rgba(255,255,255,.18)";
    ctx.lineWidth = sg.n==="Ophiuchus" ? 2.2 : 1.1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+Math.cos(a1b)*RcI,cy+Math.sin(a1b)*RcI); ctx.lineTo(cx+Math.cos(a1b)*RcO,cy+Math.sin(a1b)*RcO);
    ctx.strokeStyle="rgba(255,255,255,.55)"; ctx.lineWidth=Math.max(1.2,W*0.0022); ctx.stroke();
  }
  [RcO,RcI].forEach(function(r){ ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.strokeStyle="rgba(255,255,255,.35)"; ctx.lineWidth=1.5; ctx.stroke(); });

  ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.font = "900 "+(W/40)+"px 'Segoe UI Symbol','Apple Symbols','DejaVu Sans',serif";
  for(var gi=0; gi<signs.length; gi++){
    var sgg = signs[gi]; var ml = mod(sgg.lo+sgg.span/2); var cw3 = eclToCW(ml, ascLon); var angg=ca(cw3);
    var prg=(RcO+RcI)/2; var px=cx+Math.cos(angg)*prg, py=cy+Math.sin(angg)*prg;
    var col = sgg.n==="Ophiuchus" ? "#ff2bd6" : (isTropical ? "#ffd700" : sc13CompareTrueSkyColorMap[sgg.n] || "#00e5ff");
    ctx.lineWidth = Math.max(3,W*0.006); ctx.strokeStyle="rgba(0,0,0,.9)"; ctx.strokeText(sgg.s,px,py);
    ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur = sgg.n==="Ophiuchus" ? 18 : 10; ctx.fillText(sgg.s,px,py); ctx.shadowBlur=0;
  }

  ctx.beginPath(); ctx.moveTo(cx-RhO,cy); ctx.lineTo(cx+RhO,cy); ctx.strokeStyle="rgba(255,255,255,.35)"; ctx.lineWidth=1.5; ctx.stroke();
  var mcCW = eclToCW(mcLon, ascLon); var mA = ca(mcCW);
  ctx.beginPath(); ctx.moveTo(cx+Math.cos(mA)*Rin,cy+Math.sin(mA)*Rin); ctx.lineTo(cx+Math.cos(mA)*RhO,cy+Math.sin(mA)*RhO);
  ctx.setLineDash([4,3]); ctx.strokeStyle="rgba(255,255,255,.3)"; ctx.lineWidth=1.2; ctx.stroke(); ctx.setLineDash([]);

  var bodies = placements.filter(function(p){ return p.key !== "MC"; });
  var sorted = bodies.map(function(p){
    var cw = eclToCW(p.rawLongitude, ascLon);
    var copy = {}; for(var k in p){ copy[k]=p[k]; } copy.cw = cw; return copy;
  }).sort(function(a,b){ return a.cw-b.cw; });

  var cwL = sorted.map(function(p){ return p.cw; });
  var packed = typeof packAnglesOnRing === "function" ? packAnglesOnRing(cwL, 10, 50) : cwL;

  sorted.forEach(function(p,i){
    var dA = ca(packed[i]); var eA = ca(p.cw);
    var symSz = W/17;
    var isSacred = ["BlackMoonLilith","Eve","PartOfFortune","PartOfSpirit"].indexOf(p.key) !== -1;
    var lx = cx+Math.cos(dA)*(RhO+W*0.08), ly = cy+Math.sin(dA)*(RhO+W*0.095);
    var dotX = cx+Math.cos(eA)*RhI, dotY = cy+Math.sin(eA)*RhI;
    var tickX = cx+Math.cos(eA)*RhO, tickY = cy+Math.sin(eA)*RhO;
    var col = PLANET_COLOR[p.key] || "#fff";
    ctx.globalAlpha=0.7; ctx.strokeStyle=col; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(dotX,dotY); ctx.lineTo(tickX,tickY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tickX,tickY); ctx.lineTo(lx,ly); ctx.stroke(); ctx.globalAlpha=1;

    if(p.key==="Eve" && typeof drawEveGlyph==="function"){
      drawEveGlyph(ctx, lx, ly, symSz*0.62, col);
    } else {
      var label = p.symbol || p.name[0];
      ctx.font = "900 "+(isSacred?symSz*0.62:symSz)+"px 'Segoe UI Symbol','Apple Symbols','DejaVu Sans',serif";
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.lineWidth=1.6; ctx.strokeStyle="rgba(0,0,0,.85)"; ctx.strokeText(label,lx,ly);
      ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur=8; ctx.fillText(label,lx,ly); ctx.shadowBlur=0;
    }
    var deg = isTropical ? p.tropicalDegree : p.trueSkyDegree;
    var rxL = p.retrograde ? " R" : "";
    ctx.font = "900 "+(W/48)+"px Arial Black,Arial"; ctx.fillStyle=col; ctx.strokeStyle="rgba(0,0,0,.8)"; ctx.lineWidth=1.4;
    var oy = ly + symSz*0.75;
    ctx.strokeText(Math.floor(deg)+"°"+rxL, lx, oy); ctx.fillText(Math.floor(deg)+"°"+rxL, lx, oy);
  });

  ctx.beginPath(); ctx.arc(cx,cy,Rin,0,Math.PI*2); ctx.fillStyle="#000"; ctx.fill();

  ctx.font = "900 "+(W/28)+"px Raleway,Arial,sans-serif"; ctx.fillStyle = ringColor; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.shadowColor = ringColor; ctx.shadowBlur=10;
  ctx.fillText(isTropical ? "TROPICAL" : "TRUE SKY 13", cx, cy);
  ctx.shadowBlur=0;
}

/* -------------------------- Export 1080x1920 PNG --------------------------- 
   Manual canvas composition (no html2canvas dependency, avoids cross-origin/
   font-rendering pitfalls) drawing directly from the already-rendered wheel
   canvases so the exported image matches exactly what's on screen. */
function sc13CompareExportImage(){
  var data = window.sc13CompareData;
  if(!data){ return; }
  var statusEl = document.getElementById("sc13CompareStatus");
  try{
    var W = 1080, H = 1920;
    var out = document.createElement("canvas");
    out.width = W; out.height = H;
    var ctx = out.getContext("2d");

    var grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0, "#0d0025"); grad.addColorStop(1, "#03000f");
    ctx.fillStyle = grad; ctx.fillRect(0,0,W,H);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd700"; ctx.font = "900 44px Arial,sans-serif";
    ctx.shadowColor = "#ffd700"; ctx.shadowBlur = 14;
    ctx.fillText("TROPICAL vs 13-SIGN TRUE SKY", W/2, 70);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(234,231,255,.85)"; ctx.font = "700 26px Arial,sans-serif";
    ctx.fillText("Same sky. Two zodiac maps.", W/2, 110);

    var b = data.birthData;
    ctx.fillStyle = "rgba(234,231,255,.75)"; ctx.font = "600 22px Arial,sans-serif";
    ctx.fillText((b.name || "Chart") + " · " + b.city, W/2, 150);
    ctx.fillText(b.ds + " " + String(b.hh).padStart(2,"0") + ":" + String(b.mm).padStart(2,"0"), W/2, 178);

    var wheelY = 210, wheelSize = 470;
    var cvT = document.getElementById("cvTropical");
    var cvS = document.getElementById("cvTrueSky");
    ctx.drawImage(cvT, 40, wheelY, wheelSize, wheelSize);
    ctx.drawImage(cvS, W-40-wheelSize, wheelY, wheelSize, wheelSize);

    ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 4; ctx.strokeRect(40, wheelY, wheelSize, wheelSize);
    ctx.strokeStyle = "#ff2bd6"; ctx.lineWidth = 4; ctx.strokeRect(W-40-wheelSize, wheelY, wheelSize, wheelSize);

    ctx.font = "900 22px Arial,sans-serif";
    ctx.fillStyle = "#ffd700"; ctx.fillText("TROPICAL · 12 SIGNS", 40+wheelSize/2, wheelY+wheelSize+30);
    ctx.fillStyle = "#ff6ae0"; ctx.fillText("TRUE SKY · 13 SIGNS", W-40-wheelSize/2, wheelY+wheelSize+30);

    var tableTop = wheelY + wheelSize + 70;
    ctx.textAlign = "left";
    ctx.fillStyle = "#eae7ff"; ctx.font = "900 24px Arial,sans-serif";
    ctx.fillText("Changed Placements", 40, tableTop);

    var rowY = tableTop + 34;
    var changed = data.tropical.placements.filter(function(p){ return p.tropicalSign !== p.trueSkySign || p.tropicalHouse !== p.trueSkyHouse; });
    ctx.font = "700 18px Arial,sans-serif";
    changed.forEach(function(p){
      if(rowY > H-140) return;
      ctx.fillStyle = "#eae7ff";
      ctx.fillText(p.name, 40, rowY);
      var tropColor = sc13CompareTropicalColorMap[p.tropicalSign] || "#ffd700";
      var trueColor = p.isOphiuchus ? "#ff2bd6" : (sc13CompareTrueSkyColorMap[p.trueSkySign] || "#00e5ff");
      ctx.fillStyle = tropColor;
      ctx.fillText(sc13CompareFmt(p.tropicalSign,p.tropicalDegree,p.tropicalHouse), 300, rowY);
      ctx.fillStyle = trueColor;
      ctx.fillText(sc13CompareFmt(p.trueSkySign,p.trueSkyDegree,p.trueSkyHouse), 680, rowY);
      rowY += 30;
    });

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(234,231,255,.85)"; ctx.font = "italic 20px Arial,sans-serif";
    ctx.fillText("The planets stayed in the same sky. The zodiac map changed.", W/2, H-70);
    ctx.fillStyle = "#00e5ff"; ctx.font = "900 22px Arial,sans-serif";
    ctx.fillText("StarChart13.com", W/2, H-36);

    var url = out.toDataURL("image/png");
    var a = document.createElement("a");
    a.href = url;
    a.download = "starchart13-tropical-vs-truesky.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if(statusEl){ statusEl.textContent = "✅ Image downloaded."; statusEl.className = "status st-ok"; }
  }catch(e){
    console.error(e);
    if(statusEl){ statusEl.textContent = "❌ Export failed: " + e.message; statusEl.className = "status st-err"; }
  }
}
