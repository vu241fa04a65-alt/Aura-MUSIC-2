/**
 * lyrics.js - Synced Karaoke Lyrics Engine for Aura Music
 * Integrates with LRCLIB API with smooth line auto-scrolling & click-to-seek.
 */

class LyricsManager {
  constructor() {
    this.lyricsContainer = document.getElementById('lyricsList');
    this.overlay = document.getElementById('lyricsOverlay');
    this.currentTrackId = null;
    this.syncedLines = [];
    this.activeLineIndex = -1;
    this.isOpen = false;
  }

  toggle() {
    this.isOpen = !this.isOpen;
    if (this.overlay) {
      this.overlay.classList.toggle('active', this.isOpen);
      const btn = document.getElementById('lyricsToggleBtn');
      if (btn) btn.classList.toggle('active', this.isOpen);
    }
    if (this.isOpen && window.player && window.player.currentTrack) {
      this.loadLyrics(window.player.currentTrack);
    }
  }

  close() {
    this.isOpen = false;
    if (this.overlay) this.overlay.classList.remove('active');
    const btn = document.getElementById('lyricsToggleBtn');
    if (btn) btn.classList.remove('active');
  }

  async loadLyrics(track) {
    if (!track) return;
    if (this.currentTrackId === track.id && this.syncedLines.length > 0) {
      return; // Already loaded for this track
    }

    this.currentTrackId = track.id;
    this.syncedLines = [];
    this.activeLineIndex = -1;

    // Update overlay header
    const titleEl = document.getElementById('lyricsTrackTitle');
    const artistEl = document.getElementById('lyricsTrackArtist');
    const coverEl = document.getElementById('lyricsTrackCover');

    if (titleEl) titleEl.textContent = track.title;
    if (artistEl) artistEl.textContent = track.artist;
    if (coverEl) coverEl.src = track.image;

    if (!this.lyricsContainer) return;
    this.lyricsContainer.innerHTML = '<div class="lyric-line">Loading synced lyrics...</div>';

    try {
      const resp = await fetch(`/api/lyrics?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}&duration=${track.duration || 0}`);
      const data = await resp.json();

      if (data.success && data.syncedLyrics) {
        this.parseLrc(data.syncedLyrics);
        this.renderSyncedLyrics();
      } else if (data.success && data.plainLyrics) {
        this.renderPlainLyrics(data.plainLyrics);
      } else {
        this.lyricsContainer.innerHTML = '<div class="lyric-line">♪ Enjoy the music ♪<br><span style="font-size: 1rem; opacity: 0.6;">Lyrics not available for this track</span></div>';
      }
    } catch (err) {
      console.error('Failed to load lyrics:', err);
      this.lyricsContainer.innerHTML = '<div class="lyric-line">♪ Enjoy the music ♪</div>';
    }
  }

  parseLrc(lrcText) {
    const lines = lrcText.split('\n');
    const parsed = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.?(\d{2,3})?\]/;

    for (const rawLine of lines) {
      const match = timeRegex.exec(rawLine);
      if (match) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
        const time = min * 60 + sec + ms / 1000;
        const text = rawLine.replace(timeRegex, '').trim();

        if (text) {
          parsed.push({ time, text });
        }
      }
    }

    parsed.sort((a, b) => a.time - b.time);
    this.syncedLines = parsed;
  }

  renderSyncedLyrics() {
    if (!this.lyricsContainer) return;
    this.lyricsContainer.innerHTML = '';

    this.syncedLines.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'lyric-line';
      div.dataset.index = index;
      div.dataset.time = item.time;
      div.textContent = item.text;

      // Click to seek to that line
      div.addEventListener('click', () => {
        if (window.player) {
          window.player.seek(item.time);
        }
      });

      this.lyricsContainer.appendChild(div);
    });
  }

  renderPlainLyrics(plainText) {
    if (!this.lyricsContainer) return;
    this.lyricsContainer.innerHTML = '';
    const paragraphs = plainText.split('\n');
    paragraphs.forEach(p => {
      if (p.trim()) {
        const div = document.createElement('div');
        div.className = 'lyric-line';
        div.textContent = p.trim();
        this.lyricsContainer.appendChild(div);
      }
    });
  }

  updateProgress(currentTime) {
    if (!this.isOpen || this.syncedLines.length === 0) return;

    // Find active line
    let activeIdx = -1;
    for (let i = 0; i < this.syncedLines.length; i++) {
      if (currentTime >= this.syncedLines[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }

    if (activeIdx !== this.activeLineIndex) {
      this.activeLineIndex = activeIdx;

      // Update DOM classes
      const allLines = this.lyricsContainer.querySelectorAll('.lyric-line');
      allLines.forEach((el, idx) => {
        if (idx === activeIdx) {
          el.classList.add('active');
          // Scroll into middle of container
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          el.classList.remove('active');
        }
      });
    }
  }
}

window.LyricsManager = LyricsManager;
