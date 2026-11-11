(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var DATA = window.CA_MAP;

  var MIN_K = 1;
  var MAX_K = 10;
  var EMIT_DELAY = 180;

  var S = null;

  var ALIASES = {
    'San Francisco': ['sf', 'san fran', 'bay area'],
    'Los Angeles': ['la', 'l.a.', 'socal'],
    'San Diego': ['sd'],
    'Sacramento': ['sac', 'norcal'],
    'San Jose': ['sj'],
    'Santa Barbara': ['sb'],
    'Palm Springs': ['ps']
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function project(lat, lng) {
    var p = DATA.projection;
    return {
      x: p.pad + (lng - DATA.bounds.west) * p.cosLat * p.scale,
      y: p.pad + (DATA.bounds.north - lat) * p.scale
    };
  }

  function unproject(x, y) {
    var p = DATA.projection;
    return {
      lat: DATA.bounds.north - (y - p.pad) / p.scale,
      lng: DATA.bounds.west + (x - p.pad) / (p.cosLat * p.scale)
    };
  }

  function kmBetween(lat1, lng1, lat2, lng2) {
    var mid = (lat1 + lat2) * Math.PI / 360;
    var dx = (lng2 - lng1) * 111.32 * Math.cos(mid);
    var dy = (lat2 - lat1) * 110.57;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function coords(lat, lng) {
    return lat.toFixed(5) + ', ' + lng.toFixed(5);
  }

  function contains(lat, lng) {
    var b = DATA.bounds;
    return isFinite(lat) && isFinite(lng) &&
      lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
  }

  /* ---------------------------------------------------------------------
     build
     --------------------------------------------------------------------- */
  function init(opts) {
    if (!DATA || !DATA.places || !DATA.counties) {
      return Promise.reject(new Error('The California map data did not load.'));
    }

    S = {
      opts: opts || {},
      root: document.getElementById('map'),
      layer: document.getElementById('mapLayer'),
      labels: document.getElementById('mapLabels'),
      places: [],
      search: [],
      vw: 0,
      vh: 0,
      fit: 1,
      k: MIN_K,
      z: 1,
      tx: 0,
      ty: 0,
      center: null,
      emitTimer: null,
      ready: false
    };
    if (!S.root || !S.layer || !S.labels) {
      return Promise.reject(new Error('The map container is missing.'));
    }

    buildLabels();
    buildSearch();
    bind();

    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        resize(true);
        resolve();
      });
    });
  }

  function buildLabels() {
    DATA.places.forEach(function (place) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'map-label' + (place.major ? ' major' : '');
      el.title = place.sub;
      el.setAttribute('aria-label', 'Go to ' + place.name);

      var dot = document.createElement('i');
      var text = document.createElement('span');
      text.textContent = place.name;
      el.appendChild(dot);
      el.appendChild(text);

      el.addEventListener('click', function (e) {
        e.stopPropagation();
        focusPlace(place);
      });

      S.labels.appendChild(el);
      var p = project(place.lat, place.lng);
      S.places.push({
        el: el,
        place: place,
        x: p.x,
        y: p.y,
        minZoom: Number(place.minZoom) || 4
      });
    });
  }

  function buildSearch() {
    var list = [];

    DATA.places.forEach(function (p) {
      var alias = ALIASES[p.name] || [];
      list.push({
        id: 'place:' + p.name,
        kind: 'place',
        name: p.name,
        sub: p.sub,
        address: p.sub,
        lat: p.lat,
        lng: p.lng,
        zoom: 5,
        hay: (p.name + ' ' + p.sub + ' ' + alias.join(' ')).toLowerCase()
      });
    });

    DATA.counties.forEach(function (c) {
      var name = c.name + ' County';
      list.push({
        id: 'county:' + c.name,
        kind: 'county',
        name: name,
        sub: 'California',
        address: name + ', CA',
        lat: c.lat,
        lng: c.lng,
        zoom: 3,
        hay: (name + ' ' + c.name).toLowerCase()
      });
    });

    S.search = list;
  }

  /* ---------------------------------------------------------------------
     layout
     --------------------------------------------------------------------- */
  function resize(first) {
    if (!S) return;
    var rect = S.root.getBoundingClientRect();
    var vw = Math.round(rect.width);
    var vh = Math.round(rect.height);
    if (!vw || !vh) {
      vw = 390;
      vh = 520;
    }

    var changed = vw !== S.vw || vh !== S.vh;
    S.vw = vw;
    S.vh = vh;
    /* Cover the viewport at 1× so a drag always has map under the finger;
       the state's full height still fits, only the far edges are cropped. */
    S.fit = Math.max(vw / DATA.viewBox.width, vh / DATA.viewBox.height);

    if (first || !S.center) {
      var lat = CFG.defaultCenter && isFinite(CFG.defaultCenter.lat)
        ? CFG.defaultCenter.lat
        : (DATA.bounds.north + DATA.bounds.south) / 2;
      var lng = CFG.defaultCenter && isFinite(CFG.defaultCenter.lng)
        ? CFG.defaultCenter.lng
        : (DATA.bounds.east + DATA.bounds.west) / 2;
      S.center = { lat: lat, lng: lng };
      S.k = MIN_K;
      S.z = S.fit * S.k;
      centerView();
    } else if (changed) {
      S.z = S.fit * S.k;
      centerView();
    }

    S.ready = true;
    applyView();
  }

  function centerView() {
    var p = project(S.center.lat, S.center.lng);
    S.tx = S.vw / 2 - p.x * S.z;
    S.ty = S.vh / 2 - p.y * S.z;
    clampView();
  }

  function clampView() {
    var mw = DATA.viewBox.width * S.z;
    var mh = DATA.viewBox.height * S.z;

    if (mw <= S.vw) S.tx = (S.vw - mw) / 2;
    else S.tx = clamp(S.tx, S.vw - mw, 0);

    if (mh <= S.vh) S.ty = (S.vh - mh) / 2;
    else S.ty = clamp(S.ty, S.vh - mh, 0);
  }

  function applyView() {
    if (!S || !S.ready) return;
    S.layer.style.transform = 'translate3d(' + S.tx.toFixed(1) + 'px,' +
      S.ty.toFixed(1) + 'px,0) scale(' + S.z.toFixed(4) + ')';
    updateLabels();
  }

  function updateLabels() {
    for (var i = 0; i < S.places.length; i++) {
      var item = S.places[i];
      if (S.k + 0.001 < item.minZoom) {
        if (item.el.style.display !== 'none') item.el.style.display = 'none';
        continue;
      }
      var x = S.tx + item.x * S.z;
      var y = S.ty + item.y * S.z;
      if (x < -90 || x > S.vw + 90 || y < -30 || y > S.vh + 30) {
        if (item.el.style.display !== 'none') item.el.style.display = 'none';
        continue;
      }
      if (item.el.style.display === 'none') item.el.style.display = '';
      item.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' +
        y.toFixed(1) + 'px,0) translate(-50%,-50%)';
    }
  }

  function centerFromView() {
    var p = unproject((S.vw / 2 - S.tx) / S.z, (S.vh / 2 - S.ty) / S.z);
    return { lat: p.lat, lng: p.lng };
  }

  function notifyStart() {
    if (S && S.opts.onStart) S.opts.onStart();
  }

  function emitCenter(source) {
    clearTimeout(S.emitTimer);
    S.center = centerFromView();
    if (S.opts.onCenter) {
      S.opts.onCenter({
        lat: S.center.lat,
        lng: S.center.lng,
        source: source || 'move'
      });
    }
  }

  function scheduleEmit(source) {
    clearTimeout(S.emitTimer);
    S.emitTimer = setTimeout(function () { emitCenter(source); }, EMIT_DELAY);
  }

  /* ---------------------------------------------------------------------
     moves
     --------------------------------------------------------------------- */
  function panTo(lat, lng, options) {
    if (!S || !S.ready || !isFinite(lat) || !isFinite(lng)) return;
    options = options || {};
    S.center = { lat: Number(lat), lng: Number(lng) };
    if (options.zoom) S.k = clamp(Number(options.zoom) || MIN_K, MIN_K, MAX_K);
    S.z = S.fit * S.k;
    centerView();
    applyView();
    notifyStart();
    clearTimeout(S.emitTimer);
    if (S.opts.onCenter) {
      S.opts.onCenter({ lat: S.center.lat, lng: S.center.lng, source: 'programmatic' });
    }
  }

  function zoomBy(factor, sx, sy) {
    if (!S || !S.ready) return;
    var newK = clamp(S.k * factor, MIN_K, MAX_K);
    if (Math.abs(newK - S.k) < 0.0005) return;

    var ax = typeof sx === 'number' ? sx : S.vw / 2;
    var ay = typeof sy === 'number' ? sy : S.vh / 2;
    var wx = (ax - S.tx) / S.z;
    var wy = (ay - S.ty) / S.z;

    S.k = newK;
    S.z = S.fit * S.k;
    S.tx = ax - wx * S.z;
    S.ty = ay - wy * S.z;
    clampView();
    applyView();
    S.center = centerFromView();
    scheduleEmit('move');
  }

  function focusPlace(place) {
    if (!S || !S.ready) return;
    S.k = Math.max(S.k, 4.5);
    S.center = { lat: place.lat, lng: place.lng };
    S.z = S.fit * S.k;
    centerView();
    applyView();
    notifyStart();
    var info = placeInfo(place);
    if (S.opts.onPlace) S.opts.onPlace(info);
    else emitCenter('move');
  }

  function placeInfo(place) {
    return {
      line1: place.name,
      short: place.sub,
      address: place.address || place.sub,
      lat: place.lat,
      lng: place.lng,
      name: place.name,
      zoom: place.zoom || 5
    };
  }

  /* ---------------------------------------------------------------------
     input
     --------------------------------------------------------------------- */
  function bind() {
    var pointers = {};
    var count = 0;
    var drag = null;
    var pinch = null;
    var moved = false;

    function pointList() {
      return Object.keys(pointers).map(function (id) { return pointers[id]; });
    }

    function beginPinch() {
      var p = pointList();
      if (p.length < 2) return;
      var a = p[0];
      var b = p[1];
      var mx = (a.x + b.x) / 2;
      var my = (a.y + b.y) / 2;
      var dx = a.x - b.x;
      var dy = a.y - b.y;
      pinch = {
        dist: Math.sqrt(dx * dx + dy * dy) || 1,
        k: S.k,
        worldX: (mx - S.tx) / S.z,
        worldY: (my - S.ty) / S.z
      };
    }

    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest && (e.target.closest('.map-label') || e.target.closest('.zoomctl'))) return;

      e.preventDefault();
      notifyStart();
      try { S.root.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      count++;
      S.root.classList.add('dragging');

      if (count === 1) {
        drag = { x: e.clientX, y: e.clientY, tx: S.tx, ty: S.ty };
        moved = false;
      } else if (count === 2) {
        drag = null;
        beginPinch();
      }
    }

    function onMove(e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

      if (count >= 2 && pinch) {
        var p = pointList();
        var a = p[0];
        var b = p[1];
        var mx = (a.x + b.x) / 2;
        var my = (a.y + b.y) / 2;
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var newK = clamp(pinch.k * (dist / pinch.dist), MIN_K, MAX_K);

        S.k = newK;
        S.z = S.fit * S.k;
        S.tx = mx - pinch.worldX * S.z;
        S.ty = my - pinch.worldY * S.z;
        clampView();
        applyView();
        S.center = centerFromView();
        moved = true;
        return;
      }

      if (!drag) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      S.tx = drag.tx + dx;
      S.ty = drag.ty + dy;
      clampView();
      applyView();
      S.center = centerFromView();
    }

    function onUp(e) {
      if (!pointers[e.pointerId]) return;
      delete pointers[e.pointerId];
      count = Math.max(0, count - 1);
      try { S.root.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }

      if (count === 1) {
        var p = pointList()[0];
        drag = { x: p.x, y: p.y, tx: S.tx, ty: S.ty };
        pinch = null;
        return;
      }

      if (count === 0) {
        S.root.classList.remove('dragging');
        drag = null;
        pinch = null;
        if (moved) {
          moved = false;
          emitCenter('move');
        }
      }
    }

    S.root.addEventListener('pointerdown', onDown);
    S.root.addEventListener('pointermove', onMove);
    S.root.addEventListener('pointerup', onUp);
    S.root.addEventListener('pointercancel', onUp);

    S.root.addEventListener('wheel', function (e) {
      e.preventDefault();
      notifyStart();
      var rect = S.root.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    S.root.addEventListener('dblclick', function (e) {
      if (e.target.closest && e.target.closest('.map-label')) return;
      e.preventDefault();
      notifyStart();
      var rect = S.root.getBoundingClientRect();
      zoomBy(1.8, e.clientX - rect.left, e.clientY - rect.top);
    });

    S.root.addEventListener('keydown', function (e) {
      var step = 90;
      var handled = true;
      if (e.key === 'ArrowLeft') S.tx += step;
      else if (e.key === 'ArrowRight') S.tx -= step;
      else if (e.key === 'ArrowUp') S.ty += step;
      else if (e.key === 'ArrowDown') S.ty -= step;
      else if (e.key === '+' || e.key === '=') zoomBy(1.4);
      else if (e.key === '-') zoomBy(1 / 1.4);
      else handled = false;

      if (!handled) return;
      e.preventDefault();
      notifyStart();
      if (e.key.indexOf('Arrow') === 0) {
        clampView();
        applyView();
        scheduleEmit('move');
      }
    });

    var zin = document.getElementById('zoomIn');
    var zout = document.getElementById('zoomOut');
    if (zin) zin.addEventListener('click', function (e) {
      e.stopPropagation();
      notifyStart();
      zoomBy(1.6);
    });
    if (zout) zout.addEventListener('click', function (e) {
      e.stopPropagation();
      notifyStart();
      zoomBy(1 / 1.6);
    });

    window.addEventListener('resize', function () { resize(false); });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { resize(false); }, 250);
    });
  }

  /* ---------------------------------------------------------------------
     reverse lookup / search
     --------------------------------------------------------------------- */
  function nearestPlace(lat, lng) {
    var best = null;
    var bestKm = Infinity;
    DATA.places.forEach(function (p) {
      var d = kmBetween(lat, lng, p.lat, p.lng);
      if (d < bestKm) { bestKm = d; best = p; }
    });
    return { place: best, km: bestKm };
  }

  function nearestCounty(lat, lng) {
    var best = null;
    var bestKm = Infinity;
    DATA.counties.forEach(function (c) {
      var d = kmBetween(lat, lng, c.lat, c.lng);
      if (d < bestKm) { bestKm = d; best = c; }
    });
    return { county: best, km: bestKm };
  }

  function reverseGeocode(lat, lng) {
    var near = nearestPlace(lat, lng);
    var county = nearestCounty(lat, lng);
    var countyName = county.county ? county.county.name + ' County' : 'California';
    var point = coords(lat, lng);
    var limit = near.place && near.place.major ? 14 : 8;

    if (near.place && near.km <= limit) {
      var place = near.place;
      return Promise.resolve({
        line1: near.km < 1.5 ? place.name : 'Near ' + place.name,
        short: place.sub + ' · ' + countyName,
        address: place.sub + ' · ' + point,
        lat: lat,
        lng: lng,
        name: place.name
      });
    }

    return Promise.resolve({
      line1: 'Pinned location',
      short: countyName + ', CA · ' + point,
      address: countyName + ', CA · ' + point,
      lat: lat,
      lng: lng
    });
  }

  function parseCoords(q) {
    var m = q.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (!m) return null;
    var lat = Number(m[1]);
    var lng = Number(m[2]);
    if (!contains(lat, lng)) return null;
    return { lat: lat, lng: lng };
  }

  function search(query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return Promise.resolve([]);

    var exact = parseCoords(q);
    if (exact) {
      return Promise.resolve([{
        id: 'point',
        kind: 'point',
        name: 'Pinned location',
        sub: coords(exact.lat, exact.lng),
        address: coords(exact.lat, exact.lng),
        lat: exact.lat,
        lng: exact.lng,
        zoom: 6
      }]);
    }

    var scored = [];
    S.search.forEach(function (item, order) {
      var idx = item.hay.indexOf(q);
      if (idx === -1) return;

      var name = item.name.toLowerCase();
      var score;
      if (name === q) score = 0;
      else if (name.indexOf(q) === 0) score = 1;
      else if (name.indexOf(' ' + q) > -1) score = 2;
      else score = 3;
      if (item.kind === 'county') score += 0.5;

      scored.push({ item: item, score: score, order: order });
    });

    scored.sort(function (a, b) {
      return a.score - b.score || a.order - b.order;
    });

    return Promise.resolve(scored.slice(0, 6).map(function (row) {
      var item = row.item;
      return {
        id: item.id,
        kind: item.kind,
        name: item.name,
        sub: item.sub,
        address: item.address,
        lat: item.lat,
        lng: item.lng,
        zoom: item.zoom
      };
    }));
  }

  function resolveSuggestion(sug) {
    if (!sug || !isFinite(sug.lat) || !isFinite(sug.lng)) {
      return Promise.reject(new Error('That place is not on this map.'));
    }
    return Promise.resolve(placeInfo(sug));
  }

  function geolocate() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error('This browser can’t share your location. Search a California city instead.'));
        return;
      }
      if (window.isSecureContext === false) {
        reject(new Error('Location needs a secure (https) connection. Search a California city instead.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy || null
          });
        },
        function (err) {
          var message = 'We couldn’t get your location. Search a California city instead.';
          if (err && err.code === 1) message = 'Location permission was denied. Search a California city or move the map instead.';
          else if (err && err.code === 3) message = 'Finding your location took too long. Search a California city instead.';
          reject(new Error(message));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  window.MapView = {
    init: init,
    panTo: panTo,
    zoomBy: zoomBy,
    geolocate: geolocate,
    reverseGeocode: reverseGeocode,
    search: search,
    resolveSuggestion: resolveSuggestion,
    contains: contains,
    getCenter: function () {
      return S && S.center ? { lat: S.center.lat, lng: S.center.lng } : null;
    }
  };
})();