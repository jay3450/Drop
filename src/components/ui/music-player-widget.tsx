import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';

export interface Track {
  title: string;
  artist: string;
  cover: string;
  src: string;
  lyrics?: { text: string; start: number; end: number; }[];
  album?: string;
  /** Clip start time in seconds — player seeks here on load and loops back here */
  clipStart?: number;
  /** Clip end time in seconds — player loops back to clipStart when reached */
  clipEnd?: number;
}
export type LoopMode = 'off' | 'all' | 'one';
export type Direction = 'next' | 'prev' | null;
type AudioCtor = typeof AudioContext;

export function useRafLoop(cb: (now: number, dt: number) => void) {
  const cbRef = useRef(cb); cbRef.current = cb;
  useEffect(() => {
    let raf = 0; let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last; last = now;
      cbRef.current(now, dt); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

function useTransitionSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  useEffect(() => { return () => { ctxRef.current?.close().catch(() => { }); ctxRef.current = null; }; }, []);
  return useCallback((bassEnergy = 0.5) => {
    try {
      if (!ctxRef.current) {
        const Ctor: AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;
        if (!Ctor) return; ctxRef.current = new Ctor();
      }
      const ctx = ctxRef.current; if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime; const osc = ctx.createOscillator(); const gain = ctx.createGain();
      const startFreq = 440 + bassEnergy * 440; const endFreq = startFreq * (2 / 3);
      osc.type = 'triangle'; osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.09);
      gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.06, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.connect(gain).connect(ctx.destination); osc.start(now); osc.stop(now + 0.18);
    } catch { /* Web Audio unavailable */ }
  }, []);
}

const FFT_SIZE = 256;
export function useAudioAnalyser(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const ctxRef = useRef<AudioContext | null>(null); const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array>(new Uint8Array(FFT_SIZE / 2)); const connectedRef = useRef(false);
  const connect = useCallback(() => {
    const audio = audioRef.current; if (!audio || connectedRef.current) return;
    try {
      const Ctor: AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;
      if (!Ctor) return; const ctx = new Ctor(); const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE; analyser.smoothingTimeConstant = 0.8;
      const source = ctx.createMediaElementSource(audio); source.connect(analyser); analyser.connect(ctx.destination);
      ctxRef.current = ctx; analyserRef.current = analyser; dataRef.current = new Uint8Array(analyser.frequencyBinCount);
      connectedRef.current = true; if (ctx.state === 'suspended') ctx.resume().catch(() => { });
    } catch { /* unavailable or already connected */ }
  }, [audioRef]);
  useEffect(() => { const audio = audioRef.current; if (!audio) return; audio.addEventListener('play', connect, { once: true }); return () => audio.removeEventListener('play', connect); }, [audioRef, connect]);
  useEffect(() => { return () => { ctxRef.current?.close().catch(() => { }); ctxRef.current = null; }; }, []);
  const getFrequencyData = useCallback((): Uint8Array | null => { const analyser = analyserRef.current; if (!analyser) return null; if (ctxRef.current?.state === 'suspended') ctxRef.current.resume().catch(() => { }); analyser.getByteFrequencyData(dataRef.current as any); return dataRef.current; }, []);
  const getBandEnergy = useCallback((startBin: number, endBin: number): number => { if (!analyserRef.current) return 0; const data = dataRef.current; const count = endBin - startBin; if (count <= 0) return 0; let sum = 0; for (let i = startBin; i < endBin && i < data.length; i++) sum += data[i] ?? 0; return sum / count / 255; }, []);
  return { getFrequencyData, getBandEnergy };
}

interface State { currentIndex: number; order: number[]; shuffled: boolean; loopMode: LoopMode; isPlaying: boolean; direction: Direction; }
type Action = | { type: 'PLAY' } | { type: 'PAUSE' } | { type: 'SET_TRACK'; index: number; direction: Direction } | { type: 'TOGGLE_SHUFFLE'; trackCount: number } | { type: 'CYCLE_LOOP' } | { type: 'SYNC_ORDER'; trackCount: number };
function shuffleOrder(pinFirst: number, count: number): number[] { const rest = Array.from({ length: count }, (_, i) => i).filter((x) => x !== pinFirst); for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const valI = rest[i]; const valJ = rest[j]; if (valI !== undefined && valJ !== undefined) { rest[i] = valJ; rest[j] = valI; } } return [pinFirst, ...rest]; }
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'PLAY': return { ...state, isPlaying: true };
    case 'PAUSE': return { ...state, isPlaying: false };
    case 'SET_TRACK': return { ...state, currentIndex: action.index, direction: action.direction };
    case 'TOGGLE_SHUFFLE': { const shuffled = !state.shuffled; const order = shuffled ? shuffleOrder(state.currentIndex, action.trackCount) : Array.from({ length: action.trackCount }, (_, i) => i); return { ...state, shuffled, order }; }
    case 'CYCLE_LOOP': { const next: LoopMode = state.loopMode === 'off' ? 'all' : state.loopMode === 'all' ? 'one' : 'off'; return { ...state, loopMode: next }; }
    case 'SYNC_ORDER': {
      if (action.trackCount === state.order.length) return state;
      const newOrder = [...state.order];
      for (let i = state.order.length; i < action.trackCount; i++) {
        newOrder.push(i); // Append newly fetched tracks to the playback order
      }
      return { ...state, order: newOrder };
    }
    default: return state;
  }
}

