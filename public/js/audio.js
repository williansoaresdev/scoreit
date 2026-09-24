/**
 * All sound effects are synthesized with the Web Audio API - no audio files
 * to fetch/cache, and it sidesteps autoplay restrictions since the context
 * is created/resumed on the player's first tap (see ScoreItAudio.unlock).
 */
const ScoreItAudio = (() => {
  let ctx = null;

  function unlock() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone({ freq, duration, type = 'sine', gain = 0.2, glideTo = null, delay = 0 }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function noiseBurst({ duration, gain = 0.15, filterFreq = 1200, delay = 0 }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.frequency.exponentialRampToValueAtTime(filterFreq * 0.4, t0 + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(filter).connect(amp).connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }

  return {
    unlock,
    playTransition() {
      tone({ freq: 420, glideTo: 720, duration: 0.18, type: 'triangle', gain: 0.15 });
    },
    playThrow() {
      noiseBurst({ duration: 0.28, filterFreq: 900, gain: 0.18 });
    },
    playScore() {
      tone({ freq: 523.25, duration: 0.14, type: 'sine', gain: 0.22 });
      tone({ freq: 659.25, duration: 0.14, type: 'sine', gain: 0.2, delay: 0.09 });
      tone({ freq: 783.99, duration: 0.22, type: 'sine', gain: 0.22, delay: 0.18 });
    },
    playMiss() {
      tone({ freq: 180, glideTo: 90, duration: 0.35, type: 'sawtooth', gain: 0.18 });
    },
  };
})();
