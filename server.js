import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import CryptoJS from 'crypto-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// In-memory cache for ultra-fast response
const cache = new Map();
function getCached(key, ttlMs = 300000) {
  const item = cache.get(key);
  if (item && Date.now() - item.time < ttlMs) {
    return item.data;
  }
  return null;
}
function setCache(key, data) {
  cache.set(key, { time: Date.now(), data });
}

// Decode HTML entities
function decodeHtml(html) {
  if (!html) return '';
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&copy;/g, '©');
}

// Ensure 500x500 high-res album image
function getHighResImage(url) {
  if (!url) return 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';
  return url.replace('50x50.jpg', '500x500.jpg').replace('150x150.jpg', '500x500.jpg');
}

// Decrypt DES-ECB media URL with JioSaavn key '38346591'
function decryptMediaUrl(encUrl, quality = '320') {
  if (!encUrl) return null;
  try {
    const key = CryptoJS.enc.Utf8.parse('38346591');
    const decrypted = CryptoJS.DES.decrypt({
      ciphertext: CryptoJS.enc.Base64.parse(encUrl)
    }, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7
    });
    let rawUrl = decrypted.toString(CryptoJS.enc.Utf8);
    if (!rawUrl) return null;

    const qStr = ['96', '160', '320'].includes(String(quality)) ? String(quality) : '320';
    rawUrl = rawUrl.replace(/_[0-9]+\.mp4$/, `_${qStr}.mp4`);
    return rawUrl;
  } catch (err) {
    return null;
  }
}

// Format raw JioSaavn song object
function formatSong(song, quality = '320') {
  if (!song) return null;
  const id = song.id || song.songid;
  const title = decodeHtml(song.song || song.title || 'Unknown Track');
  const artist = decodeHtml(
    song.more_info?.singers ||
    song.more_info?.primary_artists ||
    song.singers ||
    song.primary_artists ||
    song.artist ||
    'Unknown Artist'
  );
  const starring = decodeHtml(
    song.more_info?.starring ||
    song.starring ||
    ''
  );
  const album = decodeHtml(song.album || song.more_info?.album || title);
  const albumId = song.albumid || song.more_info?.album_id || '';
  const image = getHighResImage(song.image || song.more_info?.image);
  const duration = parseInt(song.duration || song.more_info?.duration || 0, 10);
  const year = song.year || song.more_info?.year || '';
  const language = song.language || song.more_info?.language || 'english';
  const hasLyrics = song.more_info?.has_lyrics === 'true' || song.has_lyrics === 'true' || false;
  const copyright = decodeHtml(song.more_info?.copyright_text || song.copyright_text || '');

  let audioUrl = null;
  if (song.encrypted_media_url) {
    audioUrl = decryptMediaUrl(song.encrypted_media_url, quality);
  } else if (song.more_info?.encrypted_media_url) {
    audioUrl = decryptMediaUrl(song.more_info.encrypted_media_url, quality);
  } else if (song.media_preview_url) {
    audioUrl = song.media_preview_url;
  }

  return {
    id,
    title,
    artist,
    starring,
    album,
    albumId,
    image,
    duration,
    year,
    language,
    audioUrl,
    hasLyrics,
    copyright
  };
}

