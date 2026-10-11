/**
 * localFiles.js - Local Audio Files Player for Aura Music
 * Allows dragging and dropping or selecting personal audio files.
 */

class LocalFileManager {
  constructor() {
    this.localTracks = [];
  }

  initDropZone() {
    const dropZone = document.getElementById('localDropZone');
    const fileInput = document.getElementById('localFileInput');

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      this.handleFiles(e.target.files);
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files) {
        this.handleFiles(e.dataTransfer.files);
      }
    });
  }

  handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    let addedCount = 0;
    Array.from(fileList).forEach(file => {
      if (file.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(file.name)) {
        const url = URL.createObjectURL(file);
        
        // Clean song title from filename
        let cleanName = file.name.replace(/\.[^/.]+$/, '');
        let artist = 'Local Artist';
        if (cleanName.includes(' - ')) {
          const parts = cleanName.split(' - ');
          artist = parts[0].trim();
          cleanName = parts.slice(1).join(' - ').trim();
        }

        const track = {
          id: 'local_' + Math.random().toString(36).substr(2, 9),
          title: cleanName,
          artist: artist,
          album: 'Local Computer Files',
          image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
          duration: 0,
          audioUrl: url,
          isLocal: true,
          fileName: file.name
        };

        this.localTracks.push(track);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      if (window.App) {
        window.App.showToast(`Imported ${addedCount} local audio tracks!`);
        window.App.renderLocalFilesView();
        window.App.updateLibrarySidebar();
      }
    }
  }

  getLocalTracks() {
    return this.localTracks;
  }
}

window.LocalFileManager = LocalFileManager;
