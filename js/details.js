(function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var els = {};
  var policy = null;
  var incident = { date: '', time: '' };
  var whereValue = '';
  var rendered = false;

  function init() {
    els.form = document.getElementById('detailsForm');
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function nowTime() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fmtDate(iso) {
    var parts = String(iso || '').split('-').map(Number);
    if (!parts[0] || !parts[1] || !parts[2]) return iso || '';
    return MONTHS[parts[1] - 1] + ' ' + parts[2] + ', ' + parts[0];
  }

  function fmtTime(value) {
    var parts = String(value || '').split(':').map(Number);
    if (isNaN(parts[0])) return value || '';
    return (parts[0] % 12 || 12) + ':' + pad(parts[1] || 0) + ' ' + (parts[0] >= 12 ? 'PM' : 'AM');
  }

  function srcTag(src, locked) {
    var tag = src === 'policy' ? 'Policy' : src === 'photo' ? 'Photo' : 'You';
    var lock = locked ? (window.ICONS.lock || '') : '';
    return '<span class="src ' + src + '"><i></i>' + tag + lock + '</span>';
  }

  function fieldHTML(row) {
    var empty = !row.val;
    var shown = empty ? (row.ph || '—') : row.val;
    var cls = 'val' + (row.mono ? ' mono' : '') + (empty ? ' empty' : '');
    var src = srcTag(row.src, row.ro);

    if (row.ro) {
      return '<div class="field ro" data-k="' + row.k + '">' +
        '<span class="lb">' + esc(row.lb) + '</span>' + src +
        '<span class="' + cls + '" data-val>' + esc(shown) + '</span>' +
      '</div>';
    }

    var attrs = 'type="' + (row.type || 'text') + '"' +
      (row.mono ? ' class="mono"' : '') +
      ' value="' + esc(row.val) + '"' +
      ' placeholder="' + esc(row.ph || '') + '"' +
      ' data-kind="' + (row.type || 'text') + '"' +
      ' aria-label="' + esc(row.lb) + '"' +
      (row.autocomplete ? ' autocomplete="' + row.autocomplete + '"' : ' autocomplete="off"') +
      (row.inputmode ? ' inputmode="' + row.inputmode + '"' : '') +
      ' enterkeyhint="done"';

    return '<div class="field" data-k="' + row.k + '" tabindex="0">' +
      '<span class="lb">' + esc(row.lb) + '</span>' + src +
      '<span class="' + cls + '" data-val>' + esc(shown) + '</span>' +
      '<input ' + attrs + '>' +
    '</div>';
  }

  function pairHTML(items) {
    return '<div class="pair">' + items.map(function (row) {
      var display = row.k === 'date' ? fmtDate(row.val) : fmtTime(row.val);
      return '<div class="field" data-k="' + row.k + '" data-iso="' + esc(row.val) + '" tabindex="0">' +
        '<span class="lb">' + esc(row.lb) + '</span>' +
        '<span class="val" data-val>' + esc(display) + '</span>' +
        '<input type="' + row.type + '" value="' + esc(row.val) + '" data-kind="' + row.type + '"' +
          (row.k === 'date' ? ' max="' + todayISO() + '"' : '') +
          ' aria-label="' + esc(row.lb) + '" enterkeyhint="done">' +
      '</div>';
    }).join('') + '</div>';
  }

  function formHTML() {
    var p = policy;
    return [
      '<div class="grp"><div class="rows">',
        fieldHTML({ k: 'name', lb: 'Full name', val: p.insured.name, src: 'policy', autocomplete: 'name' }),
        fieldHTML({ k: 'phone', lb: 'Phone number', val: p.insured.phone, src: 'you', mono: true, type: 'tel', inputmode: 'tel', autocomplete: 'tel' }),
        fieldHTML({ k: 'email', lb: 'Email', val: p.insured.email, src: 'you', type: 'email', inputmode: 'email', autocomplete: 'email' }),
      '</div></div>',

      '<div class="grp">',
        '<div class="gh">Vehicle</div>',
        '<div class="rows">',
          fieldHTML({ k: 'plate', lb: 'Plate number', val: p.vehicle.plate, src: 'photo', mono: true }),
          fieldHTML({ k: 'state', lb: 'Issuing state', val: p.vehicle.state, src: 'photo' }),
          fieldHTML({ k: 'vin', lb: 'VIN', val: p.vehicle.vin, src: 'policy', mono: true, ro: true }),
          fieldHTML({ k: 'model', lb: 'Make and model', val: [p.vehicle.make, p.vehicle.model].filter(Boolean).join(' '), src: 'policy' }),
          fieldHTML({ k: 'color', lb: 'Color', val: p.vehicle.color, src: 'photo' }),
        '</div>',
      '</div>',

      '<div class="grp">',
        '<div class="gh">Incident</div>',
        '<div class="rows">',
          pairHTML([
            { k: 'date', lb: 'Date', type: 'date', val: incident.date },
            { k: 'time', lb: 'Time', type: 'time', val: incident.time }
          ]),
          fieldHTML({ k: 'where', lb: 'Location', val: whereValue, src: 'you', ph: 'Set on the map' }),
        '</div>',
      '</div>'
    ].join('');
  }

  function setPolicy(p, options) {
    policy = p;
    options = options || {};
    incident = options.incident || { date: todayISO(), time: nowTime() };
    if (options.where) whereValue = options.where;
    render();
  }

  function setIncident(values) {
    if (!values) return;
    incident = { date: values.date || incident.date, time: values.time || incident.time };
    if (rendered) updatePair();
  }

  function setLocation(address) {
    whereValue = address || '';
    if (!rendered) return;
    var field = els.form.querySelector('[data-k="where"]');
    if (!field) return;
    var val = field.querySelector('[data-val]');
    var input = field.querySelector('input');
    if (val) {
      val.textContent = whereValue || 'Set on the map';
      val.classList.toggle('empty', !whereValue);
    }
    if (input) input.value = whereValue;
  }

  function updatePair() {
    ['date', 'time'].forEach(function (k) {
      var field = els.form.querySelector('[data-k="' + k + '"]');
      if (!field) return;
      field.dataset.iso = incident[k];
      var input = field.querySelector('input');
      if (input) input.value = incident[k];
      var val = field.querySelector('[data-val]');
      if (val) val.textContent = k === 'date' ? fmtDate(incident[k]) : fmtTime(incident[k]);
    });
  }

  function render() {
    if (!policy) return;
    els.form.innerHTML = formHTML();
    rendered = true;
    bindFields();
  }

  function bindFields() {
    var fields = els.form.querySelectorAll('.field');
    for (var i = 0; i < fields.length; i++) bindField(fields[i]);
  }

  function bindField(field) {
    if (field.classList.contains('ro')) return;
    var input = field.querySelector('input');
    var valEl = field.querySelector('[data-val]');
    if (!input || !valEl) return;
    var kind = input.getAttribute('data-kind') || 'text';
    var isPick = kind === 'date' || kind === 'time';

    function begin() {
      if (field.classList.contains('editing')) return;
      field.classList.add('editing');
      input.focus();
      if (isPick) {
        if (typeof input.showPicker === 'function') {
          try { input.showPicker(); } catch (err) { /* not allowed outside a gesture on some browsers */ }
        }
        return;
      }
      var len = input.value.length;
      try { input.setSelectionRange(len, len); } catch (err) { /* type=tel etc. */ }
    }

    field.addEventListener('click', begin);

    field.addEventListener('keydown', function (e) {
      if (e.target !== field) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        begin();
      }
    });

    function commit() {
      if (!field.classList.contains('editing')) return;
      field.classList.remove('editing');
      field.classList.remove('err');

      if (isPick) {
        var picked = input.value;
        var previous = field.dataset.iso || '';
        if (!picked) { input.value = previous; return; }
        if (kind === 'date' && picked > todayISO()) {
          field.classList.add('err');
          field.dataset.iso = previous;
          input.value = previous;
          valEl.textContent = fmtDate(previous);
          return;
        }
        field.dataset.iso = picked;
        incident[kind === 'date' ? 'date' : 'time'] = picked;
        valEl.textContent = kind === 'date' ? fmtDate(picked) : fmtTime(picked);
        return;
      }

      var value = input.value.trim();
      if (value) {
        valEl.textContent = value;
        valEl.classList.remove('empty');
        var key = field.getAttribute('data-k');
        if (key === 'where') whereValue = value;
        if (key === 'plate') {
          value = value.toUpperCase();
          input.value = value;
          valEl.textContent = value;
        }
        return;
      }
      if (field.getAttribute('data-k') === 'where') {
        whereValue = '';
      }
      var ph = input.getAttribute('placeholder');
      if (ph) {
        valEl.textContent = ph;
        valEl.classList.add('empty');
      } else {
        input.value = valEl.textContent;
      }
    }

    input.addEventListener('blur', commit);
    if (isPick) input.addEventListener('change', commit);

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        input.value = isPick ? (field.dataset.iso || '') : (valEl.classList.contains('empty') ? '' : valEl.textContent);
        field.classList.remove('editing');
        field.classList.remove('err');
        input.blur();
      }
    });
  }

  function readValues() {
    var out = {
      name: '', phone: '', email: '', plate: '', state: '', model: '', color: '',
      vin: policy ? policy.vehicle.vin : '',
      policyNumber: policy ? policy.policyNumber : '',
      where: whereValue
    };
    var fields = els.form.querySelectorAll('.field');
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var key = field.getAttribute('data-k');
      var valEl = field.querySelector('[data-val]');
      var text = valEl && !valEl.classList.contains('empty') ? valEl.textContent.trim() : '';

      if (key === 'date' || key === 'time') {
        out[key] = field.dataset.iso || '';
        out[key + 'ISO'] = field.dataset.iso || '';
        continue;
      }
      if (!key) continue;
      if (key === 'where') {
        out.where = text || whereValue;
        continue;
      }
      if (valEl) out[key] = text;
    }
    out.plate = String(out.plate || '').toUpperCase();
    out.date = out.date || '';
    out.time = out.time || '';
    return out;
  }

  function markError(key) {
    var field = els.form.querySelector('[data-k="' + key + '"]');
    if (field) field.classList.add('err');
  }

  function clearErrors() {
    var fields = els.form.querySelectorAll('.field.err');
    for (var i = 0; i < fields.length; i++) fields[i].classList.remove('err');
  }

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function validate() {
    if (!els.form) return { ok: false, key: '', message: 'The form is not ready yet.' };
    clearErrors();
    var v = readValues();

    var checks = [
      ['name', v.name.length >= 2, 'Add your full name.'],
      ['phone', digits(v.phone).length >= 7, 'Add a phone number the adjuster can call.'],
      ['email', EMAIL_RE.test(v.email), 'Check the email address.'],
      ['plate', v.plate.length >= 2, 'Add the plate number.'],
      ['date', !!v.date, 'Add the incident date.'],
      ['where', v.where.length >= 3, 'Set the location on the map.']
    ];

    for (var i = 0; i < checks.length; i++) {
      if (!checks[i][1]) {
        markError(checks[i][0]);
        return { ok: false, key: checks[i][0], message: checks[i][2] };
      }
    }

    if (v.date > todayISO()) {
      markError('date');
      return { ok: false, key: 'date', message: 'The incident date can’t be in the future.' };
    }

    return { ok: true, values: v };
  }

  function focus(key) {
    var field = els.form.querySelector('[data-k="' + key + '"]');
    if (!field) return;
    try { field.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) { field.scrollIntoView(); }
    if (!field.classList.contains('ro')) {
      setTimeout(function () { field.click(); }, 120);
    }
  }

  window.DetailsUI = {
    init: init,
    setPolicy: setPolicy,
    setIncident: setIncident,
    setLocation: setLocation,
    validate: validate,
    focus: focus,
    todayISO: todayISO,
    nowTime: nowTime
  };
})();