// Upstream fetch with short timeout
async function fetchWithTimeout(url, opts = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// Default fallback data for Home view
const defaultCharts = [
  {
    id: '946682072',
    title: 'Most Searched Songs',
    subtitle: 'Global Top Charts',
    image: 'https://c.saavncdn.com/editorial/MostSearchedSongsHindi_20260824093050.jpg',
    count: 50,
    type: 'playlist'
  },
  {
    id: '110858205',
    title: 'Trending Today',
    subtitle: 'Daily Viral Hits',
    image: 'https://c.saavncdn.com/editorial/charts_TrendingToday_130861_20250303070317.jpg',
    count: 50,
    type: 'playlist'
  },
  {
    id: '1139074020',
    title: 'Most Streamed Love Songs',
    subtitle: 'Romantic Melodies',
    image: 'https://c.saavncdn.com/editorial/MostStreamedLoveSongs-Hindi_20260824045054.jpg',
    count: 50,
    type: 'playlist'
  },
  {
    id: '1167751270',
    title: 'Top Hits 2000s',
    subtitle: 'Nostalgia Favorites',
    image: 'https://c.saavncdn.com/editorial/charts_Hindi2000s_156632_20240408061838.jpg',
    count: 50,
    type: 'playlist'
  }
];

const defaultPlaylists = [
  {
    id: '58057412',
    title: "Essential Hits & Anthems",
    subtitle: 'Over 1M+ Monthly Listeners',
    image: 'https://c.saavncdn.com/editorial/Let_sPlayArijitSinghHindi_20240812070403.jpg',
    count: 30,
    type: 'playlist'
  },
  {
    id: '1302033575',
    title: 'Global Romantic Hits',
    subtitle: 'Heartfelt Melodies',
    image: 'https://c.saavncdn.com/editorial/RomanticHits2026Hindi_20260707083404.jpg',
    count: 30,
    type: 'playlist'
  },
  {
    id: '903166403',
    title: 'Best of Acoustic Pop',
    subtitle: 'Unplugged Sessions',
    image: 'https://c.saavncdn.com/editorial/BestOfRomanceHindi_20260901103522.jpg',
    count: 30,
    type: 'playlist'
  }
];

const defaultAlbums = [
  {
    id: 'HIIQCV1i',
    title: 'Trending New Releases',
    subtitle: 'Fresh Master Tracks',
    image: 'https://c.saavncdn.com/202/Tujh-Mein-Basi-Meri-Jaan-From-Prahaar-The-Untold-Story-Of-Ujjwal-Nikam-Hindi-2026-20261008171013-500x500.jpg',
    year: '2026',
    type: 'album'
  },
  {
    id: 'WlTeqcgx',
    title: 'Club & Beat Explosions',
    subtitle: 'Dance & Energy',
    image: 'https://c.saavncdn.com/950/Afsaana-Banaaya-Aapne-From-Gunmaaster-G9-Hindi-2026-20260921193544-500x500.jpg',
    year: '2026',
    type: 'album'
  }
];

const defaultQuickCategories = [
  { id: 'cat-pop', title: "Today's Top Hits", query: 'Top Hits', color: 'linear-gradient(135deg, #1e3a8a, #3b82f6)' },
  { id: 'cat-chill', title: 'Chill & Lo-Fi', query: 'Lofi Chill', color: 'linear-gradient(135deg, #4c1d95, #8b5cf6)' },
  { id: 'cat-rock', title: 'Rock Classics', query: 'Rock Classics', color: 'linear-gradient(135deg, #831843, #ec4899)' },
  { id: 'cat-hiphop', title: 'Hip-Hop Vibes', query: 'Hip Hop', color: 'linear-gradient(135deg, #78350f, #f59e0b)' },
  { id: 'cat-workout', title: 'Workout Energy', query: 'Workout', color: 'linear-gradient(135deg, #064e3b, #10b981)' },
  { id: 'cat-focus', title: 'Deep Focus & Study', query: 'Study Focus', color: 'linear-gradient(135deg, #134e4a, #14b8a6)' }
];

// 1. HOME API
app.get('/api/home', async (req, res) => {
  const cached = getCached('home_data', 600000);
  if (cached) return res.json(cached);

  // Try live upstream proxy
  try {
    const resp = await fetchWithTimeout('https://music-01l9.onrender.com/api/home', {}, 3000);
    if (resp.ok) {
      const data = await resp.json();
      if (data.success && data.charts?.length) {
        setCache('home_data', data);
        return res.json(data);
      }
    }
  } catch (e) {}

  // Fallback to direct launch data
  try {
    const url = 'https://www.jiosaavn.com/api.php?__call=webapi.get&api_version=4&_format=json&_marker=0&ctx=web6dot0&token=1&type=launch_data';
    const saavnRes = await fetch(url);
    const saavnData = await saavnRes.json();

    const charts = (saavnData.charts || []).map(c => ({
      id: c.id || c.listid,
      title: decodeHtml(c.title),
      subtitle: decodeHtml(c.subtitle || 'Top Chart'),
      image: getHighResImage(c.image),
      count: parseInt(c.count || 0, 10),
      type: 'playlist'
    }));

    const featuredPlaylists = (saavnData.featured_playlists || saavnData.top_playlists || []).map(p => ({
      id: p.id || p.listid,
      title: decodeHtml(p.title),
      subtitle: decodeHtml(p.subtitle || 'Curated Playlist'),
      image: getHighResImage(p.image),
      count: parseInt(p.count || 0, 10),
      type: 'playlist'
    }));

    const newAlbums = (saavnData.new_albums || []).map(a => ({
      id: a.id || a.albumid,
      title: decodeHtml(a.title),
      subtitle: decodeHtml(a.subtitle || a.header_desc || 'New Release'),
      image: getHighResImage(a.image),
      year: a.year || '',
      type: 'album'
    }));

    const result = {
      success: true,
      charts: charts.length ? charts : defaultCharts,
      featuredPlaylists: featuredPlaylists.length ? featuredPlaylists : defaultPlaylists,
      newAlbums: newAlbums.length ? newAlbums : defaultAlbums,
      quickCategories: defaultQuickCategories
    };

    setCache('home_data', result);
    return res.json(result);
  } catch (err) {
    return res.json({
      success: true,
      charts: defaultCharts,
      featuredPlaylists: defaultPlaylists,
      newAlbums: defaultAlbums,
      quickCategories: defaultQuickCategories
    });
  }
});

// 2. SEARCH API (DIRECT JIOSAAVN + MULTILINGUAL SUPPORT + PROXY FALLBACK)
app.get('/api/search', async (req, res) => {
  const rawQuery = (req.query.q || '').toString();
  const query = rawQuery.normalize('NFKC').trim();
  const language = (req.query.language || req.query.lang || '').toString().toLowerCase().trim();
  const quality = req.query.quality || '320';
  if (!query) {
    return res.json({ success: false, message: 'Query parameter q is required' });
  }

  const cacheKey = `search_${query}_${language}_${quality}`;
  const cached = getCached(cacheKey, 180000);
  if (cached) return res.json(cached);

  try {
    // If language is specified, craft targeted search query
    let effectiveQuery = query;
    if (language && language !== 'all') {
      const qLower = query.toLowerCase();
      if (!qLower.includes(language)) {
        if (language === 'korean' || language === 'k-pop') {
          effectiveQuery = `${query} K-Pop`;
        } else if (language === 'chinese' || language === 'c-pop') {
          effectiveQuery = `${query} Chinese`;
        } else {
          effectiveQuery = `${query} ${language}`;
        }
      }
    }

    // High-speed direct JioSaavn search & autocomplete
    const songsUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&includeMetaTags=1&q=${encodeURIComponent(effectiveQuery)}&p=1&n=40`;
    const autoUrl = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&cc=in&includeMetaTags=1&query=${encodeURIComponent(query)}`;

    const [songsRes, autoRes] = await Promise.all([
      fetch(songsUrl).then(r => r.json()).catch(() => ({ results: [] })),
      fetch(autoUrl).then(r => r.json()).catch(() => ({}))
    ]);

    let rawSongs = songsRes.results || [];
    let songs = rawSongs.map(s => formatSong(s, quality)).filter(Boolean);

    // If query is an album, movie, or actor with song_pids in autocomplete:
    // Extract song_pids from matching albums or topquery to include full movie tracklists
    const matchedAlbums = (autoRes.albums?.data || []).concat(autoRes.topquery?.data?.filter(t => t.type === 'album') || []);
    const extraPids = new Set();
    matchedAlbums.slice(0, 3).forEach(alb => {
      const pidsStr = alb.more_info?.song_pids || '';
      if (pidsStr) {
        pidsStr.split(',').map(p => p.trim()).filter(Boolean).forEach(pid => extraPids.add(pid));
      }
    });

    // Also collect song IDs from autoRes.songs.data
    const autoSongIds = (autoRes.songs?.data || []).map(s => s.id).filter(Boolean);
    autoSongIds.slice(0, 8).forEach(pid => extraPids.add(pid));

    let extraSongs = [];
    if (extraPids.size > 0) {
      try {
        const pidList = Array.from(extraPids).slice(0, 16).join(',');
        const pidsDetailUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0&_format=json&pids=${encodeURIComponent(pidList)}`;
        const pidsRes = await fetch(pidsDetailUrl);
        const pidsData = await pidsRes.json();
        extraSongs = Object.values(pidsData).map(raw => formatSong(raw, quality)).filter(Boolean);
      } catch (err) {
        console.warn('Extra pids resolution note:', err.message);
      }
    }

    // Combine direct search results, autocomplete songs, and movie-related tracks
    const allCandidatesMap = new Map();
    // Direct search songs
    songs.forEach(s => allCandidatesMap.set(s.id, s));
    // Movie album / autocomplete songs
    extraSongs.forEach(s => {
      if (!allCandidatesMap.has(s.id)) {
        allCandidatesMap.set(s.id, s);
      }
    });

    let combinedSongs = Array.from(allCandidatesMap.values());

    // Intelligent relevance scoring: Put exact and official title match on top,
    // and movie-related songs right beneath it!
    function scoreRelevance(song, q, lang) {
      if (!song) return -1000;
      const cleanQ = (q || '').trim().toLowerCase();
      if (!cleanQ) return 0;

      const title = (song.title || '').trim().toLowerCase();
      const album = (song.album || '').trim().toLowerCase();
      const artist = (song.artist || '').trim().toLowerCase();

      let score = 0;

      // Clean title without bracket additions for exact comparison
      const pureTitle = title.replace(/\s*\([^)]*\)/g, '').replace(/\s*-\s*.*/g, '').trim();

      // 1. Exact Title Match (e.g. searching "Sher" and title is "Sher")
      if (pureTitle === cleanQ || title === cleanQ) {
        score += 2000;
      } else if (pureTitle.startsWith(cleanQ + ' ') || pureTitle.endsWith(' ' + cleanQ)) {
        score += 1500;
      } else {
        const wordRegex = new RegExp(`(^|\\s|[^a-z0-9])${cleanQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s|[^a-z0-9])`, 'i');
        if (wordRegex.test(pureTitle) || wordRegex.test(title)) {
          score += 1100;
        } else if (pureTitle.startsWith(cleanQ) || title.startsWith(cleanQ)) {
          score += 900;
        } else if (pureTitle.includes(cleanQ) || title.includes(cleanQ)) {
          score += 600;
        }
      }

      // 2. Official release vs Cover/Derivative penalties
      if (!cleanQ.includes('cover') && (title.includes('cover') || artist.includes('cover'))) {
        score -= 400;
      }
      if (!cleanQ.includes('karaoke') && (title.includes('karaoke') || album.includes('karaoke'))) {
        score -= 500;
      }
      if (!cleanQ.includes('remix') && (title.includes('remix') || title.includes('dj '))) {
        score -= 200;
      }
      if (!cleanQ.includes('slowed') && (title.includes('slowed') || title.includes('reverb') || title.includes('8d'))) {
        score -= 300;
      }
      if (title.includes('official') || (song.copyright && !song.copyright.toLowerCase().includes('cover'))) {
        score += 80;
      }

      // 3. Movie/Album Match (Movie tracklist songs related to query e.g. "Shershaah")
      if (album === cleanQ || album.startsWith(cleanQ)) {
        score += 350;
      } else if (album.includes(cleanQ)) {
        score += 200;
      }

      // 4. Artist Match
      if (artist.includes(cleanQ)) {
        score += 150;
      }

      // 5. Language preference bonus
      if (lang && lang !== 'all' && (song.language || '').toLowerCase().includes(lang)) {
        score += 250;
      }

      return score;
    }

    combinedSongs.sort((a, b) => scoreRelevance(b, query, language) - scoreRelevance(a, query, language));
    songs = combinedSongs;

    // If direct songs returned fewer than 2, try upstream proxy
    if (songs.length < 2) {
      try {
        const upstreamUrl = `https://music-01l9.onrender.com/api/search?q=${encodeURIComponent(query)}&quality=${quality}`;
        const upRes = await fetchWithTimeout(upstreamUrl, {}, 3000);
        if (upRes.ok) {
          const upData = await upRes.json();
          if (upData.success && upData.results?.songs?.length) {
            setCache(cacheKey, upData);
            return res.json(upData);
          }
        }
      } catch (e) {}
    }

    // Resolve any songs lacking audioUrl
    const songsNeedingMedia = songs.filter(s => !s.audioUrl);
    if (songsNeedingMedia.length > 0) {
      try {
        const pids = songsNeedingMedia.slice(0, 20).map(s => s.id).join(',');
        const detailUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0&_format=json&pids=${pids}`;
        const detailRes = await fetch(detailUrl);
        const detailData = await detailRes.json();
        songs.forEach(s => {
          if (!s.audioUrl && detailData[s.id]) {
            const raw = detailData[s.id];
            if (raw.encrypted_media_url) {
              s.audioUrl = decryptMediaUrl(raw.encrypted_media_url, quality);
            }
          }
        });
      } catch (err) {
        console.warn('Song resolution warning:', err.message);
      }
    }

    const albums = (autoRes.albums?.data || []).map(a => ({
      id: a.id,
      title: decodeHtml(a.title),
      subtitle: decodeHtml(a.description || a.music || 'Album'),
      image: getHighResImage(a.image),
      type: 'album'
    }));

    const playlists = (autoRes.playlists?.data || []).map(p => ({
      id: p.id,
      title: decodeHtml(p.title),
      subtitle: decodeHtml(p.description || 'Playlist'),
      image: getHighResImage(p.image),
      type: 'playlist'
    }));

    // Artists from autocomplete and topquery
    const autoArtists = (autoRes.artists?.data || []).concat(autoRes.topquery?.data?.filter(t => t.type === 'artist') || []);
    const artists = autoArtists.map(ar => ({
      id: ar.id || ar.artistid,
      title: decodeHtml(ar.title || ar.name),
      subtitle: decodeHtml(ar.description || ar.role || 'Artist'),
      image: getHighResImage(ar.image),
      type: 'artist'
    }));

    const finalResult = {
      success: true,
      query,
      results: {
        songs,
        albums,
        playlists,
        artists
      }
    };

    setCache(cacheKey, finalResult);
    return res.json(finalResult);
  } catch (err) {
    console.error('Search error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. SONG DETAILS API
app.get('/api/song/:id', async (req, res) => {
  const id = req.params.id;
  const quality = req.query.quality || '320';
  if (!id) return res.status(400).json({ success: false, message: 'Song ID required' });

  try {
    const detailUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0&_format=json&pids=${encodeURIComponent(id)}`;
    const dRes = await fetch(detailUrl);
    const dData = await dRes.json();
    const rawSong = dData[id];
    if (rawSong) {
      const song = formatSong(rawSong, quality);
      if (song?.audioUrl) return res.json({ success: true, song });
    }
  } catch (err) {}

  try {
    const upstreamUrl = `https://music-01l9.onrender.com/api/song/${encodeURIComponent(id)}?quality=${quality}`;
    const upRes = await fetchWithTimeout(upstreamUrl, {}, 3500);
    if (upRes.ok) {
      const data = await upRes.json();
      if (data.success && data.song?.audioUrl) {
        return res.json(data);
      }
    }
  } catch (e) {}

  return res.status(404).json({ success: false, message: 'Song not found' });
});

// 4. PLAYLIST DETAILS API
app.get('/api/playlist/:id', async (req, res) => {
  const id = req.params.id;
  const quality = req.query.quality || '320';
  if (!id) return res.status(400).json({ success: false, message: 'Playlist ID required' });

  try {
    const url = `https://www.jiosaavn.com/api.php?__call=playlist.getDetails&_format=json&_marker=0&cc=in&listid=${encodeURIComponent(id)}`;
    const pRes = await fetch(url);
    const pData = await pRes.json();

    const title = decodeHtml(pData.title || pData.listname || 'Playlist');
    const subtitle = decodeHtml(pData.subtitle || pData.header_desc || `${pData.list_count || 0} Songs`);
    const image = getHighResImage(pData.image);
    const rawSongs = pData.songs || [];
    const songs = rawSongs.map(s => formatSong(s, quality)).filter(Boolean);

    if (songs.length > 0) {
      return res.json({
        success: true,
        id,
        title,
        subtitle,
        image,
        songs
      });
    }
  } catch (err) {}

  try {
    const upstreamUrl = `https://music-01l9.onrender.com/api/playlist/${encodeURIComponent(id)}?quality=${quality}`;
    const upRes = await fetchWithTimeout(upstreamUrl, {}, 4000);
    if (upRes.ok) {
      const data = await upRes.json();
      if (data.success && data.songs?.length) {
        return res.json(data);
      }
    }
  } catch (e) {}

  return res.status(500).json({ success: false, error: 'Failed to load playlist' });
});

// 5. ALBUM DETAILS API
app.get('/api/album/:id', async (req, res) => {
  const id = req.params.id;
  const quality = req.query.quality || '320';
  if (!id) return res.status(400).json({ success: false, message: 'Album ID required' });

  try {
    const url = `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&_format=json&_marker=0&cc=in&albumid=${encodeURIComponent(id)}`;
    const aRes = await fetch(url);
    const aData = await aRes.json();

    const title = decodeHtml(aData.title || aData.name || 'Album');
    const subtitle = decodeHtml(aData.subtitle || aData.primary_artists || 'Album');
    const image = getHighResImage(aData.image);
    const year = aData.year || '';
    const rawSongs = aData.songs || aData.list || [];
    const songs = rawSongs.map(s => formatSong(s, quality)).filter(Boolean);

    if (songs.length > 0) {
      return res.json({
        success: true,
        id,
        title,
        subtitle,
        image,
        year,
        songs
      });
    }
  } catch (err) {}

  try {
    const upstreamUrl = `https://music-01l9.onrender.com/api/album/${encodeURIComponent(id)}?quality=${quality}`;
    const upRes = await fetchWithTimeout(upstreamUrl, {}, 4000);
    if (upRes.ok) {
      const data = await upRes.json();
      if (data.success && data.songs?.length) {
        return res.json(data);
      }
    }
  } catch (e) {}

  return res.status(500).json({ success: false, error: 'Failed to load album' });
});

// 5b. ARTIST DETAILS & PROFILE API
app.get('/api/artist/:id', async (req, res) => {
  const id = req.params.id;
  const quality = req.query.quality || '320';
  if (!id) return res.status(400).json({ success: false, message: 'Artist ID required' });

  const cacheKey = `artist_${id}_${quality}`;
  const cached = getCached(cacheKey, 600000);
  if (cached) return res.json(cached);

  try {
    const url = `https://www.jiosaavn.com/api.php?__call=artist.getArtistPageDetails&_format=json&_marker=0&cc=in&artistId=${encodeURIComponent(id)}&n_song=40&n_album=12`;
    const aRes = await fetch(url);
    const aData = await aRes.json();

    const name = decodeHtml(aData.name || 'Artist');
    const subtitle = decodeHtml(aData.subtitle || aData.dominantType || 'Verified Artist');
    const image = getHighResImage(aData.image);
    const fanCount = aData.follower_count || aData.fan_count || '0';
    const isVerified = aData.isVerified === true || aData.isVerified === 'true';
    const bio = aData.bio ? decodeHtml(Array.isArray(aData.bio) ? aData.bio[0]?.text : (aData.bio.text || '')) : '';

    const rawSongs = aData.topSongs?.songs || aData.topSongs || [];
    const songs = (Array.isArray(rawSongs) ? rawSongs : []).map(s => formatSong(s, quality)).filter(Boolean);

    // Resolve any songs lacking audioUrl
    const songsNeedingMedia = songs.filter(s => !s.audioUrl);
    if (songsNeedingMedia.length > 0) {
      try {
        const pids = songsNeedingMedia.slice(0, 15).map(s => s.id).join(',');
        const detailUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0&_format=json&pids=${pids}`;
        const detailRes = await fetch(detailUrl);
        const detailData = await detailRes.json();
        songs.forEach(s => {
          if (!s.audioUrl && detailData[s.id]) {
            const raw = detailData[s.id];
            if (raw.encrypted_media_url) {
              s.audioUrl = decryptMediaUrl(raw.encrypted_media_url, quality);
            }
          }
        });
      } catch (err) {}
    }

    const rawAlbums = aData.topAlbums?.albums || aData.topAlbums || [];
    const albums = (Array.isArray(rawAlbums) ? rawAlbums : []).map(a => ({
      id: a.id || a.albumid,
      title: decodeHtml(a.title || a.name),
      subtitle: decodeHtml(a.year || 'Album'),
      image: getHighResImage(a.image),
      type: 'album'
    }));

    const result = {
      success: true,
      id,
      name,
      subtitle,
      image,
      fanCount,
      isVerified,
      bio,
      songs,
      albums
    };

    setCache(cacheKey, result);
    return res.json(result);
  } catch (err) {
    console.error('Artist fetch error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load artist' });
  }
});

// 6. SYNCED LYRICS API (LRCLIB)
app.get('/api/lyrics', async (req, res) => {
  const { title, artist, duration } = req.query;
  if (!title) return res.json({ success: false, message: 'Title is required' });

  const cleanTitle = title.replace(/\(.*?\)|\[.*?\]/g, '').trim();
  const cleanArtist = (artist || '').split(',')[0].replace(/&/g, '').trim();

  // Try direct LRCLIB get
  try {
    let getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`;
    if (duration && !isNaN(duration) && Number(duration) > 0) {
      getUrl += `&duration=${Math.round(Number(duration))}`;
    }

    const lrcRes = await fetch(getUrl, {
      headers: { 'User-Agent': 'AuraMusic/2.0 (https://github.com)' }
    });

    if (lrcRes.ok) {
      const lrcData = await lrcRes.json();
      if (lrcData.syncedLyrics || lrcData.plainLyrics) {
        return res.json({
          success: true,
          syncedLyrics: lrcData.syncedLyrics,
          plainLyrics: lrcData.plainLyrics
        });
      }
    }
  } catch (e) {}

  // Fallback to LRCLIB search
  try {
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle + ' ' + cleanArtist)}`;
    const sRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'AuraMusic/2.0 (https://github.com)' }
    });
    if (sRes.ok) {
      const items = await sRes.json();
      if (Array.isArray(items) && items.length > 0) {
        const best = items.find(i => i.syncedLyrics) || items[0];
        return res.json({
          success: true,
          syncedLyrics: best.syncedLyrics || null,
          plainLyrics: best.plainLyrics || null
        });
      }
    }
  } catch (err) {
    console.error('Lyrics error:', err.message);
  }

  return res.json({ success: false, message: 'Lyrics not found' });
});

// 7. MP3 DOWNLOAD STREAMER
app.get('/api/download', async (req, res) => {
  const { url, filename } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  const safeFilename = (filename || 'track.mp3').replace(/[^a-zA-Z0-9 ._\-]/g, '');

  try {
    const audioRes = await fetch(url);
    if (!audioRes.ok) {
      return res.status(audioRes.status).send('Failed to fetch audio stream');
    }

    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', audioRes.headers.get('content-type') || 'audio/mpeg');
    if (audioRes.headers.get('content-length')) {
      res.setHeader('Content-Length', audioRes.headers.get('content-length'));
    }

    const arrayBuffer = await audioRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).send('Download error');
  }
});

// 8. SIMILAR / RELATED SONGS API (AUTO-PLAY NEXT)
app.get('/api/similar', async (req, res) => {
  const { title, artist, language, quality = '320' } = req.query;
  const query = (artist && artist !== 'Unknown Artist' && artist !== 'Aura Music') 
    ? `${artist}` 
    : (title || 'top songs');

  const cacheKey = `similar_${encodeURIComponent(query)}_${quality}`;
  const cached = getCached(cacheKey, 600000);
  if (cached) return res.json(cached);

  try {
    const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&n=20&p=1&_marker=0&ctx=android&q=${encodeURIComponent(query)}`;
    const sRes = await fetch(searchUrl);
    const sData = await sRes.json();
    const rawList = sData.results || [];
    let songs = rawList.map(s => formatSong(s, quality)).filter(Boolean);

    // Resolve audio URLs if needed
    const needAudio = songs.filter(s => !s.audioUrl).slice(0, 15);
    if (needAudio.length > 0) {
      try {
        const pids = needAudio.map(s => s.id).join(',');
        const detailUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0&_format=json&pids=${pids}`;
        const dRes = await fetch(detailUrl);
        const dData = await dRes.json();
        songs.forEach(s => {
          if (!s.audioUrl && dData[s.id]?.encrypted_media_url) {
            s.audioUrl = decryptMediaUrl(dData[s.id].encrypted_media_url, quality);
          }
        });
      } catch (err) {}
    }

    const validSongs = songs.filter(s => s.audioUrl);
    const result = { success: true, songs: validSongs };
    setCache(cacheKey, result);
    return res.json(result);
  } catch (err) {
    return res.json({ success: false, songs: [] });
  }
});

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// SPA Catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server if not running serverless
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`✨ Aura Music Server running on http://localhost:${PORT}`);
    console.log('🎵 100% Ad-Free Master Streaming Engine Activated');
  });
}

export default app;
