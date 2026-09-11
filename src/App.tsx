import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, Pause, SkipBack, Trash2, Plus, Volume2, 
  Waves, Music, Disc3, X
} from 'lucide-react';
import { audioEngine, INSTRUMENT_PRESETS, type InstrumentPreset } from './audioEngine';
import Visualizer from './Visualizer';

const STEPS = 16;

// Musical notes for pitch selection
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OCTAVES = [2, 3, 4, 5, 6];

function noteToFrequency(note: string, octave: number): number {
  const noteIndex = NOTES.indexOf(note);
  if (noteIndex === -1) return 440;
  const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
  return 440 * Math.pow(2, semitonesFromA4 / 12);
}

interface Track {
  id: string;
  instrumentKey: string;
  preset: InstrumentPreset;
  notes: boolean[][]; // [step][noteIndex] - noteIndex 0-11 for one octave
  volume: number;
  pan: number;
  octave: number; // current octave for this track
}

function createTrack(instrumentKey: string, octave: number = 4): Track {
  const preset = INSTRUMENT_PRESETS[instrumentKey];
  return {
    id: Math.random().toString(36).substring(2, 9),
    instrumentKey,
    preset,
    notes: Array.from({ length: STEPS }, () => Array(NOTES.length).fill(false)),
    volume: 0.7,
    pan: 0,
    octave
  };
}