export function useAudioPlayer(tracks: Track[]) {
  const audioRef = useRef<HTMLAudioElement>(null); const [currentTime, setCurrentTime] = useState(0); const [duration, setDuration] = useState(0);
  const [state, dispatch] = useReducer(reducer, { currentIndex: 0, order: Array.from({ length: tracks.length }, (_, i) => i), shuffled: false, loopMode: 'off', isPlaying: false, direction: null });
  const { getFrequencyData, getBandEnergy } = useAudioAnalyser(audioRef); const playTransitionSound = useTransitionSound();
  const initializedRef = useRef(false);
  const loadTrack = useCallback((index: number, autoplay: boolean, direction: Direction) => {
    const audio = audioRef.current; if (!audio) return;
    const bassEnergy = getBandEnergy(0, 4); playTransitionSound(bassEnergy);
    dispatch({ type: 'SET_TRACK', index, direction });
    const track = tracks[index]; if (!track) return;
    
    // Seek to clip start once metadata is ready
    const onReady = () => {
      if (track.clipStart !== undefined) audio.currentTime = track.clipStart;
      if (autoplay) audio.play().catch(() => { });
      audio.removeEventListener('loadedmetadata', onReady);
    };
    audio.addEventListener('loadedmetadata', onReady);
    audio.src = track.src; audio.load();
  }, [tracks, playTransitionSound, getBandEnergy]);
  const toggle = useCallback(() => { const audio = audioRef.current; if (!audio) return; if (audio.paused) audio.play().catch(() => { }); else audio.pause(); }, []);
  const next = useCallback(() => { const audio = audioRef.current; if (!audio) return; const pos = state.order.indexOf(state.currentIndex); const np = pos + 1; if (np >= state.order.length) { if (state.loopMode === 'all') { const firstIndex = state.order[0]; if (firstIndex !== undefined) loadTrack(firstIndex, !audio.paused, 'next'); } else { audio.pause(); audio.currentTime = 0; } return; } const nextIndex = state.order[np]; if (nextIndex !== undefined) loadTrack(nextIndex, !audio.paused, 'next'); }, [state.order, state.currentIndex, state.loopMode, loadTrack]);
  const prev = useCallback(() => { const audio = audioRef.current; if (!audio) return; if (audio.currentTime > 3) { audio.currentTime = 0; return; } const pos = state.order.indexOf(state.currentIndex); const pp = pos - 1; if (pp < 0) { if (state.loopMode === 'all') { const lastIndex = state.order[state.order.length - 1]; if (lastIndex !== undefined) loadTrack(lastIndex, !audio.paused, 'prev'); } else audio.currentTime = 0; return; } const prevIndex = state.order[pp]; if (prevIndex !== undefined) loadTrack(prevIndex, !audio.paused, 'prev'); }, [state.order, state.currentIndex, state.loopMode, loadTrack]);
  const seek = useCallback((pct: number) => {
    const audio = audioRef.current; if (!audio || !audio.duration) return;
    const track = tracks[state.currentIndex];
    const start = track?.clipStart ?? 0;
    const end = track?.clipEnd ?? audio.duration;
    audio.currentTime = start + pct * (end - start);
  }, [tracks, state.currentIndex]);
  const toggleShuffle = useCallback(() => { dispatch({ type: 'TOGGLE_SHUFFLE', trackCount: tracks.length }); }, [tracks.length]);
  const cycleLoop = useCallback(() => { dispatch({ type: 'CYCLE_LOOP' }); }, []);
  useEffect(() => {
    const audio = audioRef.current; if (!audio) return;
    const onPlay = () => dispatch({ type: 'PLAY' });
    const onPause = () => dispatch({ type: 'PAUSE' });
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => {
      const track = tracks[state.currentIndex];
      if (track && audio.duration && audio.readyState >= 1) {
        if (track.clipStart !== undefined && audio.currentTime < track.clipStart) {
          audio.currentTime = track.clipStart;
        }
        if (track.clipEnd !== undefined && audio.currentTime >= track.clipEnd) {
          audio.currentTime = track.clipStart ?? 0;
        }
      }
      setCurrentTime(audio.currentTime);
      if (audio.duration) setDuration(audio.duration);
    };
    const onEnded = () => {
      if (state.loopMode === 'one') { audio.currentTime = tracks[state.currentIndex]?.clipStart ?? 0; audio.play().catch(() => { }); }
      else next();
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loopMode, next]);
  useEffect(() => {
    const audio = audioRef.current; if (!audio) return;
    if (!initializedRef.current && tracks.length > 0) {
      const firstTrack = tracks[0];
      if (firstTrack) {
        const onInitReady = () => {
          if (firstTrack.clipStart !== undefined) {
            audio.currentTime = firstTrack.clipStart;
            setCurrentTime(firstTrack.clipStart);
          }
          audio.removeEventListener('loadedmetadata', onInitReady);
        };
        audio.addEventListener('loadedmetadata', onInitReady);
        audio.src = firstTrack.src;
        audio.load();
        initializedRef.current = true;
      }
    }
    dispatch({ type: 'SYNC_ORDER', trackCount: tracks.length });
  }, [tracks]);

  const currentTrack = tracks[state.currentIndex];
  const start = currentTrack?.clipStart ?? 0;
  const end = currentTrack?.clipEnd ?? duration;
  const displayDuration = end - start;
  const displayCurrentTime = Math.max(0, currentTime - start);

  return { audioRef, state, currentTime: displayCurrentTime, duration: displayDuration, currentTrack: currentTrack as Track, toggle, next, prev, seek, toggleShuffle, cycleLoop, getFrequencyData, loadTrack };
}

export interface ShortcutActions { toggle: () => void; next: () => void; prev: () => void; seekForward: () => void; seekBackward: () => void; toggleShuffle: () => void; cycleLoop: () => void; }
export function useKeyboardShortcuts(actions: ShortcutActions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      switch (e.key) {
        case ' ': e.preventDefault(); actions.toggle(); break;
        case 'ArrowRight': e.preventDefault(); if (e.shiftKey) actions.next(); else actions.seekForward(); break;
        case 'ArrowLeft': e.preventDefault(); if (e.shiftKey) actions.prev(); else actions.seekBackward(); break;
        case 'ArrowDown': e.preventDefault(); actions.next(); break;
        case 'ArrowUp': e.preventDefault(); actions.prev(); break;
        case 's': case 'S': actions.toggleShuffle(); break;
        case 'l': case 'L': actions.cycleLoop(); break;
      }
    };
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler);
  }, [actions]);
}

