/**
 * library.js - Versioned Storage & Data Management for Aura Music
 * Handles Liked Songs, Custom Playlists, Recent Searches, Playback State & Audio Settings.
 */

class MusicLibrary {
  constructor() {
    this.STORAGE_VERSION = 2;
    this.STORE_KEY = 'aura_store_v2';
    
    // Legacy keys for migration
    this.LEGACY_LIKED = 'aura_liked_songs';
    this.LEGACY_PLAYLISTS = 'aura_playlists';
    this.LEGACY_HISTORY = 'aura_recent_history';
    this.LEGACY_RECENT_SEARCHES = 'aura_recent_searches';

    this.state = {
      version: this.STORAGE_VERSION,
      likedSongs: [],
      playlists: [
        {
          id: 'favorites',
          name: 'My Chill Mix',
          description: 'Personal favorite tracks',
          createdAt: Date.now(),
          songs: []
        }
      ],
      history: [],
      recentSearches: [],
      eqSettings: {
        preset: 'flat',
        preamp: 0,
        gains: [0, 0, 0, 0, 0]
      },
      queueState: {
        queue: [],
        originalQueue: [],
        queueIndex: -1,
        currentTrack: null,
        playbackPosition: 0,
        isShuffled: false,
        repeatMode: 'off'
      },
      downloadedSongs: []
    };

    this.initStore();
  }

  // --- Safe Storage & Migration ---
  initStore() {
    try {
      const raw = localStorage.getItem(this.STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.state = {
            ...this.state,
            ...parsed,
            version: this.STORAGE_VERSION
          };
          // Ensure arrays exist
          if (!Array.isArray(this.state.likedSongs)) this.state.likedSongs = [];
          if (!Array.isArray(this.state.playlists)) this.state.playlists = [];
          if (!Array.isArray(this.state.history)) this.state.history = [];
          if (!Array.isArray(this.state.recentSearches)) this.state.recentSearches = [];
          if (!Array.isArray(this.state.downloadedSongs)) this.state.downloadedSongs = [];
          return;
        }
      }
    } catch (e) {
      console.warn('Storage read warning, falling back to migration/defaults:', e);
    }

