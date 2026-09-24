(() => {
  const SHOTS_TOTAL = 10;
  const IDEAL_POWER = 55;
  const POWER_TOLERANCE = 16;
  const LATERAL_TOLERANCE = 32;

  const BALL_START = { x: 34, y: 76 };
  const HOOP_CENTER = { x: 50, y: 16 };

  const $ = (sel) => document.querySelector(sel);

  const state = {
    character: null,
    name: '',
    roomId: null,
    selfId: null,
    players: [],
    flow: null, // 'create' | 'join'
    pendingJoinRoomId: null,
    shots: 0,
    score: 0,
    motionChoiceMade: false,
  };

  const els = {
    ball: $('#ball'),
    avatarWrap: $('#avatar-wrap'),
    courtScene: $('#court-scene'),
    shotFeedback: $('#shot-feedback'),
    toast: $('#toast'),
  };

  let toastTimer = null;
  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 2500);
  }

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('is-active'));
    document.getElementById(`screen-${name}`).classList.add('is-active');
  }

  // ---------- Character select ----------
  document.querySelectorAll('.char-thumb').forEach((el) => {
    el.innerHTML = buildAvatarSVG(el.dataset.avatar);
  });

  function updateCharacterContinueState() {
    $('#btn-character-continue').disabled = !(state.character && state.name.trim());
  }

  document.querySelectorAll('.char-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.char-card').forEach((c) => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      state.character = card.dataset.character;
      updateCharacterContinueState();
    });
  });

  $('#input-name').addEventListener('input', (e) => {
    state.name = e.target.value;
    updateCharacterContinueState();
  });

  // ---------- Splash ----------
  $('#btn-splash-continue').addEventListener('click', () => {
    ScoreItAudio.unlock();
    ScoreItAudio.playTransition();
    showScreen('character');
  });

  // ---------- Character -> Room / direct join ----------
  $('#btn-character-continue').addEventListener('click', async () => {
    ScoreItAudio.playTransition();
    if (state.pendingJoinRoomId) {
      const roomId = state.pendingJoinRoomId;
      state.pendingJoinRoomId = null;
      await attemptJoin(roomId);
    } else {
      showScreen('room');
    }
  });

  // ---------- Room select ----------
  $('#btn-room-back').addEventListener('click', () => {
    ScoreItAudio.playTransition();
    showScreen('character');
  });

  $('#btn-create-court').addEventListener('click', async () => {
    state.flow = 'create';
    try {
      await net.send({ type: 'create_room', name: state.name, character: state.character });
    } catch {
      toast('Could not reach the server. Please try again.');
    }
  });

  $('#btn-join-court').addEventListener('click', async () => {
    const id = $('#input-room-id').value.trim().toUpperCase();
    if (!id) return toast('Enter a court ID first.');
    await attemptJoin(id);
  });

  async function attemptJoin(roomId) {
    state.flow = 'join';
    try {
      await net.send({ type: 'join_room', roomId, name: state.name, character: state.character });
    } catch {
      toast('Could not reach the server. Please try again.');
    }
  }

  // ---------- Network events ----------
  net.on('joined', (data) => {
    state.roomId = data.roomId;
    state.selfId = data.selfId;
    state.players = data.players;
    if (state.flow === 'create') {
      renderLobby();
      showScreen('lobby');
    } else {
      enterGameScreen();
    }
  });

  net.on('room_update', (data) => {
    state.players = data.players;
    if (document.getElementById('screen-lobby').classList.contains('is-active')) renderLobby();
    updateLiveBoard();
    if (document.getElementById('screen-results').classList.contains('is-active')) renderResults();
  });

  net.on('error', (data) => toast(data.message || 'Something went wrong.'));
  net.on('__close', () => toast('Connection lost. Reconnecting on next action.'));

  // ---------- Lobby ----------
  function renderLobby() {
    $('#lobby-room-id').textContent = state.roomId;
    $('#lobby-player-count').textContent = state.players.length;
    const list = $('#lobby-player-list');
    list.innerHTML = '';
    state.players.forEach((p) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${escapeHtml(p.name)}</span><span>${characterLabel(p.character)}</span>`;
      list.appendChild(li);
    });
  }

  $('#btn-share-court').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?room=${state.roomId}`;
    const text = `Join my ScoreIt court! Court ID: ${state.roomId}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'ScoreIt', text, url }); } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast('Link copied to clipboard!');
      } catch {
        toast(url);
      }
    }
  });

  $('#btn-enter-court').addEventListener('click', () => enterGameScreen());

  // ---------- Game screen ----------
  function updateHud() {
    $('#hud-shots-taken').textContent = state.shots;
    $('#hud-score').textContent = state.score;
  }

  function resetBallPosition() {
    els.ball.style.left = `${BALL_START.x}%`;
    els.ball.style.top = `${BALL_START.y}%`;
    els.ball.style.opacity = '1';
  }

  function enterGameScreen() {
    state.shots = 0;
    state.score = 0;
    updateHud();
    els.avatarWrap.innerHTML = buildAvatarSVG(state.character);
    resetBallPosition();
    updateLiveBoard();
    showScreen('game');
    ScoreItAudio.playTransition();

    if (!state.motionChoiceMade) {
      $('#motion-gate').classList.remove('is-hidden');
    } else {
      ShotInput.setEnabled(true);
    }
  }

  $('#btn-enable-motion').addEventListener('click', async () => {
    const ok = await ShotInput.enableMotion();
    state.motionChoiceMade = true;
    $('#motion-gate').classList.add('is-hidden');
    ShotInput.setEnabled(true);
    if (!ok) toast('Motion permission denied — swipe up on the screen to shoot.');
  });

  $('#btn-skip-motion').addEventListener('click', () => {
    state.motionChoiceMade = true;
    $('#motion-gate').classList.add('is-hidden');
    ShotInput.setEnabled(true);
  });

  ShotInput.init({ target: els.courtScene, onShot: handleShot });

  function handleShot({ power, lateral }) {
    if (state.shots >= SHOTS_TOTAL) return;
    ShotInput.setEnabled(false);
    const outcome = computeOutcome(power, lateral);
    runShotSequence(outcome);
  }

  function computeOutcome(power, lateral) {
    const jitter = Math.random() * 8 - 4;
    const idealPower = IDEAL_POWER + jitter;
    const powerDiff = power - idealPower;
    const madePower = Math.abs(powerDiff) <= POWER_TOLERANCE;
    const madeLateral = Math.abs(lateral) <= LATERAL_TOLERANCE;
    return { made: madePower && madeLateral, powerDiff, lateral };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function quadBezier(p0, p1, p2, t) {
    const x = lerp(lerp(p0.x, p1.x, t), lerp(p1.x, p2.x, t), t);
    const y = lerp(lerp(p0.y, p1.y, t), lerp(p1.y, p2.y, t), t);
    return { x, y };
  }

  function animateArc(from, to, duration, arcHeight) {
    return new Promise((resolve) => {
      const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - arcHeight };
      const start = performance.now();
      function frame(now) {
        const t = Math.min((now - start) / duration, 1);
        const p = quadBezier(from, control, to, t);
        els.ball.style.left = `${p.x}%`;
        els.ball.style.top = `${p.y}%`;
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function showFeedback(text, kind) {
    els.shotFeedback.textContent = text;
    els.shotFeedback.className = `shot-feedback is-${kind}`;
    // restart animation
    void els.shotFeedback.offsetWidth;
    els.shotFeedback.classList.add('is-visible');
  }

  async function runShotSequence(outcome) {
    ScoreItAudio.playThrow();
    els.avatarWrap.classList.add('is-throwing');
    setTimeout(() => els.avatarWrap.classList.remove('is-throwing'), 500);

    const clampPct = (v) => Math.max(15, Math.min(85, v));

    if (outcome.made) {
      await animateArc(BALL_START, HOOP_CENTER, 550, 34);
      ScoreItAudio.playScore();
      showFeedback('+3 SWISH!', 'hit');
      await animateArc(HOOP_CENTER, { x: HOOP_CENTER.x, y: HOOP_CENTER.y + 8 }, 180, 0);
      els.ball.style.opacity = '0';
    } else {
      const lateralOffset = (outcome.lateral / 100) * 24;
      let target = { x: clampPct(HOOP_CENTER.x + lateralOffset), y: HOOP_CENTER.y };
      let arcHeight = 34;

      if (outcome.powerDiff < -POWER_TOLERANCE) {
        target = { x: clampPct(HOOP_CENTER.x + lateralOffset * 0.6), y: HOOP_CENTER.y + 20 };
        arcHeight = 20;
      } else if (outcome.powerDiff > POWER_TOLERANCE) {
        target = { x: clampPct(HOOP_CENTER.x + lateralOffset * 1.3), y: HOOP_CENTER.y - 3 };
        arcHeight = 42;
      }

      await animateArc(BALL_START, target, 550, arcHeight);
      ScoreItAudio.playMiss();
      showFeedback('MISS', 'miss');
      const rebound = { x: clampPct(target.x + (lateralOffset >= 0 ? 10 : -10)), y: target.y + 14 };
      await animateArc(target, rebound, 260, 6);
      els.ball.style.opacity = '0';
    }

    state.shots += 1;
    if (outcome.made) state.score += 3;
    updateHud();
    net.send({ type: 'shot', made: outcome.made }).catch(() => {});

    await new Promise((r) => setTimeout(r, 350));
    resetBallPosition();

    if (state.shots >= SHOTS_TOTAL) {
      finishGame();
    } else {
      ShotInput.setEnabled(true);
    }
  }

  function finishGame() {
    ShotInput.setEnabled(false);
    setTimeout(() => {
      renderResults();
      showScreen('results');
      ScoreItAudio.playTransition();
    }, 600);
  }

  // ---------- Live standings ----------
  $('#btn-board-toggle').addEventListener('click', () => {
    $('#live-board').classList.toggle('is-open');
  });

  function updateLiveBoard() {
    const list = $('#live-board-list');
    list.innerHTML = '';
    state.players.forEach((p) => {
      const li = document.createElement('li');
      if (p.id === state.selfId) li.classList.add('is-self');
      li.innerHTML = `<span>${escapeHtml(p.name)}</span><span>${p.score}</span>`;
      list.appendChild(li);
    });
  }

  // ---------- Results ----------
  function renderResults() {
    const list = $('#results-list');
    list.innerHTML = '';
    state.players.forEach((p, i) => {
      const li = document.createElement('li');
      if (p.id === state.selfId) li.classList.add('is-self');
      li.innerHTML = `
        <span class="results-rank">${i + 1}</span>
        <span class="results-name">${escapeHtml(p.name)} <small>${characterLabel(p.character)}</small></span>
        <span class="results-score">${p.score} pts</span>`;
      list.appendChild(li);
    });
  }

  $('#btn-results-home').addEventListener('click', () => {
    net.send({ type: 'leave_room' }).catch(() => {});
    state.roomId = null;
    state.selfId = null;
    state.players = [];
    state.shots = 0;
    state.score = 0;
    history.replaceState(null, '', location.pathname);
    $('#live-board').classList.remove('is-open');
    ScoreItAudio.playTransition();
    showScreen('splash');
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Boot ----------
  (function boot() {
    const params = new URLSearchParams(location.search);
    const roomParam = params.get('room');
    if (roomParam) state.pendingJoinRoomId = roomParam.trim().toUpperCase();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(() => {});
      });
    }
  })();
})();
