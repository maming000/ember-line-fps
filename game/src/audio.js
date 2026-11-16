// Synthesised sound: no audio files, no network, just a WebAudio context built on the
// first user gesture. Every sound is an oscillator or a short noise burst, kept quiet
// enough to sit under the game.
export function createAudio() {
  let context = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) return context;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      context = new AudioContextClass();
      const length = Math.floor(context.sampleRate * 0.2);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    } catch {
      context = null;
    }
    return context;
  }

  function tone(frequency, duration, gainValue, type = 'square') {
    const ctx = ensure();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  }

  function noise(duration, gainValue, filterFrequency = 1200) {
    const ctx = ensure();
    if (!ctx || !noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFrequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
    source.stop(ctx.currentTime + duration);
  }

  return {
    unlock() {
      ensure();
      if (context && context.state === 'suspended') context.resume().catch(() => {});
    },
    shot(kind) {
      if (kind === 'bot') noise(0.09, 0.05, 900);
      else noise(0.12, 0.12, 1800);
    },
    reload() {
      tone(320, 0.08, 0.05);
      setTimeout(() => tone(420, 0.08, 0.05), 120);
    },
    hit(killed) {
      tone(killed ? 880 : 660, 0.07, 0.07, 'sine');
    },
    beep(frequency) {
      tone(frequency, 0.09, 0.06, 'sine');
    },
    explosion() {
      noise(0.8, 0.25, 300);
      tone(70, 0.6, 0.15, 'sine');
    },
    roundWin() {
      tone(523, 0.12, 0.07, 'sine');
      setTimeout(() => tone(784, 0.18, 0.07, 'sine'), 130);
    },
    roundLose() {
      tone(392, 0.15, 0.07, 'sine');
      setTimeout(() => tone(262, 0.25, 0.07, 'sine'), 160);
    },
    click() {
      tone(700, 0.04, 0.04, 'sine');
    },
  };
}
