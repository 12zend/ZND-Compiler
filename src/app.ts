import { createZND, ZNDInstance, ZNDConfig } from './index';
import { ProjectLoader, ProjectLoadError } from './loader/ProjectLoader';

export type Route = 'home' | 'player' | 'error';

export interface AppState {
  route: Route;
  projectName: string | null;
  error: string | null;
  loading: boolean;
  instance: ZNDInstance | null;
}

const state: AppState = {
  route: 'home',
  projectName: null,
  error: null,
  loading: false,
  instance: null
};

const projectLoader = new ProjectLoader();

const templates: Record<string, string> = {
  loading: `
    <div class="loading-screen">
      <div class="spinner"></div>
      <p class="loading-text">Loading project...</p>
      <p class="loading-sub" id="loadingStatus">Processing file...</p>
      <div class="progress-bar">
        <div class="progress-fill" id="progressFill"></div>
      </div>
    </div>
  `,
  error: `
    <div class="error-screen">
      <div class="error-icon">⚠️</div>
      <h2>Error</h2>
      <p class="error-message">{{message}}</p>
      <div class="error-actions">
        <button class="btn-primary" onclick="location.reload()">Try Again</button>
      </div>
    </div>
  `,
  player: `
    <div class="player-container">
      <div class="player-header">
        <button class="back-link" onclick="location.reload()">← New Project</button>
        <h1 class="project-title" id="projectTitle">Loading...</h1>
        <div class="player-controls">
          <button id="playPauseBtn" class="control-btn">▶</button>
          <span id="fpsDisplay" class="fps-badge">0 FPS</span>
        </div>
      </div>
      <div class="player-main">
        <canvas id="scratchCanvas" width="480" height="360"></canvas>
        <div class="player-info">
          <div class="info-row">
            <span class="info-label">Project:</span>
            <span id="projectName" class="info-value">-</span>
          </div>
          <div class="info-row">
            <span class="info-label">Status:</span>
            <span id="projectStatus" class="info-value status-stopped">Stopped</span>
          </div>
          <div class="info-row">
            <span class="info-label">Sprites:</span>
            <span id="spriteCount" class="info-value">0</span>
          </div>
        </div>
      </div>
      <div class="player-footer">
        <p class="powered-by">Powered by <a href="https://scratch.mit.edu" target="_blank">Scratch</a> • Rendered with ZND</p>
      </div>
    </div>
  `
};

