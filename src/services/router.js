// ========================================
// PlayerIQ — SPA Router (Hash-based)
// ========================================

const routes = [];
let currentCleanup = null;

export function addRoute(pattern, handler) {
  // Convert pattern like '/movie/:id' to regex
  const paramNames = [];
  const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  routes.push({
    pattern,
    regex: new RegExp(`^${regexStr}$`),
    paramNames,
    handler
  });
}

function getHash() {
  const hash = window.location.hash.slice(1) || '/';
  return hash.startsWith('/') ? hash : '/' + hash;
}

function parseQuery(hash) {
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) return { path: hash, query: {} };
  const path = hash.slice(0, qIndex);
  const query = {};
  new URLSearchParams(hash.slice(qIndex + 1)).forEach((v, k) => {
    query[k] = v;
  });
  return { path, query };
}

export function navigate(path) {
  window.location.hash = path;
}

let lastActiveHash = '#/';

async function handleRoute() {
  // Redundant fail-safe sweep to remove any stray hover preview cards during page transition
  document.querySelectorAll('.hover-preview-card').forEach(el => el.remove());

  const hash = getHash();
  const { path, query } = parseQuery(hash);

  // Update last active hash for future settings drawer triggers
  lastActiveHash = window.location.hash || '#/';

  // Run cleanup of previous page
  if (currentCleanup) {
    try {
      currentCleanup();
    } catch (err) {
      console.error('Error during route cleanup:', err);
    }
    currentCleanup = null;
  }

  for (const route of routes) {
    const match = path.match(route.regex);
    if (match) {
      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });

      // Get mount point
      const container = document.getElementById('page-content');
      if (container) {
        container.innerHTML = '';
        container.className = 'page-content page-enter';
        // Scroll to top
        window.scrollTo({ top: 0 });
        // Execute handler with safe fallback to catch module load/chunk errors
        try {
          const cleanup = await route.handler({ params, query, container });
          if (typeof cleanup === 'function') {
            currentCleanup = cleanup;
          }
        } catch (err) {
          console.error('Routing/loading error:', err);
          
          // Check if this is a chunk load / dynamically imported module fetch error
          const isChunkLoadError = 
            err.name === 'TypeError' || 
            err.message?.toLowerCase().includes('failed to fetch dynamically imported module') ||
            err.message?.toLowerCase().includes('chunkloaderror') ||
            err.message?.toLowerCase().includes('error loading');
            
          if (isChunkLoadError) {
            // Auto-reload to fetch the updated index.html and assets
            const lastReload = sessionStorage.getItem('piq_chunk_reload');
            const now = Date.now();
            if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
              sessionStorage.setItem('piq_chunk_reload', String(now));
              window.location.reload();
              return;
            }
          }
          
          container.innerHTML = `
            <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; text-align: center; padding: 40px;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="var(--danger, #ef4444)" stroke-width="1.5" style="width: 64px; height: 64px; margin-bottom: 20px; color: var(--danger, #ef4444);"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div class="empty-state-title" style="font-size: 20px; font-weight: 600; color: var(--text-normal, #f3f4f6); margin-bottom: 8px;">Application Update Required</div>
              <div class="empty-state-text" style="font-size: 14px; color: var(--text-dim, #9ca3af); max-width: 320px; margin: 0 auto 20px; line-height: 1.5;">A new version of the app is available. Please reload to apply updates.</div>
              <button onclick="window.location.reload()" class="btn btn-primary" style="background: var(--accent, #a855f7); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 500; cursor: pointer; transition: opacity 0.2s; box-shadow: 0 4px 15px rgba(168,85,247,0.3);">Reload App</button>
            </div>
          `;
        }
      }
      return;
    }
  }

  // 404
  const container = document.getElementById('page-content');
  if (container) {
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        <div class="empty-state-title">Page Not Found</div>
        <div class="empty-state-text">The page you're looking for doesn't exist.</div>
      </div>
    `;
  }
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

export function getCurrentPath() {
  return parseQuery(getHash()).path;
}
