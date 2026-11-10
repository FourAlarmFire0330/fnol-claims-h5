(function () {
  'use strict';

  var CFG = window.APP_CONFIG;

  var MAP_STYLE = [
    { featureType: 'all', elementType: 'labels.text.fill', stylers: [{ color: '#5D6E63' }] },
    { featureType: 'all', elementType: 'labels.text.stroke', stylers: [{ color: '#F4F6F0' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#DCE3D8' }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#E8EBE3' }] },
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#CFE3C7' }] },
    { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E6E2D6' }] },
    { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#FDF3D6' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#EFD79A' }] },
    { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#6E7A6C' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#BBD8EA' }] },
    { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] }
  ];

  var DEMO_SPOTS = [
    { name: '1265 El Camino Real', sub: 'Menlo Park, CA 94025', lat: 37.45305, lng: -122.18173 },
    { name: 'Whole Foods Market', sub: '1180 El Camino Real, Menlo Park, CA 94025', lat: 37.45355, lng: -122.18140, line1: '1180 El Camino Real' },
    { name: 'Menlo Park Caltrain', sub: '1120 Merrill St, Menlo Park, CA 94025', lat: 37.45460, lng: -122.18255, line1: '1120 Merrill St' },
    { name: 'Ravenswood Ave', sub: 'Menlo Park, CA 94025', lat: 37.45210, lng: -122.17930, line1: 'Ravenswood Ave' },
    { name: 'Oak Grove Ave', sub: 'Menlo Park, CA 94025', lat: 37.45080, lng: -122.18340, line1: 'Oak Grove Ave' },
    { name: 'Stanford Shopping Center', sub: '660 Stanford Shopping Ctr, Palo Alto, CA 94304', lat: 37.44270, lng: -122.17130, line1: '660 Stanford Shopping Ctr' }
  ];

  var S = null;
  var KEY_STORAGE = 'ng.mapsKey.v1';

  function savedKey() {
    try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (err) { return ''; }
  }

  /* ---------------------------------------------------------------------
     loader
     --------------------------------------------------------------------- */
  var mapsLoader = null;

  function loadMaps(key) {
    if (window.google && window.google.maps && window.google.maps.Map) return Promise.resolve();
    if (mapsLoader) return mapsLoader;

    mapsLoader = new Promise(function (resolve, reject) {
      var done = false;
      function finish(fn, value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        fn(value);
      }
      var timer = setTimeout(function () {
        finish(reject, new Error('Google Maps did not start.'));
      }, 12000);

      var cb = '__ngMapsReady_' + Math.random().toString(36).slice(2);
      window[cb] = function () { finish(resolve); };

      window.gm_authFailure = function () {
        if (S && S.ready && !S.demo) {
          startDemo('The Google Maps key was rejected.');
          return;
        }
        finish(reject, new Error('The Google Maps key was rejected.'));
      };

      var script = document.createElement('script');
      script.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({
        key: key,
        v: 'weekly',
        loading: 'async',
        callback: cb,
        language: CFG.language || 'en',
        region: CFG.region || 'US'
      });
      script.async = true;
      script.onerror = function () { finish(reject, new Error('Google Maps could not be loaded.')); };
      document.head.appendChild(script);
    });

    return mapsLoader;
  }

  /* ---------------------------------------------------------------------
     init
     --------------------------------------------------------------------- */
  function init(opts) {
    S = {
      opts: opts || {},
      demo: false,
      ready: false,
      center: { lat: CFG.defaultCenter.lat, lng: CFG.defaultCenter.lng },
      map: null,
      geocoder: null,
      placesLib: null,
      sessionToken: null,
      ignoreIdleUntil: 0,
      demoOffset: { x: 0, y: 0 }
    };

    var key = CFG.googleMapsApiKey || savedKey();
    if (!key) {
      startDemo('No Google Maps API key is configured.');
      return Promise.resolve();
    }

    return loadMaps(key)
      .then(buildReal)
      .catch(function () {
        startDemo('Google Maps could not start.');
      });
  }

  function buildReal() {
    return Promise.all([
      google.maps.importLibrary('maps'),
      google.maps.importLibrary('geocoding').catch(function () { return null; })
    ]).then(function (libs) {
      var mapsLib = libs[0];
      var mapEl = document.getElementById('map');
      mapEl.hidden = false;
      document.getElementById('mapFallback').hidden = true;

      var map = new mapsLib.Map(mapEl, {
        center: S.center,
        zoom: CFG.defaultZoom,
        disableDefaultUI: true,
        clickableIcons: false,
        keyboardShortcuts: false,
        gestureHandling: 'greedy',
        backgroundColor: '#E8EBE3',
        styles: MAP_STYLE
      });
      S.map = map;
      S.geocoder = new google.maps.Geocoder();
      S.ready = true;
      map.addListener('idle', onIdle);

      return new Promise(function (resolve) {
        var settled = false;
        function settle() {
          if (settled) return;
          settled = true;
          resolve();
        }
        google.maps.event.addListenerOnce(map, 'idle', settle);
        setTimeout(settle, 4000);

        /* A rejected key leaves Google's own error panel inside the map. */
        setTimeout(function () {
          if (!S.ready || S.demo) return;
          if (document.querySelector('#map .gm-err-container, #map .gm-err-message')) {
            startDemo('The Google Maps key could not be authenticated.');
          }
        }, 1600);
      });
    });
  }

  function startDemo(reason) {
    if (S.demo) return;
    if (reason) console.info('[MapView] Demo map:', reason);
    S.demo = true;
    S.ready = false;
    var mapEl = document.getElementById('map');
    var fallback = document.getElementById('mapFallback');
    var art = document.getElementById('demoArt');
    mapEl.hidden = true;
    fallback.hidden = false;
    if (!art.childElementCount) art.innerHTML = demoMapSVG();
    bindDemoPan();
    if (S.opts.onDemo) S.opts.onDemo(reason);
    setTimeout(function () {
      if (S.opts.onCenter) S.opts.onCenter({ lat: S.center.lat, lng: S.center.lng, source: 'init' });
    }, 0);
  }

  function emitCenter() {
    if (S.opts.onCenter) S.opts.onCenter({ lat: S.center.lat, lng: S.center.lng, source: 'move' });
  }

  function onIdle() {
    if (!S.map || S.demo) return;
    var c = S.map.getCenter();
    if (!c) return;
    S.center = { lat: c.lat(), lng: c.lng() };
    if (Date.now() < S.ignoreIdleUntil) return;
    emitCenter();
  }

  /* ---------------------------------------------------------------------
     public moves
     --------------------------------------------------------------------- */
  function panTo(lat, lng, options) {
    options = options || {};
    S.center = { lat: lat, lng: lng };
    if (S.demo) {
      S.demoOffset = { x: 0, y: 0 };
      var art = document.getElementById('demoArt');
      if (art) art.style.transform = '';
      emitCenter();
      return;
    }
    if (!S.map) return;
    S.ignoreIdleUntil = Date.now() + 1600;
    S.map.panTo({ lat: lat, lng: lng });
    if (options.zoom) S.map.setZoom(options.zoom);
  }

  function geolocate() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error('This browser can’t share your location. Search an address instead.'));
        return;
      }
      if (window.isSecureContext === false) {
        reject(new Error('Location needs a secure (https) connection. Search an address instead.'));
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
          var message = 'We couldn’t get your location.';
          if (err && err.code === 1) message = 'Location permission was denied. Search an address or move the map instead.';
          else if (err && err.code === 3) message = 'Finding your location took too long. Search an address instead.';
          reject(new Error(message));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  function reverseGeocode(lat, lng) {
    if (S.demo) return demoReverse(lat, lng);
    if (!S.geocoder) return Promise.reject(new Error('Address lookup is unavailable.'));
    return new Promise(function (resolve, reject) {
      S.geocoder.geocode({
        location: { lat: lat, lng: lng },
        region: CFG.region || 'US',
        language: CFG.language || 'en'
      }, function (results, status) {
        if (status === 'OK' && results && results[0]) {
          var parsed = fromComponents(results[0].address_components, results[0].formatted_address, '');
          parsed.lat = lat;
          parsed.lng = lng;
          resolve(parsed);
          return;
        }
        reject(new Error(status === 'OVER_QUERY_LIMIT'
          ? 'Address lookup is busy. Move the map again in a moment.'
          : 'We couldn’t read the address at this point. Search instead.'));
      });
    });
  }

  /* ---------------------------------------------------------------------
     search
     --------------------------------------------------------------------- */
  function getPlacesLib() {
    if (S.placesLib) return Promise.resolve(S.placesLib);
    return google.maps.importLibrary('places').then(function (lib) {
      S.placesLib = lib;
      return lib;
    });
  }

  function search(query) {
    if (S.demo) return Promise.resolve(demoSearch(query));
    return getPlacesLib().then(function (lib) {
      if (lib.AutocompleteSuggestion && lib.AutocompleteSuggestion.fetchAutocompleteSuggestions) {
        return newPlacesSearch(lib, query).catch(function () {
          return legacySearch(lib, query);
        });
      }
      return legacySearch(lib, query);
    });
  }

  function newPlacesSearch(lib, query) {
    var request = {
      input: query,
      language: CFG.language || 'en',
      includedRegionCodes: [(CFG.region || 'US').toLowerCase()],
      locationBias: {
        center: { lat: S.center.lat, lng: S.center.lng },
        radius: 40000
      }
    };
    if (lib.AutocompleteSessionToken) {
      if (!S.sessionToken) S.sessionToken = new lib.AutocompleteSessionToken();
      request.sessionToken = S.sessionToken;
    }
    return lib.AutocompleteSuggestion.fetchAutocompleteSuggestions(request).then(function (res) {
      var out = [];
      (res.suggestions || []).forEach(function (s) {
        var p = s.placePrediction;
        if (!p) return;
        var main = p.mainText && p.mainText.text;
        var second = p.secondaryText && p.secondaryText.text;
        if (!main && p.text) {
          var parts = p.text.text.split(', ');
          main = parts.shift();
          second = parts.join(', ');
        }
        out.push({
          id: p.placeId,
          name: main || query,
          sub: second || '',
          raw: p
        });
      });
      return out.slice(0, 5);
    });
  }

  function legacySearch(lib, query) {
    var Service = lib.AutocompleteService || (google.maps.places && google.maps.places.AutocompleteService);
    if (!Service) return Promise.resolve([]);
    return new Promise(function (resolve, reject) {
      var svc = new Service();
      svc.getPlacePredictions({
        input: query,
        componentRestrictions: { country: (CFG.region || 'US').toLowerCase() }
      }, function (preds, status) {
        if (status === 'ZERO_RESULTS') { resolve([]); return; }
        if (status !== 'OK') {
          reject(new Error(status === 'OVER_QUERY_LIMIT'
            ? 'Search is busy. Try again in a moment.'
            : 'Address search is unavailable right now.'));
          return;
        }
        resolve((preds || []).slice(0, 5).map(function (p) {
          return {
            id: p.place_id,
            name: p.structured_formatting ? p.structured_formatting.main_text : p.description,
            sub: p.structured_formatting ? p.structured_formatting.secondary_text : '',
            raw: p,
            legacy: true
          };
        }));
      });
    });
  }

  function resolveSuggestion(sug) {
    if (S.demo) return Promise.resolve(demoPick(sug));
    if (!sug || !sug.raw) return Promise.reject(new Error('That suggestion is no longer available.'));

    if (typeof sug.raw.toPlace === 'function') {
      var place = sug.raw.toPlace();
      return place.fetchFields({
        fields: ['location', 'formattedAddress', 'addressComponents', 'displayName']
      }).then(function () {
        if (S.sessionToken && S.placesLib && S.placesLib.AutocompleteSessionToken) {
          S.sessionToken = new S.placesLib.AutocompleteSessionToken();
        }
        var loc = place.location;
        if (!loc) return geocodePlaceId(sug.id);
        var display = place.displayName;
        var placeName = typeof display === 'string' ? display : (display && display.text) || sug.name;
        var parsed = fromComponents(place.addressComponents, place.formattedAddress, placeName);
        parsed.lat = loc.lat();
        parsed.lng = loc.lng();
        parsed.name = placeName;
        return parsed;
      }).catch(function () { return geocodePlaceId(sug.id); });
    }
    return geocodePlaceId(sug.id);
  }

  function geocodePlaceId(placeId) {
    return new Promise(function (resolve, reject) {
      if (!S.geocoder || !placeId) { reject(new Error('That place could not be opened.')); return; }
      S.geocoder.geocode({ placeId: placeId, language: CFG.language || 'en' }, function (results, status) {
        if (status === 'OK' && results && results[0]) {
          var r = results[0];
          var parsed = fromComponents(r.address_components, r.formatted_address, '');
          var loc = r.geometry && r.geometry.location;
          if (!loc) { reject(new Error('That place has no location.')); return; }
          parsed.lat = loc.lat();
          parsed.lng = loc.lng();
          resolve(parsed);
          return;
        }
        reject(new Error('That place could not be opened.'));
      });
    });
  }

  /* ---------------------------------------------------------------------
     address helpers
     --------------------------------------------------------------------- */
  function pickComponent(components, type) {
    if (!components) return null;
    for (var i = 0; i < components.length; i++) {
      if ((components[i].types || []).indexOf(type) > -1) return components[i];
    }
    return null;
  }

  function longName(c) { return c ? (c.long_name || c.longText || '') : ''; }
  function shortName(c) { return c ? (c.short_name || c.shortText || '') : ''; }

  function cleanAddress(value) {
    return String(value || '')
      .replace(/,\s*(USA|United States of America|United States)\.?$/i, '')
      .trim();
  }

  function fromComponents(components, formattedAddress, fallbackName) {
    var number = pickComponent(components, 'street_number');
    var route = pickComponent(components, 'route');
    var locality = pickComponent(components, 'locality')
      || pickComponent(components, 'postal_town')
      || pickComponent(components, 'sublocality')
      || pickComponent(components, 'administrative_area_level_2');
    var admin = pickComponent(components, 'administrative_area_level_1');
    var zip = pickComponent(components, 'postal_code');

    var line1 = [longName(number), longName(route)].filter(Boolean).join(' ');
    if (!line1) line1 = longName(pickComponent(components, 'premise'))
      || longName(pickComponent(components, 'point_of_interest'))
      || fallbackName || '';

    var region = [shortName(admin), longName(zip)].filter(Boolean).join(' ');
    var short = [longName(locality), region].filter(Boolean).join(', ');
    var address = cleanAddress(formattedAddress) || [line1, short].filter(Boolean).join(', ');

    if (!line1) line1 = address.split(',')[0] || 'Pin location';
    return { line1: line1, short: short || address, address: address };
  }

  function fmtCoords(lat, lng) {
    return lat.toFixed(5) + ', ' + lng.toFixed(5);
  }

  /* ---------------------------------------------------------------------
     demo map
     --------------------------------------------------------------------- */
  function bindDemoPan() {
    var wrap = document.getElementById('mapFallback');
    var art = document.getElementById('demoArt');
    if (!wrap || wrap.dataset.bound) return;
    wrap.dataset.bound = '1';

    var drag = null;
    var LAT_PER_PX = 0.0000108;
    var LNG_PER_PX = 0.0000136;

    wrap.addEventListener('pointerdown', function (e) {
      if (drag || e.button > 0) return;
      var rect = wrap.getBoundingClientRect();
      drag = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        ox: S.demoOffset.x,
        oy: S.demoOffset.y,
        lat: S.center.lat,
        lng: S.center.lng,
        maxX: rect.width * 0.3,
        maxY: rect.height * 0.3,
        moved: false
      };
      try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or cancelled pointer */ }
      wrap.classList.add('dragging');
    });

    wrap.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      var x = Math.max(-drag.maxX, Math.min(drag.maxX, drag.ox + dx));
      var y = Math.max(-drag.maxY, Math.min(drag.maxY, drag.oy + dy));
      S.demoOffset = { x: x, y: y };
      art.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    });

    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var moved = drag.moved;
      var ox = drag.ox;
      var oy = drag.oy;
      var startLat = drag.lat;
      var startLng = drag.lng;
      drag = null;
      wrap.classList.remove('dragging');
      if (!moved) return;
      S.center = {
        lat: startLat + (S.demoOffset.y - oy) * LAT_PER_PX,
        lng: startLng - (S.demoOffset.x - ox) * LNG_PER_PX
      };
      emitCenter();
    }

    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      wrap.classList.remove('dragging');
    });
  }

  function metersBetween(lat1, lng1, lat2, lng2) {
    var dLat = (lat2 - lat1) * 111320;
    var dLng = (lng2 - lng1) * 111320 * Math.cos(lat1 * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  function demoReverse(lat, lng) {
    var nearest = null;
    var best = Infinity;
    DEMO_SPOTS.forEach(function (sp) {
      var d = metersBetween(lat, lng, sp.lat, sp.lng);
      if (d < best) { best = d; nearest = sp; }
    });
    if (best < 260 && nearest) {
      return Promise.resolve({
        line1: nearest.line1 || nearest.name,
        short: nearest.sub,
        address: (nearest.line1 || nearest.name) + ', ' + nearest.sub,
        lat: lat,
        lng: lng
      });
    }
    if (metersBetween(lat, lng, CFG.defaultCenter.lat, CFG.defaultCenter.lng) < 6000) {
      var n = nearest || DEMO_SPOTS[0];
      return Promise.resolve({
        line1: 'Near ' + (n.line1 || n.name),
        short: n.sub,
        address: 'Near ' + (n.line1 || n.name) + ', ' + n.sub,
        lat: lat,
        lng: lng
      });
    }
    return Promise.resolve({
      line1: 'Current location',
      short: 'GPS · ' + fmtCoords(lat, lng),
      address: 'Current location · ' + fmtCoords(lat, lng),
      lat: lat,
      lng: lng
    });
  }

  function demoSearch(query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    var out = [];
    DEMO_SPOTS.forEach(function (sp, i) {
      if ((sp.name + ' ' + sp.sub).toLowerCase().indexOf(q) > -1) {
        out.push({ id: 'demo:' + i, name: sp.name, sub: sp.sub, raw: sp, demoIndex: i });
      }
    });
    return out.slice(0, 5);
  }

  function demoPick(sug) {
    var sp = sug.raw;
    S.center = { lat: sp.lat, lng: sp.lng };
    S.demoOffset = { x: 0, y: 0 };
    var art = document.getElementById('demoArt');
    if (art) art.style.transform = '';
    return {
      line1: sp.line1 || sp.name,
      short: sp.sub,
      address: (sp.line1 || sp.name) + ', ' + sp.sub,
      lat: sp.lat,
      lng: sp.lng,
      name: sp.name
    };
  }

  function demoMapSVG() {
    var blocks = [
      [14, 26, 86, 64], [118, 24, 70, 68], [300, 24, 70, 60],
      [14, 126, 72, 58], [104, 126, 80, 58], [212, 132, 74, 50],
      [14, 208, 66, 52], [96, 206, 72, 50], [210, 204, 80, 54], [304, 196, 60, 64],
      [14, 286, 78, 58], [110, 286, 66, 54], [206, 286, 84, 56], [304, 292, 62, 52],
      [14, 376, 70, 52], [98, 376, 76, 50], [204, 372, 80, 54]
    ];
    var buildings = [
      [26, 40, 34, 18], [66, 40, 24, 26], [130, 38, 28, 22], [166, 42, 14, 20],
      [22, 140, 28, 18], [112, 140, 36, 16], [222, 146, 30, 18], [26, 220, 24, 16],
      [112, 218, 30, 18], [222, 218, 34, 20], [26, 300, 30, 20], [120, 300, 28, 16],
      [218, 300, 32, 18], [28, 390, 26, 16], [110, 390, 32, 16], [216, 386, 28, 18]
    ];
    return '<svg viewBox="0 0 340 470" preserveAspectRatio="xMidYMid slice">' +
      '<rect width="340" height="470" fill="#E8EBE3"/>' +
      '<rect x="200" y="-14" width="158" height="128" rx="8" fill="#CFE3C7"/>' +
      '<circle cx="222" cy="26" r="7" fill="#BAD9B1"/><circle cx="252" cy="46" r="9" fill="#BAD9B1"/>' +
      '<circle cx="286" cy="20" r="6" fill="#BAD9B1"/><circle cx="312" cy="58" r="8" fill="#BAD9B1"/>' +
      '<path d="M300 120c22-10 44-8 60 2v20c-20-8-40-8-60 2Z" fill="#BBD8EA"/>' +
      blocks.map(function (b) { return '<rect x="' + b[0] + '" y="' + b[1] + '" width="' + b[2] + '" height="' + b[3] + '" rx="4" fill="#F6F6F1" stroke="#E2E0D9"/>'; }).join('') +
      buildings.map(function (b) { return '<rect x="' + b[0] + '" y="' + b[1] + '" width="' + b[2] + '" height="' + b[3] + '" rx="2" fill="#EBEBE4"/>'; }).join('') +
      '<rect x="92" y="182" width="150" height="104" rx="3" fill="#EDEDE7" stroke="#DCDAD2"/>' +
      '<path d="M-20 118H360" stroke="#E6E2D6" stroke-width="20"/><path d="M-20 118H360" stroke="#FFFFFF" stroke-width="15"/>' +
      '<path d="M-20 258H360" stroke="#E6E2D6" stroke-width="16"/><path d="M-20 258H360" stroke="#FFFFFF" stroke-width="11"/>' +
      '<path d="M-20 392H360" stroke="#E6E2D6" stroke-width="14"/><path d="M-20 392H360" stroke="#FFFFFF" stroke-width="10"/>' +
      '<path d="M66 -20V490" stroke="#E6E2D6" stroke-width="14"/><path d="M66 -20V490" stroke="#FFFFFF" stroke-width="10"/>' +
      '<path d="M288 -20V490" stroke="#E6E2D6" stroke-width="12"/><path d="M288 -20V490" stroke="#FFFFFF" stroke-width="8"/>' +
      '<path d="M196 490L216 -20" stroke="#E6E2D6" stroke-width="30"/><path d="M196 490L216 -20" stroke="#FFFDF8" stroke-width="24"/>' +
      '<path d="M196 490L216 -20" stroke="#F0EBDA" stroke-width="24" stroke-dasharray=".1 26" opacity=".9"/>' +
      '<path d="M-30 66L150 -40" stroke="#EFD79A" stroke-width="16"/><path d="M-30 66L150 -40" stroke="#FBE9AE" stroke-width="11"/>' +
      '<g font-family="-apple-system,Helvetica,Arial" fill="#6E7A6C">' +
        '<text x="24" y="112" font-size="9.4" letter-spacing=".2">Santa Cruz Ave</text>' +
        '<text x="122" y="252" font-size="8.8">Ravenswood Ave</text>' +
        '<text x="150" y="386" font-size="8.8">Oak Grove Ave</text>' +
        '<text transform="rotate(-87 226 300)" x="226" y="300" font-size="9.6" letter-spacing=".4" fill="#5F6A5E">El Camino Real</text>' +
        '<text x="18" y="452" font-size="12" letter-spacing="1.6" fill="#7B8878">MENLO PARK</text>' +
      '</g>' +
      '<g><circle cx="116" cy="150" r="6" fill="#4E9A6A"/><circle cx="116" cy="150" r="2.4" fill="#FFFFFF"/>' +
      '<text x="127" y="153" font-family="-apple-system,Helvetica,Arial" font-size="9.2" fill="#3F5A47">Whole Foods Market</text></g>' +
    '</svg>';
  }

  window.MapView = {
    init: init,
    panTo: panTo,
    geolocate: geolocate,
    reverseGeocode: reverseGeocode,
    search: search,
    resolveSuggestion: resolveSuggestion,
    isDemo: function () { return !!S && S.demo; },
    getCenter: function () { return S ? { lat: S.center.lat, lng: S.center.lng } : null; }
  };
})();