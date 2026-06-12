import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAudioPlayer, useKeyboardShortcuts, useRafLoop, type Track } from './ui/music-player-widget';


// ─────────────────────────────────────────────────────────────────────────────
// Deezer Global Charts — Infinite Feed
// Each track preview = 30s chorus/hook pre-selected by Deezer (NOT song start)
// Auto-loads 10 more tracks each time the user nears the end.
// ─────────────────────────────────────────────────────────────────────────────



const MOCK_TRACKS: Track[] = [
  {
    title: "Neon Submersion",
    artist: "Ghost Protocol",
    album: "Liquid Soul (LP)",
    cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500",
    src: "/assets/assets/songs/song1.mp3",
    clipStart: 8,
    clipEnd: 32,
    lyrics: [
      { text: "Midnight static on the wire", start: 0, end: 4 },
      { text: "Liquid echoes, hearts on fire", start: 4, end: 8 },
      { text: "Fade to velvet, sink below", start: 8, end: 12 },
      { text: "Where the indigo rivers flow", start: 12, end: 16 },
      { text: "Searching for a ghost light", start: 16, end: 20 },
      { text: "In the shadow of the night", start: 20, end: 24 }
    ]
  },
  {
    title: "Synthetic Dreams",
    artist: "Cyberpunk Melodics",
    album: "Aether Grid (EP)",
    cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500",
    src: "/assets/assets/songs/song2.mp3",
    clipStart: 12,
    clipEnd: 28,
    lyrics: [
      { text: "Lost inside the neon rain", start: 0, end: 4 },
      { text: "Electric pulses numb the pain", start: 4, end: 8 },
      { text: "Grid lock in the cyber sky", start: 8, end: 12 },
      { text: "Watch the silicon angels fly", start: 12, end: 16 }
    ]
  },
  {
    title: "Bass Theory",
    artist: "Heavy Sub-lows",
    album: "Resonance",
    cover: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=500",
    src: "/assets/assets/songs/song3.mp3",
    clipStart: 6,
    clipEnd: 22,
    lyrics: [
      { text: "Feel the vibration in your chest", start: 0, end: 4 },
      { text: "Heavy waves that never rest", start: 4, end: 8 },
      { text: "Sub-bass frequency is low", start: 8, end: 12 },
      { text: "Moving in a steady flow", start: 12, end: 16 }
    ]
  },
  {
    title: "Vapor Trails",
    artist: "AETHER",
    album: "Phonk Revolution",
    cover: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500",
    src: "/assets/assets/songs/song4.mp3",
    clipStart: 10,
    clipEnd: 26,
    lyrics: [
      { text: "Drifting past the static line", start: 0, end: 4 },
      { text: "Vapor trials frozen in time", start: 4, end: 8 },
      { text: "Speeding through the empty street", start: 8, end: 12 },
      { text: "Phonk beats making hearts beat", start: 12, end: 16 }
    ]
  }
];

function generateAestheticMockLyrics(title: string, artist: string) {
  const lyricSets = [
    [
      "Midnight static on the wire...",
      "Liquid echoes, hearts on fire...",
      "Fade to velvet, sink below...",
      "Where the indigo rivers flow...",
      "Lost inside the neon rain...",
      "Electric pulses numb the pain..."
    ],
    [
      "We drift through the digital sky...",
      "Watching the silicon angels fly...",
      "Electric dreams in a paper world...",
      "Feel the frequency start to unfold...",
      "A simple beat to clear the mind...",
      "Leave the heavy thoughts behind..."
    ],
    [
      "Vapor trails frozen in time...",
      "Speeding past the warning sign...",
      "Heavy waves that never rest...",
      "Feel the bass within your chest...",
      "Double-tap to save the loop...",
      "We are running in an endless group..."
    ],
    [
      "A quiet echo in the dark...",
      "Waiting for the perfect spark...",
      "No words needed for this sound...",
      "Spinning as the world goes round...",
      "The aux tape playing in the night...",
      "Everything is gonna be alright..."
    ]
  ];

  const setIndex = title.length % lyricSets.length;
  const selectedLines = lyricSets[setIndex] || lyricSets[0]!;

  return [
    ...selectedLines.map((line, i) => ({
      text: line,
      start: i * 4,
      end: (i + 1) * 4
    })),
    { text: "🎵 Double-tap to save this loop", start: selectedLines.length * 4, end: selectedLines.length * 4 + 4 }
  ];
}

function parseLRC(lrcText: string) {
  const lines = lrcText.split('\n');
  const lyrics: { text: string; start: number; end: number; }[] = [];

  for (const line of lines) {
    const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/);
    if (match) {
      const minutes = parseInt(match[1]!, 10);
      const seconds = parseInt(match[2]!, 10);
      const msStr = match[3]!;
      const ms = parseInt(msStr, 10);
      const msDivisor = msStr.length === 3 ? 1000 : 100;
      
      const start = minutes * 60 + seconds + ms / msDivisor;
      const text = match[4]!.trim();
      
      if (text && !text.includes('♪') && !text.toLowerCase().startsWith('paroles')) {
        lyrics.push({ text, start, end: start + 4 });
      }
    }
  }

  if (lyrics.length === 0) return null;

  // Heuristic: iTunes previews usually start at either 0s, 30s, or near the first chorus.
  // We offset all lyric start times so that the first lyric line starts at exactly 2 seconds in the preview.
  const firstLyricStart = lyrics[0]!.start;
  const offset = firstLyricStart - 2;

  const shiftedLyrics = lyrics.map(line => ({
    text: line.text,
    start: Math.max(0, line.start - offset),
    end: Math.max(0.5, line.end - offset)
  }));

  // Adjust end times to be the start time of the next line
  for (let i = 0; i < shiftedLyrics.length - 1; i++) {
    shiftedLyrics[i]!.end = shiftedLyrics[i + 1]!.start;
  }

  return shiftedLyrics;
}

async function fetchSyncedLyrics(artist: string, title: string) {
  const cleanTitle = title
    .replace(/\(feat\..*?\)/i, '')
    .replace(/feat\..*?$/i, '')
    .replace(/\(remastered.*?\)/i, '')
    .replace(/\(from.*?\)/i, '')
    .replace(/\(official.*?\)/i, '')
    .replace(/ - Single$/, '')
    .trim();
  const cleanArtist = artist.split(',')[0]!.split('&')[0]!.trim();

  // Try 1: Cleaned search
  let lyrics = await fetchLyricsApi(cleanArtist, cleanTitle);
  if (lyrics) return lyrics;

  // Try 2: Raw search (fallback)
  if (cleanTitle !== title || cleanArtist !== artist) {
    lyrics = await fetchLyricsApi(artist, title);
    if (lyrics) return lyrics;
  }

  return null;
}

async function fetchLyricsApi(artist: string, title: string) {
  try {
    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.syncedLyrics) {
      return parseLRC(json.syncedLyrics);
    }
  } catch (e) {
    console.error('Error fetching lyrics from api:', e);
  }
  return null;
}

