// Web Audio engine: drone bed, UI sounds, Echo instrument, FFT analysis (SPEC §5 / M7).
// Master chain: voices → lowpass → master → analyser → destination (+ delay loop).

export interface Bands { bass: number; mid: number; high: number }

const FFT_BINS = 256;

export class AudioEngine {
  enabled = false;
  ctx: AudioContext | null = null;

  private master!: GainNode;
  private lowpass!: BiquadFilterNode;
  private analyser!: AnalyserNode;
  private delaySend!: GainNode;
  private delayNode!: DelayNode;
  private noiseBuf: AudioBuffer | null = null;

  private droneOscs: OscillatorNode[] = [];
  private droneGain!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private droneLfoGain!: GainNode;
  private droneHz = 0;

  // echo instrument voice
  private noteOsc: OscillatorNode | null = null;
  private noteSub: OscillatorNode | null = null;
  private noteGain: GainNode | null = null;
  private noteFilter: BiquadFilterNode | null = null;

  fft = new Uint8Array(128);
  private raw = new Uint8Array(FFT_BINS);
  bands: Bands = { bass: 0, mid: 0, high: 0 };

  private targetLowpass = 18000;
  private pendingDelayWet = 0.35;

  /** echo-room delay send amount (0..1) */
  setDelayWet(v: number) {
    this.pendingDelayWet = v;
    if (!this.ctx) return;
    this.delaySend.gain.setTargetAtTime(v * 0.8, this.ctx.currentTime, 0.1);
  }

  /** build the graph lazily (needs a user gesture) */
  private ensure() {
    if (this.ctx) return;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = this.targetLowpass;
    this.lowpass.Q.value = 0.5;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = FFT_BINS * 2;
    this.analyser.smoothingTimeConstant = 0.72;

    // delay feedback loop for space
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = this.pendingDelayWet * 0.8;
    this.delayNode = ctx.createDelay(1.5);
    this.delayNode.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.45;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    this.delaySend.connect(this.delayNode);
    this.delayNode.connect(fb);
    fb.connect(this.delayNode);
    this.delayNode.connect(damp);
    damp.connect(this.master);

    this.lowpass.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    // drone bed
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 420;
    this.droneFilter.Q.value = 1.2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    this.droneLfoGain = ctx.createGain();
    this.droneLfoGain.gain.value = 160;
    lfo.connect(this.droneLfoGain);
    this.droneLfoGain.connect(this.droneFilter.frequency);
    lfo.start();
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.lowpass);
    this.droneGain.connect(this.delaySend);

