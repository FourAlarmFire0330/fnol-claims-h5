(function () {
  'use strict';

  var CFG = window.APP_CONFIG;
  var HASH = { 1: '#where', 2: '#photos', 3: '#details', 4: '#done' };
  var RECEIPT_KEY = 'ng.claimReceipt.v1';
  var ASYNC_TOKEN_KEY = 'ng.asyncToken.v1';

  var state = {
    step: 1,
    policy: null,
    boot: { policy: '', token: '' },
    asyncToken: '',
    callback: { url: '' },
    pending: null,
    location: null,
    locationReady: false,
    consent: false,
    sending: false,
    claim: '',
    histOK: true,
    programmaticMoveAt: 0,
    locating: false
  };

  var search = { suggestions: [], active: -1, timer: null, seq: 0 };
  var els = {};
  var centerTimer = null;
  var toastTimer = null;

  document.addEventListener('DOMContentLoaded', boot);

  function boot() {
    /* The SMS link carries the dynamic token after the hash route:
       https://fnol-claims-h5.vercel.app/#where?token=...
       Capture it before history.replaceState() rewrites the URL. */
    state.asyncToken = readAsyncToken();
    state.callback = buildCallbackConfig(state.asyncToken);

    cacheElements();
    bindStatic();
    DetailsUI.init();

    if (restoreReceiptIfNeeded()) return;

    PhotosUI.init({
      onContinue: function () {
        if (!state.policy) { toast('Still loading your policy. One moment…'); return; }
        if (PhotosUI.count() < 1) { toast('Add at least one photo to continue.'); return; }
        go(3);
      },
      onError: toast
    });

    show(1, { initial: true, back: false });

    try {
      history.replaceState({ step: 1 }, '', location.pathname + location.search + HASH[1]);
    } catch (err) {
      state.histOK = false;
    }

    initMap();
    loadPolicy();
  }

  function cacheElements() {
    els.app = document.getElementById('app');
    els.views = Array.prototype.slice.call(document.querySelectorAll('.view'));
    els.pin = document.getElementById('pin');
    els.addrLine = document.getElementById('addrLine');
    els.addrSub = document.getElementById('addrSub');
    els.next1 = document.getElementById('next1');
    els.adjustBtn = document.getElementById('adjustBtn');
    els.searchbar = document.getElementById('searchbar');
    els.searchInput = document.getElementById('searchInput');
    els.searchClear = document.getElementById('searchClear');
    els.results = document.getElementById('searchResults');
    els.recenter = document.getElementById('recenter');
    els.locVeil = document.getElementById('locVeil');
    els.allowLoc = document.getElementById('allowLoc');
    els.denyLoc = document.getElementById('denyLoc');
    els.consent = document.getElementById('consent');
    els.submitBtn = document.getElementById('submitBtn');
    els.claimNo = document.getElementById('claimNo');
    els.rcVehicle = document.getElementById('rcVehicle');
    els.rcPlate = document.getElementById('rcPlate');
    els.rcPhotos = document.getElementById('rcPhotos');
    els.rcLocation = document.getElementById('rcLocation');
    els.rcEmail = document.getElementById('rcEmail');
    els.copyBtn = document.getElementById('copyBtn');
    els.toast = document.getElementById('toast');
    els.bootError = document.getElementById('bootError');
    els.beMsg = document.getElementById('beMsg');
    els.beRetry = document.getElementById('beRetry');
    els.themeColor = document.getElementById('themeColor');
  }

  function bindStatic() {
    els.next1.addEventListener('click', function () {
      if (!state.location) { pulseSearch(); toast('Set the location first.'); return; }
      go(2);
    });

    els.adjustBtn.addEventListener('click', pulseSearch);

    els.allowLoc.addEventListener('click', function () {
      closeLocVeil();
      locateUser();
    });
    els.denyLoc.addEventListener('click', skipLocation);
    els.locVeil.addEventListener('click', function (e) {
      if (e.target === els.locVeil) skipLocation();
    });

    Array.prototype.slice.call(document.querySelectorAll('[data-back]')).forEach(function (b) {
      b.addEventListener('click', goBack);
    });

    els.consent.addEventListener('change', function () {
      state.consent = els.consent.checked;
      els.submitBtn.disabled = !state.consent || state.sending;
    });

    els.submitBtn.addEventListener('click', onSubmit);

    els.copyBtn.addEventListener('click', copyClaimNumber);

    els.beRetry.addEventListener('click', function () { location.reload(); });

    els.recenter.addEventListener('click', function () {
      locateUser();
    });

    bindSearch();

    window.addEventListener('popstate', onPopState);
  }

  /* ---------------------------------------------------------------------
     boot: policy + map
     --------------------------------------------------------------------- */
  function loadPolicy() {
    var params = new URLSearchParams(location.search);
    state.boot = {
      policy: params.get('policy') || params.get('policyNumber') || '',
      token: params.get('token') || ''
    };

    ClaimAPI.loadPolicy(state.boot).then(function (policy) {
      state.policy = policy;
      DetailsUI.setPolicy(policy, {
        incident: { date: DetailsUI.todayISO(), time: DetailsUI.nowTime() }
      });
      if (state.location) DetailsUI.setLocation(state.location.address);
    }).catch(showBootError);
  }

  /* The SMS link is https://<h5-host>/#where?token=<dynamic token>.
     Read it before the router replaces the hash with #where, then keep it in
     sessionStorage so a refresh before submitting can still call back. */
  function readAsyncToken() {
    var token = '';
    var hash = location.hash || '';
    var q = hash.indexOf('?');

    if (q !== -1) {
      var hp = new URLSearchParams(hash.slice(q + 1));
      token = hp.get('token') || hp.get('asyncToken') || '';
    }
    if (!token) {
      token = new URLSearchParams(location.search).get('asyncToken') || '';
    }

    if (token) {
      try { sessionStorage.setItem(ASYNC_TOKEN_KEY, token); } catch (err) { /* private mode */ }
      return token;
    }
    try { return sessionStorage.getItem(ASYNC_TOKEN_KEY) || ''; } catch (err) { return ''; }
  }

  /* The callback lives on this H5's own host and forwards to the platform.
     A ?callback=... query is only an override for local testing. */
  function buildCallbackConfig(token) {
    var params = new URLSearchParams(location.search);
    var raw = params.get('callback') || params.get('cb') || CFG.asyncCallbackUrl || '';
    if (!raw) return { url: '' };

    try {
      var u = new URL(raw, location.href);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        console.warn('Ignoring a non-HTTP async callback URL.');
        return { url: '' };
      }
      if (token) u.searchParams.set('token', token);
      if (!u.searchParams.get('token')) {
        console.warn('No async token in this link; the agent callback is disabled.');
        return { url: '' };
      }
      return { url: u.toString() };
    } catch (err) {
      console.warn('Ignoring an invalid async callback URL.');
      return { url: '' };
    }
  }

  function initMap() {
    MapView.init({
      onCenter: onMapCenter,
      onStart: showPin,
      onPlace: function (place) {
        state.programmaticMoveAt = Date.now();
        applyResolved(place, place.lat, place.lng, 'search');
      }
    }).then(function () {
      decideLocationPermission();
    }).catch(function () {
      showBootError(new Error('The map could not start. Check your connection and try again.'));
    });
  }

  function showSearchHint() {
    state.locationReady = true;
    if (!state.location) {
      els.addrLine.textContent = 'Move the map to the car';
      els.addrSub.textContent = 'Search a California city, or drag the map under the pin.';
    }
    pulseSearch();
  }

  function decideLocationPermission() {
    if (!navigator.permissions || !navigator.permissions.query) {
      openLocVeil();
      return;
    }
    navigator.permissions.query({ name: 'geolocation' }).then(function (perm) {
      if (perm.state === 'granted') locateUser();
      else if (perm.state === 'denied') showSearchHint();
      else openLocVeil();
    }).catch(function () {
      openLocVeil();
    });
  }

  function openLocVeil() {
    els.locVeil.classList.add('on');
    els.locVeil.setAttribute('aria-hidden', 'false');
  }

  function closeLocVeil() {
    var active = document.activeElement;
    if (active && els.locVeil.contains(active) && active.blur) active.blur();
    els.locVeil.classList.remove('on');
    els.locVeil.setAttribute('aria-hidden', 'true');
  }

  function skipLocation() {
    closeLocVeil();
    showSearchHint();
  }

  /* ---------------------------------------------------------------------
     location
     --------------------------------------------------------------------- */
  function onMapCenter(c) {
    clearTimeout(centerTimer);
    centerTimer = setTimeout(function () {
      if (state.locating) return;
      if (state.programmaticMoveAt && Date.now() - state.programmaticMoveAt < 1600) return;
      state.locationReady = true;
      els.addrSub.textContent = 'Finding the address…';
      MapView.reverseGeocode(c.lat, c.lng).then(function (r) {
        applyResolved(r, c.lat, c.lng, 'move');
      }).catch(function () {
        applyCoords(c.lat, c.lng);
      });
    }, 420);
  }

  function applyResolved(r, lat, lng, source, accuracy) {
    setLocation({
      line1: r.line1,
      short: r.short,
      address: r.address,
      lat: lat,
      lng: lng,
      source: source,
      accuracy: accuracy || null
    });
    showPin();
  }

  function applyCoords(lat, lng) {
    var coords = fmtCoords(lat, lng);
    setLocation({
      line1: 'Pin location',
      short: coords,
      address: coords,
      lat: lat,
      lng: lng,
      source: 'move',
      note: 'address unavailable'
    });
    showPin();
  }

  function setLocation(loc) {
    state.location = loc;
    state.locationReady = true;
    var note;
    if (loc.note) note = loc.note;
    else if (loc.source === 'gps') note = loc.accuracy
      ? 'accurate to ' + Math.max(3, Math.round(loc.accuracy * 3.28084)) + ' ft'
      : 'using your device location';
    else if (loc.source === 'search') note = 'set by search';
    else note = 'pin set';

    els.addrLine.textContent = loc.line1 || loc.address || 'Location set';
    var bits = [loc.short, note].filter(Boolean);
    els.addrSub.textContent = bits.join(' · ');

    els.next1.disabled = false;
    els.addrLine.classList.remove('loading');
    DetailsUI.setLocation(loc.address);
  }

  function locateUser() {
    if (state.locating) return;
    state.locating = true;
    els.recenter.classList.add('busy');
    if (!state.location) {
      els.addrLine.textContent = 'Locating you…';
      els.addrSub.textContent = 'This can take a second.';
      els.next1.disabled = true;
    }

    var demo = CFG.simulateLocation;
    var lookup = demo && isFinite(demo.lat) && isFinite(demo.lng)
      ? Promise.resolve({ lat: demo.lat, lng: demo.lng, accuracy: null })
      : MapView.geolocate();

    lookup.then(function (pos) {
      if (!MapView.contains(pos.lat, pos.lng)) {
        toast('This demo map covers California only. Search a California city or drag the map instead.');
        showSearchHint();
        return null;
      }
      state.programmaticMoveAt = Date.now();
      MapView.panTo(pos.lat, pos.lng, { zoom: CFG.streetZoom || 6 });
      if (demo && isFinite(demo.lat) && isFinite(demo.lng)) {
        applyResolved({
          line1: demo.line1,
          short: demo.short,
          address: demo.address
        }, pos.lat, pos.lng, 'gps', null);
        return null;
      }
      return MapView.reverseGeocode(pos.lat, pos.lng).catch(function () {
        return { line1: 'Current location', short: 'Street location', address: 'Street location' };
      }).then(function (r) {
        applyResolved(r, pos.lat, pos.lng, 'gps', pos.accuracy);
      });
    }).catch(function (err) {
      toast(err && err.message ? err.message : 'We couldn’t get your location.');
      showSearchHint();
    }).then(function () {
      state.locating = false;
      els.recenter.classList.remove('busy');
    }, function () {
      state.locating = false;
      els.recenter.classList.remove('busy');
    });
  }

  function pulseSearch() {
    els.searchbar.classList.remove('hint');
    void els.searchbar.offsetWidth;
    els.searchbar.classList.add('hint');
    setTimeout(function () { els.searchbar.classList.remove('hint'); }, 2600);
  }

  function showPin() {
    els.pin.classList.remove('hide');
    if (!els.pin.classList.contains('show')) els.pin.classList.add('show');
  }

  function fmtCoords(lat, lng) {
    return lat.toFixed(5) + ', ' + lng.toFixed(5);
  }

  /* ---------------------------------------------------------------------
     search
     --------------------------------------------------------------------- */
  function bindSearch() {
    els.searchInput.addEventListener('input', onSearchInput);
    els.searchInput.addEventListener('focus', function () {
      if (els.searchInput.value.trim().length >= 2 && search.suggestions.length) {
        els.results.classList.add('on');
      }
    });
    els.searchInput.addEventListener('keydown', onSearchKey);
    els.searchClear.addEventListener('click', function () {
      clearSearch();
      els.searchInput.focus();
    });
    els.results.addEventListener('click', function (e) {
      var b = e.target.closest('[data-i]');
      if (b) pick(Number(b.getAttribute('data-i')));
    });

    document.addEventListener('pointerdown', function (e) {
      if (!els.results.classList.contains('on')) return;
      if (e.target.closest('#searchbar') || e.target.closest('#searchResults')) return;
      hideResults();
    });
  }

  function onSearchInput() {
    var q = els.searchInput.value.trim();
    els.searchbar.classList.toggle('filled', !!els.searchInput.value);
    clearTimeout(search.timer);
    search.seq++;
    search.active = -1;
    search.suggestions = [];
    if (q.length < 2) { hideResults(); return; }

    els.results.innerHTML = '<div class="none">Searching…</div>';
    els.results.classList.add('on');
    search.timer = setTimeout(function () { runSearch(q); }, 260);
  }

  function runSearch(q) {
    var seq = ++search.seq;
    MapView.search(q).then(function (list) {
      if (seq !== search.seq) return;
      search.suggestions = list;
      search.active = -1;
      renderResults(list);
    }).catch(function (err) {
      if (seq !== search.seq) return;
      search.suggestions = [];
      els.results.innerHTML = '<div class="none">' + esc(err && err.message ? err.message : 'Search is unavailable right now.') + '</div>';
      els.results.classList.add('on');
    });
  }

  function renderResults(list) {
    if (!list.length) {
      els.results.innerHTML = '<div class="none">No California place matches. Try a city like Fresno or San Diego.</div>';
      els.results.classList.add('on');
      return;
    }
    els.results.innerHTML = list.map(function (s, i) {
      return '<button type="button" role="option" data-i="' + i + '">' +
        '<span class="ic">' + (window.ICONS.find || '') + '</span>' +
        '<span class="rg"><b>' + esc(s.name) + '</b><span>' + esc(s.sub) + '</span></span>' +
      '</button>';
    }).join('');
    els.results.classList.add('on');
  }

  function onSearchKey(e) {
    if (e.key === 'Escape') {
      clearSearch();
      els.searchInput.blur();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      var index = search.active >= 0 ? search.active : 0;
      if (search.suggestions[index]) pick(index);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!search.suggestions.length) return;
      e.preventDefault();
      var delta = e.key === 'ArrowDown' ? 1 : -1;
      search.active = (search.active + delta + search.suggestions.length) % search.suggestions.length;
      var buttons = els.results.querySelectorAll('[data-i]');
      for (var i = 0; i < buttons.length; i++) buttons[i].classList.toggle('active', i === search.active);
      if (buttons[search.active]) buttons[search.active].scrollIntoView({ block: 'nearest' });
    }
  }

  function pick(index) {
    var sug = search.suggestions[index];
    if (!sug) return;
    hideResults();
    els.searchInput.blur();
    els.addrLine.textContent = 'Finding that place…';
    els.addrSub.textContent = 'Hang on a second.';

    MapView.resolveSuggestion(sug).then(function (place) {
      state.programmaticMoveAt = Date.now();
      MapView.panTo(place.lat, place.lng, { zoom: place.zoom || 5 });
      applyResolved(place, place.lat, place.lng, 'search');
      clearSearch();
    }).catch(function (err) {
      toast(err && err.message ? err.message : 'That place could not be opened.');
      state.locationReady = true;
      if (state.location) {
        els.addrLine.textContent = state.location.line1;
        els.addrSub.textContent = [state.location.short, 'pin set'].filter(Boolean).join(' · ');
      } else {
        els.addrLine.textContent = 'Move the map to the car';
        els.addrSub.textContent = 'Try another California city.';
      }
    });
  }

  function hideResults() {
    search.seq++;
    els.results.classList.remove('on');
  }

  function clearSearch() {
    els.searchInput.value = '';
    els.searchbar.classList.remove('filled');
    search.suggestions = [];
    search.active = -1;
    els.results.innerHTML = '';
    hideResults();
  }

  /* ---------------------------------------------------------------------
     routing
     --------------------------------------------------------------------- */
  function show(step, opts) {
    opts = opts || {};
    var prev = state.step;
    els.app.dataset.dir = opts.back ? 'back' : 'fwd';
    state.step = step;

    els.views.forEach(function (v) {
      var n = Number(v.getAttribute('data-v'));
      var stay = n === step;
      var leave = n === prev && !stay;
      v.classList.toggle('on', stay);
      v.classList.toggle('outL', leave && !opts.back);
      v.classList.toggle('outR', leave && opts.back);
    });

    setTheme(step === 4);
    els.submitBtn.disabled = !state.consent || state.sending;
    if (step === 4) {
      var doneTitle = document.getElementById('doneTitle');
      if (doneTitle) {
        setTimeout(function () {
          try { doneTitle.focus({ preventScroll: true }); } catch (err) { doneTitle.focus(); }
        }, 80);
      }
    }
    if (step !== 1) hideResults();
  }

  function go(step) {
    if (step > 1 && !state.location) return;
    if (step > 2 && PhotosUI.count() < 1) return;
    var back = step < state.step;
    show(step, { back: back });
    if (state.histOK) {
      try { history.pushState({ step: step }, '', HASH[step]); }
      catch (err) { state.histOK = false; }
    }
  }

  function goBack() {
    if (state.claim) return;
    if (state.histOK && history.state && typeof history.state.step === 'number') {
      history.back();
      return;
    }
    var step = Math.max(1, state.step - 1);
    show(step, { back: true });
  }

  function onPopState(e) {
    if (state.claim) {
      try { history.pushState({ step: 4 }, '', HASH[4]); } catch (err) { state.histOK = false; }
      show(4, { back: true });
      return;
    }
    var step = e.state && typeof e.state.step === 'number' ? e.state.step : 1;
    if (step > 2 && PhotosUI.count() < 1) step = 2;
    if (step > 1 && !state.location) step = 1;
    show(step, { back: true });
  }

  function setTheme(done) {
    if (els.themeColor) els.themeColor.setAttribute('content', done ? '#0F3D5C' : '#FFFFFF');
  }

  /* ---------------------------------------------------------------------
     submit + receipt
     --------------------------------------------------------------------- */
  function onSubmit() {
    if (state.sending) return;
    if (!state.consent) { toast('Confirm the details are accurate to submit.'); return; }

    var check = DetailsUI.validate();
    if (!check.ok) {
      toast(check.message);
      DetailsUI.focus(check.key);
      return;
    }

    var photos = PhotosUI.getPhotos();
    if (photos.length < 1) { toast('Add at least one photo first.'); return; }

    var v = check.values;
    var p = state.policy;
    var claimNumber = state.pending ? state.pending.claimNumber : ClaimAPI.newClaimNumber();
    var payload = {
      policyNumber: v.policyNumber,
      token: state.boot.token || undefined,
      clientClaimNumber: claimNumber,
      contact: { name: v.name, phone: v.phone, email: v.email },
      vehicle: {
        vin: v.vin,
        plate: v.plate,
        state: v.state,
        make: p.vehicle.make,
        model: v.model,
        color: v.color
      },
      incident: {
        date: v.dateISO || v.date,
        time: v.timeISO || v.time,
        location: {
          address: v.where,
          lat: state.location ? state.location.lat : null,
          lng: state.location ? state.location.lng : null
        }
      },
      photos: photos.map(function (photo) {
        return { slot: photo.slot, name: photo.name, type: photo.type };
      }),
      consent: true,
      submittedAt: new Date().toISOString(),
      meta: { locale: navigator.language, userAgent: navigator.userAgent }
    };

    var pending = state.pending || { claimNumber: claimNumber, result: null };
    pending.payload = payload;
    pending.photos = photos;
    state.pending = pending;

    state.sending = true;
    setSubmitBusy(true, pending.result ? 'Notifying…' : 'Uploading…');

    ensureClaim(pending).then(function () {
      if (!state.callback.url) return null;
      setSubmitBusyLabel('Notifying…');
      return ClaimAPI.notifyAsyncTask(
        state.callback.url,
        buildCallbackData(payload),
        photos
      );
    }).then(function () {
      completeSubmit(pending);
    }).catch(function (err) {
      toast(err && err.message ? err.message : 'We couldn’t send your claim. Check your connection and try again.');
      setSubmitBusy(false);
    }).then(function () {
      state.sending = false;
      els.submitBtn.disabled = !state.consent || state.sending;
    });
  }

  /* The claim is filed before the agent is notified. If only the notification
     failed, the next tap retries it with the same claim number and token. */
  function ensureClaim(pending) {
    if (pending.result) return Promise.resolve(pending.result);
    return ClaimAPI.submitClaim(pending.payload, pending.photos, pending.claimNumber).then(function (res) {
      pending.result = res || {};
      if (res && res.claimNumber) pending.claimNumber = String(res.claimNumber);
      return res;
    });
  }

  function buildCallbackData(payload) {
    return {
      plate: payload.vehicle.plate,
      address: payload.incident.location.address,
      phone: payload.contact.phone
    };
  }

  function completeSubmit(pending) {
    var receipt = buildReceipt({ claimNumber: pending.claimNumber }, pending.payload);
    persistReceipt(receipt);
    state.claim = String(pending.claimNumber);
    state.pending = null;
    state.asyncToken = '';
    state.callback = { url: '' };
    try { sessionStorage.removeItem(ASYNC_TOKEN_KEY); } catch (err) { /* private mode */ }
    renderReceipt(receipt);
    setSubmitBusy(false);
    go(4);
    window.scrollTo(0, 0);
  }

  function setSubmitBusy(on, label) {
    els.submitBtn.classList.toggle('busy', on);
    els.submitBtn.disabled = on || !state.consent;
    els.submitBtn.textContent = on ? (label || 'Uploading…') : 'Submit claim';
  }

  function setSubmitBusyLabel(label) {
    if (!state.sending) return;
    els.submitBtn.textContent = label;
  }

  function buildReceipt(res, payload) {
    var p = state.policy;
    var year = p && p.vehicle.year ? p.vehicle.year + ' ' : '';
    var model = payload.vehicle.model || [p.vehicle.make, p.vehicle.model].filter(Boolean).join(' ');
    var stateCode = p && p.vehicle.stateCode ? ' · ' + p.vehicle.stateCode : '';
    var address = payload.incident.location.address;
    var shortAddress = state.location && address === state.location.address
      ? state.location.short
      : address;
    return {
      claimNumber: res.claimNumber,
      vehicle: year + model + (payload.vehicle.color ? ' · ' + payload.vehicle.color : ''),
      plate: payload.vehicle.plate + stateCode,
      photos: payload.photos.length,
      location: shortAddress || address,
      email: payload.contact.email,
      phone: payload.contact.phone,
      submittedAt: payload.submittedAt
    };
  }

  function renderReceipt(r) {
    els.claimNo.textContent = r.claimNumber;
    els.rcVehicle.textContent = r.vehicle || '—';
    els.rcPlate.textContent = r.plate || '—';
    els.rcPhotos.textContent = String(r.photos || 0);
    els.rcLocation.textContent = r.location || '—';
    els.rcEmail.textContent = r.email || '—';
  }

  function persistReceipt(r) {
    try { sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(r)); } catch (err) { /* private mode */ }
  }

  function restoreReceiptIfNeeded() {
    if (location.hash !== HASH[4]) return false;
    var raw = null;
    try { raw = sessionStorage.getItem(RECEIPT_KEY); } catch (err) { return false; }
    if (!raw) return false;
    var receipt;
    try { receipt = JSON.parse(raw); } catch (err) { return false; }
    if (!receipt || !receipt.claimNumber) return false;

    state.claim = String(receipt.claimNumber);
    renderReceipt(receipt);
    show(4, { initial: true, back: false });
    try { history.replaceState({ step: 4 }, '', HASH[4]); } catch (err) { state.histOK = false; }
    return true;
  }

  function copyClaimNumber() {
    var text = els.claimNo.textContent || '';
    if (!text || text === '—') return;

    function ok() {
      els.copyBtn.classList.add('done');
      toast('Claim number copied.');
      setTimeout(function () { els.copyBtn.classList.remove('done'); }, 1800);
    }

    function fallback() {
      try {
        var range = document.createRange();
        range.selectNodeContents(els.claimNo);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('copy');
        sel.removeAllRanges();
        ok();
      } catch (err) {
        toast('Press and hold the claim number to copy it.');
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, fallback);
    } else {
      fallback();
    }
  }

  /* ---------------------------------------------------------------------
     helpers
     --------------------------------------------------------------------- */
  function showBootError(err) {
    els.beMsg.textContent = err && err.message
      ? err.message
      : 'The link may have expired, or you may be offline. Check your connection and try again.';
    els.bootError.hidden = false;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('on'); }, 3400);
  }
})();