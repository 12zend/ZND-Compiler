import { createZND, ZNDInstance, ZNDConfig } from './index';
import type { Benchmark } from './utils/benchmark';

export type Route = 'home' | 'player' | 'error';

export interface AppState {
  route: Route;
  projectId: string | null;
  error: string | null;
  loading: boolean;
  instance: ZNDInstance | null;
}

const state: AppState = {
  route: 'home',
  projectId: null,
  error: null,
  loading: false,
  instance: null
};

const routes: Record<string, (params: Record<string, string>) => void> = {
  '^/?$': () => renderHome(),
  '^/(\\d+)/?$': (params) => renderPlayer(params[1]),
  '^/project/(\\d+)/?$': (params) => renderPlayer(params[1])
};

const templates: Record<string, string> = {
  loading: `
    <div class="loading-screen">
      <div class="spinner"></div>
      <p class="loading-text">Loading project...</p>
      <p class="loading-sub" id="loadingStatus">Fetching from Scratch...</p>
      <div class="progress-bar">
        <div class="progress-fill" id="progressFill"></div>
      </div>
    </div>
  `,
  error: `
    <div class="error-screen">
      <div class="error-icon">⚠️</div>
      <h2>Project Not Found</h2>
      <p class="error-message">{{message}}</p>
      <div class="error-actions">
        <button class="btn-primary" onclick="window.history.back()">Go Back</button>
        <a href="/" class="btn-secondary">Home</a>
      </div>
      <p class="error-hint">The project may be private, deleted, or the ID is invalid.</p>
    </div>
  `,
  player: `
    <div class="player-container">
      <div class="player-header">
        <a href="/" class="back-link">← Back</a>
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
            <span class="info-label">Project ID:</span>
            <span id="projectIdDisplay" class="info-value">-</span>
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
  .error-hint { margin-top: 24px; font-size: 0.85rem; color: var(--text-secondary); }
  
  /* Home Page */
  .home { padding: 60px 20px; text-align: center; }
  .home h1 { font-size: 2.5rem; margin-bottom: 12px; color: var(--accent); }
  .home .subtitle { color: var(--text-secondary); margin-bottom: 48px; font-size: 1.1rem; }
  
  .search-box {
    max-width: 500px;
    margin: 0 auto 40px;
  }
  
  .search-form {
    display: flex;
    gap: 12px;
  }
  
  .search-input {
    flex: 1;
    padding: 16px 20px;
    border: 2px solid var(--bg-tertiary);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 1.1rem;
    transition: border-color 0.2s;
  }
  
  .search-input:focus { outline: none; border-color: var(--accent); }
  .search-input::placeholder { color: var(--text-secondary); }
  
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
    color: var(--accent);
    text-decoration: none;
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

class Router {
  private routes: Array<{ pattern: RegExp; handler: (params: string[]) => void }> = [];

  addRoute(pattern: string, handler: (params: string[]) => void): void {
    this.routes.push({ pattern: new RegExp(pattern), handler });
  }

  navigate(path: string): void {
    for (const route of this.routes) {
      const match = path.match(route.pattern);
      if (match) {
        route.handler(match.slice(1));
        return;
      }
    }
    renderError('Page not found');
  }

  getPath(): string {
    return window.location.pathname;
  }
}

const router = new Router();

function setLoadingProgress(percent: number, status: string): void {
  const progressFill = document.getElementById('progressFill');
  const loadingStatus = document.getElementById('loadingStatus');
  if (progressFill) progressFill.style.width = `${percent}%`;
  if (loadingStatus) loadingStatus.textContent = status;
}

function renderHome(): void {
  document.title = 'ZND - Scratch Project Player';
  document.body.innerHTML = `
    <style>${globalCSS}</style>
    <div class="home container">
      <h1>ZND Compiler</h1>
      <p class="subtitle">High-performance Scratch project player</p>
      
      <div class="search-box">
        <form class="search-form" onsubmit="event.preventDefault(); handleSearch();">
          <input type="text" id="projectInput" class="search-input" 
            placeholder="Enter Scratch Project ID (e.g., 10128409)" 
            pattern="\\d+"
            required>
          <button type="submit" class="btn btn-primary">Play</button>
        </form>
      </div>
      
      <div class="features">
        <div class="feature-card">
          <h3>⚡ Fast</h3>
          <p>Optimized JavaScript compilation with WebGL rendering for smooth performance.</p>
        </div>
        <div class="feature-card">
          <h3>🔗 Direct Links</h3>
          <p>Share projects easily with direct URLs. Just add the project ID to the URL.</p>
        </div>
        <div class="feature-card">
          <h3>📱 Responsive</h3>
          <p>Works on any device with a modern browser. No downloads required.</p>
        </div>
      </div>
    </div>
  `;

  const input = document.getElementById('projectInput') as HTMLInputElement;
  input?.focus();
}

function renderLoading(projectId: string): void {
  document.body.innerHTML = `
    <style>${globalCSS}</style>
    ${templates.loading}
  `;
  setLoadingProgress(10, 'Connecting to Scratch...');
}

function renderPlayer(projectId: string): void {
  document.body.innerHTML = `
    <style>${globalCSS}</style>
    ${templates.player}
  `;

  const projectIdDisplay = document.getElementById('projectIdDisplay');
  const projectTitle = document.getElementById('projectTitle');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const fpsDisplay = document.getElementById('fpsDisplay');
  const projectStatus = document.getElementById('projectStatus');

  if (projectIdDisplay) projectIdDisplay.textContent = projectId;
  if (projectTitle) projectTitle.textContent = `Project #${projectId}`;
  
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

  loadProject(projectId, canvas);
}