const globalCSS = `
  :root {
    --bg-primary: #1a1a2e;
    --bg-secondary: #16213e;
    --bg-tertiary: #0f3460;
    --accent: #00d9ff;
    --accent-dark: #00b8d9;
    --text-primary: #eee;
    --text-secondary: #aaa;
    --success: #00ff88;
    --error: #e94560;
  }
  
  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    min-height: 100vh;
    line-height: 1.6;
  }
  
  .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
  
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 12px 24px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.2s;
  }
  
  .btn-primary {
    background: var(--accent);
    color: var(--bg-primary);
  }
  .btn-primary:hover { background: var(--accent-dark); }
  
  .btn-secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
  .btn-secondary:hover { background: #1a4a80; }
  
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  
  /* Loading Screen */
  .loading-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
  }
  
  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid var(--bg-tertiary);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin { to { transform: rotate(360deg); } }
  
  .loading-text {
    margin-top: 20px;
    font-size: 1.25rem;
    font-weight: 600;
  }
  
  .loading-sub {
    margin-top: 8px;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }
  
  .progress-bar {
    width: 200px;
    height: 4px;
    background: var(--bg-tertiary);
    border-radius: 2px;
    margin-top: 20px;
    overflow: hidden;
  }
  
  .progress-fill {
    height: 100%;
    background: var(--accent);
    width: 0%;
    transition: width 0.3s;
  }
  
  /* Error Screen */
  .error-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
    padding: 40px;
  }
  
  .error-icon { font-size: 4rem; margin-bottom: 20px; }
  .error-screen h2 { font-size: 1.75rem; margin-bottom: 12px; }
  .error-message { color: var(--text-secondary); margin-bottom: 24px; max-width: 400px; }
  
  .error-actions { display: flex; gap: 12px; }
  
  /* Home Page */
  .home { padding: 60px 20px; text-align: center; }
  .home h1 { font-size: 2.5rem; margin-bottom: 12px; color: var(--accent); }
  .home .subtitle { color: var(--text-secondary); margin-bottom: 48px; font-size: 1.1rem; }
  
  .upload-zone {
    max-width: 600px;
    margin: 0 auto 40px;
  }
  
  .drop-zone {
    border: 3px dashed var(--bg-tertiary);
    border-radius: 16px;
    padding: 60px 40px;
    background: var(--bg-secondary);
    transition: all 0.3s;
    cursor: pointer;
  }
  
  .drop-zone:hover, .drop-zone.drag-over {
    border-color: var(--accent);
    background: rgba(0, 217, 255, 0.05);
  }
  
  .drop-zone-icon { font-size: 3rem; margin-bottom: 16px; }
  .drop-zone-title { font-size: 1.25rem; font-weight: 600; margin-bottom: 8px; }
  .drop-zone-subtitle { color: var(--text-secondary); margin-bottom: 20px; }
  .drop-zone-formats { color: var(--text-secondary); font-size: 0.85rem; }
  
  .file-input { display: none; }
  
  .file-selected {
    margin-top: 20px;
    padding: 16px;
    background: var(--bg-tertiary);
    border-radius: 8px;
    display: none;
  }
  
  .file-selected.visible { display: block; }
  
  .file-name { font-weight: 600; color: var(--accent); }
  .file-size { color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px; }
  
  .upload-btn {
    margin-top: 16px;
    width: 100%;
  }
  
  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 24px;
    margin-top: 60px;
    text-align: left;
  }
  
  .feature-card {
    background: var(--bg-secondary);
    padding: 24px;
    border-radius: 12px;
    border: 1px solid var(--bg-tertiary);
  }
  
  .feature-card h3 { color: var(--accent); margin-bottom: 12px; }
  .feature-card p { color: var(--text-secondary); font-size: 0.95rem; }
  
  /* Player */
  .player-container { display: flex; flex-direction: column; min-height: 100vh; }
  
  .player-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--bg-tertiary);
  }
  
  .back-link {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 1rem;
    font-weight: 500;
  }
  .back-link:hover { text-decoration: underline; }
  
  .project-title {
    font-size: 1.1rem;
    font-weight: 600;
  }
  
  .player-controls { display: flex; align-items: center; gap: 12px; }
  
  .control-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--bg-primary);
    border: none;
    cursor: pointer;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  
  .control-btn:hover { transform: scale(1.1); }
  
  .fps-badge {
    background: var(--bg-tertiary);
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  
  .player-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
    gap: 20px;
  }
  
  #scratchCanvas {
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    max-width: 100%;
    height: auto;
  }
  
  .player-info {
    background: var(--bg-secondary);
    padding: 16px 24px;
    border-radius: 8px;
    display: flex;
    gap: 32px;
  }
  
  .info-row { display: flex; gap: 8px; align-items: center; }
  .info-label { color: var(--text-secondary); font-size: 0.9rem; }
  .info-value { font-weight: 600; font-variant-numeric: tabular-nums; }
  .info-value.status-stopped { color: var(--error); }
  .info-value.status-running { color: var(--success); }
  
  .player-footer {
    text-align: center;
    padding: 20px;
    color: var(--text-secondary);
    font-size: 0.85rem;
  }
  
  .player-footer a { color: var(--accent); }
`;

function setLoadingProgress(percent: number, status: string): void {
  const progressFill = document.getElementById('progressFill');
  const loadingStatus = document.getElementById('loadingStatus');
  if (progressFill) progressFill.style.width = `${percent}%`;
  if (loadingStatus) loadingStatus.textContent = status;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderHome(): void {
  document.title = 'ZND - Scratch Project Player';
  document.body.innerHTML = `
    <style>${globalCSS}</style>
    <div class="home container">
      <h1>ZND Compiler</h1>
      <p class="subtitle">High-performance Scratch project player</p>
      
      <div class="upload-zone">
        <div class="drop-zone" id="dropZone">
          <div class="drop-zone-icon">📁</div>
          <div class="drop-zone-title">Drop your .sb3 file here</div>
          <div class="drop-zone-subtitle">or click to browse</div>
          <div class="drop-zone-formats">Supports .sb3 files exported from Scratch</div>
          <input type="file" id="fileInput" class="file-input" accept=".sb3">
        </div>
        
        <div class="file-selected" id="fileSelected">
          <div class="file-name" id="fileName"></div>
          <div class="file-size" id="fileSize"></div>
          <button class="btn btn-primary upload-btn" id="loadBtn">Load Project</button>
        </div>
      </div>
      
      <div class="features">
        <div class="feature-card">
          <h3>⚡ Fast</h3>
          <p>Optimized JavaScript compilation with WebGL rendering for smooth performance.</p>
        </div>
        <div class="feature-card">
          <h3>🔒 Private</h3>
          <p>Files are processed locally in your browser. Nothing is uploaded to any server.</p>
        </div>
        <div class="feature-card">
          <h3>📱 Responsive</h3>
          <p>Works on any device with a modern browser. No downloads required.</p>
        </div>
      </div>
    </div>
  `;

  const dropZone = document.getElementById('dropZone')!;
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;
  const fileSelected = document.getElementById('fileSelected')!;
  const fileName = document.getElementById('fileName')!;
  const fileSize = document.getElementById('fileSize')!;
  const loadBtn = document.getElementById('loadBtn')!;

  let selectedFile: File | null = null;

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFileSelect(fileInput.files[0]);
    }
  });

  function handleFileSelect(file: File): void {
    if (!file.name.endsWith('.sb3')) {
      renderError('Please select a valid .sb3 file');
      return;
    }
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileSelected.classList.add('visible');
  }

  loadBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    await loadAndRenderProject(selectedFile);
  });
}

