(function () {
  'use strict';

  var SLOTS = [
    { k: 'w1', label: 'Whole car, front', hint: 'Front three-quarter', group: 'Car' },
    { k: 'w2', label: 'Whole car, rear', hint: 'Rear three-quarter', group: 'Car' },
    { k: 'i1', label: 'Point of impact', hint: 'Close up, fill the frame', group: 'Impact' }
  ];
  var TOTAL = SLOTS.length;

  var els = {};
  var opts = {};
  var photos = [];
  var processing = {};
  var pendingSlot = null;
  var busy = false;

  function init(config) {
    opts = config || {};
    els.grid = document.getElementById('photoGrid');
    els.next = document.getElementById('photoNext');
    els.help = document.getElementById('photoHelp');
    els.veil = document.getElementById('photoVeil');
    els.veilSub = document.getElementById('photoSheetSub');
    els.cam = document.getElementById('camInput');
    els.lib = document.getElementById('libInput');

    els.grid.addEventListener('click', onGridClick);
    els.next.addEventListener('click', onNext);
    els.cam.addEventListener('change', function (e) { onFiles(e, 'camera'); });
    els.lib.addEventListener('change', function (e) { onFiles(e, 'library'); });

    els.veil.addEventListener('click', function (e) {
      if (e.target === els.veil) closeSheet();
      var srcBtn = e.target.closest('[data-src]');
      if (srcBtn) {
        var src = srcBtn.getAttribute('data-src');
        closeSheet();
        if (busy) return;
        if (src === 'camera') els.cam.click();
        else els.lib.click();
      }
      if (e.target.closest('[data-close]')) closeSheet();
    });

    render();
  }

  function firstEmptyKey() {
    for (var i = 0; i < SLOTS.length; i++) {
      if (!findPhoto(SLOTS[i].k)) return SLOTS[i].k;
    }
    return SLOTS[0].k;
  }

  function findPhoto(key) {
    for (var i = 0; i < photos.length; i++) if (photos[i].slot === key) return photos[i];
    return null;
  }

  function openSheet(slotKey) {
    if (busy) return;
    var slot = SLOTS.filter(function (s) { return s.k === slotKey; })[0] || SLOTS[0];
    pendingSlot = slot.k;
    els.veilSub.textContent = slot.label + ' · ' + slot.hint;
    els.veil.classList.add('on');
    els.veil.setAttribute('aria-hidden', 'false');
  }

  function closeSheet() {
    var active = document.activeElement;
    if (active && els.veil.contains(active) && active.blur) active.blur();
    els.veil.classList.remove('on');
    els.veil.setAttribute('aria-hidden', 'true');
  }

  function onGridClick(e) {
    var rm = e.target.closest('[data-remove]');
    if (rm) {
      e.preventDefault();
      e.stopPropagation();
      remove(rm.getAttribute('data-remove'));
      return;
    }
    var tile = e.target.closest('.tile');
    if (!tile || tile.classList.contains('filled')) return;
    if (tile.classList.contains('loading')) return;
    openSheet(tile.getAttribute('data-slot'));
  }

  function onNext() {
    if (busy) return;
    if (photos.length >= TOTAL) {
      if (opts.onContinue) opts.onContinue();
      return;
    }
    openSheet(firstEmptyKey());
  }

  function targetsFrom(startKey, count) {
    var start = 0;
    for (var i = 0; i < SLOTS.length; i++) if (SLOTS[i].k === startKey) start = i;
    var rotated = SLOTS.slice(start).concat(SLOTS.slice(0, start));
    return rotated.filter(function (s) {
      return !findPhoto(s.k) && !processing[s.k];
    }).slice(0, count);
  }

  function isImageFile(file) {
    return /^image\//i.test(file.type || '') ||
      /\.(jpe?g|png|heic|heif|webp|gif|bmp)$/i.test(file.name || '');
  }

  function onFiles(e, mode) {
    var input = e.target;
    var files = Array.prototype.slice.call(input.files || []);
    input.value = '';
    files = files.filter(isImageFile);
    if (mode === 'camera') files = files.slice(0, 1);
    if (!files.length) return;
    if (files.length > TOTAL) files = files.slice(0, TOTAL);

    var targets = targetsFrom(pendingSlot || firstEmptyKey(), files.length);
    if (!targets.length) {
      if (opts.onError) opts.onError('All three photo slots are already filled. Remove one to retake it.');
      return;
    }

    busy = true;
    var i = 0;
    function step() {
      if (i >= files.length || i >= targets.length) {
        busy = false;
        render();
        return;
      }
      var slot = targets[i];
      var file = files[i];
      i++;
      addFile(slot, file).then(step, step);
    }
    step();
  }

  function prepare(file) {
    var fallback = { blob: file, name: file.name || 'photo.jpg', type: file.type || 'image/jpeg' };
    if (typeof createImageBitmap !== 'function') return Promise.resolve(fallback);

    var decode;
    try {
      decode = createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (err) {
      return Promise.resolve(fallback);
    }

    return decode.then(function (bmp) {
      var max = 1600;
      var scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      var heic = /^image\/hei[cf]$/i.test(file.type || '') || /\.hei[cf]$/i.test(file.name || '');
      if (!heic && scale >= 1 && file.size <= 1300 * 1024) {
        if (bmp.close) bmp.close();
        return fallback;
      }
      var w = Math.max(1, Math.round(bmp.width * scale));
      var h = Math.max(1, Math.round(bmp.height * scale));
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      if (!ctx) { if (bmp.close) bmp.close(); return fallback; }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          if (!blob) { resolve(fallback); return; }
          resolve({
            blob: blob,
            name: String(file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg',
            type: 'image/jpeg'
          });
        }, 'image/jpeg', 0.82);
      });
    }).catch(function () { return fallback; });
  }

  function addFile(slot, file) {
    processing[slot.k] = true;
    render();
    return prepare(file).then(function (prepared) {
      delete processing[slot.k];
      if (findPhoto(slot.k)) { render(); return; }
      photos.push({
        slot: slot.k,
        blob: prepared.blob,
        url: URL.createObjectURL(prepared.blob),
        name: prepared.name,
        type: prepared.type,
        size: prepared.blob.size
      });
      render();
      if (opts.onChange) opts.onChange(photos.length);
    }).catch(function (err) {
      delete processing[slot.k];
      render();
      if (opts.onError) opts.onError(err && err.message ? err.message : 'That photo could not be added.');
    });
  }

  function remove(key) {
    for (var i = 0; i < photos.length; i++) {
      if (photos[i].slot === key) {
        URL.revokeObjectURL(photos[i].url);
        photos.splice(i, 1);
        break;
      }
    }
    render();
    if (opts.onChange) opts.onChange(photos.length);
  }

  function render() {
    var isProcessing = Object.keys(processing).length > 0;

    els.grid.innerHTML = SLOTS.map(function (s) {
      var photo = findPhoto(s.k);
      if (photo) {
        return '<div class="tile filled" data-slot="' + s.k + '">' +
          '<img src="' + photo.url + '" alt="' + s.label + '">' +
          '<span class="chk">' + (window.ICONS.check || '') + '</span>' +
          '<button class="rm" type="button" data-remove="' + s.k + '" aria-label="Remove ' + s.label + '">' +
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
          '</button>' +
          '<span class="cap">' + s.label + '</span>' +
        '</div>';
      }
      if (processing[s.k]) {
        return '<div class="tile loading" data-slot="' + s.k + '"><span class="spinner"></span><span>Adding…</span></div>';
      }
      return '<button class="tile" type="button" data-slot="' + s.k + '" aria-label="Add ' + s.label + '">' +
        (window.ICONS.plus || '') + '<span>' + s.label + '</span>' +
      '</button>';
    }).join('');

    var counts = { Car: 0, Impact: 0 };
    photos.forEach(function (p) {
      var slot = SLOTS.filter(function (s) { return s.k === p.slot; })[0];
      if (slot) counts[slot.group]++;
    });
    var totals = { Car: 2, Impact: 1 };
    Object.keys(counts).forEach(function (k) {
      var el = els.grid.parentNode.querySelector('[data-ct="' + k + '"]');
      if (!el) return;
      el.textContent = counts[k] + '/' + totals[k];
      el.classList.toggle('done', counts[k] === totals[k]);
    });

    var n = photos.length;
    if (isProcessing) {
      els.help.textContent = 'Preparing photo…';
      els.next.disabled = true;
      els.next.textContent = 'Add photos';
      return;
    }

    els.next.disabled = false;
    if (n === 0) {
      els.help.textContent = '0 of ' + TOTAL + ' added';
      els.next.textContent = 'Add photos';
    } else if (n < TOTAL) {
      els.help.textContent = n + ' of ' + TOTAL + ' added · ' + (TOTAL - n) + ' to go';
      els.next.innerHTML = 'Add ' + (TOTAL - n) + ' more' + (window.ICONS.arrow || '');
    } else {
      els.help.textContent = 'All ' + TOTAL + ' photos added';
      els.next.innerHTML = 'Continue' + (window.ICONS.arrow || '');
    }
  }

  window.PhotosUI = {
    init: init,
    getPhotos: function () {
      return photos.map(function (p) {
        return { slot: p.slot, blob: p.blob, name: p.name, type: p.type };
      });
    },
    count: function () { return photos.length; }
  };
})();