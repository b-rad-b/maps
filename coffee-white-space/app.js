/* Coffee white space, US Southwest. deck.gl 9.1, no basemap service: the basemap is bundled in basemap.js. */
(function () {
  const {Deck, MapView, H3HexagonLayer, GeoJsonLayer, ScatterplotLayer, TextLayer, FlyToInterpolator} = deck;
  const D = window.WS, B = window.BASE;

  // cells: [h3, score, market(0 white,1 contested,2 saturated), pop_2mi, dt_1mi, dt_2mi, dutch_2mi, road_km*10, places, buildings, county index]
  const COLORS = [[44, 123, 182], [169, 169, 163], [230, 97, 0]];
  const MARKET = ['White space', 'Contested', 'Saturated'];
  const on = [true, true, true];
  let shopsDutch = true, shopsOther = true;

  const counts = [0, 0, 0];
  D.cells.forEach(c => counts[c[2]]++);
  const fmt = n => n.toLocaleString('en-US');
  document.getElementById('ncells').textContent = fmt(D.cells.length);
  counts.forEach((n, i) => document.getElementById('n' + i).textContent = fmt(n));
  const nd = D.shops.filter(s => s[2] === 1).length;
  document.getElementById('nd').textContent = fmt(nd);
  document.getElementById('no').textContent = fmt(D.shops.length - nd);

  const HOME = {longitude: -113.6, latitude: 34.2, zoom: 5.4, pitch: 40, bearing: 0};
  const narrow = matchMedia('(max-width:620px)').matches;
  if (narrow) Object.assign(HOME, {zoom: 4.5, latitude: 33.2});
  let view = Object.assign({}, HOME);

  const METROS = [
    ['Phoenix', -112.0, 33.48, 9.6], ['Tucson', -110.93, 32.25, 10.2], ['Las Vegas', -115.17, 36.14, 10],
    ['Albuquerque', -106.62, 35.1, 10.2], ['Los Angeles', -118.2, 34.03, 9.2], ['Inland Empire', -117.35, 34.0, 9.6],
    ['San Diego', -117.1, 32.8, 9.8], ['Bakersfield', -119.02, 35.36, 10.4], ['Reno', -119.8, 39.53, 10.6],
    ['Las Cruces', -106.77, 32.33, 10.8], ['Santa Fe', -105.96, 35.67, 10.8], ['Yuma', -114.6, 32.68, 10.8]
  ];
  const jump = document.getElementById('jump');
  const home = document.createElement('button');
  home.textContent = 'All four states';
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
    li.innerHTML = `${t.label} <span class="s">· score ${t.score} · ${fmt(t.pop)} people in 2 mi${t.note ? ` (${t.note})` : ""}</span>`;
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
    if (o.length === 11) {
      const c = D.counties[o[10]] || '';
      h = `<b>${MARKET[o[2]]}</b> · score <b>${o[1]}</b><br><span class="k">${c}</span><table>
        <tr><td>People within 2 mi</td><td>${fmt(o[3])}</td></tr>
        <tr><td>Drive-thru coffee, 1 mi / 2 mi</td><td>${o[4]} / ${o[5]}</td></tr>
        <tr><td>Dutch Bros within 2 mi</td><td>${o[6]}</td></tr>
        <tr><td>Arterial road in hex</td><td>${(o[7] / 10).toFixed(1)} km</td></tr>
        <tr><td>Places in hex</td><td>${fmt(o[8])}</td></tr>
        <tr><td>Buildings in hex</td><td>${fmt(o[9])}</td></tr></table>`;
    } else {
      h = `<b>${D.brands[o[3]]}</b><br><span class="k">Drive-thru coffee (Overture place)</span>`;
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
        getElevation: d => d[1], elevationScale: zoom > 11.5 ? 25 : zoom > 9.5 ? 70 : zoom > 8 ? 160 : zoom > 6.5 ? 400 : 900,
        getFillColor: d => COLORS[d[2]], material: {ambient: 0.55, diffuse: 0.55, shininess: 12, specularColor: [40, 40, 40]},
        pickable: true, autoHighlight: true, highlightColor: [255, 214, 0, 220],
        updateTriggers: {elevationScale: zoom}
      }),
      new ScatterplotLayer({
        id: 'shops', data: D.shops.filter(s => (s[2] === 1 ? shopsDutch : shopsOther)), visible: zoom >= 8.5,
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
  document.getElementById('shopsOn').onchange = e => { shopsDutch = e.target.checked; dk.setProps({layers: layers()}); };
  document.getElementById('shopsOn2').onchange = e => { shopsOther = e.target.checked; dk.setProps({layers: layers()}); };
  document.getElementById('north').onclick = () => fly({bearing: 0, pitch: view.pitch});
  const panel = document.getElementById('panel'), hide = document.getElementById('hide');
  const setMin = m => { panel.classList.toggle('min', m); hide.textContent = m ? 'Show legend' : 'Hide'; };
  hide.onclick = () => setMin(!panel.classList.contains('min'));
  if (narrow) setMin(true);
})();
