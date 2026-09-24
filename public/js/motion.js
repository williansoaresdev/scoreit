/**
 * Shot input abstraction: turns either a real phone swing (DeviceMotion) or
 * a touch swipe (desktop/no-sensor fallback) into the same two numbers the
 * game cares about - power (0-100, how hard) and lateral (0-100, how far
 * off-axis) - so the shooting logic never needs to know which one fired.
 */
const ShotInput = (() => {
  const START_THRESHOLD = 7;
  const END_THRESHOLD = 3;
  const MAX_GESTURE_MS = 550;
  const COOLDOWN_MS = 900;
  const MIN_SWIPE_PX = 50;

  let onShot = null;
  let enabled = false;
  let cooldown = false;
  let motionAttached = false;

  let state = 'idle';
  let gestureStart = 0;
  let peakMag = 0;
  let peakLateral = 0;

  let touchTarget = null;
  let touchStart = null;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function mapRange(v, inLo, inHi, outLo, outHi) {
    const t = (v - inLo) / (inHi - inLo);
    return outLo + clamp(t, 0, 1) * (outHi - outLo);
  }
  function magnitude(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }

  function fire(power, lateral, source) {
    if (cooldown || !enabled) return;
    cooldown = true;
    setTimeout(() => { cooldown = false; }, COOLDOWN_MS);
    if (onShot) onShot({ power: clamp(power, 0, 100), lateral: clamp(lateral, -100, 100), source });
  }

  function handleMotion(e) {
    if (!enabled || cooldown) return;

    let ax = 0, ay = 0, az = 0;
    const acc = e.acceleration;
    if (acc && (acc.x || acc.y || acc.z)) {
      ax = acc.x || 0; ay = acc.y || 0; az = acc.z || 0;
    } else if (e.accelerationIncludingGravity) {
      ax = e.accelerationIncludingGravity.x || 0;
      ay = (e.accelerationIncludingGravity.y || 0) - 9.8;
      az = e.accelerationIncludingGravity.z || 0;
    } else {
      return;
    }

    const mag = magnitude(ax, ay, az);
    const rot = e.rotationRate && typeof e.rotationRate.gamma === 'number' ? e.rotationRate.gamma : null;
    const lateralRaw = rot !== null ? rot : ax * 12;

    if (state === 'idle') {
      if (mag > START_THRESHOLD) {
        state = 'gesture';
        gestureStart = performance.now();
        peakMag = mag;
        peakLateral = lateralRaw;
      }
      return;
    }

    if (mag > peakMag) {
      peakMag = mag;
      peakLateral = lateralRaw;
    }
    const elapsed = performance.now() - gestureStart;
    if (mag < END_THRESHOLD || elapsed > MAX_GESTURE_MS) {
      state = 'idle';
      const power = mapRange(peakMag, 8, 26, 0, 100);
      const lateral = clamp((peakLateral / 160) * 100, -100, 100);
      fire(power, lateral, 'motion');
    }
  }

  function handlePointerDown(e) {
    if (!enabled || cooldown) return;
    const p = e.touches ? e.touches[0] : e;
    touchStart = { x: p.clientX, y: p.clientY, t: performance.now() };
  }

  function handlePointerUp(e) {
    if (!enabled || cooldown || !touchStart) return;
    const p = e.changedTouches ? e.changedTouches[0] : e;
    const dy = touchStart.y - p.clientY;
    const dx = p.clientX - touchStart.x;
    const dt = Math.max((performance.now() - touchStart.t) / 1000, 0.05);
    touchStart = null;
    if (dy < MIN_SWIPE_PX) return;

    const speed = dy / dt;
    const power = mapRange(speed, 150, 1800, 0, 100);
    const lateral = clamp((dx / 220) * 100, -100, 100);
    fire(power, lateral, 'touch');
  }

  return {
    init({ target, onShot: cb }) {
      onShot = cb;
      touchTarget = target;
      touchTarget.addEventListener('touchstart', handlePointerDown, { passive: true });
      touchTarget.addEventListener('touchend', handlePointerUp, { passive: true });
      touchTarget.addEventListener('mousedown', handlePointerDown);
      touchTarget.addEventListener('mouseup', handlePointerUp);
    },
    needsPermissionPrompt() {
      return typeof window.DeviceMotionEvent !== 'undefined'
        && typeof window.DeviceMotionEvent.requestPermission === 'function';
    },
    hasMotionSupport() {
      return typeof window.DeviceMotionEvent !== 'undefined';
    },
    async enableMotion() {
      if (this.needsPermissionPrompt()) {
        try {
          const result = await window.DeviceMotionEvent.requestPermission();
          if (result !== 'granted') return false;
        } catch {
          return false;
        }
      }
      if (!motionAttached) {
        window.addEventListener('devicemotion', handleMotion);
        motionAttached = true;
      }
      return true;
    },
    setEnabled(v) { enabled = v; },
  };
})();
