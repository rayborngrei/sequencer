// Web Audio API Engine for the Sequencer

export type WaveType = 'sine' | 'triangle' | 'sawtooth' | 'square';

export interface NoteInfo {
  name: string;
  frequency: number;
}

// Musical scales
const SCALES: Record<string, number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10, 12],
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  pentatonic: [0, 3, 5, 7, 10, 12, 15, 17],
  blues: [0, 3, 5, 6, 7, 10, 12, 15],
  japanese: [0, 1, 5, 7, 8, 12, 13, 17],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7],
};

const NOTE_NAMES: Record<string, string[]> = {
  minor: ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb', 'C'],
  major: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'],
  pentatonic: ['C', 'Eb', 'F', 'G', 'Bb', 'C', 'Eb', 'F'],
  blues: ['C', 'Eb', 'F', 'F#', 'G', 'Bb', 'C', 'Eb'],
  japanese: ['C', 'Db', 'F', 'G', 'Ab', 'C', 'Db', 'F'],
  chromatic: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G'],
};

const BASE_FREQ = 261.63; // C4

export function getScaleNotes(scaleName: string): NoteInfo[] {
  const intervals = SCALES[scaleName] || SCALES.minor;
  const names = NOTE_NAMES[scaleName] || NOTE_NAMES.minor;
  return intervals.map((semitone, i) => ({
    name: names[i],
    frequency: BASE_FREQ * Math.pow(2, semitone / 12),
  }));
}

