export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engine = null;
    this.engineGain = null;
    this.boostGain = null;
    this.ready = false;
    this.muted = false;
  }

  init() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.ctx.destination);

    this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const engineOsc = this.ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 52;
    const engineOsc2 = this.ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 26;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 2;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    engineOsc.connect(filter);
    engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    engineOsc.start();
    engineOsc2.start();
    this.engineFilter = filter;
    this.engineOsc = engineOsc;
    this.engineOsc2 = engineOsc2;

    const boostSrc = this.ctx.createBufferSource();
    boostSrc.buffer = this.noiseBuffer;
    boostSrc.loop = true;
    const boostFilter = this.ctx.createBiquadFilter();
    boostFilter.type = 'bandpass';
    boostFilter.frequency.value = 900;
    boostFilter.Q.value = 0.8;
    this.boostGain = this.ctx.createGain();
    this.boostGain.gain.value = 0;
    boostSrc.connect(boostFilter);
    boostFilter.connect(this.boostGain);
    this.boostGain.connect(this.master);
    boostSrc.start();

    this.ready = true;
  }

  setEngine(speed, boosting, airborne) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const norm = Math.min(Math.abs(speed) / 42, 1);
    const freq = 44 + norm * 78 + (boosting ? 16 : 0);
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(freq * 0.5, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(240 + norm * 780 + (boosting ? 320 : 0), t, 0.08);
    const target = airborne ? 0.018 : 0.045 + norm * 0.075;
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : target, t, 0.1);
    this.boostGain.gain.setTargetAtTime(this.muted ? 0 : (boosting ? 0.16 : 0), t, 0.08);
  }

  blip(freq = 660, duration = 0.12, type = 'sine', vol = 0.18) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  hit(power = 1) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160 * (0.7 + power * 0.5), t);
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.18);
    gain.gain.setValueAtTime(0.28 * Math.min(power, 1.4), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.25);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.16 * Math.min(power, 1.2), t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    src.connect(filter);
    filter.connect(ng);
    ng.connect(this.master);
    src.start(t);
    src.stop(t + 0.16);
  }

  pickup(big = false) {
    this.blip(big ? 1180 : 880, 0.14, 'sine', big ? 0.16 : 0.08);
    if (big) setTimeout(() => this.blip(1480, 0.18, 'sine', 0.1), 60);
  }

  jump() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.exponentialRampToValueAtTime(2400, t + 0.2);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + 0.24);
  }

  goal() {
    if (!this.ready || this.muted) return;
    const notes = [196, 247, 294, 392, 494, 587];
    notes.forEach((f, i) => {
      setTimeout(() => {
        this.blip(f, 0.6, 'sawtooth', 0.075);
        this.blip(f * 2, 0.35, 'sine', 0.05);
      }, i * 70);
    });
  }

  countdown(final = false) {
    this.blip(final ? 1040 : 620, final ? 0.35 : 0.12, 'square', 0.09);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.42, this.ctx.currentTime, 0.05);
    return this.muted;
  }
}