const COLS = 10; const ROWS = 10;
const BAND_RANGES: [number, number][] = [[0, 1], [1, 3], [3, 6], [6, 10], [10, 16], [16, 24], [24, 36], [36, 52], [52, 74], [74, 100]];
const sineOut = (x: number) => Math.sin((x * Math.PI) / 2); const sineIn = (x: number) => 1 - Math.cos((x * Math.PI) / 2); const sineInOut = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2; const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const PART_A_DUR = 1.5; const PART_A_TO = 11; const PART_A_STEP = 3 / (COLS - 1); const PART_B_DUR = 1; const SCALE_FROM = 0.133; const SCALE_TO = 0.8;
function partAColumnY(time: number, col: number): number { const local = time - col * PART_A_STEP; const period = PART_A_DUR * 2; const cyc = ((local % period) + period) % period; if (cyc < PART_A_DUR) return PART_A_TO * sineInOut(cyc / PART_A_DUR); return PART_A_TO * sineInOut(1 - (cyc - PART_A_DUR) / PART_A_DUR); }
function partBCircle(time: number, col: number, row: number): [number, number] { const frac = row / ROWS; const yFrom = lerp(77, -77, frac); const yTo = lerp(col, -col, frac); const local = time - col / COLS; const period = PART_B_DUR * 2; const cyc = ((local % period) + period) % period; let e: number; if (cyc < PART_B_DUR) e = sineOut(cyc / PART_B_DUR); else e = sineIn(1 - (cyc - PART_B_DUR) / PART_B_DUR); return [lerp(yFrom, yTo, e), lerp(SCALE_FROM, SCALE_TO, e)]; }

