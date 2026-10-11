/**
 * app.js - Main Application Controller for Aura Music 2
 * Full implementation: Multilingual Search, Smart Equalizer, Persistent Queue,
 * Synchronized Red/Outlined Like Button, Playlist Saving Confirmation ("✓ Saved"),
 * My Playlists management, and Mobile-First responsive controls.
 */

class AppController {
  constructor() {
    this.currentView = 'home';
    this.historyStack = ['home'];
    this.historyIndex = 0;
    this.searchDebounceTimer = null;
    this.activeLanguage = 'all';

    // Components
    this.library = new MusicLibrary();
    this.player = new AudioPlayer();
    this.lyrics = new LyricsManager();
    this.localFiles = new LocalFileManager();

    // Expose globally
    window.player = this.player;
    window.Library = this.library;
    window.App = this;

    this.initDOM();
    this.bindEvents();
    this.initKeyboardShortcuts();
    this.loadHomeData();
    this.updateLibrarySidebar();
  }

  initDOM() {
    this.mainView = document.getElementById('viewScroll');
    this.searchInput = document.getElementById('headerSearchInput');
    this.searchClearBtn = document.getElementById('searchClearBtn');
    this.ambientGlow = document.getElementById('ambientGlow');

    // Player Elements
    this.playPauseBtn = document.getElementById('playPauseBtn');
    this.prevBtn = document.getElementById('prevBtn');
    this.nextBtn = document.getElementById('nextBtn');
    this.shuffleBtn = document.getElementById('shuffleBtn');
    this.repeatBtn = document.getElementById('repeatBtn');
    this.progressBarContainer = document.getElementById('progressBarContainer');
    this.progressBarFill = document.getElementById('progressBarFill');
    this.currentTimeEl = document.getElementById('currentTime');
    this.totalDurationEl = document.getElementById('totalDuration');
    this.volumeContainer = document.getElementById('volumeContainer');
    this.volumeFill = document.getElementById('volumeFill');
    this.volumeBtn = document.getElementById('volumeBtn');
    this.playerHeartBtn = document.getElementById('playerHeartBtn');
    this.qualityPill = document.getElementById('qualityPill');
    this.qualityText = document.getElementById('qualityText');

    // Modals & Panels
    this.queueDrawer = document.getElementById('queueDrawer');
    this.eqModal = document.getElementById('eqModal');
    this.createPlaylistModal = document.getElementById('createPlaylistModal');
    this.fullscreenOverlay = document.getElementById('fullscreenMode');

    // Equalizer controls
    this.eqPreampSlider = document.getElementById('eqPreampSlider');
    this.eqPreampVal = document.getElementById('eqPreampVal');

    // Set initial quality text
    if (this.qualityText) {
      this.qualityText.textContent = (this.player.quality || '320') + ' kbps';
    }

    // Init local files drop zone
    this.localFiles.initDropZone();
  }

