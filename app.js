(() => {
  'use strict';

  /* ---------- Constants ----------------------------------------- */

  const SFX_START_SEC = 4.0;    // play this portion of lunchbox.mp3 (the click)
  const SFX_END_SEC   = 6.0;
  const UNLOCK_HOLD_MS = 1500;
  const BGM_VOLUME  = 0.5;
  const SFX_VOLUME  = 0.7;
  const CODE_LEN    = 4;

  /* ---------- State --------------------------------------------- */

  const state = {
    scene: 'tincan',
    letters: {},      // grouped: { code: [letter, letter, ...] }
    sender: '',
    lyrics: null,
    audioUnlocked: false,
    smileStarted: false,
    lyricIndex: -1,
    unlocking: false,
    pickerOpen: false,
  };

  /* ---------- DOM ----------------------------------------------- */

  const $ = (sel) => document.querySelector(sel);
  const scenes = {
    tincan:   $('#scene-tincan'),
    lock:     $('#scene-lock'),
    postcard: $('#scene-postcard'),
  };
  const lockWrap  = $('.lock-wrap');
  const pwdInputs = Array.from(document.querySelectorAll('.pwd-input'));
  const picker      = $('#picker');
  const pickerList  = $('#picker-list');
  const audio = {
    sfx: $('#sfx-lunchbox'),
    bgm: $('#bgm-smile'),
  };

  /* ---------- Markdown letter parser ---------------------------- *
   * Format of data/letters.md:
   *
   *   **발신자**: 김민석
   *
   *   ## 0101 김민영
   *   > 맏누나, 우리 팀 비공식 4대보험.
   *
   *   처음 회사가 무너질 것 같던 ...
   *
   *   ## 0202 고경진
   *   > ...
   *
   * `code name` on the H2 line. First `> ...` line becomes subtitle.
   * Everything else is body text (paragraphs preserved). Same code
   * appearing twice means two recipients share that birthday — the
   * site will offer a name picker when that code is entered.
   */
  function parseLettersMd(text) {
    const result = { sender: '', letters: [] };
    const lines = text.split(/\r?\n/);

    let cur = null;
    let bodyLines = [];
    let gotSubtitle = false;

    const flush = () => {
      if (!cur) return;
      cur.body = bodyLines.join('\n').replace(/^\s+|\s+$/g, '');
      // Drop trailing standalone "---" rulers used as section dividers
      cur.body = cur.body.replace(/\n+---+\s*$/g, '').trim();
      result.letters.push(cur);
      cur = null;
      bodyLines = [];
      gotSubtitle = false;
    };

    for (const line of lines) {
      if (!cur) {
        const sm = line.match(/^\*\*?\s*발신자\s*\*\*?\s*[:：]\s*(.+?)\s*$/);
        if (sm) { result.sender = sm[1].trim(); continue; }
      }
      const hm = line.match(/^##\s+(\d+)\s+(.+?)\s*$/);
      if (hm) {
        flush();
        cur = { code: hm[1].trim(), name: hm[2].trim(), subtitle: '', body: '' };
        continue;
      }
      if (!cur) continue;
      if (!gotSubtitle && bodyLines.every(l => !l.trim())) {
        const qm = line.match(/^>\s*(.+?)\s*$/);
        if (qm) { cur.subtitle = qm[1].trim(); gotSubtitle = true; continue; }
      }
      bodyLines.push(line);
    }
    flush();
    return result;
  }

  function groupLettersByCode(letters) {
    const grouped = {};
    for (const l of letters) {
      if (!l.code) continue;
      (grouped[l.code] ||= []).push(l);
    }
    return grouped;
  }

  /* ---------- Data loading -------------------------------------- */

  async function loadData() {
    const opts = { cache: 'no-store' };
    try {
      const [mdText, lyrics] = await Promise.all([
        fetch('data/letters.md', opts).then(r => r.text()),
        fetch('data/lyrics.json', opts).then(r => r.json()),
      ]);
      const parsed = parseLettersMd(mdText);
      state.sender  = parsed.sender || '';
      state.letters = groupLettersByCode(parsed.letters);
      state.lyrics  = Array.isArray(lyrics) ? lyrics : [];
    } catch (err) {
      console.error('Data load failed', err);
      state.letters = {};
      state.lyrics  = [];
    }
  }

  /* ---------- Audio unlock (mobile autoplay) -------------------- */

  function unlockAudio() {
    if (state.audioUnlocked) return;
    state.audioUnlocked = true;
    audio.sfx.volume = SFX_VOLUME;
    audio.bgm.volume = BGM_VOLUME;
    [audio.sfx, audio.bgm].forEach((a) => {
      a.muted = true;
      const p = a.play();
      if (p && p.then) {
        p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
         .catch(() => { a.muted = false; });
      } else {
        a.muted = false;
      }
    });
  }

  /* ---------- Scene transitions --------------------------------- */

  function gotoScene(name) {
    if (state.scene === name) return;
    Object.entries(scenes).forEach(([k, el]) => {
      el.classList.toggle('is-active', k === name);
    });
    document.body.classList.toggle('is-postcard', name === 'postcard');
    state.scene = name;
    if (name === 'postcard') {
      const el = $('#letter-body');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => fitLetterBody(el));
      });
      setTimeout(() => fitLetterBody(el), 250);
      setTimeout(() => fitLetterBody(el), 800);
    }
  }

  function zoomFromTincanToLock() {
    document.body.classList.add('is-zooming');
    setTimeout(() => { gotoScene('lock'); }, 550);
    setTimeout(() => {
      document.body.classList.remove('is-zooming');
      pwdInputs[0]?.focus();
    }, 1400);
  }

  /* ---------- Password inputs ----------------------------------- */

  function currentCode() {
    return pwdInputs.map(p => p.value || '').join('');
  }

  function clearInputs(focusFirst = true) {
    pwdInputs.forEach(p => p.value = '');
    if (focusFirst) pwdInputs[0]?.focus();
  }

  function attachInputs() {
    pwdInputs.forEach((input, i) => {
      input.addEventListener('input', () => {
        if (state.unlocking) return;
        const v = (input.value || '').replace(/\D/g, '').slice(-1);
        input.value = v;
        if (v && i < pwdInputs.length - 1) {
          pwdInputs[i + 1].focus();
          pwdInputs[i + 1].select();
        }
        if (pwdInputs.every(p => p.value)) {
          setTimeout(tryUnlock, 120);
        }
      });

      input.addEventListener('keydown', (e) => {
        if (state.unlocking) { e.preventDefault(); return; }
        if (e.key === 'Backspace' && !input.value && i > 0) {
          pwdInputs[i - 1].focus();
          pwdInputs[i - 1].value = '';
          e.preventDefault();
        } else if (e.key === 'ArrowLeft' && i > 0) {
          pwdInputs[i - 1].focus();
          e.preventDefault();
        } else if (e.key === 'ArrowRight' && i < pwdInputs.length - 1) {
          pwdInputs[i + 1].focus();
          e.preventDefault();
        } else if (e.key === 'Enter') {
          if (pwdInputs.every(p => p.value)) tryUnlock();
          e.preventDefault();
        }
      });

      input.addEventListener('focus', () => input.select());

      input.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text');
        const digits = (text || '').replace(/\D/g, '').slice(0, CODE_LEN);
        if (digits.length === 0) return;
        e.preventDefault();
        for (let k = 0; k < CODE_LEN; k++) {
          pwdInputs[k].value = digits[k] || '';
        }
        if (digits.length === CODE_LEN) {
          pwdInputs[CODE_LEN - 1].focus();
          setTimeout(tryUnlock, 120);
        } else {
          pwdInputs[Math.min(digits.length, CODE_LEN - 1)].focus();
        }
      });
    });
  }

  /* ---------- Validation ---------------------------------------- */

  function tryUnlock() {
    if (state.unlocking || state.pickerOpen) return;
    const code = currentCode();
    if (code.length !== CODE_LEN) return;
    const matches = state.letters[code];
    if (!matches || matches.length === 0) {
      shakeLock();
      return;
    }
    if (matches.length === 1) {
      openLetter(matches[0]);
    } else {
      showPicker(matches);
    }
  }

  function shakeLock() {
    lockWrap.classList.remove('is-shake');
    void lockWrap.offsetWidth;
    lockWrap.classList.add('is-shake');
    setTimeout(() => {
      lockWrap.classList.remove('is-shake');
      clearInputs(true);
    }, 500);
  }

  /* ---------- Name picker (shared-birthday disambiguation) ------ */

  function showPicker(letters) {
    state.pickerOpen = true;
    pickerList.innerHTML = '';
    letters.forEach((letter) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'picker-btn';
      btn.textContent = letter.name;
      btn.addEventListener('click', () => {
        hidePicker();
        openLetter(letter);
      });
      pickerList.appendChild(btn);
    });
    picker.classList.add('is-open');
    picker.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => pickerList.querySelector('button')?.focus());
  }

  function hidePicker() {
    state.pickerOpen = false;
    picker.classList.remove('is-open');
    picker.setAttribute('aria-hidden', 'true');
  }

  /* ---------- Open letter --------------------------------------- */

  function openLetter(entry) {
    state.unlocking = true;
    lockWrap.classList.add('is-opening');
    document.body.classList.add('is-unlocking');
    pwdInputs.forEach(p => p.blur());

    const fromEl = $('#from-name');
    if (fromEl) fromEl.textContent = state.sender || '';
    $('#to-name').textContent  = entry.name || '';
    $('#subtitle').textContent = entry.subtitle || '';
    $('#body-text').textContent = entry.body || '';

    try {
      audio.sfx.volume = SFX_VOLUME;
      audio.sfx.currentTime = SFX_START_SEC;
      audio.sfx.play().catch(() => {});
    } catch (_) {}
    const onTime = () => {
      if (audio.sfx.currentTime >= SFX_END_SEC) {
        audio.sfx.pause();
        audio.sfx.removeEventListener('timeupdate', onTime);
      }
    };
    audio.sfx.addEventListener('timeupdate', onTime);

    setTimeout(() => {
      audio.sfx.pause();
      audio.sfx.removeEventListener('timeupdate', onTime);
      document.body.classList.remove('is-unlocking');
      gotoScene('postcard');
      startSmile();
    }, UNLOCK_HOLD_MS);
  }

  function startSmile() {
    if (state.smileStarted) return;
    state.smileStarted = true;
    try {
      audio.bgm.pause();
      audio.bgm.volume = BGM_VOLUME;
      audio.bgm.currentTime = 0;
      audio.bgm.play().catch((e) => console.warn('bgm play failed', e));
    } catch (_) {}
    ensureLyricTimestamps();
    requestAnimationFrame(lyricTick);
  }

  /* ---------- Auto-fit letter body ------------------------------ */

  function fitLetterBody(el) {
    if (!el) { console.warn('fitLetterBody: container element missing'); return; }
    const bodyText = el.querySelector('.body-text');
    if (!bodyText) return;

    const sizes = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7];
    for (const fs of sizes) {
      el.style.fontSize = fs + 'px';
      void el.offsetHeight; // force synchronous reflow
      // Use real geometry — bodyText's bottom edge vs container's bottom edge.
      // getBoundingClientRect ignores `overflow: hidden` clipping, so we see true overflow.
      const cRect = el.getBoundingClientRect();
      const bRect = bodyText.getBoundingClientRect();
      if (bRect.bottom <= cRect.bottom + 0.5) return;
    }
    el.style.fontSize = sizes[sizes.length - 1] + 'px';
  }

  /* ---------- Auto-distribute lyric timestamps (fallback) ------- */

  function ensureLyricTimestamps() {
    if (!state.lyrics || state.lyrics.length === 0) return;
    const hasReal = state.lyrics.some(l => typeof l.t === 'number');
    if (hasReal) return;
    const finalize = () => {
      const dur = isFinite(audio.bgm.duration) && audio.bgm.duration > 4
        ? audio.bgm.duration
        : 180;
      const start = 11;
      const end   = Math.max(start + 1, dur - 14);
      const span  = end - start;
      state.lyrics.forEach((line, i) => {
        line.t = start + (i / state.lyrics.length) * span;
      });
    };
    if (isFinite(audio.bgm.duration) && audio.bgm.duration > 0) {
      finalize();
    } else {
      audio.bgm.addEventListener('loadedmetadata', finalize, { once: true });
    }
  }

  /* ---------- Lyric sync ---------------------------------------- */

  function findLyricIndex(t) {
    const arr = state.lyrics;
    if (!arr || arr.length === 0) return -1;
    let lo = 0, hi = arr.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const lt = arr[mid] && typeof arr[mid].t === 'number' ? arr[mid].t : Infinity;
      if (lt <= t) { ans = mid; lo = mid + 1; }
      else { hi = mid - 1; }
    }
    return ans;
  }

  const lyricEls = {
    prev:   $('#lyric-prev'),
    curr:   $('#lyric-curr'),
    currKo: $('#lyric-curr-ko'),
    next:   $('#lyric-next'),
  };

  function renderLyrics(i) {
    if (i === state.lyricIndex) return;
    state.lyricIndex = i;
    const arr = state.lyrics;
    const cur  = arr[i]     || { en: '', ko: '' };
    const prev = arr[i - 1] || { en: '' };
    const next = arr[i + 1] || { en: '' };
    lyricEls.prev.textContent   = prev.en || '';
    lyricEls.curr.textContent   = cur.en  || '';
    lyricEls.currKo.textContent = cur.ko  || '';
    lyricEls.next.textContent   = next.en || '';
    lyricEls.curr.classList.remove('is-entering');
    void lyricEls.curr.offsetWidth;
    lyricEls.curr.classList.add('is-entering');
    requestAnimationFrame(() => lyricEls.curr.classList.remove('is-entering'));
  }

  function lyricTick() {
    if (state.scene !== 'postcard') return;
    const t = audio.bgm.currentTime;
    const i = findLyricIndex(t);
    if (i !== state.lyricIndex) renderLyrics(i);
    requestAnimationFrame(lyricTick);
  }

  /* ---------- Reset --------------------------------------------- */

  function resetAll() {
    audio.sfx.pause(); audio.sfx.currentTime = 0;
    audio.bgm.pause(); audio.bgm.currentTime = 0;
    state.smileStarted = false;
    state.lyricIndex = -1;
    state.unlocking = false;
    hidePicker();
    lockWrap.classList.remove('is-opening', 'is-shake');
    document.body.classList.remove('is-unlocking', 'is-zooming');
    clearInputs(false);
    gotoScene('tincan');
  }

  /* ---------- Wire up ------------------------------------------- */

  function init() {
    audio.sfx.volume = SFX_VOLUME;
    audio.bgm.volume = BGM_VOLUME;

    attachInputs();

    // No {once:true}: the tincan must remain clickable after reset.
    scenes.tincan.addEventListener('pointerdown', () => {
      if (state.scene !== 'tincan') return;
      if (document.body.classList.contains('is-zooming')) return;
      unlockAudio();
      zoomFromTincanToLock();
    });

    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      if (t.dataset.action === 'reset') resetAll();
    });

    // Dismiss picker on backdrop click or Escape
    picker.addEventListener('click', (e) => {
      if (e.target === picker) hidePicker();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.pickerOpen) hidePicker();
    });

    document.addEventListener('pointerdown', unlockAudio, { once: true });

    window.addEventListener('resize', () => {
      if (state.scene === 'postcard') fitLetterBody($('#letter-body'));
    });
  }

  loadData().then(init);
})();
