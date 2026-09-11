import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, Pause, SkipBack, Trash2, Shuffle, Volume2, 
  Zap, Waves, Music, Disc3
} from 'lucide-react';
import { audioEngine, getScaleNotes, type WaveType, type NoteInfo } from './audioEngine';
import Visualizer from './Visualizer';

const STEPS = 16;
const ROWS = 8;

type Mood = {
  name: string;
  scale: string;
  waveType: WaveType;
  color: string;
  emoji: string;
  description: string;
  bpm: number;
};

const MOODS: Mood[] = [
  { name: 'Dreamy', scale: 'pentatonic', waveType: 'sine', color: 'from-violet-500 to-indigo-600', emoji: '🌙', description: 'Ethereal & floating', bpm: 90 },
  { name: 'Dark', scale: 'minor', waveType: 'sawtooth', color: 'from-red-600 to-rose-900', emoji: '🔥', description: 'Intense & brooding', bpm: 120 },
  { name: 'Joyful', scale: 'major', waveType: 'triangle', color: 'from-amber-400 to-orange-500', emoji: '☀️', description: 'Bright & uplifting', bpm: 130 },
  { name: 'Bluesy', scale: 'blues', waveType: 'square', color: 'from-blue-500 to-cyan-600', emoji: '🎸', description: 'Soulful & raw', bpm: 100 },
  { name: 'Mystic', scale: 'japanese', waveType: 'sine', color: 'from-emerald-500 to-teal-700', emoji: '🎋', description: 'Exotic & meditative', bpm: 80 },
  { name: 'Chaos', scale: 'chromatic', waveType: 'sawtooth', color: 'from-fuchsia-500 to-purple-700', emoji: '⚡', description: 'Unpredictable & wild', bpm: 150 },
];