  bindEvents() {
    // Navigation items (desktop sidebar + mobile bottom nav)
    document.addEventListener('click', (e) => {
      const navEl = e.target.closest('[data-nav]');
      if (navEl) {
        e.preventDefault();
        const target = navEl.dataset.nav;
        this.navigateTo(target);
      }
    });

    // Back / Forward buttons
    document.getElementById('navBackBtn')?.addEventListener('click', () => this.navBack());
    document.getElementById('navForwardBtn')?.addEventListener('click', () => this.navForward());

    // Search input with debounce
    this.searchInput?.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (this.searchClearBtn) {
        this.searchClearBtn.classList.toggle('visible', q.length > 0);
      }
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        if (q.length > 0) {
          if (this.currentView !== 'search') {
            this.navigateTo('search', false);
          }
          this.executeSearch(q);
        } else if (this.currentView === 'search') {
          this.renderSearchDefaultView();
        }
      }, 350);
    });

    this.searchClearBtn?.addEventListener('click', () => {
      if (this.searchInput) {
        this.searchInput.value = '';
        this.searchClearBtn.classList.remove('visible');
        if (this.currentView === 'search') this.renderSearchDefaultView();
      }
    });

    // Player controls
    this.playPauseBtn?.addEventListener('click', () => this.player.togglePlay());
    this.prevBtn?.addEventListener('click', () => this.player.playPrevious());
    this.nextBtn?.addEventListener('click', () => this.player.playNext());
    this.shuffleBtn?.addEventListener('click', () => {
      const active = this.player.toggleShuffle();
      this.shuffleBtn.classList.toggle('active', active);
      this.showToast(active ? 'Shuffle On' : 'Shuffle Off');
    });
    this.repeatBtn?.addEventListener('click', () => {
      const mode = this.player.toggleRepeat();
      this.repeatBtn.classList.toggle('active', mode !== 'off');
      this.repeatBtn.title = `Repeat: ${mode.toUpperCase()}`;
      this.showToast(`Repeat: ${mode.toUpperCase()}`);
    });

    // Progress Bar Seeking
    let isSeeking = false;
    this.progressBarContainer?.addEventListener('mousedown', (e) => {
      isSeeking = true;
      this.handleSeekEvent(e);
    });
    window.addEventListener('mousemove', (e) => {
      if (isSeeking) this.handleSeekEvent(e);
    });
    window.addEventListener('mouseup', () => {
      isSeeking = false;
    });

    // Volume Slider
    let isAdjustingVolume = false;
    this.volumeContainer?.addEventListener('mousedown', (e) => {
      isAdjustingVolume = true;
      this.handleVolumeEvent(e);
    });
    window.addEventListener('mousemove', (e) => {
      if (isAdjustingVolume) this.handleVolumeEvent(e);
    });
    window.addEventListener('mouseup', () => {
      isAdjustingVolume = false;
    });
    this.volumeBtn?.addEventListener('click', () => this.player.toggleMute());

    // Like in Player -> Opens Spotify "Saved in" modal
    this.playerHeartBtn?.addEventListener('click', () => {
      if (this.player.currentTrack) {
        this.openSavedInModal(this.player.currentTrack);
      } else {
        this.showToast('No song is currently playing');
      }
    });

    // Download in Player bar
    document.getElementById('playerBarDownloadBtn')?.addEventListener('click', () => {
      if (this.player.currentTrack) {
        this.downloadSong(this.player.currentTrack);
      } else {
        this.showToast('No song is currently playing');
      }
    });

    // Three-dots menu in Player bar
    document.getElementById('playerBarMenuBtn')?.addEventListener('click', () => {
      if (this.player.currentTrack) {
        this.openSongMenu(this.player.currentTrack);
      } else {
        this.showToast('No song is currently playing');
      }
    });

    // Quality Pill Toggle
    this.qualityPill?.addEventListener('click', () => {
      const qualities = ['320', '160', '96'];
      let nextIdx = (qualities.indexOf(this.player.quality) + 1) % qualities.length;
      const nextQ = qualities[nextIdx];
      this.player.setQuality(nextQ);
      if (this.qualityText) this.qualityText.textContent = nextQ + ' kbps';
      this.showToast(`Audio Quality: ${nextQ} kbps HD`);
    });

    // Lyrics Button
    document.getElementById('lyricsToggleBtn')?.addEventListener('click', () => {
      this.lyrics.toggle();
    });
    document.getElementById('lyricsCloseBtn')?.addEventListener('click', () => {
      this.lyrics.close();
    });

    // Queue Drawer Toggle
    document.getElementById('queueToggleBtn')?.addEventListener('click', () => {
      this.queueDrawer?.classList.toggle('open');
      this.renderQueue();
    });
    document.getElementById('queueCloseBtn')?.addEventListener('click', () => {
      this.queueDrawer?.classList.remove('open');
    });
    document.getElementById('clearQueueBtn')?.addEventListener('click', () => {
      this.player.clearQueue();
      this.showToast('Playback queue cleared');
    });

    // Equalizer Modal Open & Close
    document.getElementById('eqToggleBtn')?.addEventListener('click', () => {
      this.openEqModal();
    });
    document.getElementById('eqModalClose')?.addEventListener('click', () => {
      this.eqModal?.classList.remove('open');
    });

    // Equalizer Preamp Slider
    this.eqPreampSlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.player.setPreamp(val);
      if (this.eqPreampVal) {
        this.eqPreampVal.textContent = (val > 0 ? '+' : '') + val.toFixed(1) + ' dB';
      }
      this.markPresetButton('custom');
    });

    // Equalizer 5-Band sliders
    document.querySelectorAll('.eq-slider[data-band]').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const band = parseInt(e.target.dataset.band, 10);
        const gain = parseFloat(e.target.value);
        this.player.setEqBand(band, gain);
        const valEl = document.getElementById(`eqBandVal${band}`);
        if (valEl) valEl.textContent = (gain > 0 ? '+' : '') + gain.toFixed(1) + ' dB';
        this.markPresetButton('custom');
      });
    });

    // Equalizer Preset Buttons
    document.querySelectorAll('.eq-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        this.markPresetButton(preset);
        const res = this.player.applyPreset(preset);
        this.syncEqModalUI(res.gains, res.preamp);
        this.showToast(`Equalizer Preset: ${btn.textContent.trim()}`);
      });
    });

    // Create Playlist Modal Open
    document.getElementById('createPlaylistBtn')?.addEventListener('click', () => {
      const saveBtn = document.getElementById('savePlaylistBtn');
      if (saveBtn) {
        saveBtn.textContent = 'Save Playlist';
        saveBtn.classList.remove('saved-confirmation');
      }
      this.createPlaylistModal?.classList.add('open');
    });
    document.getElementById('closeCreatePlaylistModal')?.addEventListener('click', () => {
      this.createPlaylistModal?.classList.remove('open');
    });

    // Save Playlist Button with "✓ Saved" Confirmation
    document.getElementById('savePlaylistBtn')?.addEventListener('click', () => {
      const input = document.getElementById('newPlaylistNameInput');
      const saveBtn = document.getElementById('savePlaylistBtn');
      const name = input ? input.value.trim() : '';

      if (!name) {
        this.showToast('Please enter a playlist name', 'error');
        return;
      }

      try {
        const pl = this.library.createPlaylist(name);
        if (pl) {
          // Success confirmation
          if (saveBtn) {
            saveBtn.textContent = '✓ Saved';
            saveBtn.classList.add('saved-confirmation');
          }
          this.updateLibrarySidebar();
          this.showToast(`Playlist "${name}" saved!`);

          setTimeout(() => {
            this.createPlaylistModal?.classList.remove('open');
            if (input) input.value = '';
            if (saveBtn) {
              saveBtn.textContent = 'Save Playlist';
              saveBtn.classList.remove('saved-confirmation');
            }
            if (this.currentView === 'playlists') {
              this.renderPlaylistsView();
            } else {
              this.openPlaylist(pl.id);
            }
          }, 1200);
        }
      } catch (err) {
        console.error('Playlist creation error:', err);
        this.showToast('Failed to save playlist: ' + err.message, 'error');
      }
    });

    // Fullscreen Mode
    document.getElementById('fullscreenToggleBtn')?.addEventListener('click', () => {
      this.toggleFullscreen();
    });
    document.getElementById('fullscreenExitBtn')?.addEventListener('click', () => {
      this.toggleFullscreen(false);
    });

    // Mini-player mobile tap to expand
    document.querySelector('.player-left')?.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 && !e.target.closest('#playerHeartBtn')) {
        this.toggleFullscreen(true);
      }
    });

    // Download button in player
    document.getElementById('downloadTrackBtn')?.addEventListener('click', () => {
      this.downloadCurrentTrack();
    });
  }

  // --- Equalizer UI Sync ---
  openEqModal() {
    this.player.initWebAudio();
    const settings = this.library.getEqSettings();
    this.syncEqModalUI(settings.gains, settings.preamp);
    this.markPresetButton(settings.preset || 'flat');
    this.eqModal?.classList.add('open');
  }

  syncEqModalUI(gains, preamp) {
    if (this.eqPreampSlider) this.eqPreampSlider.value = preamp ?? 0;
    if (this.eqPreampVal) {
      const p = parseFloat(preamp ?? 0);
      this.eqPreampVal.textContent = (p > 0 ? '+' : '') + p.toFixed(1) + ' dB';
    }

    (gains || [0, 0, 0, 0, 0]).forEach((g, idx) => {
      const slider = document.querySelector(`.eq-slider[data-band="${idx}"]`);
      if (slider) slider.value = g;
      const valEl = document.getElementById(`eqBandVal${idx}`);
      if (valEl) valEl.textContent = (g > 0 ? '+' : '') + parseFloat(g).toFixed(1) + ' dB';
    });
  }

  markPresetButton(presetName) {
    document.querySelectorAll('.eq-preset-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.preset === presetName);
    });
  }

  handleSeekEvent(e) {
    if (!this.progressBarContainer) return;
    const rect = this.progressBarContainer.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.player.seek(ratio);
  }

  handleVolumeEvent(e) {
    if (!this.volumeContainer) return;
    const rect = this.volumeContainer.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.player.setVolume(ratio);
  }

  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.player.togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.player.seekRelative(5);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.player.seekRelative(-5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.player.setVolume(this.player.volume + 0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.player.setVolume(this.player.volume - 0.05);
          break;
        case 'KeyM':
          this.player.toggleMute();
          break;
        case 'KeyL':
          this.lyrics.toggle();
          break;
        case 'KeyQ':
          this.queueDrawer?.classList.toggle('open');
          this.renderQueue();
          break;
        case 'KeyF':
          this.toggleFullscreen();
          break;
        case 'Escape':
          this.lyrics.close();
          this.queueDrawer?.classList.remove('open');
          this.eqModal?.classList.remove('open');
          this.createPlaylistModal?.classList.remove('open');
          this.toggleFullscreen(false);
          break;
      }
    });
  }

  // Navigation
  navigateTo(view, addToHistory = true) {
    this.currentView = view;
    if (addToHistory) {
      this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
      this.historyStack.push(view);
      this.historyIndex++;
    }
    this.updateNavButtons();

    document.querySelectorAll('.nav-link, .mobile-nav-item').forEach(link => {
      link.classList.toggle('active', link.dataset.nav === view);
    });

    if (view === 'home') {
      this.loadHomeData();
    } else if (view === 'search') {
      if (this.searchInput && this.searchInput.value.trim()) {
        this.executeSearch(this.searchInput.value.trim());
      } else {
        this.renderSearchDefaultView();
      }
    } else if (view === 'liked') {
      this.renderLikedSongsView();
    } else if (view === 'playlists') {
      this.renderPlaylistsView();
    } else if (view === 'local') {
      this.renderLocalFilesView();
    }
  }

  navBack() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const prev = this.historyStack[this.historyIndex];
      this.navigateTo(prev, false);
    }
  }

  navForward() {
    if (this.historyIndex < this.historyStack.length - 1) {
      this.historyIndex++;
      const next = this.historyStack[this.historyIndex];
      this.navigateTo(next, false);
    }
  }

  updateNavButtons() {
    const backBtn = document.getElementById('navBackBtn');
    const fwdBtn = document.getElementById('navForwardBtn');
    if (backBtn) backBtn.disabled = this.historyIndex <= 0;
    if (fwdBtn) fwdBtn.disabled = this.historyIndex >= this.historyStack.length - 1;
  }

  // --- Home View ---
  async loadHomeData() {
    this.mainView.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
        <div class="playing-bars"><span></span><span></span><span></span><span></span></div>
        <p style="margin-top: 12px; font-weight: 600;">Loading top tracks and playlists...</p>
      </div>
    `;

    try {
      const resp = await fetch('/api/home');
      const data = await resp.json();
      if (data.success) {
        this.renderHome(data);
      }
    } catch (err) {
      console.error('Home load error:', err);
      this.mainView.innerHTML = `<p style="padding: 24px; color: var(--danger);">Failed to load home content. Please check connection.</p>`;
    }
  }

  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  renderHome(data) {
    const greeting = this.getGreeting();
    const quickItems = (data.charts || []).slice(0, 6);

    let html = `
      <h1 class="home-greeting">${greeting}</h1>
      
      <!-- Quick Hero Grid -->
      <div class="quick-grid">
        ${quickItems.map(item => `
          <div class="quick-card" onclick="App.openPlaylist('${item.id}')">
            <img class="quick-card-art" src="${item.image}" alt="${item.title}">
            <div class="quick-card-title">${item.title}</div>
            <button class="quick-card-play" onclick="event.stopPropagation(); App.playPlaylistImmediately('${item.id}')" title="Play">
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>
          </div>
        `).join('')}
      </div>

      <!-- Jump Back In -->
      <div class="section-header">
        <h2 class="section-title">Jump Back In</h2>
      </div>
      <div class="cards-grid">
        ${(data.quickCategories || []).map(cat => `
          <div class="category-tile" style="background: ${cat.color};" onclick="App.searchCategory('${cat.query}')">
            ${cat.title}
          </div>
        `).join('')}
      </div>

      <!-- Featured Playlists -->
      <div class="section-header">
        <h2 class="section-title">Featured Playlists</h2>
      </div>
      <div class="cards-grid">
        ${(data.featuredPlaylists || []).map(pl => `
          <div class="music-card" onclick="App.openPlaylist('${pl.id}')">
            <div class="card-img-wrap">
              <img src="${pl.image}" alt="${pl.title}" loading="lazy">
              <button class="card-play-btn" onclick="event.stopPropagation(); App.playPlaylistImmediately('${pl.id}')">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
            <div class="card-title">${pl.title}</div>
            <div class="card-subtitle">${pl.subtitle}</div>
          </div>
        `).join('')}
      </div>

      <!-- Top Charts -->
      <div class="section-header">
        <h2 class="section-title">Top Charts</h2>
      </div>
      <div class="cards-grid">
        ${(data.charts || []).map(chart => `
          <div class="music-card" onclick="App.openPlaylist('${chart.id}')">
            <div class="card-img-wrap">
              <img src="${chart.image}" alt="${chart.title}" loading="lazy">
              <button class="card-play-btn" onclick="event.stopPropagation(); App.playPlaylistImmediately('${chart.id}')">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
            <div class="card-title">${chart.title}</div>
            <div class="card-subtitle">${chart.subtitle}</div>
          </div>
        `).join('')}
      </div>

      <!-- New Releases -->
      <div class="section-header">
        <h2 class="section-title">New Album Releases</h2>
      </div>
      <div class="cards-grid">
        ${(data.newAlbums || []).map(album => `
          <div class="music-card" onclick="App.openAlbum('${album.id}')">
            <div class="card-img-wrap">
              <img src="${album.image}" alt="${album.title}" loading="lazy">
              <button class="card-play-btn" onclick="event.stopPropagation(); App.playAlbumImmediately('${album.id}')">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
            <div class="card-title">${album.title}</div>
            <div class="card-subtitle">${album.subtitle}</div>
          </div>
        `).join('')}
      </div>
    `;

    this.mainView.innerHTML = html;
  }

  searchCategory(q) {
    if (this.searchInput) this.searchInput.value = q;
    this.navigateTo('search');
    this.executeSearch(q);
  }

  // --- Spotify Search Category Filter Tabs (Matching Screenshot) ---
  renderSearchFilterTabsHTML() {
    const tabs = [
      { id: 'all', label: 'All' },
      { id: 'songs', label: 'Songs' },
      { id: 'albums', label: 'Albums' },
      { id: 'playlists', label: 'Playlists' },
      { id: 'artists', label: 'Artists' }
    ];

    return `
      <div class="search-filter-bar">
        ${tabs.map(t => `
          <button class="search-filter-pill ${this.activeSearchCategory === t.id ? 'active' : ''}" onclick="App.setSearchCategoryFilter('${t.id}')">
            ${t.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  setSearchCategoryFilter(category) {
    this.activeSearchCategory = category;
    if (this.lastSearchResults && this.lastSearchQuery) {
      this.renderSearchResults(this.lastSearchResults, this.lastSearchQuery);
    } else {
      const currentQuery = this.searchInput?.value.trim();
      if (currentQuery) {
        this.executeSearch(currentQuery);
      } else {
        this.renderSearchDefaultView();
      }
    }
  }

  renderSearchDefaultView() {
    const recent = this.library.getRecentSearches();

    const popularCategories = [
      { name: 'Tamil Top Hits', q: 'Tamil Hits', color: 'linear-gradient(135deg, #b91c1c, #f97316)' },
      { name: 'Telugu Chartbusters', q: 'Telugu Hits', color: 'linear-gradient(135deg, #c2410c, #eab308)' },
      { name: 'Bollywood Top', q: 'Bollywood Hits', color: 'linear-gradient(135deg, #064e3b, #10b981)' },
      { name: 'Global Pop Hits', q: 'Pop Hits', color: 'linear-gradient(135deg, #1e3a8a, #3b82f6)' },
      { name: 'K-Pop Essentials', q: 'K-Pop Essentials', color: 'linear-gradient(135deg, #831843, #ec4899)' },
      { name: 'C-Pop & Mandopop', q: 'Chinese Hits', color: 'linear-gradient(135deg, #701a75, #d946ef)' },
      { name: 'Lo-Fi Chill & Beats', q: 'Lofi Chill', color: 'linear-gradient(135deg, #4c1d95, #8b5cf6)' },
      { name: 'Rock & Classics', q: 'Rock Classics', color: 'linear-gradient(135deg, #78350f, #f59e0b)' }
    ];

    let html = `
      <h2 class="section-title" style="margin-bottom: 12px;">Explore</h2>
      ${this.renderSearchFilterTabsHTML()}

      ${recent.length > 0 ? `
        <div style="margin: 12px 0 20px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 0.88rem; color: var(--text-secondary); font-weight: 600;">Recent Searches</span>
            <button class="tag-btn" onclick="App.library.clearRecentSearches(); App.renderSearchDefaultView();" style="font-size: 0.72rem; padding: 2px 8px;">Clear All</button>
          </div>
          <div class="recent-searches-bar">
            ${recent.map(term => `
              <span class="recent-search-chip" onclick="App.searchCategory('${term.replace(/'/g, "\\'")}')">
                <span>${term}</span>
                <span class="remove-chip" onclick="event.stopPropagation(); App.library.removeRecentSearch('${term.replace(/'/g, "\\'")}'); App.renderSearchDefaultView();">&times;</span>
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <h2 class="section-title" style="margin: 20px 0 16px 0;">Browse All Categories</h2>
      <div class="search-categories">
        ${popularCategories.map(cat => `
          <div class="category-tile" style="background: ${cat.color};" onclick="App.searchCategory('${cat.q}')">
            ${cat.name}
          </div>
        `).join('')}
      </div>
    `;

    this.mainView.innerHTML = html;
  }

  async executeSearch(query) {
    if (!query) {
      this.renderSearchDefaultView();
      return;
    }

    this.library.addRecentSearch(query);

    this.mainView.innerHTML = `
      <div style="padding: 12px 0 20px 0;">
        ${this.renderSearchFilterTabsHTML()}
      </div>
      <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
        <div class="playing-bars"><span></span><span></span><span></span><span></span></div>
        <p style="margin-top: 12px; font-weight: 600;">Searching "${query}"...</p>
      </div>
    `;

    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}&quality=${this.player.quality}`);
      const data = await resp.json();

      if (!data.success || (!data.results?.songs?.length && !data.results?.albums?.length && !data.results?.playlists?.length && !data.results?.artists?.length)) {
        this.mainView.innerHTML = `
          <div style="padding: 12px 0 20px 0;">
            ${this.renderSearchFilterTabsHTML()}
          </div>
          <div style="padding: 50px 20px; text-align: center;">
            <h2 style="font-size: 1.4rem; margin-bottom: 8px;">No results found for "${query}"</h2>
            <p style="color: var(--text-secondary);">Try checking your spelling or using another keyword.</p>
          </div>
        `;
        return;
      }

      this.lastSearchResults = data.results;
      this.lastSearchQuery = query;
      this.renderSearchResults(data.results, query);
    } catch (err) {
      console.error('Search error:', err);
      this.mainView.innerHTML = `
        <div style="padding: 12px 0 20px 0;">${this.renderSearchFilterTabsHTML()}</div>
        <p style="padding: 24px; color: var(--danger);">Network error while searching. Please try again.</p>
      `;
    }
  }

  renderSearchResults(results, query) {
    const filter = this.activeSearchCategory || 'all';
    const topSong = results.songs?.[0];
    const songs = results.songs || [];
    const albums = results.albums || [];
    const playlists = results.playlists || [];
    const artists = results.artists || [];

    let html = `
      <div style="padding-bottom: 12px;">
        ${this.renderSearchFilterTabsHTML()}
      </div>
    `;

    // 1. FILTER: ONLY SONGS
    if (filter === 'songs') {
      html += `
        <div>
          <h2 class="section-title" style="margin-bottom: 16px;">Songs (${songs.length})</h2>
          ${this.buildSongsTable(songs)}
        </div>
      `;
      this.mainView.innerHTML = html;
      return;
    }

    // 2. FILTER: ONLY ALBUMS
    if (filter === 'albums') {
      html += `
        <div>
          <h2 class="section-title" style="margin-bottom: 16px;">Albums (${albums.length})</h2>
          ${albums.length ? `
            <div class="cards-grid">
              ${albums.map(album => `
                <div class="music-card" onclick="App.openAlbum('${album.id}')">
                  <div class="card-img-wrap">
                    <img src="${album.image}" alt="${album.title}" loading="lazy">
                    <button class="card-play-btn" onclick="event.stopPropagation(); App.playAlbumImmediately('${album.id}')">
                      <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                  </div>
                  <div class="card-title">${album.title}</div>
                  <div class="card-subtitle">${album.subtitle}</div>
                </div>
              `).join('')}
            </div>
          ` : '<p style="color: var(--text-secondary); padding: 16px;">No albums found</p>'}
        </div>
      `;
      this.mainView.innerHTML = html;
      return;
    }

    // 3. FILTER: ONLY PLAYLISTS
    if (filter === 'playlists') {
      html += `
        <div>
          <h2 class="section-title" style="margin-bottom: 16px;">Playlists (${playlists.length})</h2>
          ${playlists.length ? `
            <div class="cards-grid">
              ${playlists.map(pl => `
                <div class="music-card" onclick="App.openPlaylist('${pl.id}')">
                  <div class="card-img-wrap">
                    <img src="${pl.image}" alt="${pl.title}" loading="lazy">
                    <button class="card-play-btn" onclick="event.stopPropagation(); App.playPlaylistImmediately('${pl.id}')">
                      <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                  </div>
                  <div class="card-title">${pl.title}</div>
                  <div class="card-subtitle">${pl.subtitle}</div>
                </div>
              `).join('')}
            </div>
          ` : '<p style="color: var(--text-secondary); padding: 16px;">No playlists found</p>'}
        </div>
      `;
      this.mainView.innerHTML = html;
      return;
    }

    // 4. FILTER: ONLY ARTISTS
    if (filter === 'artists') {
      html += `
        <div>
          <h2 class="section-title" style="margin-bottom: 16px;">Artists (${artists.length})</h2>
          ${artists.length ? `
            <div class="cards-grid">
              ${artists.map(ar => `
                <div class="music-card" onclick="App.openArtist('${ar.id}')">
                  <div class="card-img-wrap">
                    <img class="artist-round-avatar" src="${ar.image}" alt="${ar.title}" loading="lazy">
                  </div>
                  <div class="card-title" style="text-align: center;">${ar.title}</div>
                  <div class="card-subtitle" style="text-align: center;">Artist</div>
                </div>
              `).join('')}
            </div>
          ` : '<p style="color: var(--text-secondary); padding: 16px;">No artists found</p>'}
        </div>
      `;
      this.mainView.innerHTML = html;
      return;
    }

    // 5. DEFAULT ("ALL"): SHOW TOP RESULT, SONGS, ARTISTS, ALBUMS, PLAYLISTS
    html += `
      <div class="search-results-top">
        ${topSong ? `
          <div>
            <h2 class="section-title" style="margin-bottom: 12px;">Top Result</h2>
            <div class="top-result-card" onclick="App.playTrack(${JSON.stringify(topSong).replace(/"/g, '&quot;')})">
              <img class="top-result-art" src="${topSong.image}" alt="${topSong.title}">
              <div class="top-result-title">${topSong.title}</div>
              <div class="top-result-meta">
                <span class="top-result-badge">Song</span>
                <span>${topSong.artist}</span>
              </div>
              <button class="card-play-btn" onclick="event.stopPropagation(); App.playTrack(${JSON.stringify(topSong).replace(/"/g, '&quot;')})">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
          </div>
        ` : ''}

        <div>
          <h2 class="section-title" style="margin-bottom: 12px;">Songs (${songs.length})</h2>
          ${this.buildSongsTable(songs.slice(0, 15))}
        </div>
      </div>

      ${artists.length ? `
        <div class="section-header" style="margin-top: 32px;">
          <h2 class="section-title">Artists</h2>
        </div>
        <div class="cards-grid">
          ${artists.map(ar => `
            <div class="music-card" onclick="App.openArtist('${ar.id}')">
              <div class="card-img-wrap">
                <img class="artist-round-avatar" src="${ar.image}" alt="${ar.title}" loading="lazy">
              </div>
              <div class="card-title" style="text-align: center;">${ar.title}</div>
              <div class="card-subtitle" style="text-align: center;">Artist</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${albums.length ? `
        <div class="section-header" style="margin-top: 32px;">
          <h2 class="section-title">Albums</h2>
        </div>
        <div class="cards-grid">
          ${albums.map(album => `
            <div class="music-card" onclick="App.openAlbum('${album.id}')">
              <div class="card-img-wrap">
                <img src="${album.image}" alt="${album.title}" loading="lazy">
                <button class="card-play-btn" onclick="event.stopPropagation(); App.playAlbumImmediately('${album.id}')">
                  <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
              </div>
              <div class="card-title">${album.title}</div>
              <div class="card-subtitle">${album.subtitle}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${playlists.length ? `
        <div class="section-header" style="margin-top: 32px;">
          <h2 class="section-title">Playlists</h2>
        </div>
        <div class="cards-grid">
          ${playlists.map(pl => `
            <div class="music-card" onclick="App.openPlaylist('${pl.id}')">
              <div class="card-img-wrap">
                <img src="${pl.image}" alt="${pl.title}" loading="lazy">
                <button class="card-play-btn" onclick="event.stopPropagation(); App.playPlaylistImmediately('${pl.id}')">
                  <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
              </div>
              <div class="card-title">${pl.title}</div>
              <div class="card-subtitle">${pl.subtitle}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    this.mainView.innerHTML = html;
  }

  // --- Artist Profile View (Spotify Style) ---
  async openArtist(id) {
    this.mainView.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
        <div class="playing-bars"><span></span><span></span><span></span><span></span></div>
        <p style="margin-top: 12px; font-weight: 600;">Loading artist profile...</p>
      </div>
    `;

    try {
      const resp = await fetch(`/api/artist/${encodeURIComponent(id)}?quality=${this.player.quality}`);
      const data = await resp.json();
      if (!data.success) {
        this.showToast('Could not load artist profile', 'error');
        return;
      }

      this.renderArtistProfile(data);
    } catch (err) {
      console.error(err);
      this.mainView.innerHTML = `<p style="padding: 24px; color: var(--danger);">Failed to load artist profile.</p>`;
    }
  }

  renderArtistProfile(artist) {
    const formattedFans = artist.fanCount ? Number(artist.fanCount).toLocaleString() + ' monthly listeners' : 'Verified Artist';
    const songs = artist.songs || [];
    const albums = artist.albums || [];
    const safeJSON = JSON.stringify(songs).replace(/"/g, '&quot;');

    let html = `
      <div class="artist-hero" style="background-image: linear-gradient(180deg, rgba(18, 18, 18, 0.2) 0%, rgba(18, 18, 18, 0.95) 100%), url('${artist.image}');">
        ${artist.isVerified ? `
          <div class="artist-hero-verified">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            <span>Verified Artist</span>
          </div>
        ` : ''}
        <h1 class="artist-hero-name">${artist.name}</h1>
        <div class="artist-hero-fans">${formattedFans}</div>
      </div>

      <div class="detail-action-bar">
        ${songs.length ? `
          <button class="big-play-btn" onclick="App.playCollectionQueue(${safeJSON})" title="Play Popular">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
        ` : ''}
      </div>

      <div>
        <h2 class="section-title" style="margin-bottom: 16px;">Popular Songs</h2>
        ${this.buildSongsTable(songs)}
      </div>

      ${albums.length ? `
        <div class="section-header" style="margin-top: 40px;">
          <h2 class="section-title">Discography & Albums</h2>
        </div>
        <div class="cards-grid">
          ${albums.map(alb => `
            <div class="music-card" onclick="App.openAlbum('${alb.id}')">
              <div class="card-img-wrap">
                <img src="${alb.image}" alt="${alb.title}" loading="lazy">
                <button class="card-play-btn" onclick="event.stopPropagation(); App.playAlbumImmediately('${alb.id}')">
                  <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
              </div>
              <div class="card-title">${alb.title}</div>
              <div class="card-subtitle">${alb.subtitle}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    this.mainView.innerHTML = html;
  }

  // --- Collection & Detail Views ---
  async openPlaylist(id) {
    this.mainView.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
        <div class="playing-bars"><span></span><span></span><span></span><span></span></div>
        <p style="margin-top: 12px; font-weight: 600;">Loading playlist tracks...</p>
      </div>
    `;

    // Check user playlists first
    const customPl = this.library.getPlaylist(id);
    if (customPl) {
      this.renderCollectionDetail({
        id: customPl.id,
        title: customPl.name,
        subtitle: customPl.description || 'Custom User Playlist',
        image: customPl.songs[0]?.image || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
        songs: customPl.songs,
        type: 'Custom Playlist',
        isCustom: true
      });
      return;
    }

    try {
      const resp = await fetch(`/api/playlist/${encodeURIComponent(id)}?quality=${this.player.quality}`);
      const data = await resp.json();
      if (data.success) {
        this.renderCollectionDetail({
          id: data.id,
          title: data.title,
          subtitle: data.subtitle,
          image: data.image,
          songs: data.songs,
          type: 'Playlist'
        });
      }
    } catch (err) {
      console.error(err);
      this.mainView.innerHTML = `<p style="padding: 24px; color: var(--danger);">Failed to load playlist.</p>`;
    }
  }

  async playPlaylistImmediately(id) {
    const customPl = this.library.getPlaylist(id);
    if (customPl && customPl.songs.length > 0) {
      this.player.setQueue(customPl.songs, 0);
      return;
    }
    try {
      const resp = await fetch(`/api/playlist/${encodeURIComponent(id)}?quality=${this.player.quality}`);
      const data = await resp.json();
      if (data.success && data.songs?.length) {
        this.player.setQueue(data.songs, 0);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async openAlbum(id) {
    this.mainView.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
        <div class="playing-bars"><span></span><span></span><span></span><span></span></div>
        <p style="margin-top: 12px; font-weight: 600;">Loading album...</p>
      </div>
    `;

    try {
      const resp = await fetch(`/api/album/${encodeURIComponent(id)}?quality=${this.player.quality}`);
      const data = await resp.json();
      if (data.success) {
        this.renderCollectionDetail({
          id: data.id,
          title: data.title,
          subtitle: data.subtitle + (data.year ? ` • ${data.year}` : ''),
          image: data.image,
          songs: data.songs,
          type: 'Album'
        });
      }
    } catch (err) {
      console.error(err);
      this.mainView.innerHTML = `<p style="padding: 24px; color: var(--danger);">Failed to load album.</p>`;
    }
  }

  async playAlbumImmediately(id) {
    try {
      const resp = await fetch(`/api/album/${encodeURIComponent(id)}?quality=${this.player.quality}`);
      const data = await resp.json();
      if (data.success && data.songs?.length) {
        this.player.setQueue(data.songs, 0);
      }
    } catch (e) {
      console.error(e);
    }
  }

  renderCollectionDetail(collection) {
    const totalDuration = collection.songs.reduce((acc, s) => acc + (s.duration || 0), 0);
    const mins = Math.floor(totalDuration / 60);
    const safeSongsJSON = JSON.stringify(collection.songs).replace(/"/g, '&quot;');

    let html = `
      <div class="detail-hero">
        <img class="detail-hero-cover" src="${collection.image}" alt="${collection.title}">
        <div class="detail-hero-info">
          <span class="detail-hero-type">${collection.type}</span>
          <h1 class="detail-hero-title">${collection.title}</h1>
          <div class="detail-hero-meta">
            ${collection.subtitle ? `<span>${collection.subtitle} • </span>` : ''}
            <span><strong>${collection.songs.length} songs</strong>, about ${mins} min</span>
          </div>
        </div>
      </div>

      <div class="detail-action-bar">
        <button class="big-play-btn" onclick="App.playCollectionQueue(${safeSongsJSON})" title="Play All">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
        ${collection.isCustom ? `
          <button class="tag-btn" onclick="App.deleteUserPlaylist('${collection.id}')" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.4);">
            Delete Playlist
          </button>
        ` : ''}
      </div>

      ${this.buildSongsTable(collection.songs, collection.isCustom ? collection.id : null)}
    `;

    this.mainView.innerHTML = html;
  }

  deleteUserPlaylist(id) {
    if (confirm('Are you sure you want to delete this playlist?')) {
      this.library.deletePlaylist(id);
      this.updateLibrarySidebar();
      this.showToast('Playlist deleted');
      this.renderPlaylistsView();
    }
  }

  playCollectionQueue(songs) {
    if (!songs || !songs.length) return;
    this.player.setQueue(songs, 0);
  }

  // --- Liked Songs View ---
  renderLikedSongsView() {
    const liked = this.library.getLikedSongs();
    const safeSongsJSON = JSON.stringify(liked).replace(/"/g, '&quot;');

    let html = `
      <div class="detail-hero">
        <div class="library-item-icon liked-gradient" style="width: 190px; height: 190px; border-radius: var(--radius-md);">
          <svg style="width: 80px; height: 80px; fill: #fff;" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </div>
        <div class="detail-hero-info">
          <span class="detail-hero-type">Auto Playlist</span>
          <h1 class="detail-hero-title">Liked Songs</h1>
          <div class="detail-hero-meta">
            <span><strong>${liked.length} saved favourites</strong></span>
          </div>
        </div>
      </div>

      ${liked.length ? `
        <div class="detail-action-bar">
          <button class="big-play-btn" onclick="App.playCollectionQueue(${safeSongsJSON})" title="Play All Liked">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        ${this.buildSongsTable(liked)}
      ` : `
        <div style="padding: 60px 0; text-align: center; color: var(--text-secondary);">
          <svg style="width: 64px; height: 64px; fill: none; stroke: currentColor; stroke-width: 1.5; margin-bottom: 16px; opacity: 0.5;" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          <h3 style="font-size: 1.3rem; color: var(--text-primary); margin-bottom: 8px;">Songs you like will appear here</h3>
          <p style="font-size: 0.95rem;">Save your favorite tracks by clicking the heart button on any song.</p>
        </div>
      `}
    `;

    this.mainView.innerHTML = html;
  }

  // --- Dedicated "My Playlists" View ---
  renderPlaylistsView() {
    const playlists = this.library.getPlaylists();

    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <div>
          <h1 style="font-size: 2rem; font-weight: 800;">My Playlists</h1>
          <p style="color: var(--text-secondary); margin-top: 4px;">Organize and play your personal music collections</p>
        </div>
        <button class="tag-btn" onclick="document.getElementById('createPlaylistBtn')?.click()" style="background: var(--accent-green); color: #000; font-weight: 700; padding: 10px 18px;">
          + New Playlist
        </button>
      </div>

      ${playlists.length ? `
        <div class="cards-grid">
          ${playlists.map(pl => {
            const cover = pl.songs[0]?.image || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80';
            return `
              <div class="music-card" onclick="App.openPlaylist('${pl.id}')">
                <div class="card-img-wrap">
                  <img src="${cover}" alt="${pl.name}" loading="lazy">
                  <button class="card-play-btn" onclick="event.stopPropagation(); App.openPlaylist('${pl.id}')">
                    <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                </div>
                <div class="card-title">${pl.name}</div>
                <div class="card-subtitle">${pl.songs.length} tracks &bull; ${pl.description || 'Custom playlist'}</div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div style="padding: 60px 0; text-align: center; color: var(--text-secondary);">
          <h3 style="font-size: 1.3rem; color: var(--text-primary); margin-bottom: 8px;">No playlists yet</h3>
          <p>Create your first custom playlist with the button above.</p>
        </div>
      `}
    `;

    this.mainView.innerHTML = html;
  }

  // --- Local Files View ---
  renderLocalFilesView() {
    const localTracks = this.localFiles.getLocalTracks();
    const safeJSON = JSON.stringify(localTracks).replace(/"/g, '&quot;');

    let html = `
      <div class="detail-hero">
        <div class="library-item-icon local-gradient" style="width: 190px; height: 190px; border-radius: var(--radius-md);">
          <svg style="width: 80px; height: 80px; fill: #fff;" viewBox="0 0 24 24">
            <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
          </svg>
        </div>
        <div class="detail-hero-info">
          <span class="detail-hero-type">Local Collection</span>
          <h1 class="detail-hero-title">Local Audio Files</h1>
          <div class="detail-hero-meta">
            <span><strong>${localTracks.length} tracks imported</strong></span>
          </div>
        </div>
      </div>

      <div class="drop-zone" id="localDropZone">
        <svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
        <h3>Drag & drop audio files here or Click to Browse</h3>
        <p>Supports MP3, WAV, FLAC, M4A, OGG formats</p>
        <input type="file" id="localFileInput" multiple accept="audio/*" style="display: none;">
      </div>

      ${localTracks.length ? `
        <div class="detail-action-bar">
          <button class="big-play-btn" onclick="App.playCollectionQueue(${safeJSON})" title="Play All Local">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        ${this.buildSongsTable(localTracks)}
      ` : ''}
    `;

    this.mainView.innerHTML = html;
    this.localFiles.initDropZone();
  }

  // --- Songs Table Builder ---
  buildSongsTable(songs, playlistId = null) {
    if (!songs || !songs.length) {
      return '<p style="color: var(--text-secondary); padding: 12px;">No songs in this list.</p>';
    }

    const currentTrackId = this.library.getTrackId(this.player.currentTrack);

    return `
      <table class="songs-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th>Title</th>
            <th>Album</th>
            <th class="col-dur">Duration</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          ${songs.map((song, idx) => {
            const trackId = this.library.getTrackId(song);
            const isPlayingThis = (trackId === currentTrackId && this.player.isPlaying);
            const isLiked = this.library.isLiked(trackId);
            const dur = this.formatDuration(song.duration);
            const songJSON = JSON.stringify(song).replace(/"/g, '&quot;');

            return `
              <tr class="song-row ${trackId === currentTrackId ? 'playing' : ''}" onclick="App.playTrackFromList(${songJSON}, ${idx})">
                <td class="song-cell-num">
                  ${isPlayingThis ? `
                    <div class="playing-bars">
                      <span></span><span></span><span></span><span></span>
                    </div>
                  ` : `
                    <span class="song-num-text">${idx + 1}</span>
                    <button class="song-row-play-btn">
                      <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                  `}
                </td>
                <td class="song-cell-info">
                  <img class="song-cell-thumb" src="${song.image}" alt="${song.title}" loading="lazy">
                  <div class="song-cell-details">
                    <div class="song-cell-title">${song.title}</div>
                    <div class="song-cell-artist">${song.artist}${song.starring ? ` &bull; <span style="opacity: 0.75;">${song.starring}</span>` : ''}</div>
                  </div>
                </td>
                <td class="song-cell-album">${song.album || '-'}</td>
                <td class="song-cell-dur">${dur}</td>
                <td class="song-cell-actions">
                  <!-- Like Heart Button (Outlined default, Red when liked; opens Spotify-style Saved in modal) -->
                  <button class="song-action-btn heart-btn ${isLiked ? 'liked' : ''}" data-track-id="${trackId}" onclick="event.stopPropagation(); App.openSavedInModal(${songJSON})" title="${isLiked ? 'Saved in Liked Songs' : 'Save Song'}">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                  </button>

                  <!-- Download MP3 Button (beside heart) -->
                  <button class="song-action-btn" onclick="event.stopPropagation(); App.downloadSong(${songJSON})" title="Download MP3">
                    <svg viewBox="0 0 24 24">
                      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                    </svg>
                  </button>

                  <!-- Three Dots Menu Button (opens Spotify action sheet: Share, Add to playlist, Add to Queue, Go to Queue) -->
                  <button class="song-action-btn" onclick="event.stopPropagation(); App.openSongMenu(${songJSON})" title="More Options">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                    </svg>
                  </button>

                  ${playlistId ? `
                    <button class="song-action-btn" onclick="event.stopPropagation(); App.removeSongFromCustomPlaylist('${playlistId}', '${trackId}')" title="Remove from playlist">
                      <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                  ` : ''}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  removeSongFromCustomPlaylist(playlistId, trackId) {
    this.library.removeFromPlaylist(playlistId, trackId);
    this.showToast('Song removed from playlist');
    this.openPlaylist(playlistId);
  }

  playTrackFromList(song, index) {
    this.player.loadTrack(song);
  }

  playTrack(song) {
    this.player.loadTrack(song);
  }

  // --- Like / Favourite Button Logic (Synchronized Globally) ---
  toggleSongLike(song) {
    if (!song) return;
    const trackId = this.library.getTrackId(song);
    const isNowLiked = this.library.toggleLike(song);

    this.showToast(isNowLiked ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    this.updateLibrarySidebar();
    this.updateGlobalLikeState(trackId, isNowLiked);

    if (this.currentView === 'liked') {
      this.renderLikedSongsView();
    }
  }

  updateGlobalLikeState(trackId, isLiked) {
    // 1. Update player heart if this track is playing
    const curTrackId = this.library.getTrackId(this.player.currentTrack);
    if (curTrackId === trackId) {
      this.playerHeartBtn?.classList.toggle('liked', isLiked);
    }

    // 2. Update fullscreen player heart
    const fsHeartBtn = document.getElementById('fsHeartBtn');
    if (fsHeartBtn && curTrackId === trackId) {
      fsHeartBtn.classList.toggle('liked', isLiked);
    }

    // 3. Update all table row heart buttons with matching trackId
    document.querySelectorAll(`button[data-track-id="${trackId}"]`).forEach(btn => {
      btn.classList.toggle('liked', isLiked);
      btn.title = isLiked ? 'Remove from Liked' : 'Like';
    });
  }

  // --- Queue Drawer Display with Reordering & Removal ---
  renderQueue() {
    const listEl = document.getElementById('queueList');
    if (!listEl) return;

    if (!this.player.queue || this.player.queue.length === 0) {
      listEl.innerHTML = '<p style="color: var(--text-secondary); padding: 20px 0; text-align: center;">Queue is empty</p>';
      return;
    }

    const curIndex = this.player.queueIndex;

    listEl.innerHTML = this.player.queue.map((track, idx) => {
      const isCur = idx === curIndex;
      return `
        <div class="queue-item ${isCur ? 'active-track' : ''}">
          <div class="queue-reorder-ctrls">
            <button class="queue-reorder-btn" onclick="App.player.reorderQueue(${idx}, ${idx - 1})" ${idx === 0 ? 'disabled style="opacity:0.3"' : ''} title="Move Up">▲</button>
            <button class="queue-reorder-btn" onclick="App.player.reorderQueue(${idx}, ${idx + 1})" ${idx === this.player.queue.length - 1 ? 'disabled style="opacity:0.3"' : ''} title="Move Down">▼</button>
          </div>
          <img src="${track.image}" style="width: 40px; height: 40px; border-radius: var(--radius-sm); object-fit: cover;" alt="">
          <div style="flex: 1; min-width: 0; cursor: pointer;" onclick="App.player.queueIndex = ${idx}; App.player.loadTrack(App.player.queue[${idx}]);">
            <div style="font-weight: 600; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${isCur ? 'var(--accent-green)' : 'var(--text-primary)'};">
              ${track.title}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${track.artist}
            </div>
          </div>
          <button class="queue-remove-btn" onclick="App.player.removeFromQueue(${idx})" title="Remove from queue">&times;</button>
        </div>
      `;
    }).join('');
  }

  // --- UI Update Callbacks ---
  updatePlayState(isPlaying) {
    const playSvg = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    const pauseSvg = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

    if (this.playPauseBtn) {
      this.playPauseBtn.innerHTML = isPlaying ? pauseSvg : playSvg;
      this.playPauseBtn.title = isPlaying ? 'Pause' : 'Play';
    }

    const fsBtn = document.getElementById('fsPlayPauseBtn');
    if (fsBtn) {
      fsBtn.innerHTML = isPlaying ? pauseSvg : playSvg;
    }

    // Update playing bars in table rows
    const curTrackId = this.library.getTrackId(this.player.currentTrack);
    document.querySelectorAll('.song-row').forEach(row => {
      row.classList.toggle('playing', row.dataset.trackId === curTrackId && isPlaying);
    });
  }

  setBufferingState(isBuffering) {
    if (this.playPauseBtn) {
      this.playPauseBtn.style.opacity = isBuffering ? '0.6' : '1';
    }
  }

  updateProgress(currentTime, duration) {
    if (this.currentTimeEl) {
      this.currentTimeEl.textContent = this.formatDuration(currentTime);
    }
    if (this.totalDurationEl && duration > 0) {
      this.totalDurationEl.textContent = this.formatDuration(duration);
    }
    if (this.progressBarFill && duration > 0) {
      const pct = (currentTime / duration) * 100;
      this.progressBarFill.style.width = pct + '%';
    }

    // Sync fullscreen progress bar if present
    const fsFill = document.getElementById('fsProgressBarFill');
    if (fsFill && duration > 0) {
      fsFill.style.width = (currentTime / duration) * 100 + '%';
    }
    const fsCur = document.getElementById('fsCurrentTime');
    if (fsCur) fsCur.textContent = this.formatDuration(currentTime);
  }

  updateVolumeUI(vol) {
    if (this.volumeFill) {
      this.volumeFill.style.width = (vol * 100) + '%';
    }
  }

  onTrackChange(track) {
    if (!track) return;
    const titleEl = document.getElementById('playerTrackTitle');
    const artistEl = document.getElementById('playerTrackArtist');
    const thumbEl = document.getElementById('playerThumb');

    if (titleEl) titleEl.textContent = track.title;
    if (artistEl) artistEl.textContent = track.artist;
    if (thumbEl && track.image) thumbEl.src = track.image;

    // Like button state in player
    const isLiked = this.library.isLiked(track);
    this.playerHeartBtn?.classList.toggle('liked', isLiked);

    // Fullscreen view elements
    const fsCover = document.getElementById('fsCover');
    const fsTitle = document.getElementById('fsTitle');
    const fsArtist = document.getElementById('fsArtist');
    if (fsCover && track.image) fsCover.src = track.image;
    if (fsTitle) fsTitle.textContent = track.title;
    if (fsArtist) fsArtist.textContent = track.artist;

    // Ambient background glow
    this.updateAmbientColor(track.image);

    // Update queue active styling
    this.renderQueue();

    // Auto load lyrics if lyrics overlay is open
    if (this.lyrics.isOpen) {
      this.lyrics.loadLyrics(track);
    }
  }

  // --- Dynamic Color Extraction ---
  updateAmbientColor(imageUrl) {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = 10;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 10, 10);
        const data = ctx.getImageData(0, 0, 10, 10).data;

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (brightness > 20 && brightness < 235) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
        }

        if (count > 0) {
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);
          if (this.ambientGlow) {
            this.ambientGlow.style.background = `linear-gradient(180deg, rgba(${r}, ${g}, ${b}, 0.38) 0%, rgba(18, 18, 18, 0) 100%)`;
          }
        }
      } catch (e) {}
    };
  }

  // --- Library Sidebar Rendering ---
  updateLibrarySidebar() {
    const list = document.getElementById('sidebarPlaylistsList');
    if (!list) return;

    const playlists = this.library.getPlaylists();
    list.innerHTML = playlists.map(pl => `
      <div class="library-item" onclick="App.openPlaylist('${pl.id}')">
        <div class="library-item-icon" style="background: rgba(255,255,255,0.07);">
          <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        </div>
        <div class="library-item-info">
          <div class="library-item-title">${pl.name}</div>
          <div class="library-item-sub">Playlist &bull; ${pl.songs.length} songs</div>
        </div>
      </div>
    `).join('');
  }

  // --- Downloads ---
  downloadCurrentTrack() {
    if (this.player.currentTrack) {
      this.downloadSong(this.player.currentTrack);
    }
  }

  downloadSong(song) {
    if (!song) return;
    const filename = `${song.title} - ${song.artist}.mp3`;
    this.showToast(`Starting download: ${song.title}`);

    if (song.audioUrl) {
      const a = document.createElement('a');
      a.href = `/api/download?url=${encodeURIComponent(song.audioUrl)}&filename=${encodeURIComponent(filename)}`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  toggleFullscreen(forceState) {
    if (!this.fullscreenOverlay) return;
    const shouldOpen = forceState !== undefined ? forceState : !this.fullscreenOverlay.classList.contains('active');
    this.fullscreenOverlay.classList.toggle('active', shouldOpen);
    if (shouldOpen && this.player.currentTrack) {
      this.onTrackChange(this.player.currentTrack);
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast' + (type === 'error' ? ' error' : '');
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // ==========================================================================
  // Spotify-Style Context Menu (Image 2) & "Saved In" Modal (Image 3)
  // ==========================================================================
  openSongMenu(song) {
    if (!song) return;
    this.selectedMenuSong = song;

    const modal = document.getElementById('songContextMenuModal');
    const imgEl = document.getElementById('menuTrackImg');
    const titleEl = document.getElementById('menuTrackTitle');
    const artistEl = document.getElementById('menuTrackArtist');

    if (imgEl) imgEl.src = song.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';
    if (titleEl) titleEl.textContent = song.title || 'Unknown Title';
    if (artistEl) artistEl.textContent = song.artist || 'Unknown Artist';

    // Wire actions
    const shareBtn = document.getElementById('menuActionShare');
    if (shareBtn) {
      shareBtn.onclick = () => {
        this.closeSongMenu();
        this.shareSong(song);
      };
    }

    const addToPlaylistBtn = document.getElementById('menuActionAddToPlaylist');
    if (addToPlaylistBtn) {
      addToPlaylistBtn.onclick = () => {
        this.closeSongMenu();
        this.openSavedInModal(song);
      };
    }

    const addToQueueBtn = document.getElementById('menuActionAddToQueue');
    if (addToQueueBtn) {
      addToQueueBtn.onclick = () => {
        this.closeSongMenu();
        this.player.addToQueue(song);
        this.showToast(`Added "${song.title}" to Queue`);
      };
    }

    const goToQueueBtn = document.getElementById('menuActionGoToQueue');
    if (goToQueueBtn) {
      goToQueueBtn.onclick = () => {
        this.closeSongMenu();
        this.queueDrawer?.classList.add('open');
        this.renderQueue();
      };
    }

    const downloadBtn = document.getElementById('menuActionDownload');
    if (downloadBtn) {
      downloadBtn.onclick = () => {
        this.closeSongMenu();
        this.downloadSong(song);
      };
    }

    const closeBtn = document.getElementById('closeSongContextMenu');
    if (closeBtn) {
      closeBtn.onclick = () => this.closeSongMenu();
    }

    if (modal) {
      modal.classList.add('open');
      modal.onclick = (e) => {
        if (e.target === modal) this.closeSongMenu();
      };
    }
  }

  closeSongMenu() {
    document.getElementById('songContextMenuModal')?.classList.remove('open');
  }

  shareSong(song) {
    if (!song) return;
    const shareData = {
      title: song.title,
      text: `Listen to "${song.title}" by ${song.artist} on Aura Music!`,
      url: window.location.origin + `/?song=${encodeURIComponent(song.id || song.title)}`
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      navigator.share(shareData).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(shareData.url).then(() => {
        this.showToast('Song link copied to clipboard!');
      }).catch(() => {
        this.showToast(`Song: ${song.title} - ${song.artist}`);
      });
    } else {
      this.showToast(`Song: ${song.title} - ${song.artist}`);
    }
  }

  openSavedInModal(song) {
    if (!song) return;
    this.selectedSavedInSong = song;

    const modal = document.getElementById('savedInModal');
    if (!modal) return;

    // Reset search
    const searchInput = document.getElementById('savedInSearchInput');
    if (searchInput) {
      searchInput.value = '';
      searchInput.oninput = (e) => this.renderSavedInList(song, e.target.value.trim());
    }

    // New Playlist button in header
    const newPlBtn = document.getElementById('savedInNewPlaylistBtn');
    if (newPlBtn) {
      newPlBtn.onclick = () => {
        modal.classList.remove('open');
        const input = document.getElementById('newPlaylistNameInput');
        if (input) input.value = '';
        this.createPlaylistModal?.classList.add('open');
      };
    }

    // Done and Cancel buttons
    const doneTopBtn = document.getElementById('savedInDoneTopBtn');
    const doneBtn = document.getElementById('savedInDoneBtn');
    const cancelBtn = document.getElementById('savedInCancelBtn');

    const closeModal = () => modal.classList.remove('open');
    if (doneTopBtn) doneTopBtn.onclick = closeModal;
    if (doneBtn) doneBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    this.renderSavedInList(song, '');
    modal.classList.add('open');
  }

  renderSavedInList(song, filterText = '') {
    const listEl = document.getElementById('savedInList');
    if (!listEl || !song) return;

    const trackId = this.library.getTrackId(song);
    const isLiked = this.library.isLiked(trackId);
    const playlists = this.library.getPlaylists();

    const q = (filterText || '').toLowerCase();
    const filteredPlaylists = playlists.filter(p => p.name.toLowerCase().includes(q));

    let html = '';

    // 1. "Liked Songs" item (Image 3 top row)
    if (!filterText || 'liked songs'.includes(q)) {
      html += `
        <div class="saved-in-row" onclick="App.toggleSavedInLiked()">
          <div class="saved-in-item-left">
            <div class="saved-in-liked-card">
              <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </div>
            <div class="saved-in-item-meta">
              <div class="saved-in-item-title">Liked Songs</div>
              <div class="saved-in-item-subtitle">${this.library.getLikedSongs().length} saved tracks</div>
            </div>
          </div>
          <div class="saved-in-check-circle ${isLiked ? 'checked' : ''}">
            ${isLiked ? '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : '+'}
          </div>
        </div>
      `;
    }

    // 2. User Playlists list
    filteredPlaylists.forEach(pl => {
      const isInThisPlaylist = pl.songs && pl.songs.some(s => this.library.getTrackId(s) === trackId);
      const thumb = (pl.songs && pl.songs[0]?.image) || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';

      html += `
        <div class="saved-in-row" onclick="App.toggleSavedInPlaylist('${pl.id}')">
          <div class="saved-in-item-left">
            <img class="saved-in-card-thumb" src="${thumb}" alt="${pl.name}">
            <div class="saved-in-item-meta">
              <div class="saved-in-item-title">${pl.name}</div>
              <div class="saved-in-item-subtitle">${pl.songs ? pl.songs.length : 0} songs</div>
            </div>
          </div>
          <div class="saved-in-check-circle ${isInThisPlaylist ? 'checked' : ''}">
            ${isInThisPlaylist ? '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : '+'}
          </div>
        </div>
      `;
    });

    if (!html) {
      html = '<p style="color: var(--text-secondary); padding: 16px; text-align: center;">No playlists found</p>';
    }

    listEl.innerHTML = html;
  }

  toggleSavedInLiked() {
    if (!this.selectedSavedInSong) return;
    const song = this.selectedSavedInSong;
    const trackId = this.library.getTrackId(song);
    const isNowLiked = this.library.toggleLike(song);

    this.showToast(isNowLiked ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    this.updateLibrarySidebar();
    this.updateGlobalLikeState(trackId, isNowLiked);

    if (this.currentView === 'liked') {
      this.renderLikedSongsView();
    }

    // Refresh list checkboxes
    const searchVal = document.getElementById('savedInSearchInput')?.value.trim() || '';
    this.renderSavedInList(song, searchVal);
  }

  toggleSavedInPlaylist(playlistId) {
    if (!this.selectedSavedInSong) return;
    const song = this.selectedSavedInSong;
    const trackId = this.library.getTrackId(song);
    const pl = this.library.getPlaylist(playlistId);
    if (!pl) return;

    const isInPlaylist = pl.songs && pl.songs.some(s => this.library.getTrackId(s) === trackId);
    if (isInPlaylist) {
      this.library.removeFromPlaylist(playlistId, trackId);
      this.showToast(`Removed from "${pl.name}"`);
    } else {
      this.library.addToPlaylist(playlistId, song);
      this.showToast(`Added to "${pl.name}"`);
    }

    this.updateLibrarySidebar();
    if (this.currentView === 'playlists') {
      this.renderPlaylistsView();
    }

    // Refresh list checkboxes
    const searchVal = document.getElementById('savedInSearchInput')?.value.trim() || '';
    this.renderSavedInList(song, searchVal);
  }

  formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new AppController();
});