function ScalesMixer({ isPlaying, getFrequencyData }: { isPlaying: boolean; getFrequencyData?: () => Uint8Array | null; }) {
  const maskId = useId().replace(/:/g, '_'); const colRefs = useRef<(SVGGElement | null)[]>([]); const circleRefs = useRef<(SVGCircleElement | null)[][]>(Array.from({ length: COLS }, () => [])); const tRef = useRef(50);
  useRafLoop((_, dt) => {
    if (isPlaying) tRef.current += dt / 1000; const time = tRef.current; const freqData = getFrequencyData?.();
    for (let c = 0; c < COLS; c++) {
      let energy = 1.0; if (freqData) { const range = BAND_RANGES[c]; if (range) { const [binStart, binEnd] = range; let sum = 0; for (let b = binStart; b < binEnd; b++) sum += freqData[b] ?? 0; energy = Math.sqrt(sum / (binEnd - binStart) / 255); } }
      const bobGain = freqData ? 0.4 + energy : 1; const scaleGain = freqData ? 0.5 + energy : 1; const colEl = colRefs.current[c]; if (colEl) { const ay = partAColumnY(time, c) * bobGain; colEl.style.transform = `translate(${c * 10}px, ${ay}px)`; }
      const colCircles = circleRefs.current[c]; if (!colCircles) continue;
      for (let r = 0; r < ROWS; r++) { const circle = colCircles[r]; if (!circle) continue; const [ty, s] = partBCircle(time, c, r); circle.style.transform = `translateY(${ty}px) scale(${s * scaleGain})`; }
    }
  });
  return (
    <svg className="scales" viewBox="0 0 98 108" aria-hidden="true">
      <mask id={maskId}><rect width="10" height="10" fill="#fff" /></mask>
      {Array.from({ length: COLS }, (_, c) => (
        <g key={c} ref={(el) => { colRefs.current[c] = el; }} style={{ transform: `translate(${c * 10}px, 0px)` }}>
          {Array.from({ length: ROWS }, (_, r) => (
            <g key={r} mask={`url(#${maskId})`} transform={`translate(0 ${r * 10})`}>
              <circle ref={(el) => { const col = circleRefs.current[c]; if (col) col[r] = el; }} cx="5" cy="5" r="5" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

const SPIN_MAX = 0.4375; const BURST_DURATION = 620;
interface Layer { id: number; track: Track; dir: Direction; }
function Disc({ layers, isPlaying, isZoomed, trackKey, direction, onZoomToggle }: { layers: Layer[]; isPlaying: boolean; isZoomed: boolean; trackKey: number; direction: Direction; onZoomToggle: () => void; }) {
  const spinRef = useRef<HTMLDivElement>(null); const rotRef = useRef(0); const velRef = useRef(0); const burstRef = useRef({ from: 0, start: 0, active: false, pending: false }); const lastKey = useRef(trackKey);
  useEffect(() => { if (trackKey !== lastKey.current) { lastKey.current = trackKey; if (direction) { burstRef.current.from = direction === 'prev' ? 360 : -360; burstRef.current.pending = true; } } }, [trackKey, direction]);
  useRafLoop((now) => {
    const el = spinRef.current; if (!el) return;
    if (isPlaying) velRef.current += (SPIN_MAX - velRef.current) * 0.2; else { velRef.current *= 0.96; if (velRef.current < 0.001) velRef.current = 0; }
    if (isZoomed) { const target = Math.round(rotRef.current / 360) * 360; const nx = rotRef.current + (target - rotRef.current) * 0.08; rotRef.current = Math.abs(target - nx) < 0.1 ? target : nx; } else { rotRef.current += velRef.current; }
    const burst = burstRef.current; if (burst.pending) { burst.start = now; burst.pending = false; burst.active = true; }
    let b = 0; if (burst.active) { const t = (now - burst.start) / BURST_DURATION; if (t >= 1) burst.active = false; else b = burst.from * (1 - (1 - Math.pow(1 - t, 3))); }
    el.style.transform = `scale(1.01) rotate(${rotRef.current + b}deg)`;
  });
  return (
    <div className={`mask ${isZoomed ? 'is-zoomed' : ''}`} onClick={(e) => { e.stopPropagation(); onZoomToggle(); }}>
      <div className="spin" ref={spinRef}>
        {layers.map((l, i) => { const isNewest = i === layers.length - 1; const cls = isNewest ? l.dir ? 'cover cover-enter' : 'cover' : 'cover cover-exit'; return <img key={l.id} src={l.track.cover} alt={`${l.track.title} — ${l.track.artist}`} className={cls} draggable={false} />; })}
      </div>
      <div className="hole"><div className="hole-inner" /></div>
    </div>
  );
}

function TrackInfo({ layers }: { layers: Layer[] }) {
  return (
    <div className="track-info">
      {layers.map((l, i) => {
        const isNewest = i === layers.length - 1; const dx = l.dir === 'next' ? 14 : l.dir === 'prev' ? -14 : 0; const exitDx = -dx; const state = isNewest ? (l.dir ? 'ti-enter' : '') : 'ti-exit';
        const style = { ['--dx' as string]: `${isNewest ? dx : exitDx}px` } as React.CSSProperties;
        return (
          <div key={l.id} className={`ti-layer ${isNewest ? '' : 'ti-abs'}`}>
            <p className={`artist ${state}`} style={style}>{l.track.artist}</p>
            <h2 className={`track ${state}`} style={style}>{l.track.title}</h2>
          </div>
        );
      })}
    </div>
  );
}

function fmt(seconds: number): string {
  if (isNaN(seconds) || seconds === null || seconds === undefined) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function ProgressBar({ currentTime, duration, onSeek }: { currentTime: number; duration: number; onSeek: (pct: number) => void; }) {
  const pct = duration ? (currentTime / duration) * 100 : 0;
  return (
    <>
      <div className="bar" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))); }}>
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="time"><span className="current">{fmt(currentTime)}</span><span className="sep">/</span><span className="total">{fmt(duration)}</span></div>
    </>
  );
}

function Controls({ isPlaying, shuffled, loopMode, onToggle, onNext, onPrev, onShuffle, onLoop }: { isPlaying: boolean; shuffled: boolean; loopMode: LoopMode; onToggle: () => void; onNext: () => void; onPrev: () => void; onShuffle: () => void; onLoop: () => void; }) {
  return (
    <div className="controls">
      <button className={`ctrl ctrl-toggle ${shuffled ? 'is-active' : ''}`} onClick={onShuffle} aria-label="Shuffle">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /><path d="M16 21h5v-5" /><path d="M21 21l-7-7" /><path d="M3 3l7 7" /></svg>
      </button>
      <button className="ctrl" onClick={onPrev} aria-label="Previous"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 5L8 12l11 7zM5 5h2v14H5z" /></svg></button>
      <button className="ctrl ctrl-play" onClick={onToggle} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? (<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 5h3v14H6zM15 5h3v14h-3z" /></svg>) : (<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 5v14l11-7z" /></svg>)}</button>
      <button className="ctrl" onClick={onNext} aria-label="Next"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5 5l11 7L5 19zM17 5h2v14h-2z" /></svg></button>
      <button className={`ctrl ctrl-toggle ctrl-loop ${loopMode !== 'off' ? 'is-active' : ''} ${loopMode === 'one' ? 'mode-one' : ''}`} onClick={onLoop} aria-label="Loop"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12V8a2 2 0 0 1 2-2h12" /><path d="M16 3l4 3l-4 3" /><path d="M20 12v4a2 2 0 0 1-2 2H6" /><path d="M8 21l-4-3l4-3" /></svg><span className="loop-one">1</span></button>
    </div>
  );
}

export interface MusicPlayerProps { tracks: Track[]; crossOrigin?: 'anonymous' | 'use-credentials'; }
export function MusicPlayer({ tracks, crossOrigin }: MusicPlayerProps) {
  const player = useAudioPlayer(tracks); const [isZoomed, setIsZoomed] = useState(false);
  const [layers, setLayers] = useState<Layer[]>(() => {
    const first = tracks[0];
    if (!first) throw new Error('No tracks provided');
    return [{ id: 0, track: first, dir: null }];
  });
  const lastIndex = useRef(0); const idRef = useRef(1);
  useEffect(() => {
    if (player.state.currentIndex === lastIndex.current) return; lastIndex.current = player.state.currentIndex; const id = idRef.current++;
    setLayers((prev) => [...prev, { id, track: player.currentTrack, dir: player.state.direction }]);
    const t = setTimeout(() => { setLayers((prev) => prev.filter((l) => l.id === id)); }, 760); return () => clearTimeout(t);
  }, [player.state.currentIndex, player.currentTrack, player.state.direction]);
  const seekForward = useCallback(() => { const a = player.audioRef.current; if (a) a.currentTime = Math.min(a.duration || 0, a.currentTime + 5); }, [player.audioRef]);
  const seekBackward = useCallback(() => { const a = player.audioRef.current; if (a) a.currentTime = Math.max(0, a.currentTime - 5); }, [player.audioRef]);
  const shortcuts = useMemo(() => ({ toggle: player.toggle, next: player.next, prev: player.prev, seekForward, seekBackward, toggleShuffle: player.toggleShuffle, cycleLoop: player.cycleLoop }), [player.toggle, player.next, player.prev, seekForward, seekBackward, player.toggleShuffle, player.cycleLoop]);
  useKeyboardShortcuts(shortcuts);
  return (
    <div className={`card ${player.state.isPlaying ? 'is-playing' : ''} ${isZoomed ? 'is-zoomed' : ''}`} onClick={(e) => { if (!(e.target as HTMLElement).closest('.mask')) setIsZoomed(false); }}>
      <audio ref={player.audioRef} preload="metadata" crossOrigin={crossOrigin} />
      <Disc layers={layers} isPlaying={player.state.isPlaying} isZoomed={isZoomed} trackKey={player.state.currentIndex} direction={player.state.direction} onZoomToggle={() => setIsZoomed((z) => !z)} />
      <div className="info">
        <ScalesMixer isPlaying={player.state.isPlaying} getFrequencyData={player.getFrequencyData} />
        <TrackInfo layers={layers} />
        <ProgressBar currentTime={player.currentTime} duration={player.duration} onSeek={player.seek} />
        <Controls isPlaying={player.state.isPlaying} shuffled={player.state.shuffled} loopMode={player.state.loopMode} onToggle={player.toggle} onNext={player.next} onPrev={player.prev} onShuffle={player.toggleShuffle} onLoop={player.cycleLoop} />
      </div>
    </div>
  );
}
export default MusicPlayer;
