// Funeral track metadata (shared with FuneralDJ and Profile Ghost)
// url: optional fallback (royalty-free). Server files at /api/static/funeral/{id}.mp3 take precedence.
export const FUNERAL_TRACKS: Record<string, { name: string; artist: string; url?: string }> = {
  astronomia: { name: 'Astronomia (Coffin Dance)', artist: 'Vicetone & Tony Igy', url: 'https://assets.mixkit.co/music/preview/mixkit-game-over-641.mp3' },
  sax: { name: 'Epic Sax Guy', artist: 'Sunstroke Project', url: 'https://assets.mixkit.co/music/preview/mixkit-winning-chimes-2019.mp3' },
  ussr: { name: 'Soviet Anthem (Trap Remix)', artist: 'Mother Russia', url: 'https://assets.mixkit.co/music/preview/mixkit-sad-melody-639.mp3' },
  sad: { name: 'Sad Violin', artist: 'Meme Orchestra', url: 'https://assets.mixkit.co/music/preview/mixkit-sad-melody-639.mp3' }
};