export function getScaleNames(): string[] {
  return Object.keys(SCALES);
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayDry: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private ready = false;

  async init() {
    if (this.ready) return;

    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();

      // Wait for context to be running (required by browsers)
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      // Master gain → destination
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;

      // Analyser for visualization
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      // Dry path
      this.dryGain = this.ctx.createGain();
      this.dryGain.gain.value = 0.85;

      // Wet (reverb) path
      this.wetGain = this.ctx.createGain();
      this.wetGain.gain.value = 0.15;

      // Reverb
      this.reverbNode = this.ctx.createConvolver();
      const ir = this.createReverbIR(2.5, 2.5);
      if (ir) {
        this.reverbNode.buffer = ir;
      }

      // Delay
      this.delayNode = this.ctx.createDelay(2.0);
      this.delayNode.delayTime.value = 0.375;
      this.delayFeedback = this.ctx.createGain();
      this.delayFeedback.gain.value = 0.0;
      this.delayDry = this.ctx.createGain();
      this.delayDry.gain.value = 0.0;

      // Routing:
      // masterGain → dryGain → analyser → destination
      // masterGain → wetGain → reverb → analyser → destination
      // masterGain → delayDry → analyser
      // masterGain → delayNode → delayFeedback → delayNode (feedback loop)
      // delayNode → analyser

      this.masterGain.connect(this.dryGain);
      this.dryGain.connect(this.analyser);

      this.masterGain.connect(this.wetGain);
      this.wetGain.connect(this.reverbNode);
      this.reverbNode.connect(this.analyser);

      this.masterGain.connect(this.delayDry);
      this.delayDry.connect(this.analyser);

      this.masterGain.connect(this.delayNode);
      this.delayNode.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);
      this.delayNode.connect(this.analyser);

      this.analyser.connect(this.ctx.destination);

      this.ready = true;
    } catch (e) {
      console.error('AudioEngine init error:', e);
    }
  }

  /** Ensure the audio context is running. Must be awaited before playing. */
  async ensureRunning() {
    if (!this.ctx) {
      await this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  private createReverbIR(duration: number, decay: number): AudioBuffer | null {
    if (!this.ctx) return null;
    try {
      const sr = this.ctx.sampleRate;
      const length = Math.floor(sr * duration);
      if (length <= 0) return null;
      const buffer = this.ctx.createBuffer(2, length, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = buffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
      }
      return buffer;
    } catch {
      return null;
    }
  }

  playNote(frequency: number, waveType: WaveType, duration = 0.3, velocity = 0.6) {
    if (!this.ctx || !this.masterGain || !this.ready) return;
    if (!isFinite(frequency) || frequency <= 0) return;
    if (this.ctx.state !== 'running') return;

    try {
      const t = this.ctx.currentTime;

      // Two oscillators for richness
      const osc1 = this.ctx.createOscillator();
      osc1.type = waveType;
      osc1.frequency.setValueAtTime(frequency, t);

      const osc2 = this.ctx.createOscillator();
      osc2.type = waveType;
      osc2.frequency.setValueAtTime(frequency * 1.003, t);
      osc2.detune.setValueAtTime(5, t);

      // Amplitude envelope
      const env = this.ctx.createGain();
      const peak = velocity * 0.5;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peak, t + 0.005);
      env.gain.exponentialRampToValueAtTime(peak * 0.4, t + duration * 0.4);
      env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      // Low-pass filter for warmth
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(frequency * 6, 12000), t);
      filter.frequency.exponentialRampToValueAtTime(Math.max(frequency * 1.5, 200), t + duration);
      filter.Q.value = 1;

      // Connect: osc → filter → envelope → masterGain
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(env);
      env.connect(this.masterGain);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + duration + 0.05);
      osc2.stop(t + duration + 0.05);
    } catch (e) {
      console.warn('playNote error:', e);
    }
  }

  playKick() {
    if (!this.ctx || !this.masterGain || !this.ready || this.ctx.state !== 'running') return;
    try {
      const t = this.ctx.currentTime;

      // Sub oscillator
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(35, t + 0.12);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(1.0, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      // Click
      const click = this.ctx.createOscillator();
      click.type = 'square';
      click.frequency.setValueAtTime(1200, t);
      click.frequency.exponentialRampToValueAtTime(100, t + 0.02);
      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(0.3, t);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

      osc.connect(gain);
      gain.connect(this.masterGain);
      click.connect(clickGain);
      clickGain.connect(this.masterGain);

      osc.start(t);
      click.start(t);
      osc.stop(t + 0.4);
      click.stop(t + 0.05);
    } catch (e) {
      console.warn('playKick error:', e);
    }
  }

  playHihat() {
    if (!this.ctx || !this.masterGain || !this.ready || this.ctx.state !== 'running') return;
    try {
      const t = this.ctx.currentTime;
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 0.06);
      if (len <= 0) return;

      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        d[i] = Math.random() * 2 - 1;
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buf;

      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 10000;
      bp.Q.value = 1;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      src.connect(hp);
      hp.connect(bp);
      bp.connect(gain);
      gain.connect(this.masterGain);

      src.start(t);
    } catch (e) {
      console.warn('playHihat error:', e);
    }
  }

  playSnare() {
    if (!this.ctx || !this.masterGain || !this.ready || this.ctx.state !== 'running') return;
    try {
      const t = this.ctx.currentTime;
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 0.15);
      if (len <= 0) return;

      // Noise
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        d[i] = Math.random() * 2 - 1;
      }

      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = buf;

      const noiseHp = this.ctx.createBiquadFilter();
      noiseHp.type = 'highpass';
      noiseHp.frequency.value = 1500;

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.6, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

      noiseSrc.connect(noiseHp);
      noiseHp.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      // Tone body
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.05);

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.5, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);

      noiseSrc.start(t);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch (e) {
      console.warn('playSnare error:', e);
    }
  }

  setReverb(amount: number) {
    if (this.wetGain && isFinite(amount)) {
      this.wetGain.gain.value = Math.max(0, Math.min(1, amount));
    }
  }

  setDelay(amount: number) {
    if (this.delayFeedback && isFinite(amount)) {
      this.delayFeedback.gain.value = Math.max(0, Math.min(0.7, amount));
    }
  }

  setVolume(vol: number) {
    if (this.masterGain && isFinite(vol)) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
    }
  }

  getAnalyserData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(128);
    try {
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      return data;
    } catch {
      return new Uint8Array(128);
    }
  }

  get isReady() {
    return this.ready;
  }
}

export const audioEngine = new AudioEngine();
