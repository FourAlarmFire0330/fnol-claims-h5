(function () {
  'use strict';

  var CFG = window.APP_CONFIG;

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function endpoint(path) {
    return String(CFG.apiBase || '').replace(/\/+$/, '') + path;
  }

  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error(message || 'The connection timed out. Check your signal and try again.'));
      }, ms);
      promise.then(
        function (v) { clearTimeout(timer); resolve(v); },
        function (e) { clearTimeout(timer); reject(e); }
      );
    });
  }

  /* Server response is expected to mirror config.demoPolicy. Small variations
     (contact vs insured, registration vs vehicle) are normalized here. */
  function normalizePolicy(raw) {
    var p = raw || {};
    var insured = p.insured || p.contact || {};
    var v = p.vehicle || p.registration || {};
    return {
      policyNumber: String(p.policyNumber || p.policy_number || v.policyNumber || ''),
      insured: {
        name: String(insured.name || p.insuredName || ''),
        phone: String(insured.phone || p.phone || ''),
        email: String(insured.email || p.email || '')
      },
      vehicle: {
        vin: String(v.vin || ''),
        year: Number(v.year) || '',
        make: String(v.make || ''),
        model: String(v.model || ''),
        color: String(v.color || ''),
        plate: String(v.plate || '').toUpperCase(),
        state: String(v.state || ''),
        stateCode: String(v.stateCode || v.state_code || '').toUpperCase()
      }
    };
  }

  function demoPolicy(boot) {
    var copy = JSON.parse(JSON.stringify(CFG.demoPolicy));
    if (boot && boot.policy) copy.policyNumber = boot.policy;
    if (boot && boot.vin) copy.vehicle.vin = boot.vin;
    return copy;
  }

  function loadPolicy(boot) {
    if (!CFG.apiBase) {
      return delay(420).then(function () { return demoPolicy(boot); });
    }
    var url = endpoint(CFG.endpoints.policy);
    var qs = new URLSearchParams();
    if (boot && boot.policy) qs.set('policy', boot.policy);
    if (boot && boot.token) qs.set('token', boot.token);
    if (qs.toString()) url += (url.indexOf('?') === -1 ? '?' : '&') + qs.toString();

    var task = fetch(url, { headers: { Accept: 'application/json' }, credentials: 'include' })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status === 404 || res.status === 410
          ? 'This claim link has expired. Ask your insurer for a new one.'
          : 'We couldn’t load your policy. Please try again.');
        return res.json();
      })
      .then(normalizePolicy)
      .then(function (p) {
        if (!p.policyNumber) throw new Error('This link is missing its policy details.');
        return p;
      });

    return withTimeout(task, 20000, 'Loading your policy took too long. Check your connection and try again.');
  }

  function mockClaimNumber() {
    var n = String(Math.floor(100000 + Math.random() * 900000));
    return 'FN-' + new Date().getFullYear() + '-' + n;
  }

  /* payload: JSON-able object. photos: [{slot, blob, name}]. */
  function submitClaim(payload, photos) {
    if (!CFG.apiBase) {
      return delay(1150).then(function () {
        return { claimNumber: mockClaimNumber(), receivedAt: new Date().toISOString() };
      });
    }

    var form = new FormData();
    form.append('payload', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    (photos || []).forEach(function (p) {
      form.append('photos', p.blob, (p.slot || 'photo') + '-' + (p.name || 'photo.jpg'));
    });

    var task = fetch(endpoint(CFG.endpoints.claims), {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error(body.message || 'We couldn’t send your claim. Please try again.');
        if (!body.claimNumber) throw new Error('The claim was received without a claim number. Please contact your insurer.');
        return body;
      });
    });

    return withTimeout(task, 45000, 'Uploading took too long. Move somewhere with a better signal and try again.');
  }

  window.ClaimAPI = {
    loadPolicy: loadPolicy,
    submitClaim: submitClaim,
    normalizePolicy: normalizePolicy
  };
})();