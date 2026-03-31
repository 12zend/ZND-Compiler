# ZND Compiler

High-performance Scratch project player with WebGL acceleration.

## Features

- **Fast**: Optimized JavaScript compilation with WebGL rendering
- **Simple URLs**: Access projects directly via `/{projectId}`
- **No Install**: Runs entirely in the browser
- **Caching**: IndexedDB-based asset caching for faster reloads

## Quick Start

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build
```

## URL Format

Access any Scratch project directly:
```
https://yoursite.com/10128409
```

## Deployment

### Netlify (Recommended)

1. Push to GitHub
2. Connect to Netlify
3. Deploy automatically

Or use CLI:
```bash
npm install -g netlify-cli
npm run build
netlify deploy --prod --dir=dist
```

### Vercel

```bash
npm install -g vercel
npm run build
vercel deploy --prod dist
```

### Cloudflare Pages

1. Connect GitHub repository
2. Build command: `npm run build`
3. Output directory: `dist`

### Self-hosted (Apache/Nginx)

```bash
npm run build
# Copy dist/ contents to your web root
```

See `public/_nginx.conf` for Nginx configuration.

## Project Structure

```
├── src/
│   ├── app.ts          # SPA router and UI
│   ├── index.ts        # Core compiler/runtime
│   ├── compiler/       # Block → IR → JS
│   ├── core/           # Execution engine
│   ├── renderer/       # WebGL renderer
│   ├── loader/         # Project fetching
│   └── types/          # TypeScript types
├── public/             # Static assets
├── dist/               # Build output
└── index.html          # Entry point
```

## Development

```bash
# Start dev server with hot reload
npm run dev

# Production build
npm run build

# Preview production build locally
npm run preview
```

## Browser Support

- Chrome 90+
- Firefox 90+
- Safari 15+
- Edge 90+

Requires WebGL2 support.

## API

### `createZND(config)`

```typescript
import { createZND } from 'znd-compiler';

const znd = createZND({
  canvas: document.getElementById('canvas'),
  width: 480,
  height: 360,
  autoStart: false
});

await znd.loadProject('10128409');
znd.start();
```

## License

MIT
# ZND-Compiler
