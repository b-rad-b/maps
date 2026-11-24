/* Brand white-space pages. One app for every brand folder: all text and numbers come from that folder's data.js (WS.meta). */
(function () {
  const {Deck, MapView, H3HexagonLayer, GeoJsonLayer, ScatterplotLayer, TextLayer, FlyToInterpolator} = deck;
  const D = window.WS, B = window.BASE;

  // cells: [h3, score, class(0 white space, 1 contested, 2 already served), county index, own stores in radius, competitors in radius, road_km*10, ...meta.fields]
  const M = D.meta, R = M.radius_mi;
  const COLORS = [[44, 123, 182], [169, 169, 163], [230, 97, 0]];
  const MARKET = ['White space', 'Contested', M.brand + ' already here'];
  const on = [true, true, true];
  let shopsDutch = true, shopsOther = true;
  const $ = id => document.getElementById(id);

  const fmt = n => n.toLocaleString('en-US');
  document.title = M.short;
  $('title').textContent = M.title;
  $('sub').textContent = `${M.area_text}, in ${fmt(D.cells.length)} hexagons of about 0.7 km² that sit on a major road with ${M.min_text}. Taller hexes score higher. Hover or tap one for its numbers.`;
  $('indep').innerHTML = `<b>Independent study.</b> Built from public data for a ${M.concept} concept. Not affiliated with, or commissioned by, ${M.brand}.`;
  M.n.forEach((n, i) => $('n' + i).textContent = fmt(n));
  $('servedLab').textContent = M.brand + ' already here';
  $('classText').textContent = `White space: ${M.white_text}. Contested: ${M.contested_text}. Already here: ${M.brand} has a location within ${R} miles.`;
  $('scoreText').textContent = `0–100 = demand × openness. Demand ranks ${M.demand_text}. Each competitor within ${R} mi (${M.comp_label}) lowers openness a little, and an existing ${M.brand} lowers it much more.`;
  $('ownLab').textContent = M.brand; $('compLab').textContent = M.comp_label.charAt(0).toUpperCase() + M.comp_label.slice(1);
  $('nd').textContent = fmt(M.n_own); $('no').textContent = fmt(M.n_comp);
  $('topText').textContent = `The best white-space hex in each area. A starting point for a broker search, not a site: parcels, zoning, traffic counts and a visit come next.`;
  $('srcNote').textContent = `Store locations: Overture and Foursquare Open Source Places (Apache 2.0), matched by name and brand. Open data can miss or misplace a store, so check any area against ${M.brand}'s own store locator before acting on it.`;

  const HOME = Object.assign({pitch: 40, bearing: 0}, M.home);
  const narrow = matchMedia('(max-width:620px)').matches;
  if (narrow) Object.assign(HOME, {zoom: M.home.zoom - 0.9, latitude: M.home.latitude - (M.local ? 0.15 : 1)});
  let view = Object.assign({}, HOME);

  const METROS = M.metros;
  const jump = document.getElementById('jump');
  const home = document.createElement('button');
  home.textContent = M.local ? 'Whole metro' : 'All four states';
  home.onclick = () => fly(HOME);
  jump.appendChild(home);
  METROS.forEach(([n, lon, lat, z]) => {
    const b = document.createElement('button');
    b.textContent = n;
    b.onclick = () => fly({longitude: lon, latitude: lat, zoom: narrow ? z - 0.8 : z, pitch: 50, bearing: 0});
    jump.appendChild(b);
  });

  const top = document.getElementById('top');
  D.top.forEach(t => {
    const li = document.createElement('li');
    const v = M.field_keys.slice(0, 2).map((k, i) => M.field_pct[i] ? `${M.fields[i].toLowerCase()} ${t.vals[k]}%` : `${fmt(t.vals[k])} ${M.fields[i].charAt(0).toLowerCase() + M.fields[i].slice(1)}`).join(', ');
    li.innerHTML = `${t.label} <span class="s">· score ${t.score}</span><span class="a">${t.at ? t.at + ' · ' : ''}${v}</span>`;
    li.onclick = () => fly({longitude: t.lon, latitude: t.lat, zoom: 12.2, pitch: 55, bearing: 0});
    top.appendChild(li);
  });

  function fly(v) {
    view = Object.assign({}, view, v, {transitionDuration: 1400, transitionInterpolator: new FlyToInterpolator()});
    dk.setProps({initialViewState: view});
  }

  const tip = document.getElementById('tip');
  function showTip(info) {
    const o = info.object;
    if (!o) { tip.style.display = 'none'; return; }
    let h;
    if (typeof o[0] === 'string') {
      h = `<b>${MARKET[o[2]]}</b> · score <b>${o[1]}</b><br><span class="k">${D.counties[o[3]] || ''}</span><table>` +
        M.fields.map((f, i) => `<tr><td>${f}</td><td>${fmt(o[7 + i])}${M.field_pct[i] ? '%' : ''}</td></tr>`).join('') +
        `<tr><td>${M.brand} within ${R} mi</td><td>${o[4]}</td></tr>
        <tr><td>${M.comp_short.charAt(0).toUpperCase() + M.comp_short.slice(1)} within ${R} mi</td><td>${o[5]}</td></tr>
        <tr><td>Arterial road in hex</td><td>${(o[6] / 10).toFixed(1)} km</td></tr></table>`;
    } else {
      h = `<b>${D.names[o[3]]}</b><br><span class="k">${o[2] === 1 ? M.brand : M.comp_short} (open places data)</span>`;
    }
    tip.innerHTML = h;
    tip.style.display = 'block';
    const x = Math.min(info.x + 14, innerWidth - tip.offsetWidth - 8), y = Math.min(info.y + 14, innerHeight - tip.offsetHeight - 8);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }

  function layers() {
    const zoom = view.zoom;
    const shown = D.cells.filter(c => on[c[2]]);
    return [
      new GeoJsonLayer({id: 'states', data: B.states, stroked: true, filled: true, getFillColor: [248, 247, 242], getLineColor: [150, 148, 140], lineWidthMinPixels: 1}),
      new GeoJsonLayer({id: 'area', data: B.area, stroked: true, filled: true, getFillColor: [255, 255, 255], getLineColor: [90, 88, 82], lineWidthMinPixels: 1.6}),
      new GeoJsonLayer({id: 'counties', data: B.counties, stroked: true, filled: false, getLineColor: [200, 197, 188], lineWidthMinPixels: 0.6, visible: zoom > 6}),
      new GeoJsonLayer({id: 'freeways', data: B.freeways, stroked: true, filled: false, getLineColor: [196, 186, 160], lineWidthMinPixels: zoom > 8 ? 1.6 : 0.9}),
      new H3HexagonLayer({
        id: 'hex', data: shown, getHexagon: d => d[0], extruded: true, coverage: 0.92, highPrecision: 'auto',
        getElevation: d => d[1], elevationScale: zoom > 11.5 ? 25 : zoom > 9.9 ? 55 : zoom > 9 ? 90 : zoom > 8 ? 160 : zoom > 6.5 ? 400 : 900,
        getFillColor: d => COLORS[d[2]], material: {ambient: 0.55, diffuse: 0.55, shininess: 12, specularColor: [40, 40, 40]},
        pickable: true, autoHighlight: true, highlightColor: [255, 214, 0, 220],
        updateTriggers: {elevationScale: zoom}
      }),
      new ScatterplotLayer({
        id: 'shops', data: D.stores.filter(s => (s[2] === 1 ? shopsDutch : shopsOther)), visible: zoom >= 8.5,
        getPosition: d => [d[0], d[1], 40], getRadius: 4, radiusUnits: 'pixels', stroked: true, lineWidthUnits: 'pixels', getLineWidth: 2,
        getFillColor: d => d[2] === 1 ? [27, 27, 25] : [255, 255, 255], getLineColor: d => d[2] === 1 ? [255, 255, 255] : [27, 27, 25],
        pickable: true, parameters: {depthTest: false}
      }),
      new TextLayer({id: 'states-lab', data: B.stateLabels, getPosition: d => d.p, getText: d => d.t, getSize: 13, sizeUnits: 'pixels',
        getColor: [120, 117, 108], fontFamily: 'Lato, system-ui', fontWeight: 900, characterSet: 'auto', visible: zoom < 7.2,
        fontSettings: {sdf: true}, outlineWidth: 3, outlineColor: [255, 255, 255, 230], parameters: {depthTest: false}}),
      new TextLayer({id: 'cities', data: B.cities.filter(c => c.r <= (zoom < 6 ? 1 : zoom < 8 ? 2 : 3)), getPosition: d => [d.p[0], d.p[1], 0], getText: d => d.t,
        getSize: d => d.r === 1 ? 14 : 12, sizeUnits: 'pixels', getColor: [43, 43, 43], fontFamily: 'Lato, system-ui', fontWeight: 900, characterSet: 'auto',
        getPixelOffset: [0, -12], fontSettings: {sdf: true}, outlineWidth: 4, outlineColor: [255, 255, 255, 235], parameters: {depthTest: false}})
    ];
  }

  // scale bar and north arrow follow the view
  const scaleTxt = document.getElementById('scaleTxt'), scaleBar = document.getElementById('scaleBar'), narrowEl = document.getElementById('narrow');
  function furniture() {
    narrowEl.style.transform = `rotate(${-view.bearing || 0}deg)`;
    const mpp = 40075016.686 * Math.cos(view.latitude * Math.PI / 180) / (512 * Math.pow(2, view.zoom));
    const max = 110 * mpp / 1609.344;
    const steps = [0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];
    const mi = steps.filter(s => s <= max).pop() || 0.25;
    scaleBar.style.width = Math.round(mi * 1609.344 / mpp) + 'px';
    scaleTxt.textContent = `${mi} mi (at map centre)`;
  }

  const dk = new Deck({
    parent: document.getElementById('map'),
    views: new MapView({repeat: false}),
    initialViewState: view,
    controller: {touchRotate: true, dragRotate: true},
    layers: layers(),
    getCursor: ({isHovering}) => isHovering ? 'pointer' : 'grab',
    onHover: showTip,
    onClick: showTip,
    onViewStateChange: ({viewState}) => {
      const z0 = Math.floor(view.zoom * 4);
      view = viewState;
      furniture();
      if (Math.floor(view.zoom * 4) !== z0) dk.setProps({layers: layers()});
      return viewState;
    }
  });
  furniture();
  addEventListener('resize', furniture);

  document.querySelectorAll('#legend input').forEach(i => i.onchange = () => { on[+i.dataset.m] = i.checked; dk.setProps({layers: layers()}); });
  document.getElementById('ownOn').onchange = e => { shopsDutch = e.target.checked; dk.setProps({layers: layers()}); };
  document.getElementById('compOn').onchange = e => { shopsOther = e.target.checked; dk.setProps({layers: layers()}); };
  document.getElementById('north').onclick = () => fly({bearing: 0, pitch: view.pitch});
  const panel = document.getElementById('panel'), hide = document.getElementById('hide');
  const setMin = m => { panel.classList.toggle('min', m); hide.textContent = m ? 'Show legend' : 'Hide'; };
  hide.onclick = () => setMin(!panel.classList.contains('min'));
  if (narrow) setMin(true);
})();
