// ========================================
// PlayerIQ — Footer Component
// ========================================

export function createFooter() {
  return `
    <footer class="footer">
      <div class="footer-brand">Player<span>IQ</span></div>
      <div class="footer-links">
        <a href="#/" class="footer-link">Home</a>
        <a href="#/movies" class="footer-link">Movies</a>
        <a href="#/tv" class="footer-link">TV Shows</a>
        <a href="#/ranking" class="footer-link">Most Watched</a>
      </div>
      <p>Data provided by <a href="https://www.themoviedb.org" target="_blank" rel="noopener" class="footer-link" style="color:var(--text-muted)">TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </footer>
  `;
}