async function fetchChartPage(): Promise<Track[]> {
  try {
    // Fetch top 200 India chart songs directly
    const resIndia = await fetch('https://itunes.apple.com/in/rss/topsongs/limit=200/json');
    let indiaEntries: any[] = [];
    if (resIndia.ok) {
      const json = await resIndia.json();
      indiaEntries = json.feed?.entry || [];
    }

    // Curation filter: limit any single artist to at most 3 tracks in the top feed to keep it diverse
    const artistCounts: Record<string, number> = {};
    const diverseEntries: any[] = [];
    for (const entry of indiaEntries) {
      const artist = (entry['im:artist']?.label || '').trim().toLowerCase();
      const primaryArtist = artist.split(',')[0]!.split('&')[0]!.split('feat.')[0]!.trim();
      artistCounts[primaryArtist] = (artistCounts[primaryArtist] || 0) + 1;
      if (artistCounts[primaryArtist] <= 3) {
        diverseEntries.push(entry);
      }
    }

    return diverseEntries.map((entry: any) => {
      const previewLink = Array.isArray(entry.link)
        ? entry.link.find((l: any) => l.attributes?.title === 'Preview' || l.attributes?.['im:assetType'] === 'preview')
        : entry.link;
      const previewUrl = previewLink?.attributes?.href || '';
      
      const images = entry['im:image'] || [];
      let coverUrl = images[images.length - 1]?.label || '';
      if (coverUrl) {
        coverUrl = coverUrl.replace(/\/\d+x\d+bb\.(jpg|png|gif)/, '/500x500bb.jpg');
      }

      return {
        title: entry['im:name']?.label || '',
        artist: entry['im:artist']?.label || '',
        album: entry['im:collection']?.['im:name']?.label || '',
        cover: coverUrl,
        src: previewUrl,
      };
    }).filter((t: Track) => !!t.src);
  } catch (e) {
    console.error('Error fetching India charts:', e);
    return [];
  }
}

const INDIAN_SEARCH_QUERIES = [
  'Bollywood Hits',
  'Arijit Singh',
  'Diljit Dosanjh',
  'Sidhu Moose Wala',
  'Pritam',
  'Punjabi Hits',
  'Anirudh Ravichander',
  'A.R. Rahman',
  'Lata Mangeshkar',
  'Shreya Ghoshal',
  'Indian Pop',
  'Telugu Hits',
  'Tamil Hits',
  'Badshah',
  'Divine',
  'Karan Aujla',
  'Amit Trivedi',
  'Neha Kakkar',
  'Jubin Nautiyal',
  'Vishal-Shekhar'
];

function useDeezerCharts() {
  // Read from localStorage cache immediately to eliminate loading delay on reload
  const [baseTracks, setBaseTracks] = useState<Track[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('drop_cached_charts');
        return cached ? JSON.parse(cached) : [];
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [tracks, setTracks] = useState<Track[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('drop_cached_charts');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.length > 0) return parsed;
        }
      } catch (e) {
        console.error(e);
      }
    }
    return MOCK_TRACKS;
  });

  const [initialLoading, setInit] = useState(() => tracks === MOCK_TRACKS);
  const [loadingMore, setMore] = useState(false);
  const [error] = useState<string | null>(null);
  const [hasMore] = useState(true);
  const [queryIndex, setQueryIndex] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const newTracks = await fetchChartPage();
        if (active && newTracks.length > 0) {
          setBaseTracks(newTracks);
          setTracks(newTracks);
          localStorage.setItem('drop_cached_charts', JSON.stringify(newTracks));
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setInit(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setMore(true);

    try {
      // Pick next Indian query from list
      const query = INDIAN_SEARCH_QUERIES[queryIndex % INDIAN_SEARCH_QUERIES.length] || 'Bollywood';
      setQueryIndex(prev => prev + 1);

      // Search iTunes API for new Indian tracks
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&country=IN&limit=30`);
      if (res.ok) {
        const json = await res.json();
        if (json && json.results) {
          const formatted: Track[] = json.results
            .filter((t: any) => !!t.previewUrl)
            .map((t: any) => {
              let coverUrl = t.artworkUrl100 || '';
              if (coverUrl) {
                coverUrl = coverUrl.replace('100x100bb.jpg', '500x500bb.jpg');
              }
              return {
                title: t.trackName,
                artist: t.artistName,
                album: t.collectionName,
                cover: coverUrl,
                src: t.previewUrl,
              };
            });

          if (formatted.length > 0) {
            setTracks(prev => {
              // Deduplicate tracks by src URL
              const existingSrcs = new Set(prev.map(t => t.src));
              const newUnique = formatted.filter(t => !existingSrcs.has(t.src));
              return [...prev, ...newUnique];
            });
          }
        }
      }
    } catch (e) {
      console.error('Error loading more Indian tracks:', e);
    } finally {
      setMore(false);
    }
  }, [queryIndex, loadingMore]);

  return { tracks, initialLoading, loadingMore, error, loadMore, hasMore };
}




// Scrolling lyric panel component with active focus and blur transitions
function LyricView({ lyrics, currentTime }: { lyrics: { text: string; start: number; end: number; }[]; currentTime: number; }) {
  // Guard: nothing to render if lyrics array is empty
  if (!lyrics || lyrics.length === 0) return null;

  // Find which lyric line is currently active
  const activeIndex = (() => {
    const idx = lyrics.findIndex(line => currentTime >= line.start && currentTime < line.end);
    if (idx !== -1) return idx;
    if (currentTime < (lyrics[0]?.start ?? 0)) return 0;
    return lyrics.length - 1;
  })();

  // Each lyric line slot height — tighter spacing for a compact cinematic feel
  const ROW_H = 75;
  const ANCHOR_Y = 120;
  const translateY = ANCHOR_Y - activeIndex * ROW_H;

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none overflow-hidden"
      style={{ zIndex: 15 }}
    >
      {/* Top veil — fades lines above the anchor */}
      <div
        className="absolute top-0 left-0 right-0 z-20 pointer-events-none"
        style={{ height: '160px', background: 'linear-gradient(to bottom, rgba(5,5,5,0.97) 0%, rgba(5,5,5,0.6) 60%, transparent 100%)' }}
      />
      {/* Bottom veil — fades lines below */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
        style={{ height: '220px', background: 'linear-gradient(to top, rgba(5,5,5,0.98) 0%, rgba(5,5,5,0.7) 50%, transparent 100%)' }}
      />

      {/* Scrolling lyric strip */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          transform: `translateY(${translateY}px)`,
          transition: 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'transform',
        }}
      >
        {lyrics.map((line, idx) => {
          const dist = idx - activeIndex;
          const isActive = dist === 0;
          const isClose = Math.abs(dist) === 1;
          const isFar = Math.abs(dist) === 2;

          // Cinematic sizing — enormous active, muted context lines
          let fontSize = '14px';
          let fontWeight = '500';
          let opacity = 0.10;
          let color = '#b0b0b0';
          let filter = 'none';
          let lineH = 1.2;
          let letterSp = '0px';
          let textShadow = 'none';

          if (isActive) {
            fontSize = '38px';
            fontWeight = '800';
            opacity = 1;
            color = '#ffffff';
            filter = 'none';
            lineH = 1.15;
            letterSp = '-1px';
            textShadow = '0 0 40px rgba(255,255,255,0.18)';
          } else if (isClose) {
            fontSize = '22px';
            fontWeight = '700';
            opacity = 0.38;
            color = '#cccccc';
            filter = 'none';
            lineH = 1.2;
            letterSp = '0px';
          } else if (isFar) {
            fontSize = '17px';
            fontWeight = '600';
            opacity = 0.18;
            color = '#aaaaaa';
            filter = 'none';
            lineH = 1.2;
            letterSp = '0px';
          }

          return (
            <div
              key={idx}
              style={{
                minHeight: `${ROW_H}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                textAlign: 'left',
                padding: '0 28px',
                width: '100%',
                boxSizing: 'border-box',
                fontFamily: '"Sora", sans-serif',
                fontSize,
                fontWeight,
                color,
                opacity,
                filter,
                lineHeight: lineH,
                letterSpacing: letterSp,
                textShadow,
                transition: 'font-size 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.35s cubic-bezier(0.22,1,0.36,1), color 0.35s ease',
                wordBreak: 'break-word',
              }}
            >
              {line.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// 12-bar real-time audio visualizer waveform
function WaveformVisualizer({ isPlaying, getFrequencyData }: { isPlaying: boolean; getFrequencyData?: () => Uint8Array | null; }) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);

  useRafLoop(() => {
    const data = getFrequencyData?.();
    for (let i = 0; i < 12; i++) {
      const bar = barsRef.current[i];
      if (!bar) continue;

      let height = 4; // minimum height
      if (isPlaying) {
        if (data) {
          const bin = Math.floor((i / 12) * (data.length * 0.4));
          const val = data[bin] ?? 0;
          height = 4 + (val / 255) * 20; // scale up to 24px
        } else {
          height = 4 + Math.abs(Math.sin(Date.now() / 150 + i * 0.8)) * 18;
        }
      }
      bar.style.height = `${height}px`;
    }
  });

  return (
    <div className="flex items-end gap-[3px] h-[28px] px-1 select-none">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          ref={(el) => { barsRef.current[i] = el; }}
          className="w-[3px] bg-[#FF3B30] rounded-full transition-all duration-75"
          style={{ height: '4px' }}
        />
      ))}
    </div>
  );
}

