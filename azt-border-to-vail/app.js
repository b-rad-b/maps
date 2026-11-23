(function(){
const D = window.MAPDATA;
const HOT = "#e66100", ROUTE = "#1d3f6e";
const stages = D.stages.filter(s => !s.alt);
const alt = D.stages.find(s => s.alt);
const byDay = Object.fromEntries(stages.map(s => [s.day, s]));

// ---------- chapters (text from travel/azt-border-to-vail-itinerary.md) ----------
const CH = [
 {key:"intro", kicker:"A story map · spring 2027", h1:"Border to Vail with Dad",
  sub:"123.5 miles of the Arizona Trail, from the Mexican border to Vail, on the edge of Tucson, in 13 days.",
  body:[ "We start at border monument 102, the southern end of the Arizona Trail, cross the Huachuca crest at 9,100 feet, wander the Canelo Hills grasslands and the Santa Rita foothills, and finish at Colossal Cave in Vail.",
         "Every day starts and ends at a trailhead you can drive to, so we carry daypacks and sleep in a bed every night: Sierra Vista, then Patagonia, then Tucson."],
  stats:[["142","miles walked"],["12","walking days"],["~15k","ft of climb"],["9,116","ft high point"]],
  tips:[["blue","Scroll to walk the trip one day at a time. Click a day number on the map or the profile below to jump."]], view:"all"},
 {key:"d0", kicker:"Day 0 · Fri, April 2", h2:"Dad lands in Tucson",
  body:["Dinner, a gear check, and the GPX loaded on both phones. Fri 4/16 stays open as a spare weather day, and Dad flies home Sat 4/17."],
  tips:[["blue","Why April and not March: the Huachuca crest on Day 2 often holds snow or ice in mid-March. Early April is usually clear, and the low desert at the end is warm but not yet hot."]], view:"all"},
 {key:"d1", day:1, hi:6740, date:"Sat, April 3", h2:"Border day", sleep:"Sierra Vista", climb:"+915 / −906",
  body:["Drive to Montezuma Pass, then walk 1.8 miles down to border monument 102, the trail's southern terminus, and back up. Add Coronado Peak (0.6 mi round trip) for the view south into Sonora."],
  tips:[["blue","Border Patrol traffic is normal here. Carry ID and a charged phone."]]},
 {key:"d2", day:2, hi:9116, date:"Sun, April 4", h2:"The big one: over the Huachuca crest", sleep:"Sierra Vista", climb:"+3,460 / −4,090",
  body:["The hardest day of the trip and the best views. Climb from Montezuma Pass to the crest near 9,100 ft, pass Bathtub Spring, then drop a long rocky descent to Sunnyside Canyon."],
  tips:[["hot","Start by 7am with trekking poles. If you're tired or there's snow, bail down Miller Canyon Trail (3.3 mi) at Bathtub Spring, mile 8."],["blue","Check the Forest Service AZT conditions page the week before. Icy crest: bring microspikes or skip to Day 3."]]},
 {key:"d3", day:3, hi:5980, date:"Mon, April 5", h2:"Recovery morning to Parker Canyon Lake", sleep:"Patagonia", climb:"+120 / −450",
  body:["An easy 4.3 miles after the big day, with lunch by the lake. Then move the base to Patagonia for the next six nights."]},
 {key:"d4", day:4, hi:6070, date:"Tue, April 6", h2:"Canelo Hills East", sleep:"Patagonia", climb:"+1,770 / −2,090",
  body:["Open oak grassland and rolling hills from Parker Canyon Lake to Canelo Pass. Several cattle tanks along the way: treat anything you drink."]},
 {key:"d5", day:5, hi:5600, date:"Wed, April 7", h2:"Canelo Hills West", sleep:"Patagonia", climb:"+650 / −1,750",
  body:["Mostly downhill to Harshaw Road. Cobbles and loose rock make this a day to take the descents slowly."]},
 {key:"d6", day:6, hi:4850, date:"Thu, April 8", h2:"Into the Patagonia country", sleep:"Patagonia", climb:"+1,310 / −1,270",
  body:["Harshaw Road to the Casa Blanca trailhead on Hwy 82. The optional 4.7-mile Train Track Trail walks you right into Patagonia."],
  tips:[["blue","Shorter option: end the whole trip here. Border to Patagonia is about 67 miles in 6 days and only 5 weekdays off."]]},
 {key:"d7", day:7, hi:5130, date:"Fri, April 9", h2:"Casa Blanca Canyons", sleep:"Patagonia", climb:"+1,200 / −990",
  body:["From Hwy 82 through the Casa Blanca Canyons to the Temporal Gulch trailhead, the edge of the Santa Ritas. The road to the trailhead is rough: Outback, dry weather only."]},
 {key:"d8", day:8, date:"Sat, April 10", h2:"Rest day in Patagonia", rest:true,
  body:["Right before the longest day. Patagonia Lake, the Sonoita wineries, or the Patagonia–Sonoita Creek bird preserve."], view:"patagonia"},
 {key:"d9", day:9, hi:5500, date:"Sun, April 11", h2:"The longest day: Santa Rita foothills", sleep:"Patagonia or the Kentucky Camp cabin", climb:"+2,430 / −1,650",
  body:["17.9 miles along the east flank of the Santa Ritas to Gardner Canyon Road. Few exits, so start at 7am."],
  tips:[["hot","At about 2 mph with climbs, this is a 9–10 hour day with breaks."],["blue","Option: sleep in the restored Kentucky Camp adobe cabin (Recreation.gov), right where Day 10 stops for lunch."]]},
 {key:"d10", day:10, hi:5860, date:"Mon, April 12", h2:"Kentucky Camp", sleep:"Tucson", climb:"+1,190 / −1,190",
  body:["Lunch at Kentucky Camp, a 1900s gold-mining camp at mile 4, then on to Box Canyon Road. From here on, every trailhead is within an hour of Tucson."]},
 {key:"d11", day:11, hi:5390, date:"Tue, April 13", h2:"Half day", sleep:"Tucson", climb:"+330 / −900",
  body:["Box Canyon Road to Helvetia Road, 6 miles. An afternoon off."]},
 {key:"d12", day:12, hi:4870, date:"Wed, April 14", h2:"Down into the low desert", sleep:"Tucson", climb:"+1,150 / −2,050",
  body:["Helvetia Road through the Las Colinas foothills to Sahuarita Road. Little shade and mid-April highs in the 80s."],
  tips:[["hot","Start at 6:30am. Carry 3–4 L plus electrolytes. Rattlesnakes come out as April warms."]]},
 {key:"d13", day:13, hi:3740, date:"Thu, April 15", h2:"Cienega Creek and the finish", sleep:"Tucson: celebration dinner", climb:"+690 / −830",
  body:["Past Gabe Zimmerman trailhead to Cienega Creek, one of the last flowing desert streams near Tucson, and on to Colossal Cave. Family meets you at the finish."]},
 {key:"alt", kicker:"Option", h2:"The one-day shortcut", view:"alt",
  body:["Casa Blanca trailhead straight to Gardner Canyon Road is 20.9 miles. It skips the Temporal Gulch connectors and saves a day, but it's a long one at 70. It's in the GPX if you both feel strong."]},
];

// ---------- map ----------
const BBall = (() => { let a=[180,90,-180,-90]; stages.forEach(s=>s.line.forEach(([x,y])=>{a[0]=Math.min(a[0],x);a[1]=Math.min(a[1],y);a[2]=Math.max(a[2],x);a[3]=Math.max(a[3],y);})); return a; })();
const map = new maplibregl.Map({container:"map", attributionControl:false, maxZoom:15, minZoom:7.5,
  style:{version:8, sources:{}, layers:[{id:"bg", type:"background", paint:{"background-color":"#efeadf"}}]},
  bounds:[[BBall[0],BBall[1]],[BBall[2],BBall[3]]], fitBoundsOptions:{padding:40},
  maxBounds:[[-111.5,31.0],[-109.6,32.5]]});
map.addControl(new maplibregl.NavigationControl({visualizePitch:false}), "top-right");
map.addControl(new maplibregl.ScaleControl({maxWidth:130, unit:"imperial"}), "bottom-left");
map.addControl(new maplibregl.ScaleControl({maxWidth:130, unit:"metric"}), "bottom-left");
map.addControl(new maplibregl.AttributionControl({compact:true, customAttribution:"Pensador Solutions · Arizona Trail Association · Copernicus · Esri · US Census · Natural Earth"}), "bottom-right");
const narrow = document.getElementById("narrow");
map.on("rotate", () => narrow.style.transform = `rotate(${-map.getBearing()}deg)`);

const fc = feats => ({type:"FeatureCollection", features:feats});
const lineF = s => ({type:"Feature", properties:{day:s.day||0, alt:!!s.alt}, geometry:{type:"LineString", coordinates:s.line}});
function bboxOf(lines, pad){ let a=[180,90,-180,-90]; lines.forEach(l=>l.forEach(([x,y])=>{a[0]=Math.min(a[0],x);a[1]=Math.min(a[1],y);a[2]=Math.max(a[2],x);a[3]=Math.max(a[3],y);})); return [[a[0],a[1]],[a[2],a[3]]]; }
const isMobile = () => window.innerWidth <= 760;
const pad = () => isMobile() ? {top:70,bottom:30,left:30,right:50} : {top:90,bottom:50,left:60,right:70};

const markers = {};
const pop = new maplibregl.Popup({closeButton:true, offset:12, maxWidth:"260px"});
map.on("load", () => {
  map.addSource("terrain", {type:"image", url:D.terrain.url, coordinates:D.terrain.coordinates});
  map.addLayer({id:"terrain", type:"raster", source:"terrain", paint:{"raster-opacity":1, "raster-fade-duration":0}});
  map.addSource("fed", {type:"geojson", data:D.fed});
  const ag = a => ["==",["get","agency"],a];
  map.addLayer({id:"usfs", type:"fill", source:"fed", filter:ag("Forest Service"), paint:{"fill-color":"#c9d6a4","fill-opacity":0.42}});
  map.addLayer({id:"usfs-l", type:"line", source:"fed", filter:ag("Forest Service"), paint:{"line-color":"#8d9a6c","line-width":0.8}});
  map.addLayer({id:"oth", type:"fill", source:"fed", filter:["any",ag("Bureau of Land Management"),ag("National Park Service")], paint:{"fill-color":"#e2cfae","fill-opacity":0.4}});
  map.addLayer({id:"oth-l", type:"line", source:"fed", filter:["any",ag("Bureau of Land Management"),ag("National Park Service")], paint:{"line-color":"#a88c62","line-width":0.7}});
  map.addLayer({id:"dod", type:"fill", source:"fed", filter:ag("Department of Defense"), paint:{"fill-color":"#c4c0b8","fill-opacity":0.5}});
  map.addLayer({id:"dod-l", type:"line", source:"fed", filter:ag("Department of Defense"), paint:{"line-color":"#8a8a8a","line-width":0.8}});
  map.addSource("contours", {type:"geojson", data:D.contours});
  map.addLayer({id:"cont", type:"line", source:"contours", minzoom:9.5, filter:["!",["get","idx"]], paint:{"line-color":"#8a6f4e","line-width":0.6,"line-opacity":["interpolate",["linear"],["zoom"],9.5,0,10.5,0.55]}});
  map.addLayer({id:"cont-i", type:"line", source:"contours", filter:["get","idx"], paint:{"line-color":"#7a5c3a","line-width":["interpolate",["linear"],["zoom"],8,0.6,12,1.3],"line-opacity":0.75}});
  map.on("click","cont-i", e => { if (map.queryRenderedFeatures(e.point,{layers:["th","route-hit"]}).length) return; pop.setLngLat(e.lngLat).setHTML(`<b>${e.features[0].properties.ft.toLocaleString()} ft contour</b>`).addTo(map); });
  map.addSource("roads", {type:"geojson", data:D.roads});
  map.addLayer({id:"roads-c", type:"line", source:"roads", paint:{"line-color":"#fff","line-width":["match",["get","rt"],"I",4.2,3.2],"line-opacity":0.8}});
  map.addLayer({id:"roads", type:"line", source:"roads", paint:{"line-color":"#7a7a7a","line-width":["match",["get","rt"],"I",2.4,1.6]}});
  map.addSource("border", {type:"geojson", data:D.border});
  map.addLayer({id:"border", type:"line", source:"border", paint:{"line-color":"#2b2b2b","line-width":1.6,"line-dasharray":[5,2,1.4,2]}});
  map.addSource("route", {type:"geojson", data:fc(stages.map(lineF))});
  map.addSource("alt", {type:"geojson", data:fc([lineF(alt)])});
  map.addLayer({id:"alt", type:"line", source:"alt", layout:{"line-cap":"butt"}, paint:{"line-color":ROUTE,"line-width":2.2,"line-dasharray":[2,1.5],"line-opacity":0.85}});
  map.addLayer({id:"route-c", type:"line", source:"route", layout:{"line-cap":"round","line-join":"round"}, paint:{"line-color":"#fff","line-width":5,"line-opacity":0.85}});
  map.addLayer({id:"route", type:"line", source:"route", layout:{"line-cap":"round","line-join":"round"}, paint:{"line-color":ROUTE,"line-width":3}});
  map.addLayer({id:"hot-c", type:"line", source:"route", filter:["==",["get","day"],-1], layout:{"line-cap":"round","line-join":"round"}, paint:{"line-color":"#fff","line-width":9}});
  map.addLayer({id:"hot", type:"line", source:"route", filter:["==",["get","day"],-1], layout:{"line-cap":"round","line-join":"round"}, paint:{"line-color":HOT,"line-width":5.5}});
  map.addLayer({id:"route-hit", type:"line", source:"route", paint:{"line-color":"#000","line-width":16,"line-opacity":0}});
  // trailheads as circles
  const th = D.poi.features.filter(f=>f.properties.kind==="trailhead");
  map.addSource("th", {type:"geojson", data:fc(th)});
  map.addLayer({id:"th", type:"circle", source:"th", paint:{"circle-radius":5,"circle-color":"#fff","circle-stroke-color":ROUTE,"circle-stroke-width":2}});
  // cursor dot for profile hover
  map.addSource("cur", {type:"geojson", data:fc([])});
  map.addLayer({id:"cur", type:"circle", source:"cur", paint:{"circle-radius":7,"circle-color":HOT,"circle-stroke-color":"#fff","circle-stroke-width":2.5}});

  // HTML labels and symbols
  const mk = (html, cls, ll, anchor="left", off=[0,0], click) => { const e=document.createElement("div"); e.className=cls; e.innerHTML=html; if(click){e.style.pointerEvents="auto";e.style.cursor="pointer";e.addEventListener("click",click);} return new maplibregl.Marker({element:e, anchor, offset:off}).setLngLat(ll).addTo(map); };
  const townM = [];
  D.towns.features.forEach(f => { const k=f.properties.kind, n=f.properties.name;
    const m = n==="Vail" ? mk(`Vail<i></i>`, "lbl "+k, f.geometry.coordinates, "right", [6,0]) : mk(`<i></i>${n}`, "lbl "+k, f.geometry.coordinates, "left", [-6,0]);
    if (k==="town") townM.push(m); });
  const townVis = () => townM.forEach(m => m.getElement().style.display = map.getZoom() < (isMobile()?9.6:8.9) ? "none" : "");
  map.on("zoomend", townVis); townVis();
  [["Huachuca Mountains",[-110.39,31.47]],["Canelo Hills",[-110.58,31.53]],["Santa Rita Mountains",[-110.86,31.72]],["Empire Mountains",[-110.63,31.86]],["Whetstone Mountains",[-110.38,31.84]],["Patagonia Mountains",[-110.78,31.46]],["SONORA, MÉXICO",[-110.52,31.29]],["ARIZONA, USA",[-110.52,31.355]]]
    .forEach(([n,ll]) => mk(n, "plbl", ll, "center"));
  const sym = {
    milestone:`<svg width="22" height="22" viewBox="0 0 22 22"><path d="M11 1 L14 8 L21 8.5 L15.5 13 L17.5 21 L11 16.5 L4.5 21 L6.5 13 L1 8.5 L8 8 Z" fill="${HOT}" stroke="#fff" stroke-width="1.4"/></svg>`,
    summit:`<svg width="22" height="22" viewBox="0 0 22 22"><path d="M11 1 L14 8 L21 8.5 L15.5 13 L17.5 21 L11 16.5 L4.5 21 L6.5 13 L1 8.5 L8 8 Z" fill="${HOT}" stroke="#fff" stroke-width="1.4"/></svg>`,
    bailout:`<svg width="18" height="16" viewBox="0 0 18 16"><path d="M9 1 L17 15 L1 15 Z" fill="#fff" stroke="#2b2b2b" stroke-width="1.8"/></svg>`,
    finish:`<svg width="20" height="20" viewBox="0 0 20 20"><rect x="1" y="1" width="18" height="18" fill="#2b2b2b" stroke="#fff" stroke-width="1.5"/><rect x="6" y="6" width="8" height="8" fill="#fff"/></svg>`};
  D.poi.features.forEach(f => {
    const p=f.properties;
    const show = () => pop.setLngLat(f.geometry.coordinates).setHTML(`<b>${p.name}</b>${p.day?`Day ${p.day}. `:""}${p.note}`).addTo(map);
    if (sym[p.kind]) { const m=mk(sym[p.kind], "", f.geometry.coordinates, "center", [0,0], show); m.getElement().title=p.name; }
  });
  map.on("click","th", e => { const p=e.features[0].properties; pop.setLngLat(e.lngLat).setHTML(`<b>${p.name}</b>${p.day&&p.day!=="null"?`Day ${p.day}. `:""}${p.note}`).addTo(map); });
  map.on("mouseenter","th",()=>map.getCanvas().style.cursor="pointer"); map.on("mouseleave","th",()=>map.getCanvas().style.cursor="");
  map.on("click","route-hit", e => { if (map.queryRenderedFeatures(e.point,{layers:["th"]}).length) return; goto("d"+e.features[0].properties.day); });
  map.on("mouseenter","route-hit",()=>map.getCanvas().style.cursor="pointer"); map.on("mouseleave","route-hit",()=>map.getCanvas().style.cursor="");
  // day number badges at each stage's midpoint
  stages.forEach(s => { const m=s.line[Math.floor(s.line.length/2)]; markers[s.day]=mk(String(s.day), "dnum", m, "center", [0,0], ()=>goto("d"+s.day)); });
  document.getElementById("t-alt").onchange = e => map.setLayoutProperty("alt","visibility",e.target.checked?"visible":"none");
  document.getElementById("t-cont").onchange = e => ["cont","cont-i"].forEach(l=>map.setLayoutProperty(l,"visibility",e.target.checked?"visible":"none"));
  document.getElementById("t-land").onchange = e => ["usfs","usfs-l","oth","oth-l","dod","dod-l"].forEach(l=>map.setLayoutProperty(l,"visibility",e.target.checked?"visible":"none"));
  if (isMobile()) document.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
  ready = true; if (pending) { activate(pending, true); pending = null; }
});

// ---------- locator ----------
(function(){ const az=D.azOutline.coordinates[0][0] ? D.azOutline.coordinates : [D.azOutline.coordinates];
  const ring = (D.azOutline.type==="Polygon"? D.azOutline.coordinates[0] : D.azOutline.coordinates[0][0]);
  const xs=ring.map(p=>p[0]), ys=ring.map(p=>p[1]); const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const W=64, H=W*(y1-y0)/(x1-x0)*1.18; const X=x=>(x-x0)/(x1-x0)*W, Y=y=>(y1-y)/(y1-y0)*H;
  const d="M"+ring.map(p=>X(p[0]).toFixed(1)+" "+Y(p[1]).toFixed(1)).join("L")+"Z"; const b=D.bbox;
  document.getElementById("loc").innerHTML = `<svg viewBox="-2 -2 ${W+4} ${H+4}"><path d="${d}" fill="#f1eee6" stroke="#555" stroke-width="1"/><rect x="${X(b[0])}" y="${Y(b[3])}" width="${X(b[2])-X(b[0])}" height="${Y(b[1])-Y(b[3])}" fill="none" stroke="${HOT}" stroke-width="2"/><circle cx="${X(-110.97)}" cy="${Y(32.22)}" r="1.8" fill="#2b2b2b"/><circle cx="${X(-112.07)}" cy="${Y(33.45)}" r="1.8" fill="#2b2b2b"/><text x="${X(-112.07)+3}" y="${Y(33.45)+3}" font-size="7" font-family="Lato">Phoenix</text></svg><div class="note"><b>Locator.</b> Arizona, USA. The orange box is the area of the map, in the southeast corner of the state between Tucson and the Mexican border.</div>`;
})();

// ---------- chapters DOM ----------
const wrap = document.getElementById("chapters");
CH.forEach(c => {
  const s=document.createElement("section"); s.className="ch"; s.id="ch-"+c.key; s.dataset.key=c.key;
  const st = c.day ? byDay[c.day] : null;
  let h = "";
  if (c.day) h += `<div class="kicker"><span class="daybadge">Day ${c.day}</span>${c.date}</div>`;
  else h += `<div class="kicker">${c.kicker || c.date || ""}</div>`;
  if (c.rest && c.date) h = `<div class="kicker"><span class="daybadge" style="background:#777">Day 8</span>${c.date}</div>`;
  h += c.h1 ? `<h1>${c.h1}</h1>` : `<h2>${c.h2}</h2>`;
  if (c.sub) h += `<p class="sub">${c.sub}</p>`;
  if (st) h += `<div class="stats"><div><b>${st.miles}</b><span>miles</span></div><div><b>${c.climb.split(" / ")[0]}</b><span>ft climb</span></div><div><b>${c.climb.split(" / ")[1]}</b><span>ft descent</span></div><div><b>${(c.hi||st.hi).toLocaleString()}</b><span>ft high</span></div></div>`;
  if (c.stats) h += `<div class="stats">${c.stats.map(([a,b])=>`<div><b>${a}</b><span>${b}</span></div>`).join("")}</div>`;
  (c.body||[]).forEach(p => h += `<p>${p}</p>`);
  (c.tips||[]).forEach(([k,t]) => h += `<div class="tip ${k}">${t}</div>`);
  if (c.sleep) h += `<p class="note" style="margin-top:10px"><b>Sleep:</b> ${c.sleep}</p>`;
  if (c.key==="intro") h += `<div class="scrollhint">↓ Scroll to start walking</div>`;
  s.innerHTML = h; wrap.appendChild(s);
});

// ---------- elevation profile (whole trip, concatenated) ----------
const P = []; let off = 0; const seg = [];
stages.forEach(s => { const a=off; s.profile.forEach(p => P.push({mi:off+p[0], ft:p[1], ll:[p[2],p[3]], day:s.day, dmi:p[0]})); off += s.profile[s.profile.length-1][0]; seg.push({day:s.day, a, b:off}); });
const totMi = off; const fmin = 3000, fmax = 9500;
const prof = document.getElementById("prof"), tip = document.getElementById("ptip");
let svg, xs, ys, PW, PH, ML=46, MR=14, MT=12, MB=22;
function drawProfile(activeDay){
  PW = prof.clientWidth; PH = prof.clientHeight;
  xs = mi => ML + mi/totMi*(PW-ML-MR); ys = ft => MT + (1-(ft-fmin)/(fmax-fmin))*(PH-MT-MB);
  let h = `<svg viewBox="0 0 ${PW} ${PH}">`;
  [4000,6000,8000].forEach(f => h += `<line x1="${ML}" x2="${PW-MR}" y1="${ys(f)}" y2="${ys(f)}" stroke="#e6e3dc"/><text x="${ML-5}" y="${ys(f)+3.5}" text-anchor="end" font-size="10" fill="#777">${f.toLocaleString()}</text>`);
  h += `<text x="4" y="${MT+2}" font-size="9.5" fill="#777" transform="rotate(-90 9 ${PH/2})" x="9" y="${PH/2}"></text>`;
  h += `<text x="${ML-5}" y="${PH-6}" text-anchor="end" font-size="9.5" fill="#777">ft</text>`;
  seg.forEach(g => {
    const pts = P.filter(p => p.day===g.day);
    const on = g.day===activeDay;
    const d = `M${xs(pts[0].mi)},${ys(fmin)} ` + pts.map(p=>`L${xs(p.mi).toFixed(1)},${ys(p.ft).toFixed(1)}`).join(" ") + ` L${xs(pts[pts.length-1].mi)},${ys(fmin)} Z`;
    h += `<path d="${d}" fill="${on?HOT:(g.day%2?"#b9c4d3":"#a3b2c6")}" opacity="${on?1:0.9}" data-day="${g.day}"/>`;
    h += `<line x1="${xs(g.b)}" x2="${xs(g.b)}" y1="${MT}" y2="${ys(fmin)}" stroke="#fff" stroke-width="1"/>`;
    h += `<text x="${(xs(g.a)+xs(g.b))/2}" y="${PH-7}" text-anchor="middle" font-size="10.5" font-weight="${on?900:700}" fill="${on?HOT:ROUTE}">${g.day}</text>`;
  });
  h += `<line x1="${ML}" x2="${PW-MR}" y1="${ys(fmin)}" y2="${ys(fmin)}" stroke="#999"/>`;
  h += `<line id="pcur" y1="${MT}" y2="${ys(fmin)}" stroke="#2b2b2b" stroke-width="1" style="display:none"/>`;
  h += `<text x="${PW-MR}" y="${MT+1}" text-anchor="end" font-size="10" fill="#777">Elevation profile, Days 1–13 (${Math.round(totMi)} mi). Day 8 is the rest day.</text></svg>`;
  prof.querySelector("svg")?.remove(); prof.insertAdjacentHTML("afterbegin", h); svg = prof.querySelector("svg");
}
function nearest(x){ const mi=(x-ML)/(PW-ML-MR)*totMi; let lo=0,hi=P.length-1; while(hi-lo>1){const m=(lo+hi)>>1; if(P[m].mi<mi) lo=m; else hi=m;} return P[Math.abs(P[lo].mi-mi)<Math.abs(P[hi].mi-mi)?lo:hi]; }
function hover(ev){ const r=prof.getBoundingClientRect(); const x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left; if(x<ML||x>PW-MR) return out();
  const p=nearest(x); const l=svg.querySelector("#pcur"); l.setAttribute("x1",xs(p.mi)); l.setAttribute("x2",xs(p.mi)); l.style.display="";
  tip.style.display="block"; tip.textContent=`Day ${p.day} · mile ${p.dmi.toFixed(1)} · ${p.ft.toLocaleString()} ft`; tip.style.left=Math.min(Math.max(x-60,4),PW-170)+"px";
  if (ready) map.getSource("cur").setData(fc([{type:"Feature",geometry:{type:"Point",coordinates:p.ll},properties:{}}])); }
function out(){ tip.style.display="none"; const l=svg&&svg.querySelector("#pcur"); if(l) l.style.display="none"; if(ready) map.getSource("cur").setData(fc([])); }
prof.addEventListener("mousemove", hover); prof.addEventListener("touchmove", hover, {passive:true}); prof.addEventListener("mouseleave", out);
prof.addEventListener("click", ev => { const r=prof.getBoundingClientRect(); const x=ev.clientX-r.left; if(x>=ML) goto("d"+nearest(x).day); });

// ---------- scroll-driven activation ----------
let ready=false, pending=null, current=null;
function activate(key, force){
  if (key===current && !force) return; current=key;
  document.querySelectorAll(".ch").forEach(s => s.classList.toggle("on", s.dataset.key===key));
  const c = CH.find(c=>c.key===key) || {};
  const day = c.day && !c.rest ? c.day : null;
  drawProfile(day);
  document.getElementById("viewname").textContent = day ? `Day ${day} · ${c.date} · ${byDay[day].miles} mi` : (c.rest ? "Day 8 · Rest day in Patagonia" : c.key==="alt" ? "Option · one-day shortcut, 20.9 mi" : "Arizona Trail · April 3–15, 2027");
  if (!ready) { pending=key; return; }
  map.setFilter("hot", ["==",["get","day"], day||-1]); map.setFilter("hot-c", ["==",["get","day"], day||-1]);
  Object.entries(markers).forEach(([d,m]) => m.getElement().classList.toggle("on", +d===day));
  let b;
  if (day) b = bboxOf([byDay[day].line]);
  else if (c.view==="patagonia") b = bboxOf([byDay[6].line, byDay[7].line]);
  else if (c.view==="alt") b = bboxOf([alt.line]);
  else if (key==="key") return;
  else b = [[BBall[0],BBall[1]],[BBall[2],BBall[3]]];
  map.fitBounds(b, {padding:pad(), maxZoom:13, duration: matchMedia("(prefers-reduced-motion: reduce)").matches?0:1600, essential:true});
}
function goto(key){ const el=document.getElementById("ch-"+key); if(el) el.scrollIntoView({behavior:"smooth", block:"start"}); activate(key); }
const io = new IntersectionObserver(es => { const v=es.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0]; if (v) activate(v.target.dataset.key); },
  {root:document.getElementById("side"), rootMargin:"0px 0px -55% 0px", threshold:0});
document.querySelectorAll(".ch").forEach(s => io.observe(s));
window.addEventListener("resize", () => drawProfile(CH.find(c=>c.key===current)?.day||null));
activate("intro");
})();
