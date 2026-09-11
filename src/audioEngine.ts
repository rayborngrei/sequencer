// Web Audio API Engine for Instrument-based Sequencer

export type WaveType = 'sine' | 'triangle' | 'sawtooth' | 'square';

export interface InstrumentPreset {
  name: string;
  icon: string;
  color: string;
  oscillators: Array<{
    type: WaveType;
    detune?: number;
    gain: number;
  }>;
  envelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  filter?: {
    type: BiquadFilterType;
    frequency: number;
    Q: number;
  };
  isDrum?: boolean;
  drumType?: 'kick' | 'snare' | 'hihat';
}

export const INSTRUMENT_PRESETS: Record<string, InstrumentPreset> = {
  piano: {
    name: 'Piano',
    icon: '🎹',
    color: '#8b5cf6',
    oscillators: [
      { type: 'triangle', gain: 0.6 },
      { type: 'sine', detune: 5, gain: 0.3 }
    ],
    envelope: { attack: 0.005, decay: 0.3, sustain: 0.2, release: 0.2 },
    filter: { type: 'lowpass', frequency: 3000, Q: 1 }
  },
  bass: {
    name: 'Bass',
    icon: '🎸',
    color: '#ef4444',
    oscillators: [
      { type: 'sine', gain: 0.8 }
    ],
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.1 },
    filter: { type: 'lowpass', frequency: 800, Q: 2 }
  },
  lead: {
    name: 'Lead Synth',
    icon: '🎛️',
    color: '#f59e0b',
    oscillators: [
      { type: 'sawtooth', gain: 0.5 },
      { type: 'sawtooth', detune: 10, gain: 0.3 }
    ],
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.3 },
    filter: { type: 'lowpass', frequency: 2500, Q: 3 }
  },
  strings: {
    name: 'Strings',
    icon: '🎻',
    color: '#10b981',
    oscillators: [
      { type: 'sawtooth', gain: 0.4 },
      { type: 'sawtooth', detune: -5, gain: 0.3 }
    ],
    envelope: { attack: 0.15, decay: 0.3, sustain: 0.7, release: 0.5 },
    filter: { type: 'lowpass', frequency: 2000, Q: 1 }
  },
  guitar: {
    name: 'Guitar',
    icon: '🎸',
    color: '#ec4899',
    oscillators: [
      { type: 'square', gain: 0.5 }
    ],
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 0.1 },
    filter: { type: 'lowpass', frequency: 1800, Q: 2 }
  },
  pad: {
    name: 'Pad',
    icon: '🌊',
    color: '#06b6d4',
    oscillators: [
      { type: 'sawtooth', gain: 0.3 },
      { type: 'sawtooth', detune: 7, gain: 0.25 },
      { type: 'sawtooth', detune: -7, gain: 0.25 }
    ],
    envelope: { attack: 0.3, decay: 0.5, sustain: 0.8, release: 0.8 },
    filter: { type: 'lowpass', frequency: 1500, Q: 1 }
  },
  flute: {
    name: 'Flute',
    icon: '🪈',
    color: '#84cc16',
    oscillators: [
      { type: 'sine', gain: 0.7 }
    ],
    envelope: { attack: 0.08, decay: 0.2, sustain: 0.6, release: 0.3 },
    filter: { type: 'lowpass', frequency: 4000, Q: 1 }
  },
  bells: {
    name: 'Bells',
    icon: '🔔',
    color: '#eab308',
    oscillators: [
      { type: 'sine', gain: 0.6 },
      { type: 'sine', detune: 1200, gain: 0.2 }
    ],
    envelope: { attack: 0.001, decay: 0.8, sustain: 0.1, release: 0.5 }
  },
  pluck: {
    name: 'Pluck',
    icon: '🎵',
    color: '#f97316',
    oscillators: [
      { type: 'triangle', gain: 0.6 }
    ],
    envelope: { attack: 0.001, decay: 0.1, sustain: 0.05, release: 0.05 },
    filter: { type: 'lowpass', frequency: 2500, Q: 3 }
  },
  kick: {
    name: 'Kick',
    icon: '🥁',
    color: '#dc2626',
    oscillators: [],
    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
    isDrum: true,
    drumType: 'kick'
  },
  snare: {
    name: 'Snare',
    icon: '🥁',
    color: '#ca8a04',
    oscillators: [],
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
    isDrum: true,
    drumType: 'snare'
  },
  hihat: {
    name: 'Hi-Hat',
    icon: '🥁',
    color: '#0891b2',
    oscillators: [],
    envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 },
    isDrum: true,
    drumType: 'hihat'
  }
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private ready = false;

  async init() {
    if (this.ready) return;

    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      this.dryGain = this.ctx.createGain();
      this.dryGain.gain.value = 0.85;

      this.wetGain = this.ctx.createGain();
      this.wetGain.gain.value = 0.15;

      this.reverbNode = this.ctx.createConvolver();
      const ir = this.createReverbIR(2.5, 2.5);
      if (ir) this.reverbNode.buffer = ir;

      this.delayNode = this.ctx.createDelay(2.0);
      this.delayNode.delayTime.value = 0.375;
      this.delayFeedback = this.ctx.createGain();
      this.delayFeedback.gain.value = 0.0;

      this.masterGain.connect(this.dryGain);
      this.dryGain.connect(this.analyser);

      this.masterGain.connect(this.wetGain);
      this.wetGain.connect(this.reverbNode);
      this.reverbNode.connect(this.analyser);

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

  async ensureRunning() {
    if (!this.ctx) await this.init();
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

  playInstrument(preset: InstrumentPreset, frequency: number, duration: number = 0.3, volume: number = 0.6, pan: number = 0) {
    if (!this.ctx || !this.masterGain || !this.ready || this.ctx.state !== 'running') return;

    if (preset.isDrum) {
      this.playDrum(preset, volume);
      return;
    }

    if (!isFinite(frequency) || frequency <= 0) return;

    try {
      const t = this.ctx.currentTime;

      // Create panner
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));

      // Create instrument gain
      const instGain = this.ctx.createGain();
      instGain.gain.value = volume;

      // Create envelope
      const env = this.ctx.createGain();
      const peak = 0.5;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peak, t + preset.envelope.attack);
      env.gain.linearRampToValueAtTime(peak * preset.envelope.sustain, t + preset.envelope.attack + preset.envelope.decay);
      env.gain.linearRampToValueAtTime(0.0001, t + duration + preset.envelope.release);

      // Create oscillators
      const oscillators: OscillatorNode[] = [];
      preset.oscillators.forEach(oscConfig => {
        const osc = this.ctx!.createOscillator();
        osc.type = oscConfig.type;
        osc.frequency.setValueAtTime(frequency, t);
        if (oscConfig.detune) {
          osc.detune.setValueAtTime(oscConfig.detune, t);
        }
        oscillators.push(osc);
      });

      // Create filter if needed
      let lastNode: AudioNode = env;
      if (preset.filter) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = preset.filter.type;
        filter.frequency.setValueAtTime(preset.filter.frequency, t);
        filter.Q.value = preset.filter.Q;
        env.connect(filter);
        lastNode = filter;
      }

      // Connect oscillators to envelope
      oscillators.forEach((osc, i) => {
        const oscGain = this.ctx!.createGain();
        oscGain.gain.value = preset.oscillators[i].gain;
        osc.connect(oscGain);
        oscGain.connect(env);
      });

      // Connect to instrument gain and panner
      lastNode.connect(instGain);
      instGain.connect(panner);
      panner.connect(this.masterGain);

      // Start and stop oscillators
      oscillators.forEach(osc => {
        osc.start(t);
        osc.stop(t + duration + preset.envelope.release + 0.05);
      });
    } catch (e) {
      console.warn('playInstrument error:', e);
    }
  }

  private playDrum(preset: InstrumentPreset, volume: number = 0.6) {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;

    try {
      const t = this.ctx.currentTime;

      if (preset.drumType === 'kick') {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(35, t + 0.12);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + 0.4);
      } else if (preset.drumType === 'snare') {
        const sr = this.ctx.sampleRate;
        const len = Math.floor(sr * 0.15);
        if (len <= 0) return;

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
        noiseGain.gain.setValueAtTime(volume * 0.8, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

        noiseSrc.connect(noiseHp);
        noiseHp.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(110, t + 0.05);

        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(volume * 0.6, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

        osc.connect(oscGain);
        oscGain.connect(this.masterGain);

        noiseSrc.start(t);
        osc.start(t);
        osc.stop(t + 0.2);
      } else if (preset.drumType === 'hihat') {
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
        gain.gain.setValueAtTime(volume * 0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

        src.connect(hp);
        hp.connect(bp);
        bp.connect(gain);
        gain.connect(this.masterGain);

        src.start(t);
      }
    } catch (e) {
      console.warn('playDrum error:', e);
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