export default function App() {
  const [tracks, setTracks] = useState<Track[]>(() => [
    createTrack('piano', 4),
    createTrack('bass', 3),
    createTrack('kick', 4),
  ]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [bpm, setBpm] = useState(120);
  const [reverb, setReverb] = useState(0.15);
  const [delay, setDelay] = useState(0.0);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [audioReady, setAudioReady] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [showInstrumentPicker, setShowInstrumentPicker] = useState<string | null>(null);

  const intervalRef = useRef<number | null>(null);
  const stepRef = useRef(-1);
  const tracksRef = useRef(tracks);
  const bpmRef = useRef(bpm);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { audioEngine.setReverb(reverb); }, [reverb]);
  useEffect(() => { audioEngine.setDelay(delay); }, [delay]);
  useEffect(() => { audioEngine.setVolume(masterVolume); }, [masterVolume]);

  const ensureAudio = useCallback(async () => {
    if (!audioReady) {
      await audioEngine.init();
      setAudioReady(true);
    } else {
      await audioEngine.ensureRunning();
    }
  }, [audioReady]);

  // Toggle note on/off
  const toggleNote = useCallback(async (trackId: string, step: number, noteIdx: number) => {
    await ensureAudio();
    setTracks(prev => prev.map(track => {
      if (track.id !== trackId) return track;
      const newNotes = track.notes.map(s => [...s]);
      newNotes[step][noteIdx] = !newNotes[step][noteIdx];
      
      // Play preview when activating
      if (newNotes[step][noteIdx] && !track.preset.isDrum) {
        const noteName = NOTES[noteIdx];
        const freq = noteToFrequency(noteName, track.octave);
        audioEngine.playInstrument(track.preset, freq, 0.3, track.volume * 0.7, track.pan);
      }
      
      return { ...track, notes: newNotes };
    }));
  }, [ensureAudio]);

  // Sequencer step
  const playStep = useCallback(() => {
    stepRef.current = (stepRef.current + 1) % STEPS;
    const step = stepRef.current;
    setCurrentStep(step);

    const currentTracks = tracksRef.current;
    const currentBpm = bpmRef.current;
    const beatDuration = 60 / currentBpm / 4;

    currentTracks.forEach(track => {
      const noteData = track.notes[step];
      if (!noteData) return;

      if (track.preset.isDrum) {
        // For drums, check if any note is active
        if (noteData.some(n => n)) {
          audioEngine.playInstrument(track.preset, 0, beatDuration * 2, track.volume, track.pan);
        }
      } else {
        // For melodic instruments, play all active notes
        noteData.forEach((active, noteIdx) => {
          if (active) {
            const noteName = NOTES[noteIdx];
            const freq = noteToFrequency(noteName, track.octave);
            audioEngine.playInstrument(track.preset, freq, beatDuration * 2.5, track.volume, track.pan);
          }
        });
      }
    });
  }, []);

  const startPlayback = useCallback(async () => {
    await ensureAudio();
    setIsPlaying(true);
    stepRef.current = -1;
    const intervalMs = (60 / bpmRef.current / 4) * 1000;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(playStep, intervalMs);
  }, [ensureAudio, playStep]);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCurrentStep(-1);
    stepRef.current = -1;
  }, []);

  const togglePlayback = useCallback(() => {
    if (isPlaying) stopPlayback();
    else startPlayback();
  }, [isPlaying, startPlayback, stopPlayback]);

  useEffect(() => {
    if (isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const intervalMs = (60 / bpm / 4) * 1000;
      intervalRef.current = window.setInterval(playStep, intervalMs);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [bpm, isPlaying, playStep]);

  const addTrack = async (instrumentKey: string) => {
    await ensureAudio();
    const newTrack = createTrack(instrumentKey);
    setTracks(prev => [...prev, newTrack]);
    setShowInstrumentPicker(null);
  };

  const removeTrack = (trackId: string) => {
    setTracks(prev => prev.filter(t => t.id !== trackId));
    if (selectedTrackId === trackId) setSelectedTrackId(null);
  };

  const updateTrack = (trackId: string, updates: Partial<Track>) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, ...updates } : t));
  };

  const changeTrackInstrument = (trackId: string, instrumentKey: string) => {
    const preset = INSTRUMENT_PRESETS[instrumentKey];
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, instrumentKey, preset } : t));
    setShowInstrumentPicker(null);
  };

  const clearAllNotes = () => {
    setTracks(prev => prev.map(t => ({
      ...t,
      notes: Array.from({ length: STEPS }, () => Array(NOTES.length).fill(false))
    })));
  };

  const instrumentKeys = Object.keys(INSTRUMENT_PRESETS);
  const melodicInstruments = instrumentKeys.filter(k => !INSTRUMENT_PRESETS[k].isDrum);
  const drumInstruments = instrumentKeys.filter(k => INSTRUMENT_PRESETS[k].isDrum);

  const totalNoteRows = NOTES.length * OCTAVES.length;

  return (
    <div className="min-h-screen bg-gray-950 text-white overflow-hidden relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-900/10 via-gray-950 to-cyan-900/10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(100,100,255,0.08),transparent_50%)]" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-3 py-4">
        {/* Header */}
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: isPlaying ? 360 : 0 }}
              transition={{ duration: 2, repeat: isPlaying ? Infinity : 0, ease: 'linear' }}
            >
              <Disc3 className="w-7 h-7 text-violet-400" />
            </motion.div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                SynthGrid
              </h1>
              <p className="text-[10px] text-gray-500">Instrument Sequencer</p>
            </div>
          </div>
          <Visualizer isPlaying={isPlaying} />
        </header>

        {/* Transport & Global Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4 bg-gray-900/60 backdrop-blur-xl rounded-xl border border-gray-800/50 p-3">
          <motion.button
            onClick={togglePlayback}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
              isPlaying
                ? 'bg-red-500/20 border-2 border-red-500 text-red-400'
                : 'bg-green-500/20 border-2 border-green-500 text-green-400'
            }`}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </motion.button>

          <motion.button
            onClick={() => { stopPlayback(); stepRef.current = -1; setCurrentStep(-1); }}
            whileTap={{ scale: 0.9 }}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-800 border border-gray-700 text-gray-400 hover:text-white"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </motion.button>

          <motion.button
            onClick={clearAllNotes}
            whileTap={{ scale: 0.9 }}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-800 border border-gray-700 text-gray-400 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </motion.button>

          <div className="h-6 w-px bg-gray-700" />

          {/* BPM */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">BPM</span>
            <input
              type="range"
              min="60"
              max="200"
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="w-20 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer text-violet-500"
            />
            <span className="text-xs font-mono text-violet-400 w-8">{bpm}</span>
          </div>

          <div className="h-6 w-px bg-gray-700" />

          {/* Master Volume */}
          <div className="flex items-center gap-2">
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            <input
              type="range"
              min="0"
              max="100"
              value={masterVolume * 100}
              onChange={(e) => setMasterVolume(Number(e.target.value) / 100)}
              className="w-16 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer text-emerald-500"
            />
          </div>

          <div className="h-6 w-px bg-gray-700" />

          {/* Reverb */}
          <div className="flex items-center gap-2">
            <Waves className="w-3.5 h-3.5 text-cyan-400" />
            <input
              type="range"
              min="0"
              max="80"
              value={reverb * 100}
              onChange={(e) => setReverb(Number(e.target.value) / 100)}
              className="w-16 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer text-cyan-500"
            />
          </div>

          {/* Delay */}
          <div className="flex items-center gap-2">
            <Music className="w-3.5 h-3.5 text-amber-400" />
            <input
              type="range"
              min="0"
              max="70"
              value={delay * 100}
              onChange={(e) => setDelay(Number(e.target.value) / 100)}
              className="w-16 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer text-amber-500"
            />
          </div>

          <div className="flex-1" />

          {/* Add Instrument */}
          <motion.button
            onClick={() => setShowInstrumentPicker(showInstrumentPicker ? null : 'add')}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/50 text-violet-300 text-xs font-medium hover:bg-violet-500/30"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Instrument
          </motion.button>
        </div>

        {/* Instrument Picker Modal */}
        <AnimatePresence>
          {showInstrumentPicker && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 bg-gray-900/80 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-300">Choose Instrument</h3>
                <button onClick={() => setShowInstrumentPicker(null)} className="text-gray-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-2">Melodic</p>
                <div className="flex flex-wrap gap-2">
                  {melodicInstruments.map(key => {
                    const preset = INSTRUMENT_PRESETS[key];
                    return (
                      <button
                        key={key}
                        onClick={() => addTrack(key)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/50 text-gray-300 text-xs hover:bg-gray-700/60 hover:text-white transition-all"
                      >
                        <span>{preset.icon}</span>
                        <span>{preset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-2">Drums</p>
                <div className="flex flex-wrap gap-2">
                  {drumInstruments.map(key => {
                    const preset = INSTRUMENT_PRESETS[key];
                    return (
                      <button
                        key={key}
                        onClick={() => addTrack(key)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/50 text-gray-300 text-xs hover:bg-gray-700/60 hover:text-white transition-all"
                      >
                        <span>{preset.icon}</span>
                        <span>{preset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tracks */}
        <div className="space-y-2">
          {tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              currentStep={currentStep}
              isPlaying={isPlaying}
              isSelected={selectedTrackId === track.id}
              onSelect={() => setSelectedTrackId(selectedTrackId === track.id ? null : track.id)}
              onToggleNote={(step, noteIdx) => toggleNote(track.id, step, noteIdx)}
              onRemove={() => removeTrack(track.id)}
              onUpdate={(updates) => updateTrack(track.id, updates)}
              onChangeInstrument={(key) => changeTrackInstrument(track.id, key)}
              showInstrumentPicker={showInstrumentPicker === track.id}
              onToggleInstrumentPicker={() => setShowInstrumentPicker(showInstrumentPicker === track.id ? null : track.id)}
            />
          ))}
        </div>

        {tracks.length === 0 && (
          <div className="text-center py-16 text-gray-600">
            <Music className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No instruments yet. Click "Add Instrument" to start creating.</p>
          </div>
        )}

        <div className="mt-4 text-center">
          <p className="text-[10px] text-gray-600">
            Click cells to place notes • Select a track to adjust volume and pan • Add multiple instruments to layer sounds
          </p>
        </div>
      </div>
    </div>
  );
}

// Track Row Component
interface TrackRowProps {
  track: Track;
  currentStep: number;
  isPlaying: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggleNote: (step: number, noteIdx: number) => void;
  onRemove: () => void;
  onUpdate: (updates: Partial<Track>) => void;
  onChangeInstrument: (key: string) => void;
  showInstrumentPicker: boolean;
  onToggleInstrumentPicker: () => void;
}

function TrackRow({
  track,
  currentStep,
  isPlaying,
  isSelected,
  onSelect,
  onToggleNote,
  onRemove,
  onUpdate,
  onChangeInstrument,
  showInstrumentPicker,
  onToggleInstrumentPicker,
}: TrackRowProps) {
  const instrumentKeys = Object.keys(INSTRUMENT_PRESETS);

  return (
    <div className={`bg-gray-900/60 backdrop-blur-xl rounded-xl border transition-all ${
      isSelected ? 'border-violet-500/50 shadow-lg shadow-violet-500/10' : 'border-gray-800/50'
    }`}>
      {/* Track Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/50">
        <button
          onClick={onSelect}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <div 
            className="w-6 h-6 rounded-md flex items-center justify-center text-sm"
            style={{ backgroundColor: track.preset.color + '30' }}
          >
            {track.preset.icon}
          </div>
          <span className="text-xs font-medium text-gray-300 truncate">{track.preset.name}</span>
        </button>

        {/* Instrument change */}
        <div className="relative">
          <button
            onClick={onToggleInstrumentPicker}
            className="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-500 hover:text-gray-300"
          >
            Change
          </button>
          {showInstrumentPicker && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg p-2 shadow-xl min-w-[180px] max-h-[200px] overflow-y-auto">
              {instrumentKeys.map(key => {
                const preset = INSTRUMENT_PRESETS[key];
                return (
                  <button
                    key={key}
                    onClick={() => onChangeInstrument(key)}
                    className="flex items-center gap-2 w-full px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded"
                  >
                    <span>{preset.icon}</span>
                    <span>{preset.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Volume */}
        <div className="flex items-center gap-1">
          <Volume2 className="w-3 h-3 text-gray-600" />
          <input
            type="range"
            min="0"
            max="100"
            value={track.volume * 100}
            onChange={(e) => onUpdate({ volume: Number(e.target.value) / 100 })}
            className="w-12 h-1 bg-gray-700 rounded appearance-none cursor-pointer text-gray-400"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Pan */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-gray-600">L</span>
          <input
            type="range"
            min="-100"
            max="100"
            value={track.pan * 100}
            onChange={(e) => onUpdate({ pan: Number(e.target.value) / 100 })}
            className="w-10 h-1 bg-gray-700 rounded appearance-none cursor-pointer text-gray-400"
            onClick={(e) => e.stopPropagation()}
          />
          <span className="text-[9px] text-gray-600">R</span>
        </div>

        {/* Remove */}
        <button
          onClick={onRemove}
          className="text-gray-600 hover:text-red-400 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Grid */}
      <div className="px-2 py-2 overflow-x-auto">
        <div className="min-w-[400px]">
          {/* Step indicators */}
          <div className="flex gap-0.5 mb-1">
            {Array.from({ length: STEPS }, (_, step) => (
              <div
                key={step}
                className={`flex-1 h-2 rounded-sm transition-colors duration-75 ${
                  step === currentStep && isPlaying
                    ? 'bg-white/60'
                    : step % 4 === 0
                    ? 'bg-gray-700'
                    : 'bg-gray-800/50'
                }`}
              />
            ))}
          </div>

          {track.preset.isDrum ? (
            // Drum: single row
            <div className="flex gap-0.5">
              {Array.from({ length: STEPS }, (_, step) => {
                const isActive = track.notes[step]?.[0] ?? false;
                const isBeat = step % 4 === 0;
                return (
                  <motion.button
                    key={step}
                    onClick={() => onToggleNote(step, 0)}
                    whileTap={{ scale: 0.9 }}
                    className={`flex-1 h-7 rounded-sm transition-all ${
                      isActive
                        ? `shadow-md ${step === currentStep && isPlaying ? 'bg-white ring-1 ring-white/50' : ''}`
                        : isBeat
                        ? 'bg-gray-700/60 hover:bg-gray-600/60'
                        : 'bg-gray-800/60 hover:bg-gray-700/60'
                    }`}
                    style={isActive ? { backgroundColor: track.preset.color } : {}}
                  />
                );
              })}
            </div>
          ) : (
            // Melodic: show one octave (12 notes)
            <div className="space-y-0.5">
              {/* Octave selector */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] text-gray-500">Octave:</span>
                {OCTAVES.map(oct => (
                  <button
                    key={oct}
                    onClick={() => onUpdate({ octave: oct })}
                    className={`text-[9px] px-1.5 py-0.5 rounded ${
                      oct === track.octave
                        ? 'bg-violet-500/30 text-violet-300'
                        : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {oct}
                  </button>
                ))}
              </div>

              {/* Note rows - reversed so higher notes are on top */}
              {[...NOTES].reverse().map((noteName, reversedIdx) => {
                const noteIdx = NOTES.length - 1 - reversedIdx;
                return (
                  <div key={noteName} className="flex gap-0.5 items-center">
                    <span className="text-[8px] text-gray-600 w-5 text-right font-mono pr-1">
                      {noteName}
                    </span>
                    {Array.from({ length: STEPS }, (_, step) => {
                      const isActive = track.notes[step]?.[noteIdx] ?? false;
                      const isBeat = step % 4 === 0;
                      return (
                        <motion.button
                          key={step}
                          onClick={() => onToggleNote(step, noteIdx)}
                          whileTap={{ scale: 0.9 }}
                          className={`flex-1 h-4 rounded-sm transition-all ${
                            isActive
                              ? `shadow-sm ${step === currentStep && isPlaying ? 'bg-white ring-1 ring-white/50' : ''}`
                              : isBeat
                              ? 'bg-gray-700/40 hover:bg-gray-600/40'
                              : 'bg-gray-800/40 hover:bg-gray-700/40'
                          }`}
                          style={isActive ? { backgroundColor: track.preset.color } : {}}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