    // Attempt migration from v1 legacy keys
    this.migrateFromV1();
    this.saveStore();
  }

  migrateFromV1() {
    try {
      const oldLiked = localStorage.getItem(this.LEGACY_LIKED);
      if (oldLiked) {
        const parsed = JSON.parse(oldLiked);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.state.likedSongs = parsed;
        }
      }

      const oldPlaylists = localStorage.getItem(this.LEGACY_PLAYLISTS);
      if (oldPlaylists) {
        const parsed = JSON.parse(oldPlaylists);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.state.playlists = parsed;
        }
      }

      const oldHistory = localStorage.getItem(this.LEGACY_HISTORY);
      if (oldHistory) {
        const parsed = JSON.parse(oldHistory);
        if (Array.isArray(parsed)) {
          this.state.history = parsed;
        }
      }

      const oldSearches = localStorage.getItem(this.LEGACY_RECENT_SEARCHES);
      if (oldSearches) {
        const parsed = JSON.parse(oldSearches);
        if (Array.isArray(parsed)) {
          this.state.recentSearches = parsed;
        }
      }
    } catch (err) {
      console.error('Migration error:', err);
    }
  }

  saveStore() {
    try {
      localStorage.setItem(this.STORE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('LocalStorage save failed, quota exceeded or storage disabled:', e);
    }
  }

  // --- Stable Track Identifier ---
  getTrackId(track) {
    if (!track) return '';
    if (typeof track === 'string') return track;
    if (track.id) return String(track.id);
    const title = (track.title || '').trim().toLowerCase();
    const artist = (track.artist || '').trim().toLowerCase();
    return `${title}:::${artist}`.replace(/[^a-z0-9]/g, '_');
  }

  // --- Liked / Favourite Songs ---
  isLiked(songOrId) {
    const id = this.getTrackId(songOrId);
    if (!id) return false;
    return this.state.likedSongs.some(s => this.getTrackId(s) === id);
  }

  toggleLike(song) {
    if (!song) return false;
    const songId = this.getTrackId(song);
    if (!songId) return false;

    const existingIndex = this.state.likedSongs.findIndex(s => this.getTrackId(s) === songId);
    let newState = false;

    if (existingIndex >= 0) {
      // Remove from liked
      this.state.likedSongs.splice(existingIndex, 1);
      newState = false;
    } else {
      // Add full metadata to preserve offline / persisted display
      const fullSong = {
        id: song.id || songId,
        title: song.title || 'Unknown Title',
        artist: song.artist || 'Unknown Artist',
        album: song.album || song.title || '',
        albumId: song.albumId || '',
        image: song.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
        duration: parseInt(song.duration || 0, 10),
        audioUrl: song.audioUrl || '',
        year: song.year || '',
        language: song.language || 'english',
        likedAt: Date.now()
      };
      this.state.likedSongs.unshift(fullSong);
      newState = true;
    }

    this.saveStore();
    return newState;
  }

  getLikedSongs() {
    return [...this.state.likedSongs];
  }

  // --- Downloaded Songs Collection (App Offline / Saved in App) ---
  getDownloadedSongs() {
    return [...(this.state.downloadedSongs || [])];
  }

  isDownloaded(songOrId) {
    const id = this.getTrackId(songOrId);
    if (!id) return false;
    return (this.state.downloadedSongs || []).some(s => this.getTrackId(s) === id);
  }

  addDownloadedSong(song) {
    if (!song) return;
    if (!Array.isArray(this.state.downloadedSongs)) {
      this.state.downloadedSongs = [];
    }
    const songId = this.getTrackId(song);
    const existingIndex = this.state.downloadedSongs.findIndex(s => this.getTrackId(s) === songId);
    const fullSong = {
      id: song.id || songId,
      title: song.title || 'Unknown Title',
      artist: song.artist || 'Unknown Artist',
      album: song.album || song.title || '',
      duration: song.duration || 0,
      image: song.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
      audioUrl: song.audioUrl || '',
      downloadedAt: Date.now()
    };

    if (existingIndex >= 0) {
      this.state.downloadedSongs[existingIndex] = fullSong;
    } else {
      this.state.downloadedSongs.unshift(fullSong);
    }
    this.saveStore();
  }

  removeDownloadedSong(songOrId) {
    const id = this.getTrackId(songOrId);
    if (!id || !Array.isArray(this.state.downloadedSongs)) return;
    this.state.downloadedSongs = this.state.downloadedSongs.filter(s => this.getTrackId(s) !== id);
    this.saveStore();
  }

  // --- Custom Playlists ---
  getPlaylists() {
    return [...this.state.playlists];
  }

  getPlaylist(id) {
    return this.state.playlists.find(p => p.id === id);
  }

  createPlaylist(name, description = '') {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('Playlist name cannot be empty');

    // Prevent duplicate playlist names
    const existing = this.state.playlists.find(p => p.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) {
      return existing;
    }

    const newPlaylist = {
      id: 'pl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: cleanName,
      description: description.trim(),
      createdAt: Date.now(),
      songs: []
    };

    this.state.playlists.push(newPlaylist);
    this.saveStore();
    return newPlaylist;
  }

  updatePlaylist(id, updates = {}) {
    const pl = this.getPlaylist(id);
    if (!pl) return null;

    if (updates.name && updates.name.trim()) {
      pl.name = updates.name.trim();
    }
    if (updates.description !== undefined) {
      pl.description = updates.description.trim();
    }
    if (Array.isArray(updates.songs)) {
      pl.songs = updates.songs;
    }

    pl.updatedAt = Date.now();
    this.saveStore();
    return pl;
  }

  deletePlaylist(id) {
    const initialLen = this.state.playlists.length;
    this.state.playlists = this.state.playlists.filter(p => p.id !== id);
    const deleted = this.state.playlists.length < initialLen;
    if (deleted) this.saveStore();
    return deleted;
  }

  addToPlaylist(playlistId, song) {
    const pl = this.getPlaylist(playlistId);
    if (!pl || !song) return false;

    const trackId = this.getTrackId(song);
    // Prevent duplicate entries
    const exists = pl.songs.some(s => this.getTrackId(s) === trackId);
    if (exists) return false;

    const fullSong = {
      id: song.id || trackId,
      title: song.title || 'Unknown Title',
      artist: song.artist || 'Unknown Artist',
      album: song.album || '',
      albumId: song.albumId || '',
      image: song.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
      duration: parseInt(song.duration || 0, 10),
      audioUrl: song.audioUrl || '',
      year: song.year || ''
    };

    pl.songs.push(fullSong);
    pl.updatedAt = Date.now();
    this.saveStore();
    return true;
  }

  removeFromPlaylist(playlistId, songId) {
    const pl = this.getPlaylist(playlistId);
    if (!pl) return false;

    const targetId = this.getTrackId(songId);
    const initialLen = pl.songs.length;
    pl.songs = pl.songs.filter(s => this.getTrackId(s) !== targetId);
    const removed = pl.songs.length < initialLen;
    if (removed) {
      pl.updatedAt = Date.now();
      this.saveStore();
    }
    return removed;
  }

  // --- Recent Searches ---
  getRecentSearches() {
    return [...this.state.recentSearches];
  }

  addRecentSearch(query) {
    const q = (query || '').trim();
    if (!q) return;

    this.state.recentSearches = this.state.recentSearches.filter(
      item => item.toLowerCase() !== q.toLowerCase()
    );
    this.state.recentSearches.unshift(q);
    if (this.state.recentSearches.length > 12) {
      this.state.recentSearches.pop();
    }
    this.saveStore();
  }

  removeRecentSearch(query) {
    const q = (query || '').trim().toLowerCase();
    this.state.recentSearches = this.state.recentSearches.filter(
      item => item.toLowerCase() !== q
    );
    this.saveStore();
  }

  clearRecentSearches() {
    this.state.recentSearches = [];
    this.saveStore();
  }

  // --- Recently Played History ---
  addToHistory(song) {
    if (!song) return;
    const songId = this.getTrackId(song);
    this.state.history = this.state.history.filter(s => this.getTrackId(s) !== songId);
    this.state.history.unshift(song);
    if (this.state.history.length > 40) {
      this.state.history.pop();
    }
    this.saveStore();
  }

  getHistory() {
    return [...this.state.history];
  }

  // --- Equalizer Settings Persistence ---
  getEqSettings() {
    return {
      preset: this.state.eqSettings?.preset || 'flat',
      preamp: this.state.eqSettings?.preamp ?? 0,
      gains: Array.isArray(this.state.eqSettings?.gains) ? [...this.state.eqSettings.gains] : [0, 0, 0, 0, 0]
    };
  }

  saveEqSettings(settings) {
    if (!settings) return;
    this.state.eqSettings = {
      preset: settings.preset || 'flat',
      preamp: parseFloat(settings.preamp ?? 0),
      gains: Array.isArray(settings.gains) ? [...settings.gains] : [0, 0, 0, 0, 0]
    };
    this.saveStore();
  }

  // --- Queue State Persistence ---
  getQueueState() {
    return {
      queue: Array.isArray(this.state.queueState?.queue) ? [...this.state.queueState.queue] : [],
      originalQueue: Array.isArray(this.state.queueState?.originalQueue) ? [...this.state.queueState.originalQueue] : [],
      queueIndex: this.state.queueState?.queueIndex ?? -1,
      currentTrack: this.state.queueState?.currentTrack || null,
      playbackPosition: this.state.queueState?.playbackPosition || 0,
      isShuffled: !!this.state.queueState?.isShuffled,
      repeatMode: this.state.queueState?.repeatMode || 'off'
    };
  }

  saveQueueState(qState) {
    if (!qState) return;
    this.state.queueState = {
      queue: Array.isArray(qState.queue) ? [...qState.queue] : [],
      originalQueue: Array.isArray(qState.originalQueue) ? [...qState.originalQueue] : [],
      queueIndex: qState.queueIndex ?? -1,
      currentTrack: qState.currentTrack || null,
      playbackPosition: qState.playbackPosition || 0,
      isShuffled: !!qState.isShuffled,
      repeatMode: qState.repeatMode || 'off'
    };
    this.saveStore();
  }
}

window.MusicLibrary = MusicLibrary;