// Spinning vinyl record component with size burst animation on track shift
function ReelsVinyl({ isPlaying, cover, title, activeIndex }: { isPlaying: boolean; cover: string; title: string; activeIndex: number; }) {
  const spinRef = useRef<HTMLDivElement>(null);
  const rotRef = useRef(0);
  const velRef = useRef(0);
  const lastIndex = useRef(activeIndex);
  const scaleRef = useRef(1);

  useRafLoop((_, dt) => {
    if (isPlaying) {
      velRef.current += (0.6 - velRef.current) * 0.1;
    } else {
      velRef.current *= 0.95;
      if (velRef.current < 0.01) velRef.current = 0;
    }
    rotRef.current += velRef.current;

    if (activeIndex !== lastIndex.current) {
      lastIndex.current = activeIndex;
      scaleRef.current = 0.4;
    }
    scaleRef.current += (1 - scaleRef.current) * 0.15;

    const el = spinRef.current;
    if (el) {
      el.style.transform = `scale(${scaleRef.current}) rotate(${rotRef.current}deg)`;
    }
  });

  return (
    <div className="w-[68px] h-[68px] rounded-full bg-black/60 border border-white/20 shadow-2xl flex items-center justify-center relative select-none">
      <div className="absolute inset-1 rounded-full border border-white/5 pointer-events-none z-10" />
      <div className="absolute inset-3 rounded-full border border-white/5 pointer-events-none z-10" />
      <div className="absolute inset-5 rounded-full border border-white/5 pointer-events-none z-10" />

      <div ref={spinRef} className="w-[52px] h-[52px] rounded-full overflow-hidden relative" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
        <img src={cover} alt={title} className="w-full h-full object-cover rounded-full" draggable={false} />
      </div>

      <div className="absolute w-[12px] h-[12px] rounded-full bg-[#050505] border border-white/20 z-20 flex items-center justify-center">
        <div className="w-[4px] h-[4px] rounded-full bg-white/30" />
      </div>
    </div>
  );
}