export default function App() {
  const [grid, setGrid] = useState<boolean[][]>(
    Array(ROWS).map(() => Array(STEPS).fill(false))
  );
  const [drumGrid, setDrumGrid] = useState<boolean[][]>(
    Array(3).map(() => Array(STEPS).fill(false))
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [bpm, setBpm] = useState(110);
  const [currentMood, setCurrentMood] = useState(0);
  const [waveType, setWaveType] = useState<WaveType>('sine');
  const [reverb, setReverb] = useState(0.2);
  const [delay, setDelay] = useState(0.0);
  const [volume, setVolume] = useState(0.7);
  const [initialized, setInitialized] = useState(false);
  
  const intervalRef = useRef<number | null>(null);
  const stepRef = useRef(-1);
  const gridRef = useRef(grid);
  const drumGridRef = useRef(drumGrid);
  const notesRef = useRef<NoteInfo[]>(getScaleNotes(MOODS[0].scale));
  const waveTypeRef = useRef<WaveType>('sine');
  const bpmRef = useRef(110);

  const mood = MOODS[currentMood];
  const notes: NoteInfo[] = getScaleNotes(mood.scale);

  // Keep refs in sync
  useEffect(() => { gridRef.current = grid; }, [grid]);
  useEffect(() => { drumGridRef.current = drumGrid; }, [drumGrid]);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { waveTypeRef.current = waveType; }, [waveType]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  useEffect(() => { audioEngine.setReverb(reverb); }, [reverb]);
  useEffect(() => { audioEngine.setDelay(delay); }, [delay]);
  useEffect(() => { audioEngine.setVolume(volume); }, [volume]);

  const initAudio = useCallback(async () => {
    if (!initialized) {
      await audioEngine.init();
      setInitialized(true);
    }
    audioEngine.resume();
  }, [initialized]);

  const toggleCell = useCallback(async (row: number, step: number) => {
    await initAudio();
    setGrid(prev => {
      const newGrid = prev.map(r => [...r]);
      newGrid[row][step] = !newGrid[row][step];
      if (newGrid[row][step]) {
        const currentNotes = notesRef.current;
        const note = currentNotes[ROWS - 1 - row];
        audioEngine.playNote(note.frequency, waveTypeRef.current, 0.3, 0.4);
      }
      return newGrid;
    });
  }, [initAudio]);

  const toggleDrumCell = useCallback(async (row: number, step: number) => {
    await initAudio();
    setDrumGrid(prev => {
      const newGrid = prev.map(r => [...r]);
      newGrid[row][step] = !newGrid[row][step];
      return newGrid;
    });
  }, [initAudio]);

  const playStep = useCallback(() => {
    stepRef.current = (stepRef.current + 1) % STEPS;
    const step = stepRef.current;
    setCurrentStep(step);

    const currentGrid = gridRef.current;
    const currentDrums = drumGridRef.current;
    const currentNotes = notesRef.current;
    const currentWave = waveTypeRef.current;
    const currentBpm = bpmRef.current;
    const beatDuration = 60 / currentBpm / 4;

    // Play melodic notes
    for (let row = 0; row < ROWS; row++) {
      if (currentGrid[row][step]) {
        const note = currentNotes[ROWS - 1 - row];
        audioEngine.playNote(note.frequency, currentWave, beatDuration * 2, 0.5);
      }
    }

    // Play drums
    if (currentDrums[0][step]) audioEngine.playKick();
    if (currentDrums[1][step]) audioEngine.playSnare();
    if (currentDrums[2][step]) audioEngine.playHihat();
  }, []);

  const startPlayback = useCallback(async () => {
    await initAudio();
    setIsPlaying(true);
    stepRef.current = -1;
    
    const intervalMs = (60 / bpmRef.current / 4) * 1000;
    intervalRef.current = window.setInterval(playStep, intervalMs);
  }, [initAudio, playStep]);

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
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, startPlayback, stopPlayback]);

  // Update interval when BPM changes during playback
  useEffect(() => {
    if (isPlaying) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      const intervalMs = (60 / bpm / 4) * 1000;
      intervalRef.current = window.setInterval(playStep, intervalMs);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [bpm, isPlaying, playStep]);

  const clearGrid = () => {
    setGrid(Array(ROWS).map(() => Array(STEPS).fill(false)));
    setDrumGrid(Array(3).map(() => Array(STEPS).fill(false)));
  };

  const randomizeGrid = () => {
    const density = 0.2;
    setGrid(
      Array(ROWS).map(() =>
        Array(STEPS).fill(false).map(() => Math.random() < density)
      )
    );
    setDrumGrid(
      Array(3).map((_, row) =>
        Array(STEPS).fill(false).map(() => {
          if (row === 0) return Math.random() < 0.15;
          if (row === 1) return Math.random() < 0.1;
          return Math.random() < 0.25;
        })
      )
    );
  };

  const changeMood = (index: number) => {
    setCurrentMood(index);
    const m = MOODS[index];
    setWaveType(m.waveType);
    setBpm(m.bpm);
  };

  const getCellColor = (row: number, _step: number, isActive: boolean) => {
    if (!isActive) return '';
    
    const isCurrentPlayhead = _step === currentStep;
    
    if (isCurrentPlayhead && isPlaying) {
      return `bg-white shadow-lg shadow-white/50`;
    }
    
    const colors = [
      'bg-rose-400', 'bg-orange-400', 'bg-amber-400', 'bg-yellow-400',
      'bg-lime-400', 'bg-emerald-400', 'bg-cyan-400', 'bg-violet-400'
    ];
    
    return colors[ROWS - 1 - row] || 'bg-white';
  };

  const getDrumColor = (row: number) => {
    const colors = ['bg-red-500', 'bg-yellow-500', 'bg-blue-400'];
    return colors[row];
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white overflow-hidden relative">
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${mood.color} opacity-10 transition-all duration-1000`} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(100,100,255,0.1),transparent_50%)]" />
      
      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: isPlaying ? 360 : 0 }}
              transition={{ duration: 2, repeat: isPlaying ? Infinity : 0, ease: 'linear' }}
            >
              <Disc3 className="w-8 h-8 text-violet-400" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                SynthGrid
              </h1>
              <p className="text-xs text-gray-500">Interactive Music Sequencer</p>
            </div>
          </div>
          
          <Visualizer isPlaying={isPlaying} />
        </header>

        {/* Mood Selector */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Music className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400 font-medium">Mood</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m, i) => (
              <motion.button
                key={m.name}
                onClick={() => changeMood(i)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                  i === currentMood
                    ? `bg-gradient-to-r ${m.color} text-white shadow-lg`
                    : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-white border border-gray-700/50'
                }`}
              >
                <span className="mr-1">{m.emoji}</span>
                {m.name}
              </motion.button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={mood.name}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="text-xs text-gray-500 mt-2 italic"
            >
              {mood.description} • {mood.scale} scale • {mood.bpm} BPM
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Main Sequencer Grid */}
        <div className="bg-gray-900/60 backdrop-blur-xl rounded-2xl border border-gray-800/50 p-4 mb-4 shadow-2xl">
          {/* Note labels and grid */}
          <div className="flex gap-1">
            {/* Note names */}
            <div className="flex flex-col gap-1 pr-2 pt-0">
              {notes.map((note, i) => (
                <div
                  key={i}
                  className="h-8 flex items-center justify-end text-xs text-gray-500 font-mono w-8"
                >
                  {note.name}
                </div>
              ))}
            </div>
            
            {/* Grid */}
            <div className="flex-1 overflow-x-auto">
              <div className="min-w-[500px]">
                {/* Step indicators */}
                <div className="flex gap-1 mb-1">
                  {Array(STEPS).fill(0).map((_, step) => (
                    <div
                      key={step}
                      className={`flex-1 h-3 rounded-sm transition-colors duration-75 ${
                        step === currentStep && isPlaying
                          ? 'bg-white/80'
                          : step % 4 === 0
                          ? 'bg-gray-600'
                          : 'bg-gray-800'
                      }`}
                    />
                  ))}
                </div>
                
                {/* Note rows */}
                {notes.map((_, row) => (
                  <div key={row} className="flex gap-1 mb-1">
                    {Array(STEPS).fill(0).map((_, step) => {
                      const actualRow = ROWS - 1 - row;
                      const isActive = grid[actualRow][step];
                      const isBeat = step % 4 === 0;
                      return (
                        <motion.button
                          key={step}
                          onClick={() => toggleCell(actualRow, step)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className={`flex-1 h-8 rounded-sm transition-all duration-150 ${
                            isActive
                              ? `${getCellColor(actualRow, step, true)} shadow-md`
                              : isBeat
                              ? 'bg-gray-700/60 hover:bg-gray-600/60'
                              : 'bg-gray-800/60 hover:bg-gray-700/60'
                          } ${step === currentStep && isPlaying ? 'ring-1 ring-white/30' : ''}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Drum Machine */}
        <div className="bg-gray-900/60 backdrop-blur-xl rounded-2xl border border-gray-800/50 p-4 mb-4 shadow-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-gray-400 font-medium">Drums</span>
          </div>
          <div className="flex flex-col gap-1">
            {['KICK', 'SNARE', 'HI-HAT'].map((name, row) => (
              <div key={row} className="flex items-center gap-1">
                <span className="text-xs text-gray-500 font-mono w-12 text-right pr-2">{name}</span>
                <div className="flex-1 flex gap-1 min-w-[500px]">
                  {Array(STEPS).fill(0).map((_, step) => {
                    const isActive = drumGrid[row][step];
                    const isBeat = step % 4 === 0;
                    return (
                      <motion.button
                        key={step}
                        onClick={() => toggleDrumCell(row, step)}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className={`flex-1 h-7 rounded-sm transition-all duration-150 ${
                          isActive
                            ? `${getDrumColor(row)} shadow-md ${step === currentStep && isPlaying ? 'ring-2 ring-white' : ''}`
                            : isBeat
                            ? 'bg-gray-700/60 hover:bg-gray-600/60'
                            : 'bg-gray-800/60 hover:bg-gray-700/60'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Transport */}
          <div className="bg-gray-900/60 backdrop-blur-xl rounded-2xl border border-gray-800/50 p-4 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <Waves className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-gray-400 font-medium">Transport</span>
            </div>
            <div className="flex items-center gap-3">
              <motion.button
                onClick={togglePlayback}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                  isPlaying
                    ? 'bg-red-500/20 border-2 border-red-500 text-red-400'
                    : 'bg-green-500/20 border-2 border-green-500 text-green-400'
                }`}
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
              </motion.button>
              
              <motion.button
                onClick={() => { stopPlayback(); stepRef.current = -1; setCurrentStep(-1); }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-800 border border-gray-700 text-gray-400 hover:text-white"
              >
                <SkipBack className="w-4 h-4" />
              </motion.button>

              <motion.button
                onClick={clearGrid}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-800 border border-gray-700 text-gray-400 hover:text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </motion.button>

              <motion.button
                onClick={randomizeGrid}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-800 border border-gray-700 text-gray-400 hover:text-yellow-400"
              >
                <Shuffle className="w-4 h-4" />
              </motion.button>
            </div>
          </div>

          {/* Tempo & Wave */}
          <div className="bg-gray-900/60 backdrop-blur-xl rounded-2xl border border-gray-800/50 p-4 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <Music className="w-4 h-4 text-violet-400" />
              <span className="text-sm text-gray-400 font-medium">Sound</span>
            </div>
            
            {/* BPM */}
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Tempo</span>
                <span className="font-mono text-violet-400">{bpm} BPM</span>
              </div>
              <input
                type="range"
                min="60"
                max="200"
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer text-violet-500"
              />
            </div>

            {/* Wave type */}
            <div className="flex gap-1">
              {(['sine', 'triangle', 'sawtooth', 'square'] as WaveType[]).map((w) => (
                <button
                  key={w}
                  onClick={() => setWaveType(w)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    w === waveType
                      ? 'bg-violet-500/30 text-violet-300 border border-violet-500/50'
                      : 'bg-gray-800 text-gray-500 hover:text-gray-300 border border-gray-700/50'
                  }`}
                >
                  {w === 'sine' ? '∿' : w === 'triangle' ? '△' : w === 'sawtooth' ? '⩘' : '⊓'}
                </button>
              ))}
            </div>
          </div>

          {/* Effects */}
          <div className="bg-gray-900/60 backdrop-blur-xl rounded-2xl border border-gray-800/50 p-4 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-gray-400 font-medium">Effects</span>
            </div>
            
            {/* Volume */}
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Volume</span>
                <span className="font-mono text-emerald-400">{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volume * 100}
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer text-emerald-500"
              />
            </div>

            {/* Reverb */}
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Reverb</span>
                <span className="font-mono text-emerald-400">{Math.round(reverb * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="80"
                value={reverb * 100}
                onChange={(e) => setReverb(Number(e.target.value) / 100)}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer text-emerald-500"
              />
            </div>

            {/* Delay */}
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Delay</span>
                <span className="font-mono text-emerald-400">{Math.round(delay * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="80"
                value={delay * 100}
                onChange={(e) => setDelay(Number(e.target.value) / 100)}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer text-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-600">
            Click cells to add/remove notes • Change mood to transform the sound • Press play to hear your creation
          </p>
        </div>
      </div>
    </div>
  );
}
