/**
 * player.js - Core Audio Engine for Aura Music
 * Handles HTML5 playback, Web Audio Equalizer (5-Band + Preamp + Compressor),
 * Persistent Queue, State Restoration, MediaSession API & Error Recovery.
 */

class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';

    this.currentTrack = null;
    this.queue = [];
    this.originalQueue = [];
    this.queueIndex = -1;
    this.isPlaying = false;
    this.isShuffled = false;
    this.repeatMode = 'off'; // 'off' | 'all' | 'one'
    this.quality = localStorage.getItem('aura_quality') || '320';
    this.volume = parseFloat(localStorage.getItem('aura_volume') || '0.8');
    this.isMuted = false;

    // Web Audio Equalizer setup
    this.audioCtx = null;
    this.sourceNode = null;
    this.preampNode = null;
    this.eqFilters = [];
    this.compressor = null;
    this.activePreset = 'flat';
    this.preampDb = 0;
    this.bandGains = [0, 0, 0, 0, 0];

    // Throttled storage write timer
    this.lastPositionSaveTime = 0;

    this.initEvents();
    this.setVolume(this.volume);
    
    // Defer restoring state until DOM and Library are ready
    setTimeout(() => this.restoreState(), 100);
  }

  // --- Web Audio Equalizer & DSP ---
  initWebAudio() {
    if (this.audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.audioCtx = new AudioContext();

      // Preamp gain node
      this.preampNode = this.audioCtx.createGain();
      this.setPreampGain(this.preampDb, false);

      // Dynamics Compressor for Soft Limiting / Clipping Prevention
      this.compressor = this.audioCtx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-0.5, this.audioCtx.currentTime);
      this.compressor.knee.setValueAtTime(0, this.audioCtx.currentTime);
      this.compressor.ratio.setValueAtTime(20, this.audioCtx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
      this.compressor.release.setValueAtTime(0.1, this.audioCtx.currentTime);

      // 5-band Equalizer:
      // 60Hz (Sub-bass), 250Hz (Low-mid), 1kHz (Midrange), 4kHz (Presence), 14kHz (Treble)
      const frequencies = [60, 250, 1000, 4000, 14000];
      this.eqFilters = frequencies.map((freq, index) => {
        const filter = this.audioCtx.createBiquadFilter();
        if (index === 0) {
          filter.type = 'lowshelf';
        } else if (index === frequencies.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = 1.0;
        }
        filter.frequency.value = freq;
        filter.gain.value = this.bandGains[index] || 0;
        return filter;
      });

      // Chain: audio source -> preamp -> filter0 -> ... -> filter4 -> compressor -> destination
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);
      let lastNode = this.sourceNode;
      lastNode.connect(this.preampNode);
      lastNode = this.preampNode;

      this.eqFilters.forEach(filter => {
        lastNode.connect(filter);
        lastNode = filter;
      });

      lastNode.connect(this.compressor);
      this.compressor.connect(this.audioCtx.destination);
    } catch (err) {
      console.warn('Web Audio processing note (graceful degradation):', err.message);
    }
  }

  dbToGain(db) {
    return Math.pow(10, db / 20);
  }

  setPreamp(db, smooth = true) {
    this.preampDb = Math.max(-12, Math.min(12, parseFloat(db) || 0));
    this.setPreampGain(this.preampDb, smooth);
    this.saveEqState();
  }

  setPreampGain(db, smooth = true) {
    if (!this.preampNode || !this.audioCtx) return;
    const targetGain = this.dbToGain(db);
    if (smooth && this.audioCtx.state === 'running') {
      this.preampNode.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.04);
    } else {
      this.preampNode.gain.setValueAtTime(targetGain, this.audioCtx.currentTime);
    }
  }

  setEqBand(bandIndex, gainValue, smooth = true) {
    const gain = Math.max(-12, Math.min(12, parseFloat(gainValue) || 0));
    this.bandGains[bandIndex] = gain;

    if (this.eqFilters[bandIndex] && this.audioCtx) {
      if (smooth && this.audioCtx.state === 'running') {
        this.eqFilters[bandIndex].gain.setTargetAtTime(gain, this.audioCtx.currentTime, 0.04);
      } else {
        this.eqFilters[bandIndex].gain.setValueAtTime(gain, this.audioCtx.currentTime);
      }
    }
    this.activePreset = 'custom';
    this.saveEqState();
  }

  applyPreset(presetName) {
    this.initWebAudio();
    const presets = {
      'flat': { gains: [0, 0, 0, 0, 0], preamp: 0 },
      'bass': { gains: [7, 4, 0, -1, -2], preamp: 0 },
      'vocal': { gains: [-2, 1, 4, 3, 1], preamp: 0 },
      'acoustic': { gains: [3, 2, 1, 2, 3], preamp: 0 },
      'classical': { gains: [4, 2, -1, 2, 3], preamp: 0 },
      'custom': { gains: [...this.bandGains], preamp: this.preampDb }
    };

    const preset = presets[presetName] || presets['flat'];
    this.activePreset = presetName;
    this.preampDb = preset.preamp;
    this.setPreampGain(this.preampDb, true);

    preset.gains.forEach((g, idx) => {
      this.bandGains[idx] = g;
      if (this.eqFilters[idx] && this.audioCtx) {
        if (this.audioCtx.state === 'running') {
          this.eqFilters[idx].gain.setTargetAtTime(g, this.audioCtx.currentTime, 0.04);
        } else {
          this.eqFilters[idx].gain.setValueAtTime(g, this.audioCtx.currentTime);
        }
      }
    });

    this.saveEqState();
    return { gains: preset.gains, preamp: preset.preamp };
  }

  saveEqState() {
    if (window.Library) {
      window.Library.saveEqSettings({
        preset: this.activePreset,
        preamp: this.preampDb,
        gains: [...this.bandGains]
      });
    }
  }

  loadSavedEq() {
    if (!window.Library) return;
    const settings = window.Library.getEqSettings();
    if (settings) {
      this.activePreset = settings.preset || 'flat';
      this.preampDb = settings.preamp ?? 0;
      this.bandGains = Array.isArray(settings.gains) ? [...settings.gains] : [0, 0, 0, 0, 0];
      if (this.activePreset !== 'custom') {
        this.applyPreset(this.activePreset);
      } else {
        this.setPreampGain(this.preampDb, false);
        this.bandGains.forEach((g, idx) => {
          if (this.eqFilters[idx] && this.audioCtx) {
            this.eqFilters[idx].gain.setValueAtTime(g, this.audioCtx.currentTime);
          }
        });
      }
    }
  }

  // --- Audio Events ---
  initEvents() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.updateMediaSessionPlaybackState('playing');
      if (window.App) window.App.updatePlayState(true);
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updateMediaSessionPlaybackState('paused');
      this.savePlaybackStateNow();
      if (window.App) window.App.updatePlayState(false);
    });

    this.audio.addEventListener('waiting', () => {
      if (window.App) window.App.setBufferingState(true);
    });

    this.audio.addEventListener('playing', () => {
      if (window.App) window.App.setBufferingState(false);
    });

    this.audio.addEventListener('timeupdate', () => {
      const cur = this.audio.currentTime || 0;
      const dur = this.audio.duration || 0;
      if (window.App) window.App.updateProgress(cur, dur);

      // Throttled storage save: save position at most once every 4 seconds
      const now = Date.now();
      if (now - this.lastPositionSaveTime > 4000) {
        this.lastPositionSaveTime = now;
        this.savePlaybackStateNow();
      }
    });

    this.audio.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    this.audio.addEventListener('error', (e) => {
      console.warn('Audio playback error on track, recovering queue:', e);
      if (window.App) {
        window.App.setBufferingState(false);
        window.App.showToast('Audio stream unavailable. Playing next track...', 'error');
      }
      setTimeout(() => this.playNext(), 1200);
    });

    // Save state on page unload
    window.addEventListener('beforeunload', () => {
      this.savePlaybackStateNow();
    });

    // Register MediaSession action handlers
    this.initMediaSessionHandlers();
  }

  handleTrackEnded() {
    if (this.repeatMode === 'one') {
      this.audio.currentTime = 0;
      this.play();
    } else {
      this.playNext();
    }
  }

  // --- Queue Management ---
  setQueue(tracks, startIndex = 0) {
    if (!Array.isArray(tracks) || tracks.length === 0) return;
    this.originalQueue = [...tracks];
    this.queue = this.isShuffled ? this.shuffleArray([...tracks]) : [...tracks];
    this.queueIndex = Math.max(0, Math.min(startIndex, this.queue.length - 1));

    if (this.queue[this.queueIndex]) {
      this.loadTrack(this.queue[this.queueIndex]);
    }
    this.savePlaybackStateNow();
    if (window.App) window.App.renderQueue();
  }

  addToQueue(track) {
    if (!track) return;
    this.queue.push(track);
    this.originalQueue.push(track);
    if (!this.currentTrack && this.queue.length === 1) {
      this.queueIndex = 0;
      this.loadTrack(track);
    }
    this.savePlaybackStateNow();
    if (window.App) {
      window.App.showToast(`Added "${track.title}" to Queue`);
      window.App.renderQueue();
    }
  }

  removeFromQueue(index) {
    if (index < 0 || index >= this.queue.length) return;
    const removed = this.queue.splice(index, 1)[0];
    if (removed) {
      this.originalQueue = this.originalQueue.filter(t => t.id !== removed.id);
    }
    if (index < this.queueIndex) {
      this.queueIndex--;
    } else if (index === this.queueIndex) {
      // Current track removed
      if (this.queue[this.queueIndex]) {
        this.loadTrack(this.queue[this.queueIndex]);
      } else if (this.queue.length > 0) {
        this.queueIndex = 0;
        this.loadTrack(this.queue[0]);
      } else {
        this.currentTrack = null;
        this.audio.src = '';
        this.pause();
      }
    }
    this.savePlaybackStateNow();
    if (window.App) window.App.renderQueue();
  }

  reorderQueue(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.queue.length) return;
    if (toIndex < 0 || toIndex >= this.queue.length) return;
    const [moved] = this.queue.splice(fromIndex, 1);
    this.queue.splice(toIndex, 0, moved);

    // Adjust active index
    if (this.currentTrack) {
      this.queueIndex = this.queue.findIndex(t => t.id === this.currentTrack.id);
    }
    this.savePlaybackStateNow();
    if (window.App) window.App.renderQueue();
  }

  clearQueue() {
    if (this.currentTrack) {
      this.queue = [this.currentTrack];
      this.originalQueue = [this.currentTrack];
      this.queueIndex = 0;
    } else {
      this.queue = [];
      this.originalQueue = [];
      this.queueIndex = -1;
    }
    this.savePlaybackStateNow();
    if (window.App) window.App.renderQueue();
  }

  shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  toggleShuffle() {
    this.isShuffled = !this.isShuffled;
    const current = this.currentTrack;
    if (this.isShuffled) {
      this.queue = this.shuffleArray([...this.originalQueue]);
      if (current) {
        this.queueIndex = this.queue.findIndex(t => t.id === current.id);
      }
    } else {
      this.queue = [...this.originalQueue];
      if (current) {
        this.queueIndex = this.queue.findIndex(t => t.id === current.id);
      }
    }
    this.savePlaybackStateNow();
    return this.isShuffled;
  }

  toggleRepeat() {
    if (this.repeatMode === 'off') {
      this.repeatMode = 'all';
    } else if (this.repeatMode === 'all') {
      this.repeatMode = 'one';
    } else {
      this.repeatMode = 'off';
    }
    this.savePlaybackStateNow();
    return this.repeatMode;
  }

  // --- Track Loading & Playback ---
  async loadTrack(track, autoPlay = true, resumePosition = 0) {
    if (!track) return;
    this.currentTrack = track;

    // Initialize Web Audio upon user gesture
    this.initWebAudio();
    if (this.audioCtx && this.audioCtx.state === 'suspended' && autoPlay) {
      this.audioCtx.resume().catch(() => {});
    }

    let streamUrl = track.audioUrl;
    // If not direct URL, resolve via API
    if (!streamUrl && track.id) {
      try {
        const resp = await fetch(`/api/song/${encodeURIComponent(track.id)}?quality=${this.quality}`);
        const data = await resp.json();
        if (data.success && data.song?.audioUrl) {
          track.audioUrl = data.song.audioUrl;
          streamUrl = data.song.audioUrl;
        }
      } catch (e) {
        console.error('Error resolving track audio:', e);
      }
    }

    if (!streamUrl) {
      if (window.App) window.App.showToast('Audio stream unavailable. Skipping...', 'error');
      setTimeout(() => this.playNext(), 1200);
      return;
    }

    this.audio.src = streamUrl;

    if (resumePosition > 0) {
      const onLoaded = () => {
        this.audio.currentTime = resumePosition;
        this.audio.removeEventListener('loadedmetadata', onLoaded);
      };
      this.audio.addEventListener('loadedmetadata', onLoaded);
    }

    if (autoPlay) {
      this.play();
    } else {
      this.pause();
    }

    // Update MediaSession
    this.updateMediaSession(track);

    // Save to recently played history
    if (window.Library) window.Library.addToHistory(track);

    // Notify UI
    if (window.App) window.App.onTrackChange(track);
    this.savePlaybackStateNow();
  }

  play() {
    this.initWebAudio();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    this.audio.play().catch(err => {
      console.warn('Playback prevented by browser autoplay policy:', err);
    });
  }

  pause() {
    this.audio.pause();
  }

  togglePlay() {
    if (this.audio.paused) {
      if (!this.currentTrack && this.queue.length > 0) {
        this.loadTrack(this.queue[0]);
      } else {
        this.play();
      }
    } else {
      this.pause();
    }
  }

  async playNext() {
    if (this.queue.length === 0) return;
    if (this.queueIndex < this.queue.length - 1) {
      this.queueIndex++;
      this.loadTrack(this.queue[this.queueIndex]);
    } else if (this.repeatMode === 'all') {
      this.queueIndex = 0;
      this.loadTrack(this.queue[0]);
    } else {
      // Auto-select and play another related/similar song seamlessly (Radio Mode)
      await this.autoPlayRelatedSong();
    }
  }

  async autoPlayRelatedSong() {
    const cur = this.currentTrack;
    if (!cur) {
      this.pause();
      return;
    }

    try {
      if (window.App) window.App.showToast(`Autoplaying next track related to ${cur.title}...`);
      const artistQuery = encodeURIComponent(cur.artist || '');
      const titleQuery = encodeURIComponent(cur.title || '');
      const resp = await fetch(`/api/similar?artist=${artistQuery}&title=${titleQuery}&quality=${this.quality}`);
      const data = await resp.json();

      if (data.success && Array.isArray(data.songs) && data.songs.length > 0) {
        // Filter out songs already in the queue if possible
        const existingIds = new Set(this.queue.map(t => t.id));
        let nextSongs = data.songs.filter(s => !existingIds.has(s.id));
        if (nextSongs.length === 0) nextSongs = data.songs;

        const nextTrack = nextSongs[0];
        if (nextTrack) {
          // Append to queue and play
          this.queue.push(nextTrack);
          this.originalQueue.push(nextTrack);
          this.queueIndex = this.queue.length - 1;
          this.loadTrack(nextTrack, true);
          if (window.App) window.App.renderQueue();
          return;
        }
      }
    } catch (e) {
      console.warn('AutoPlay related song error:', e);
    }

    this.pause();
  }

  playPrevious() {
    if (this.queue.length === 0) return;
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    if (this.queueIndex > 0) {
      this.queueIndex--;
      this.loadTrack(this.queue[this.queueIndex]);
    } else if (this.repeatMode === 'all') {
      this.queueIndex = this.queue.length - 1;
      this.loadTrack(this.queue[this.queueIndex]);
    } else {
      this.audio.currentTime = 0;
    }
  }

  seek(percent) {
    if (this.audio.duration) {
      this.audio.currentTime = percent * this.audio.duration;
    }
  }

  seekRelative(deltaSeconds) {
    if (this.audio.duration) {
      this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, this.audio.currentTime + deltaSeconds));
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    this.audio.volume = this.volume;
    this.isMuted = this.volume === 0;
    localStorage.setItem('aura_volume', this.volume);
    if (window.App) window.App.updateVolumeUI(this.volume);
  }

  toggleMute() {
    if (this.isMuted) {
      this.setVolume(this.prevVolume || 0.8);
      this.isMuted = false;
    } else {
      this.prevVolume = this.volume;
      this.setVolume(0);
      this.isMuted = true;
    }
  }

  setQuality(q) {
    this.quality = q;
    localStorage.setItem('aura_quality', q);
    // Reload current track if playing
    if (this.currentTrack && !this.currentTrack.isLocal) {
      const curPos = this.audio.currentTime;
      const wasPlaying = !this.audio.paused;
      this.currentTrack.audioUrl = null; // force resolve with new quality
      this.loadTrack(this.currentTrack, wasPlaying, curPos);
    }
  }

  // --- Persistence & State Restoration ---
  savePlaybackStateNow() {
    if (!window.Library) return;
    window.Library.saveQueueState({
      queue: this.queue,
      originalQueue: this.originalQueue,
      queueIndex: this.queueIndex,
      currentTrack: this.currentTrack,
      playbackPosition: this.audio.currentTime || 0,
      isShuffled: this.isShuffled,
      repeatMode: this.repeatMode
    });
  }

  restoreState() {
    this.loadSavedEq();
    if (!window.Library) return;

    const saved = window.Library.getQueueState();
    if (saved && Array.isArray(saved.queue) && saved.queue.length > 0) {
      this.queue = saved.queue;
      this.originalQueue = saved.originalQueue && saved.originalQueue.length ? saved.originalQueue : [...saved.queue];
      this.queueIndex = saved.queueIndex >= 0 ? saved.queueIndex : 0;
      this.isShuffled = !!saved.isShuffled;
      this.repeatMode = saved.repeatMode || 'off';

      if (window.App) {
        window.App.renderQueue();
        if (window.App.shuffleBtn) window.App.shuffleBtn.classList.toggle('active', this.isShuffled);
        if (window.App.repeatBtn) window.App.repeatBtn.classList.toggle('active', this.repeatMode !== 'off');
      }
    }
  }

  // --- Media Session API & Android Background Audio ---
  initMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrevious());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime && this.audio.duration) {
          this.audio.currentTime = details.seekTime;
        }
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        this.seekRelative(details.seekOffset || 10);
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        this.seekRelative(-(details.seekOffset || 10));
      });
    } catch (e) {
      console.warn('MediaSession handler warning:', e);
    }
  }

  updateMediaSession(track) {
    if (!('mediaSession' in navigator) || !track) return;
    try {
      const artUrl = track.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || 'Aura Music',
        artwork: [
          { src: artUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: artUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: artUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: artUrl, sizes: '512x512', type: 'image/jpeg' }
        ]
      });
    } catch (e) {
      console.warn('MediaSession metadata error:', e);
    }
  }

  updateMediaSessionPlaybackState(state) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = state;
    } catch (e) {}
  }
}

window.AudioPlayer = AudioPlayer;