    // noise buffer for UI / transition cracks
    const len = ctx.sampleRate * 0.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  enable(): Promise<void> {
    this.ensure();
    // All state that the UI depends on is applied synchronously; waiting for
    // AudioContext.resume() is done by the returned promise only. In some
    // browsers resume() stays pending without a trusted gesture — the button
    // must still reflect the requested state.
    this.enabled = true;
    const t = this.ctx!.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0.85, t, 0.6);
    if (this.droneHz > 0) this.setDrone(this.droneHz);
    return this.ctx!.resume().catch(() => { /* ignore blocked autoplay */ });
  }

  disable() {
    if (!this.ctx || !this.enabled) return;
    this.enabled = false;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, t, 0.25);
  }

  setLowpassTarget(hz: number) {
    this.targetLowpass = hz;
    if (!this.ctx) return;
    this.lowpass.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.4);
  }

  /** root frequency for the current room; 0 = drone off (Echo) */
  setDrone(hz: number) {
    this.droneHz = hz;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (hz <= 0) {
      this.droneGain.gain.setTargetAtTime(0, t, 0.8);
      return;
    }
    if (this.droneOscs.length === 0) {
      const detunes = [-6, 5, 0]; // two near-unison saws + one octave-down triangle
      const types: OscillatorType[] = ['sawtooth', 'sawtooth', 'triangle'];
      for (let i = 0; i < 3; i++) {
        const o = this.ctx.createOscillator();
        o.type = types[i];
        o.detune.value = detunes[i];
        const g = this.ctx.createGain();
        g.gain.value = i === 2 ? 0.5 : 0.32;
        o.connect(g);
        g.connect(this.droneFilter);
        o.start();
        this.droneOscs.push(o);
      }
    }
    this.droneOscs.forEach((o, i) => {
      o.frequency.setTargetAtTime(hz * (i === 2 ? 0.5 : 1), t, 0.9);
    });
    if (this.enabled) this.droneGain.gain.setTargetAtTime(0.05, t, 1.2);
  }

  // ------------------------------------------------------------ UI sounds --

  private noiseVoice(dur: number, hpFreq: number, vol: number, decay: number) {
    if (!this.ctx || !this.enabled || !this.noiseBuf) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = hpFreq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    g.connect(this.delaySend);
    src.start(t);
    src.stop(t + dur);
  }

  crack() { this.noiseVoice(0.5, 900, 0.5, 0.45); }  // frost transition
  blip() { this.tone(1320, 0.06, 0.1, 'square'); }   // confirm
  hoverTick() { this.tone(2400, 0.02, 0.028, 'sine'); }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------- Echo instrument --

  /** A-minor pentatonic across ~2.5 octaves */
  static PENTATONIC = [
    110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63, 392, 440, 523.25,
  ];

  noteOn(freq: number, cutoff: number, vol: number) {
    if (!this.ctx || !this.enabled) return;
    this.noteOff(true);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);            // attack
    o.connect(f); sub.connect(f);
    f.connect(g);
    g.connect(this.lowpass);
    g.connect(this.delaySend);
    o.start(t); sub.start(t);
    this.noteOsc = o; this.noteSub = sub; this.noteGain = g; this.noteFilter = f;
  }

  noteMove(freq: number, cutoff: number, vol: number) {
    if (!this.ctx || !this.noteOsc || !this.noteGain || !this.noteFilter) return;
    const t = this.ctx.currentTime;
    this.noteOsc.frequency.setTargetAtTime(freq, t, 0.035);
    if (this.noteSub) this.noteSub.frequency.setTargetAtTime(freq / 2, t, 0.035);
    this.noteFilter.frequency.setTargetAtTime(cutoff, t, 0.05);
    this.noteGain.gain.setTargetAtTime(vol, t, 0.08);
  }

  noteOff(immediate = false) {
    if (!this.ctx || !this.noteGain) return;
    const t = this.ctx.currentTime;
    const g = this.noteGain;
    const o = this.noteOsc, s = this.noteSub;
    const rel = immediate ? 0.02 : 0.35;                       // release
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.0001, t, rel / 3);
    const stopAt = t + rel + 0.1;
    if (o) { try { o.stop(stopAt); } catch { /* noop */ } }
    if (s) { try { s.stop(stopAt); } catch { /* noop */ } }
    this.noteOsc = null; this.noteSub = null; this.noteGain = null; this.noteFilter = null;
  }

  // ------------------------------------------------------------- analysis --

  /** call once per frame; fills fft (128 bins) + bands */
  tick() {
    if (!this.ctx || !this.enabled) {
      // decay bands to silence
      this.bands.bass *= 0.9; this.bands.mid *= 0.9; this.bands.high *= 0.9;
      return;
    }
    this.analyser.getByteFrequencyData(this.raw);
    let b = 0, m = 0, h = 0;
    for (let i = 0; i < 128; i++) {
      this.fft[i] = this.raw[i];
      if (i < 8) b += this.raw[i];
      else if (i < 48) m += this.raw[i];
      else h += this.raw[i];
    }
    this.bands.bass = Math.min(1, b / (8 * 160));
    this.bands.mid = Math.min(1, m / (40 * 150));
    this.bands.high = Math.min(1, h / (80 * 120));
  }

  dispose() {
    this.noteOff(true);
    this.droneOscs.forEach((o) => { try { o.stop(); } catch { /* noop */ } });
    this.droneOscs = [];
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
    this.enabled = false;
  }
}