function renderLoading(): void {
  document.body.innerHTML = `
    <style>${globalCSS}</style>
    ${templates.loading}
  `;
  setLoadingProgress(10, 'Processing file...');
}

function renderPlayer(projectName: string): void {
  document.body.innerHTML = `
    <style>${globalCSS}</style>
    ${templates.player}
  `;

  const projectNameEl = document.getElementById('projectName');
  const projectTitle = document.getElementById('projectTitle');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const fpsDisplay = document.getElementById('fpsDisplay');
  const projectStatus = document.getElementById('projectStatus');

  if (projectNameEl) projectNameEl.textContent = projectName;
  if (projectTitle) projectTitle.textContent = projectName;
  
  let isPlaying = false;

  const canvas = document.getElementById('scratchCanvas') as HTMLCanvasElement;
  if (!canvas) return;

  const updateFPS = (): void => {
    if (fpsDisplay && state.instance) {
      fpsDisplay.textContent = `${state.instance.getFPS().toFixed(1)} FPS`;
    }
    requestAnimationFrame(updateFPS);
  };
  updateFPS();

  playPauseBtn?.addEventListener('click', () => {
    if (!state.instance) return;
    
    if (isPlaying) {
      state.instance.stop();
      playPauseBtn.textContent = '▶';
      if (projectStatus) {
        projectStatus.textContent = 'Stopped';
        projectStatus.className = 'info-value status-stopped';
      }
    } else {
      state.instance.start();
      playPauseBtn.textContent = '⏸';
      if (projectStatus) {
        projectStatus.textContent = 'Running';
        projectStatus.className = 'info-value status-running';
      }
    }
    isPlaying = !isPlaying;
  });

  setLoadingProgress(20, 'Initializing player...');
}

function renderError(message: string): void {
  document.title = 'Error - ZND';
  document.body.innerHTML = `
    <style>${globalCSS}</style>
    ${templates.error.replace('{{message}}', message)}
  `;
}

async function loadAndRenderProject(file: File): Promise<void> {
  renderLoading();

  try {
    setLoadingProgress(30, 'Loading project file...');

    const sb3Project = await projectLoader.loadFromFile(file);

    setLoadingProgress(60, 'Compiling scripts...');

    renderPlayer(file.name);

    const canvas = document.getElementById('scratchCanvas') as HTMLCanvasElement;

    if (!canvas) {
      throw new Error('Failed to initialize canvas');
    }

    const instance = createZND({
      canvas,
      width: 480,
      height: 360,
      autoStart: false,
      debugMode: false
    });

    state.instance = instance;

    setLoadingProgress(80, 'Initializing runtime...');
    
    await instance.loadProject(sb3Project);

    setLoadingProgress(90, 'Starting...');

    const spriteCountEl = document.getElementById('spriteCount');
    const ctx = instance.engine.getContext();
    if (spriteCountEl && ctx) {
      spriteCountEl.textContent = ctx.sprites.size.toString();
    }

    setLoadingProgress(100, 'Ready!');

    instance.start();

    const playPauseBtn = document.getElementById('playPauseBtn');
    const projectStatus = document.getElementById('projectStatus');
    if (playPauseBtn) playPauseBtn.textContent = '⏸';
    if (projectStatus) {
      projectStatus.textContent = 'Running';
      projectStatus.className = 'info-value status-running';
    }

    document.title = `${file.name} - ZND`;

  } catch (err) {
    console.error('Failed to load project:', err);
    const message = err instanceof Error ? err.message : 'Failed to load project';
    renderError(message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderHome();
});