function renderError(message: string): void {
  document.title = 'Error - ZND';
  document.body.innerHTML = `
    <style>${globalCSS}</style>
    ${templates.error.replace('{{message}}', message)}
  `;
}

async function loadProject(projectId: string, canvas: HTMLCanvasElement): Promise<void> {
  try {
    setLoadingProgress(30, 'Fetching project data...');

    const instance = createZND({
      canvas,
      width: 480,
      height: 360,
      autoStart: false,
      debugMode: false
    });

    state.instance = instance;

    setLoadingProgress(50, 'Compiling scripts...');
    
    await instance.loadProject(projectId);

    setLoadingProgress(90, 'Starting...');

    const projectTitle = document.getElementById('projectTitle');
    if (projectTitle) {
      projectTitle.textContent = `Project #${projectId}`;
    }

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

    document.title = `Project #${projectId} - ZND`;

  } catch (err) {
    console.error('Failed to load project:', err);
    renderError(err instanceof Error ? err.message : 'Failed to load project');
  }
}

function handleSearch(): void {
  const input = document.getElementById('projectInput') as HTMLInputElement;
  const projectId = input?.value.trim();
  
  if (projectId && /^\d+$/.test(projectId)) {
    window.history.pushState({}, '', `/${projectId}`);
    router.navigate(`/${projectId}`);
  }
}

(window as any).handleSearch = handleSearch;

router.addRoute('^/?$', () => renderHome());
router.addRoute('^/(\\d+)/?$', (params) => {
  state.projectId = params[0];
  renderLoading(params[0]);
  const canvas = document.getElementById('scratchCanvas');
  if (canvas) {
    renderPlayer(params[0]);
  }
});
router.addRoute('^/project/(\\d+)/?$', (params) => {
  state.projectId = params[0];
  renderLoading(params[0]);
  renderPlayer(params[0]);
});

window.addEventListener('popstate', () => {
  router.navigate(window.location.pathname);
});

document.addEventListener('DOMContentLoaded', () => {
  router.navigate(window.location.pathname);
});

(window as any).router = router;
