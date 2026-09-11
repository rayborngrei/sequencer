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
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  async init() {
    if (this.ctx) return;
    
    this.ctx = new AudioContext();
    
    // Master chain
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 10;
    this.compressor.ratio.value = 4;
    
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.7;
    
    // Effects
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.8;
    
    this.wetGain = this.ctx.createGain();
    this.wetGain.gain.value = 0.2;
    
    // Delay
    this.delayNode = this.ctx.createDelay(1.0);
    this.delayNode.delayTime.value = 0.3;
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.value = 0.3;
    
    // Reverb (simple impulse response)
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = this.createReverbIR(2.0, 2.0);
    
    // Routing
    this.compressor.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    
    this.dryGain.connect(this.compressor);
    this.wetGain.connect(this.reverbNode);
    this.reverbNode.connect(this.compressor);
    
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.compressor);
    
    this.masterGain.connect(this.dryGain);
    this.masterGain.connect(this.wetGain);
    this.masterGain.connect(this.delayNode);
  }

  private createReverbIR(duration: number, decay: number): AudioBuffer {
    const sampleRate = this.ctx!.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.ctx!.createBuffer(2, length, sampleRate);
    
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  playNote(frequency: number, waveType: WaveType, duration: number = 0.2, velocity: number = 0.5) {
    if (!this.ctx || !this.masterGain) return;
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    
    // Oscillator
    const osc = this.ctx.createOscillator();
    osc.type = waveType;
    osc.frequency.setValueAtTime(frequency, now);
    
    // Add slight detune for richness
    const osc2 = this.ctx.createOscillator();
    osc2.type = waveType;
    osc2.frequency.setValueAtTime(frequency * 1.002, now);
    
    // Envelope
    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(velocity * 0.4, now + 0.01);
    envelope.gain.exponentialRampToValueAtTime(velocity * 0.15, now + duration * 0.3);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    // Filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency * 4, now);
    filter.frequency.exponentialRampToValueAtTime(frequency * 1.5, now + duration);
    filter.Q.value = 2;
    
    // Connect
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.masterGain);
    
    osc.start(now);
    osc2.start(now);
    osc.stop(now + duration + 0.1);
    osc2.stop(now + duration + 0.1);
  }

  playKick() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playHihat() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    source.start(now);
  }

  playSnare() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    
    // Noise part
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 3000;
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    
    // Tone part
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
    
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    
    noiseSource.start(now);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  setBpm(_bpm: number) {
    // BPM is handled by the sequencer timing
  }

  setReverb(amount: number) {
    if (this.wetGain) {
      this.wetGain.gain.value = amount;
    }
  }

  setDelay(amount: number) {
    if (this.delayFeedback) {
      this.delayFeedback.gain.value = amount * 0.5;
    }
  }

  setDelayTime(time: number) {
    if (this.delayNode) {
      this.delayNode.delayTime.value = time;
    }
  }

  setVolume(vol: number) {
    if (this.masterGain) {
      this.masterGain.gain.value = vol;
    }
  }

  getAnalyserData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(128);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  getWaveformData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(128);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}

export const audioEngine = new AudioEngine();