export function Demo() {
  const [activeTab, setActiveTab] = useState<'discover' | 'browse' | 'library'>('discover');

  // Fetch live Deezer 30-second preview URLs on mount
  const { tracks: TRACKS, initialLoading: previewsLoading, loadingMore, error: previewsError, loadMore, hasMore } = useDeezerCharts();

  // Persistent Saved Tracks (Library)
  const [savedTracks, setSavedTracks] = useState<Track[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('drop_saved_tracks');
        return saved ? JSON.parse(saved) : [];
      } catch (e) {
        console.error(e);
        return [];
      }
    }
    return [];
  });

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('drop_saved_tracks', JSON.stringify(savedTracks));
  }, [savedTracks]);

  const isTrackLiked = useCallback((track: Track | undefined) => {
    if (!track) return false;
    return savedTracks.some(t => t.src === track.src);
  }, [savedTracks]);

  const toggleSaveTrack = useCallback((track: Track | undefined) => {
    if (!track) return;
    setSavedTracks(prev => {
      const exists = prev.some(t => t.src === track.src);
      if (exists) {
        return prev.filter(t => t.src !== track.src);
      } else {
        return [...prev, track];
      }
    });
  }, []);

  const [activePlaylist, setActivePlaylist] = useState<Track[]>([]);
  const activePlaylistRef = useRef(activePlaylist);
  activePlaylistRef.current = activePlaylist;

  // Sync chartTracks → activePlaylist ONLY when TRACKS changes. Never watch activePlaylist here.
  useEffect(() => {
    if (TRACKS.length === 0) return;
    const cur = activePlaylistRef.current;
    // Only update if playlist is empty or every src matches (i.e. user hasn't diverged)
    if (cur.length === 0 || cur.every((t, i) => t.src === TRACKS[i]?.src)) {
      setActivePlaylist(TRACKS);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TRACKS]);

  // Single Audio Engine hook shared globally — fed activePlaylist
  const player = useAudioPlayer(activePlaylist);

  const [pendingPlay, setPendingPlay] = useState<{ playlist: Track[], index: number } | null>(null);

  const playTrackFromPlaylist = useCallback((playlist: Track[], index: number) => {
    const clickedTrack = playlist[index];
    if (!clickedTrack) return;

    if (playlist === TRACKS) {
      setActivePlaylist(TRACKS);
      setPendingPlay({ playlist: TRACKS, index });
    } else {
      // If playing a search result or saved song, insert it right after the current playing index in activePlaylist
      const baseList = activePlaylist.length > 0 ? activePlaylist : TRACKS;
      const newPlaylist = [...baseList];
      
      const existingIdx = newPlaylist.findIndex(t => t.src === clickedTrack.src);
      if (existingIdx !== -1) {
        setPendingPlay({ playlist: newPlaylist, index: existingIdx });
      } else {
        const currentIdx = player.state.currentIndex;
        const insertIdx = currentIdx + 1;
        newPlaylist.splice(insertIdx, 0, clickedTrack);
        
        setActivePlaylist(newPlaylist);
        setPendingPlay({ playlist: newPlaylist, index: insertIdx });
      }
    }
    setActiveTab('discover'); // Auto-switch to feed view when clicking a track
  }, [TRACKS, activePlaylist, player.state.currentIndex]);

  useEffect(() => {
    if (pendingPlay && activePlaylist === pendingPlay.playlist) {
      player.loadTrack(pendingPlay.index, true, null);
      setPendingPlay(null);
    }
  }, [activePlaylist, pendingPlay, player.loadTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real Synced Lyrics Cache — ref for reads (no re-render), state for writes (triggers re-render)
  const [lyricsCache, setLyricsCache] = useState<Record<string, { text: string; start: number; end: number; }[] | null>>({});
  const lyricsCacheRef = useRef(lyricsCache);
  lyricsCacheRef.current = lyricsCache;
  const fetchingTracksRef = useRef<Set<string>>(new Set());

  // Single stable effect — only re-runs when track index or playlist changes, NOT when cache changes
  useEffect(() => {
    let active = true;

    function maybeFetch(artist: string, title: string, src: string) {
      if (lyricsCacheRef.current[src] !== undefined) return;
      if (fetchingTracksRef.current.has(src)) return;
      fetchingTracksRef.current.add(src);
      fetchSyncedLyrics(artist, title).then(parsed => {
        if (active) {
          setLyricsCache(prev => ({ ...prev, [src]: parsed }));
        }
        fetchingTracksRef.current.delete(src);
      });
    }

    const cur = activePlaylist[player.state.currentIndex];
    if (cur && !cur.lyrics) maybeFetch(cur.artist, cur.title, cur.src);

    const next = activePlaylist[player.state.currentIndex + 1];
    const t1 = setTimeout(() => {
      if (active && next && !next.lyrics) maybeFetch(next.artist, next.title, next.src);
    }, 400);

    const prev = activePlaylist[player.state.currentIndex - 1];
    const t2 = setTimeout(() => {
      if (active && prev && !prev.lyrics) maybeFetch(prev.artist, prev.title, prev.src);
    }, 800);

    return () => { active = false; clearTimeout(t1); clearTimeout(t2); };
  // activePlaylist reads via activePlaylistRef — safe, no loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.state.currentIndex]);

  // Browse search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const apiUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&media=music&limit=20`;
        const res = await fetch(apiUrl);
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        const json = await res.json();
        if (json && json.results) {
          const formatted: Track[] = json.results
            .filter((t: any) => {
              if (!t.previewUrl) return false;
              const name = (t.trackCensoredName || t.trackName || '').toLowerCase();
              if (name.includes('karaoke') || name.includes('tribute') || name.includes('cover version') || name.includes('tribute version') || name.includes('instrumental')) {
                return false;
              }
              return true;
            })
            .sort((a: any, b: any) => {
              const aName = (a.trackName || '').toLowerCase();
              const bName = (b.trackName || '').toLowerCase();
              const query = searchQuery.toLowerCase();
              
              // Exact match prioritization
              const aExact = aName === query ? 1 : 0;
              const bExact = bName === query ? 1 : 0;
              if (aExact !== bExact) return bExact - aExact;
              
              // Prioritize Single/Radio Edit/EP over album versions to get better previews (choruses)
              const aSingle = (a.collectionName || '').toLowerCase().includes('single') || aName.includes('radio edit') ? 1 : 0;
              const bSingle = (b.collectionName || '').toLowerCase().includes('single') || bName.includes('radio edit') ? 1 : 0;
              if (aSingle !== bSingle) return bSingle - aSingle;
              
              return 0;
            })
            .map((t: any) => {
              let coverUrl = t.artworkUrl100 || '';
              if (coverUrl) {
                coverUrl = coverUrl.replace('100x100bb.jpg', '500x500bb.jpg');
              }
              return {
                title: t.trackName,
                artist: t.artistName,
                album: t.collectionName,
                cover: coverUrl,
                src: t.previewUrl,
              };
            });
          setSearchResults(formatted);
        } else {
          setSearchResults([]);
        }
      } catch (err: any) {
        setSearchError(err.message || 'Error fetching search results');
      } finally {
        setSearchLoading(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  // Double-tap pop-up state
  const [showCenterHeart, setShowCenterHeart] = useState(false);
  const lastTapRef = useRef<number>(0);

  // Custom toast notification for links sharing
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync scroll position with player.state.currentIndex
  const containerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keyboard shortcut listener integration
  const seekForward = useCallback(() => { const a = player.audioRef.current; if (a) a.currentTime = Math.min(a.duration || 0, a.currentTime + 5); }, [player.audioRef]);
  const seekBackward = useCallback(() => { const a = player.audioRef.current; if (a) a.currentTime = Math.max(0, a.currentTime - 5); }, [player.audioRef]);
  const shortcuts = useMemo(() => ({ toggle: player.toggle, next: player.next, prev: player.prev, seekForward, seekBackward, toggleShuffle: player.toggleShuffle, cycleLoop: player.cycleLoop }), [player.toggle, player.next, player.prev, seekForward, seekBackward, player.toggleShuffle, player.cycleLoop]);
  useKeyboardShortcuts(shortcuts);

  const [discoverIndex, setDiscoverIndex] = useState(0);

  // Keep track of the active index when we are in discover tab
  useEffect(() => {
    if (activeTab === 'discover') {
      setDiscoverIndex(player.state.currentIndex);
    }
  }, [player.state.currentIndex, activeTab]);

  // Handle tab switching and playlist transitions
  const handleTabChange = useCallback((tab: 'discover' | 'browse' | 'library') => {
    setActiveTab(tab);
    if (tab === 'discover') {
      playTrackFromPlaylist(TRACKS, discoverIndex);
    }
  }, [TRACKS, discoverIndex, playTrackFromPlaylist]);

  // Programmatic scroll alignment when track index changes or Discover tab mounts
  useEffect(() => {
    if (activeTab !== 'discover' || !containerRef.current) return;
    const container = containerRef.current;
    
    const handleScrollAlign = () => {
      const height = container.clientHeight;
      if (height === 0) return;
      const targetScrollTop = player.state.currentIndex * height;
      if (Math.abs(container.scrollTop - targetScrollTop) > 5) {
        isProgrammaticRef.current = true;
        container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
        clearTimeout(scrollTimeoutRef.current ?? undefined);
        scrollTimeoutRef.current = setTimeout(() => {
          isProgrammaticRef.current = false;
        }, 800);
      }
    };

    handleScrollAlign();
    // Run after a short delay to handle any dynamic layout or height updates
    const t1 = setTimeout(handleScrollAlign, 100);
    const t2 = setTimeout(handleScrollAlign, 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [player.state.currentIndex, activeTab]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const scrollPosition = container.scrollTop;
    const height = container.clientHeight;
    if (height === 0) return;

    const newIndex = Math.round(scrollPosition / height);
    const isAtSnapPoint = Math.abs(scrollPosition - newIndex * height) < 5;

    if (isProgrammaticRef.current) {
      if (isAtSnapPoint && newIndex === player.state.currentIndex) {
        isProgrammaticRef.current = false;
      }
      return;
    }

    if (isAtSnapPoint && newIndex !== player.state.currentIndex) {
      const direction = newIndex > player.state.currentIndex ? 'next' : 'prev';
      player.loadTrack(newIndex, true, direction);
    }

    // Infinite loading: Auto-load more tracks when nearing the end
    if (activePlaylist === TRACKS && newIndex >= activePlaylist.length - 3 && hasMore) {
      loadMore();
    }
  };

  const handleDoubleTap = (e: React.MouseEvent) => {
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_PRESS_DELAY) {
      setShowCenterHeart(true);
      const currentTrack = activePlaylist[player.state.currentIndex];
      if (currentTrack) {
        setSavedTracks(prev => {
          if (prev.some(t => t.src === currentTrack.src)) return prev;
          return [...prev, currentTrack];
        });
      }
      setTimeout(() => {
        setShowCenterHeart(false);
      }, 700);
    }
    lastTapRef.current = now;
  };

  const toggleLike = (idx: number) => {
    const track = activePlaylist[idx];
    if (track) toggleSaveTrack(track);
  };

  const handleShare = (title: string, artist: string) => {
    navigator.clipboard.writeText(`${title} - ${artist} loop shared from DROP!`);
    setToastMessage('Link copied to clipboard!');
    setTimeout(() => {
      setToastMessage(null);
    }, 2000);
  };

  // Dynamic asset injection (Tailwind configuration, Fonts, Icons)
  const [tailwindReady, setTailwindReady] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!document.getElementById('font-sora')) {
        const link = document.createElement('link');
        link.id = 'font-sora';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Sora:wght@400;700;800&family=Hanken+Grotesk:wght@400;500;700&display=swap';
        document.head.appendChild(link);
      }

      if (!document.getElementById('material-symbols')) {
        const link = document.createElement('link');
        link.id = 'material-symbols';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap';
        document.head.appendChild(link);
      }

      if (!document.getElementById('tailwind-cdn')) {
        const script = document.createElement('script');
        script.id = 'tailwind-cdn';
        script.src = 'https://cdn.tailwindcss.com?plugins=forms,container-queries';
        script.onload = () => {
          (window as any).tailwind.config = {
            darkMode: 'class',
            theme: {
              extend: {
                colors: {
                  "crimson-orb": "rgba(255, 59, 48, 0.15)",
                  "indigo-orb": "rgba(88, 86, 214, 0.15)",
                  "smoky-glass": "rgba(255, 255, 255, 0.05)",
                  "hairline-border": "rgba(255, 255, 255, 0.12)",
                  "text-muted": "rgba(255, 255, 255, 0.60)",
                  "on-surface": "#e2e2e2",
                  "surface-container": "#1a1c1c",
                  "surface-container-highest": "#333535",
                  "background-deep": "#050505",
                },
                borderRadius: {
                  "container-radius": "24px",
                },
                spacing: {
                  "gutter-feed": "0px",
                  "gutter-browse": "20px",
                  "safe-bottom": "34px",
                  "container-radius": "24px",
                  "safe-top": "44px"
                },
                fontFamily: {
                  "lyric-display": ["Sora", "sans-serif"],
                  "headline-lg": ["Sora", "sans-serif"],
                  "body-md": ["Hanken Grotesk", "sans-serif"],
                  "metadata-sm": ["Hanken Grotesk", "sans-serif"],
                  "label-caps": ["Hanken Grotesk", "sans-serif"]
                }
              }
            }
          };
          setTailwindReady(true);
        };
        document.head.appendChild(script);
      } else {
        setTailwindReady(true);
      }

      // Inject global custom scroll and animation styles safely
      if (!document.getElementById('drop-custom-styles')) {
        const style = document.createElement('style');
        style.id = 'drop-custom-styles';
        style.innerHTML = `
          @keyframes bounce { 0%, 80%, 100% { transform: scale(0) } 40% { transform: scale(1) } }
          @keyframes heart-pop { 0% { transform: scale(0.5); opacity: 0; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); opacity: 0; } }
          @keyframes ti-in { 0% { transform: translate(-50%, -20px); opacity: 0; } 100% { transform: translate(-50%, 0); opacity: 1; } }
          .scrollbar-none::-webkit-scrollbar { display: none; }
          .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  // Show premium loading splash while INITIAL Deezer previews are fetching and styles are configuring
  if (previewsLoading || !tailwindReady) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#050505',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        fontFamily: '"Sora", sans-serif'
      }}>
        <div style={{ fontSize: '32px', fontWeight: 800, color: '#fff', letterSpacing: '-1px' }}>DROP</div>
        <div style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: '8px', height: '8px', borderRadius: '50%', background: '#FF3B30',
              animation: 'bounce 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
            }} />
          ))}
        </div>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', letterSpacing: '2px', textTransform: 'uppercase' }}>
          {!tailwindReady ? 'Configuring styles...' : 'Loading previews...'}
        </p>
      </div>
    );
  }

  if (previewsError && TRACKS.length === 0) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center gap-4" style={{ fontFamily: '"Sora", sans-serif' }}>
        <div style={{ fontSize: '32px', fontWeight: 800, color: '#fff' }}>DROP</div>
        <p style={{ color: '#FF3B30', fontSize: '14px' }}>{previewsError}</p>
        <button onClick={() => window.location.reload()} style={{ padding: '10px 24px', borderRadius: '999px', background: '#FF3B30', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}>Retry</button>
      </div>
    );
  }

  return (
    <div
      className="text-[#e2e2e2] bg-[#050505] font-body-md select-none"
      style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}
    >
      {/* Native HTML5 Audio node element wired to player controller */}
      <audio ref={player.audioRef} preload="auto" crossOrigin="anonymous" />

      {/* Preload adjacent tracks for near-instant switching */}
      {activePlaylist[player.state.currentIndex + 1] && (
        <audio
          key={`preload-next-${player.state.currentIndex + 1}`}
          src={activePlaylist[player.state.currentIndex + 1]!.src}
          preload="auto"
          crossOrigin="anonymous"
          style={{ display: 'none' }}
        />
      )}
      {activePlaylist[player.state.currentIndex - 1] && (
        <audio
          key={`preload-prev-${player.state.currentIndex - 1}`}
          src={activePlaylist[player.state.currentIndex - 1]!.src}
          preload="auto"
          crossOrigin="anonymous"
          style={{ display: 'none' }}
        />
      )}

      {/* Dynamic Hardware-Accelerated Liquid Background Layer */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="orb orb-crimson -top-20 -left-20" style={{ animationDelay: '0s' }}></div>
        <div className="orb orb-indigo -bottom-40 -right-20" style={{ animationDelay: '-5s' }}></div>
        <div className="orb orb-crimson top-1/3 left-1/4 opacity-25" style={{ animationDelay: '-10s', width: '450px', height: '450px' }}></div>
      </div>

      {/* Glassmorphism Header Dock */}
      <header
        className="absolute w-full z-50 bg-smoky-glass backdrop-blur-[60px] border-b border-hairline-border flex justify-between items-center px-6"
        style={{ top: 0, left: 0, right: 0, height: '48px', display: 'flex', flexDirection: 'row' }}
      >
        <div className="flex items-center gap-3" style={{ display: 'flex', flexDirection: 'row' }}>
          <span className="material-symbols-outlined text-white cursor-pointer hover:scale-105 transition-transform duration-300">menu</span>
          <h1 className="font-lyric-display font-extrabold text-[20px] text-white tracking-tighter leading-none select-none">DROP</h1>
        </div>
        <div className="flex items-center gap-4" style={{ display: 'flex', flexDirection: 'row' }}>
          <span className="material-symbols-outlined text-white cursor-pointer hover:scale-105 transition-transform duration-300">search</span>
        </div>
      </header>

      {/* Page Canvas — fills exactly between header and nav */}
      <main
        className="absolute z-10 overflow-hidden"
        style={{
          top: '48px',
          left: 0,
          right: 0,
          bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
        }}
      >
        {/* Discover Feed Tab (Full-screen Reels Layout) */}
        {activeTab === 'discover' && (
          <div className="relative flex items-stretch justify-center" style={{ flex: 1, height: '100%', background: '#000', flexDirection: 'row', width: '100%' }}>
            {/* Left ambient blur panel */}
            <div className="flex-1 relative overflow-hidden hidden md:block">
              {activePlaylist[player.state.currentIndex] && (
                <img
                  src={activePlaylist[player.state.currentIndex]!.cover}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover scale-110"
                  style={{ filter: 'blur(80px)', opacity: 0.15 }}
                />
              )}
              <div className="absolute inset-0 bg-black/70" />
            </div>

            {/* Center phone-width column */}
            <div
              className="relative flex-shrink-0 bg-black"
              style={{
                width: '100%',
                maxWidth: '420px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >


              {/* Scroll snapping track pages list */}
              <div
                ref={containerRef}
                onScroll={handleScroll}
                className="w-full"
                style={{ height: '100%', overflowY: 'auto', scrollSnapType: 'y mandatory', position: 'relative' }}
              >
                {/* Fallback if chart is completely empty */}
                {activePlaylist.length === 0 && (
                  <div className="w-full flex flex-col items-center justify-center gap-4 text-white/50" style={{ height: '100%' }}>
                    <span className="material-symbols-outlined text-[48px]">music_off</span>
                    <p>No tracks available right now.</p>
                  </div>
                )}

                {activePlaylist.map((track, idx) => {
                  const isActiveTrack = idx === player.state.currentIndex;
                  const isLiked = isTrackLiked(track);

                  return (
                    <div
                      key={idx}
                      onClick={handleDoubleTap}
                      className="w-full relative overflow-hidden cursor-pointer"
                      style={{ height: '100%', scrollSnapAlign: 'start', flexShrink: 0 }}
                    >
                      {/* Blurred cover art background */}
                      <div className="absolute inset-0 z-0">
                        <img
                          src={track.cover}
                          alt=""
                          className="w-full h-full object-cover scale-125"
                          style={{ filter: 'blur(55px)', opacity: 0.25 }}
                          draggable={false}
                        />
                        {/* Deep dark overlay so lyrics pop */}
                        <div className="absolute inset-0" style={{ background: 'rgba(5,5,5,0.82)' }} />
                      </div>

                      {/* ═══ HERO: Full-card cinematic lyrics ═══ */}
                      <LyricView
                        lyrics={
                          track.lyrics || 
                          lyricsCache[track.src] || 
                          generateAestheticMockLyrics(track.title, track.artist)
                        }
                        currentTime={isActiveTrack ? player.currentTime : 0}
                      />

                      {/* Paused — ghost play button on hover */}
                      {isActiveTrack && !player.state.isPlaying && (
                        <div
                          onClick={(e) => { e.stopPropagation(); player.toggle(); }}
                          className="absolute inset-0 flex items-center justify-center cursor-pointer group"
                          style={{ zIndex: 16 }}
                        >
                          <div
                            className="w-20 h-20 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}
                          >
                            <span className="material-symbols-outlined text-white text-[44px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                          </div>
                        </div>
                      )}

                      {/* Floating Controls Row (Right Side) — dark glass circles matching reference */}
                      <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4 z-30">
                        {/* Spinning Album Disc Vinyl */}
                        <div
                          onClick={(e) => { e.stopPropagation(); player.toggle(); }}
                          className="hover:scale-105 active:scale-95 transition-transform duration-200"
                        >
                          <ReelsVinyl
                            isPlaying={isActiveTrack && player.state.isPlaying}
                            cover={track.cover}
                            title={track.title}
                            activeIndex={player.state.currentIndex}
                          />
                        </div>

                        {/* Heart Button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleLike(idx); }}
                          className="flex flex-col items-center gap-1 select-none active:scale-90 transition-transform cursor-pointer"
                        >
                          <div
                            className="w-12 h-12 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(30,30,30,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            <span
                              className={`material-symbols-outlined text-[28px] transition-colors duration-300 ${isLiked ? 'text-[#FF3B30]' : 'text-white'}`}
                              style={{ fontVariationSettings: isLiked ? "'FILL' 1" : "'FILL' 0" }}
                            >
                              favorite
                            </span>
                          </div>
                        </button>

                        {/* Share Button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleShare(track.title, track.artist); }}
                          className="flex flex-col items-center gap-1 select-none active:scale-90 transition-transform cursor-pointer"
                        >
                          <div
                            className="w-12 h-12 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(30,30,30,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            <span className="material-symbols-outlined text-white text-[22px]">share</span>
                          </div>
                        </button>

                        {/* Options Button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); }}
                          className="flex flex-col items-center gap-1 select-none active:scale-90 transition-transform cursor-pointer"
                        >
                          <div
                            className="w-12 h-12 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(30,30,30,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            <span className="material-symbols-outlined text-white text-[22px]">more_vert</span>
                          </div>
                        </button>
                      </div>


                      {/* Bottom-left Content Block — waveform + title + artist + controls */}
                      <div className="absolute left-5 right-5 z-30 flex flex-col gap-2 select-none" style={{ bottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 16px))', pointerEvents: 'none' }}>
                        {/* Audio visualizer */}
                        <WaveformVisualizer
                          isPlaying={isActiveTrack && player.state.isPlaying}
                          getFrequencyData={isActiveTrack ? player.getFrequencyData : undefined}
                        />

                        {/* Song & Artist */}
                        <div className="flex flex-col gap-0.5">
                          <h2
                            style={{
                              fontFamily: '"Sora", sans-serif',
                              fontSize: '22px',
                              fontWeight: 800,
                              color: '#ffffff',
                              letterSpacing: '-0.5px',
                              lineHeight: 1.15,
                            }}
                          >
                            {track.title}
                          </h2>
                          <p
                            style={{
                              fontFamily: '"Hanken Grotesk", sans-serif',
                              fontSize: '11px',
                              fontWeight: 700,
                              display: 'flex',
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <span style={{ color: '#FF3B30' }}>{track.artist}</span>
                            <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
                            <span style={{ color: 'rgba(255,255,255,0.45)' }}>{track.album}</span>
                          </p>
                        </div>

                        {/* Playback Controls — only on active track, below song name */}
                        {isActiveTrack && (
                          <div
                            className="flex items-center gap-1 mt-1"
                            style={{ pointerEvents: 'auto' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Shuffle */}
                            <button
                              onClick={() => player.toggleShuffle()}
                              className="w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 hover:bg-white/10"
                              style={{ color: player.state.shuffled ? '#FF3B30' : 'rgba(255,255,255,0.45)' }}
                              aria-label="Shuffle"
                            >
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 3h5v5" /><path d="M21 3l-7 7" />
                                <path d="M3 21l7-7" /><path d="M16 21h5v-5" />
                                <path d="M21 21l-7-7" /><path d="M3 3l7 7" />
                              </svg>
                            </button>

                            {/* Previous */}
                            <button
                              onClick={() => player.prev()}
                              className="w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 hover:bg-white/10"
                              style={{ color: 'rgba(255,255,255,0.80)' }}
                              aria-label="Previous"
                            >
                              <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
                                <path d="M19 5L8 12l11 7zM5 5h2v14H5z" />
                              </svg>
                            </button>

                            {/* Play / Pause */}
                            <button
                              onClick={() => player.toggle()}
                              className="w-10 h-10 flex items-center justify-center rounded-full transition-all duration-150 active:scale-90"
                              style={{ background: '#FF3B30', color: '#fff', boxShadow: '0 0 18px rgba(255,59,48,0.5)', marginLeft: '2px', marginRight: '2px' }}
                              aria-label={player.state.isPlaying ? 'Pause' : 'Play'}
                            >
                              {player.state.isPlaying ? (
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                                  <path d="M6 5h3v14H6zM15 5h3v14h-3z" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                                  <path d="M7 5v14l11-7z" />
                                </svg>
                              )}
                            </button>

                            {/* Next */}
                            <button
                              onClick={() => player.next()}
                              className="w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 hover:bg-white/10"
                              style={{ color: 'rgba(255,255,255,0.80)' }}
                              aria-label="Next"
                            >
                              <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
                                <path d="M5 5l11 7L5 19zM17 5h2v14h-2z" />
                              </svg>
                            </button>

                            {/* Loop */}
                            <button
                              onClick={() => player.cycleLoop()}
                              className="w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 hover:bg-white/10 relative"
                              style={{ color: player.state.loopMode !== 'off' ? '#FF3B30' : 'rgba(255,255,255,0.45)' }}
                              aria-label="Loop"
                            >
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 12V8a2 2 0 0 1 2-2h12" />
                                <path d="M16 3l4 3l-4 3" />
                                <path d="M20 12v4a2 2 0 0 1-2 2H6" />
                                <path d="M8 21l-4-3l4-3" />
                              </svg>
                              {player.state.loopMode === 'one' && (
                                <span style={{
                                  position: 'absolute', bottom: '3px', right: '3px',
                                  fontSize: '8px', fontWeight: 900, color: '#FF3B30',
                                  lineHeight: 1, fontFamily: '"Sora", sans-serif',
                                }}>1</span>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Custom Centered Heart Popup on Double-Tap */}
                      {isActiveTrack && showCenterHeart && (
                        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none animate-[heart-pop_0.7s_ease-out_forwards]">
                          <span className="material-symbols-outlined text-[100px] text-[#FF3B30] drop-shadow-[0_0_20px_rgba(255,59,48,0.6)]">favorite</span>
                        </div>
                      )}


                    </div>
                  );
                })}

                {/* Loading indicator at the bottom for infinite feed */}
                {loadingMore && (
                  <div className="w-full flex items-center justify-center py-8 flex-shrink-0" style={{ scrollSnapAlign: 'start', height: '100px' }}>
                    <div className="flex gap-2" style={{ display: 'flex', flexDirection: 'row' }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-2 h-2 rounded-full bg-[#FF3B30]" style={{ animation: `bounce 1.2s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Scroll hint arrow — only shown on first track, disappears after scroll */}
              {player.state.currentIndex === 0 && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1 pointer-events-none animate-bounce">
                  <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">scroll</span>
                  <span className="material-symbols-outlined text-white/30 text-[20px]">keyboard_arrow_down</span>
                </div>
              )}

              {/* Custom toast notification overlay */}
              {toastMessage && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-white/10 backdrop-blur-[60px] border border-white/20 rounded-full px-5 py-2 text-xs font-bold text-white uppercase tracking-widest shadow-2xl animate-[ti-in_0.3s_cubic-bezier(0.25,1,0.5,1)_forwards]">
                  {toastMessage}
                </div>
              )}
            </div>

            {/* Right ambient blur panel */}
            <div className="flex-1 relative overflow-hidden hidden md:block">
              {activePlaylist[player.state.currentIndex] && (
                <img
                  src={activePlaylist[player.state.currentIndex]!.cover}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover scale-110"
                  style={{ filter: 'blur(80px)', opacity: 0.15 }}
                />
              )}
              <div className="absolute inset-0 bg-black/70" />
            </div>
          </div>
        )}


        {/* Browse Hub Tab */}
        {activeTab === 'browse' && (
          <div className="flex-1 px-6 py-6 scrollbar-none w-full" style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '896px', marginLeft: 'auto', marginRight: 'auto', alignSelf: 'center', overflowY: 'auto', height: '100%' }}>
            <div className="mb-8">
              <h2 className="font-lyric-display font-extrabold text-3xl text-white mb-2">Explore Hub</h2>
              <p className="text-text-muted font-body-md text-sm">Curated micro-verses and smart AI-curated trends.</p>
            </div>

            {/* Minimalist Search Area */}
            <div className="relative w-full group mb-8">
              <input
                type="text"
                placeholder="Search artists, tracks, or loops..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-b border-hairline-border py-3 pl-1 text-lg placeholder-white/30 text-white focus:outline-none focus:border-white transition-all duration-500"
              />
              <div className="absolute bottom-0 left-0 w-0 h-[2px] bg-white group-focus-within:w-full transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]"></div>
            </div>

            {/* Curated view (only visible when search query is empty) */}
            {searchQuery.trim() === '' && (
              <>
                {/* Scrollable Categories / Genre Chips */}
                <div className="flex gap-2.5 overflow-x-auto pb-4 mb-6 scrollbar-thin select-none" style={{ display: 'flex', flexDirection: 'row' }}>
                  {['All', 'Hyperpop', 'Drift Phonk', 'Neo-Soul', 'Glitch', 'Techno', 'Phonk'].map((genre, idx) => (
                    <button
                      key={genre}
                      onClick={() => setSearchQuery(genre === 'All' ? '' : genre)}
                      className="flex-shrink-0 px-5 py-2 rounded-full border text-xs font-bold uppercase transition-all duration-300 border-hairline-border bg-smoky-glass text-white hover:bg-white/10"
                    >
                      {genre}
                    </button>
                  ))}
                </div>

                {/* Masonry Grid representing Layout Schema 2 */}
                <div className="grid grid-cols-2 gap-5">
                  {/* Featured Highlight Card */}
                  <div className="col-span-2 glass-card rounded-container-radius overflow-hidden group cursor-pointer hover:scale-[1.01] transition-transform duration-500 border border-hairline-border">
                    <div className="relative h-56 w-full">
                      <img
                        src="https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=1080&auto=format&fit=crop&q=80"
                        alt="Phonk Revolution"
                        className="w-full h-full object-cover filter brightness-75 group-hover:scale-105 transition-transform duration-1000"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-black/20 to-transparent"></div>
                      <div className="absolute bottom-5 left-5 right-5">
                        <span className="bg-[#FF3B30]/20 border border-[#FF3B30]/30 text-[#FF3B30] text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider mb-2 inline-block">
                          HOT DROP
                        </span>
                        <h3 className="font-lyric-display font-extrabold text-2xl text-white">Vapor Trails: The Phonk Revolution</h3>
                        <p className="text-white/60 text-xs mt-1">42 Tracks • Curated by AETHER</p>
                      </div>
                    </div>
                  </div>

                  {/* Standard card 2 */}
                  <div className="glass-card rounded-container-radius p-4 flex flex-col gap-3 group cursor-pointer hover:scale-[1.02] transition-transform duration-300">
                    <div className="aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/10 relative">
                      <img
                        src="https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80"
                        alt="Synthetic Dreams"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <div>
                      <h4 className="font-lyric-display font-bold text-sm text-white uppercase tracking-wider">SYNTHETIC DREAMS</h4>
                      <p className="text-white/60 text-xs mt-0.5">Cyberpunk Melodics</p>
                    </div>
                  </div>

                  {/* Standard card 3 */}
                  <div className="glass-card rounded-container-radius p-4 flex flex-col gap-3 group cursor-pointer hover:scale-[1.02] transition-transform duration-300">
                    <div className="aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/10 relative">
                      <img
                        src="https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=500&auto=format&fit=crop&q=80"
                        alt="Bass Theory"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <div>
                      <h4 className="font-lyric-display font-bold text-sm text-white uppercase tracking-wider">BASS THEORY</h4>
                      <p className="text-white/60 text-xs mt-0.5">Heavy Sub-lows</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Search Results list (visible when search query is not empty) */}
            {searchQuery.trim() !== '' && (
              <div className="flex-1 flex flex-col">
                {searchLoading && (
                  <div className="flex justify-center items-center py-12">
                    <div className="flex gap-2">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#FF3B30]" style={{ animation: `bounce 1.2s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                  </div>
                )}

                {!searchLoading && searchError && (
                  <div className="text-center py-8 text-[#FF3B30] text-sm">
                    {searchError}
                  </div>
                )}

                {!searchLoading && searchResults.length === 0 && !searchError && (
                  <div className="text-center py-8 text-white/40 text-sm">
                    No tracks found for "{searchQuery}"
                  </div>
                )}

                {!searchLoading && searchResults.length > 0 && (
                  <div className="flex flex-col gap-3 mb-8">
                    {searchResults.map((track, idx) => {
                      const isCurrent = player.currentTrack?.src === track.src;
                      const isPlaying = isCurrent && player.state.isPlaying;
                      const isLiked = isTrackLiked(track);

                      return (
                        <div
                          key={track.src}
                          onClick={() => playTrackFromPlaylist(searchResults, idx)}
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-300 cursor-pointer ${
                            isCurrent 
                              ? 'bg-white/10 border-white/20' 
                              : 'bg-smoky-glass border-hairline-border hover:bg-white/5 hover:border-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            {/* Cover Art */}
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/5 border border-white/10 relative flex-shrink-0">
                              <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <span className="material-symbols-outlined text-white text-xl">
                                  {isPlaying ? 'pause' : 'play_arrow'}
                                </span>
                              </div>
                            </div>

                            {/* Title and Artist */}
                            <div className="flex flex-col">
                              <span className="font-lyric-display font-bold text-sm text-white line-clamp-1">{track.title}</span>
                              <span className="text-text-muted text-xs line-clamp-1">{track.artist}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => toggleSaveTrack(track)}
                              className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 active:scale-95 transition-all"
                            >
                              <span 
                                className={`material-symbols-outlined text-xl ${isLiked ? 'text-[#FF3B30]' : 'text-white/60'}`}
                                style={{ fontVariationSettings: isLiked ? "'FILL' 1" : "'FILL' 0" }}
                              >
                                favorite
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Aux Tape Personal Library Tab */}
        {activeTab === 'library' && (
          <div className="flex-1 px-6 py-6 scrollbar-none w-full" style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '896px', marginLeft: 'auto', marginRight: 'auto', alignSelf: 'center', overflowY: 'auto', height: '100%' }}>
            {/* Profile Header section */}
            <section className="mb-8 flex flex-col sm:flex-row items-center sm:items-end gap-5">
              <div className="relative">
                <div className="w-24 h-24 rounded-container-radius overflow-hidden border border-hairline-border">
                  <img
                    src="https://images.unsplash.com/photo-1535712548855-50d41e7370aa?w=300&auto=format&fit=crop&q=80"
                    alt="User Profile"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-[#FF3B30] p-1 rounded-full flex items-center justify-center border border-[#050505]">
                  <span className="material-symbols-outlined text-white text-[12px] font-bold">verified</span>
                </div>
              </div>
              <div className="flex-1 text-center sm:text-left">
                <span className="font-label-caps text-[10px] text-text-muted tracking-widest uppercase">AUX TAPE LIBRARY</span>
                <h2 className="font-lyric-display font-extrabold text-2xl text-white mt-1">@AXL_METRIC</h2>
                <div className="flex justify-center sm:justify-start gap-6 mt-3" style={{ display: 'flex', flexDirection: 'row' }}>
                  <div className="flex flex-col">
                    <span className="font-lyric-display font-extrabold text-lg text-white">{savedTracks.length}</span>
                    <span className="font-label-caps text-[9px] text-text-muted tracking-widest uppercase">VERSE COUNT</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-lyric-display font-extrabold text-lg text-white">{Math.ceil(savedTracks.length / 5)}</span>
                    <span className="font-label-caps text-[9px] text-text-muted tracking-widest uppercase">COLLECTIONS</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2" style={{ display: 'flex', flexDirection: 'row' }}>
                <button className="bg-white text-black px-5 py-2 rounded-full font-label-caps text-[10px] font-bold uppercase hover:scale-105 transition-transform duration-300">
                  EDIT PROFILE
                </button>
                <button className="w-8 h-8 rounded-full border border-hairline-border bg-smoky-glass flex items-center justify-center text-white hover:bg-white/10 transition-colors">
                  <span className="material-symbols-outlined text-[16px]">share</span>
                </button>
              </div>
            </section>

            {/* Saved Verses Grid */}
            {savedTracks.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/30 py-16">
                <span className="material-symbols-outlined text-[48px]">library_music</span>
                <p className="text-sm">No saved verses yet. Double tap on the feed or heart search results to save loops!</p>
              </div>
            ) : (
              <section className="grid grid-cols-3 gap-5">
                {savedTracks.map((track, idx) => {
                  const isCurrent = player.currentTrack?.src === track.src;
                  const isPlaying = isCurrent && player.state.isPlaying;

                  return (
                    <div 
                      key={track.src} 
                      onClick={() => playTrackFromPlaylist(savedTracks, idx)}
                      className="aspect-square rounded-container-radius overflow-hidden group cursor-pointer border border-hairline-border bg-white/5 relative"
                    >
                      <img
                        src={track.cover}
                        alt={track.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-all duration-700"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-3 text-center">
                        <span className="material-symbols-outlined text-white text-3xl">
                          {isPlaying ? 'pause_circle' : 'play_circle'}
                        </span>
                        <span className="text-white font-lyric-display font-bold text-xs line-clamp-1">{track.title}</span>
                        <span className="text-white/60 text-[10px] line-clamp-1">{track.artist}</span>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
          </div>
        )}
      </main>

      {/* Glassmorphic Persistent Bottom Navigation Bar */}
      <nav
        className="absolute w-full z-50 bg-smoky-glass backdrop-blur-[60px] border-t border-hairline-border flex justify-around items-center"
        style={{
          bottom: 0,
          left: 0,
          right: 0,
          height: 'calc(64px + env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <button
          onClick={() => handleTabChange('discover')}
          className={`flex flex-col items-center justify-center gap-0.5 transition-all w-16 h-12 ${activeTab === 'discover'
            ? 'text-white scale-105 drop-shadow-[0_0_10px_rgba(255,59,48,0.4)]'
            : 'text-text-muted opacity-60 hover:opacity-100'
            }`}
        >
          <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: activeTab === 'discover' ? "'FILL' 1" : "'FILL' 0" }}>explore</span>
          <span className="font-label-caps text-[9px] uppercase tracking-wider">Discover</span>
        </button>

        <button
          onClick={() => handleTabChange('browse')}
          className={`flex flex-col items-center justify-center gap-0.5 transition-all w-16 h-12 ${activeTab === 'browse'
            ? 'text-white scale-105 drop-shadow-[0_0_10px_rgba(255,59,48,0.4)]'
            : 'text-text-muted opacity-60 hover:opacity-100'
            }`}
        >
          <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: activeTab === 'browse' ? "'FILL' 1" : "'FILL' 0" }}>trending_up</span>
          <span className="font-label-caps text-[9px] uppercase tracking-wider">Browse</span>
        </button>

        <button
          onClick={() => handleTabChange('library')}
          className={`flex flex-col items-center justify-center gap-0.5 transition-all w-16 h-12 ${activeTab === 'library'
            ? 'text-white scale-105 drop-shadow-[0_0_10px_rgba(255,59,48,0.4)]'
            : 'text-text-muted opacity-60 hover:opacity-100'
            }`}
        >
          <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: activeTab === 'library' ? "'FILL' 1" : "'FILL' 0" }}>library_music</span>
          <span className="font-label-caps text-[9px] uppercase tracking-wider">Library</span>
        </button>
      </nav>
    </div>
  );
}

// ─── Error Boundary — shows the real crash instead of a black screen ──────────
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('🔴 DROP CRASH:', error, info);
  }
  override render() {
    if (this.state.error) {
      return (
        <div style={{ background: '#0a0a0a', color: '#ff4444', fontFamily: 'monospace', padding: '24px', height: '100vh', overflowY: 'auto' }}>
          <h1 style={{ fontSize: '20px', marginBottom: '12px' }}>💥 App Crashed</h1>
          <pre style={{ fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#1a1a1a', padding: '16px', borderRadius: '8px', color: '#ff8888' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: '16px', padding: '10px 20px', background: '#ff4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function DemoWithBoundary() {
  return (
    <ErrorBoundary>
      <Demo />
    </ErrorBoundary>
  );
}

export default DemoWithBoundary;

