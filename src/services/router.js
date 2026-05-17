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

async function handleRoute() {
  const hash = getHash();
  const { path, query } = parseQuery(hash);

  // Run cleanup of previous page
  if (currentCleanup) {
    currentCleanup();
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
        // Execute handler
        const cleanup = await route.handler({ params, query, container });
        if (typeof cleanup === 'function') {
          currentCleanup = cleanup;
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
