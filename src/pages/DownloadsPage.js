import { DownloadManager } from '../services/download.js';
import { Capacitor } from '@capacitor/core';
import { updateSidebarActive } from '../components/Sidebar.js';

export function renderDownloadsPage(ctx) {
  const container = document.getElementById('app');
  container.innerHTML = '';
  window.scrollTo(0, 0);
  updateSidebarActive();

  if (!Capacitor.isNativePlatform()) {
    container.innerHTML = `
      <div class="page-container" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:80vh; text-align:center;">
        <h1 style="font-size:2rem; margin-bottom:1rem; color:var(--text-primary);">Downloads Unvailable</h1>
        <p style="color:var(--text-secondary); max-width:400px;">Offline downloads are only available in the native Android App for secure sandboxed playback.</p>
      </div>
    `;
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'page-container downloads-page animate-fade-in';
  
  const header = document.createElement('h1');
  header.className = 'page-title';
  header.textContent = 'Smart Downloads';
  wrapper.appendChild(header);

  const listContainer = document.createElement('div');
  listContainer.className = 'downloads-list';
  wrapper.appendChild(listContainer);

  const renderList = async () => {
    const items = await DownloadManager.list();

    if (items.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align:center; padding: 4rem 1rem; color:var(--text-secondary);">
          <div style="font-size:4rem; margin-bottom:1rem;">📥</div>
          <h2>Never be without a show</h2>
          <p style="margin-top:0.5rem;">Movies and TV shows you download appear here.</p>
          <a href="#/" class="btn-primary" style="margin-top:1.5rem; display:inline-block; padding:0.75rem 1.5rem; border-radius:0.5rem; text-decoration:none; color:black; background:white; font-weight:bold;">Find Something to Download</a>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = '';
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'download-item-card';
      card.style.cssText = `
        display: flex;
        align-items: center;
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 16px;
        cursor: pointer;
        transition: transform 0.2s;
      `;
      
      const isComplete = item.status === 'COMPLETED';
      const isFailed = item.status === 'ERROR';
      
      card.innerHTML = `
        <img src="${item.posterPath || 'https://via.placeholder.com/150'}" style="width: 120px; height: 80px; object-fit: cover; border-radius: 8px; margin-right: 16px;" alt="${item.title}">
        <div style="flex: 1; min-width: 0;">
          <h3 style="margin:0 0 6px 0; font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text-primary);">${item.title}</h3>
          ${isComplete ? `
            <div style="font-size:0.8rem; color:var(--text-secondary);">✓ Completed | Local File</div>
          ` : isFailed ? `
            <div style="font-size:0.8rem; color:#ef4444;">Failed to download</div>
          ` : `
            <div style="font-size:0.8rem; color:var(--accent);">Downloading... ${item.progress}%</div>
            <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-top: 6px;">
              <div style="width: ${item.progress}%; height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.3s;"></div>
            </div>
          `}
        </div>
        <div class="download-actions" style="display:flex; align-items:center; margin-left: 12px;">
          ${isComplete ? `
            <button class="btn-play" style="background:var(--accent); color:var(--text-primary); border:none; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; margin-right:8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          ` : ''}
          <button class="btn-delete" style="background:transparent; color:var(--text-secondary); border:none; width:40px; height:40px; display:flex; align-items:center; justify-content:center; cursor:pointer;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
          </button>
        </div>
      `;

      // Play click
      const playBtn = card.querySelector('.btn-play');
      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.location.hash = `/watch/${item.type}/${item.id.replace(item.type + '_', '')}?offline=true`;
        });
      }
      
      // Card click
      card.addEventListener('click', () => {
         if (isComplete) {
           window.location.hash = `/watch/${item.type}/${item.id.replace(item.type + '_', '')}?offline=true`;
         }
      });

      // Delete click
      const delBtn = card.querySelector('.btn-delete');
      if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Delete this download?')) {
            await DownloadManager.remove(item.id);
            renderList();
          }
        });
      }

      listContainer.appendChild(card);
    });
  };

  renderList();

  // Listen for progress updates
  const handleUpdate = () => renderList();
  window.addEventListener('downloadsUpdated', handleUpdate);
  window.addEventListener('download-status-change', handleUpdate);
  window.addEventListener('download-progress', handleUpdate);

  // Cleanup
  const observer = new MutationObserver((mutations, obs) => {
    if (!document.contains(wrapper)) {
      window.removeEventListener('downloadsUpdated', handleUpdate);
      window.removeEventListener('download-status-change', handleUpdate);
      window.removeEventListener('download-progress', handleUpdate);
      obs.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  container.appendChild(wrapper);
}
