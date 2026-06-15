export function showCustomConfirm(title, message) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'custom-dialog-overlay';
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 999999;
      display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity 0.2s ease;
    `;
    
    modal.innerHTML = `
      <div class="glass-card" style="width: 90%; max-width: 400px; padding: 24px; text-align: center; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); background: rgba(18,18,24,0.85); box-shadow: 0 20px 50px rgba(0,0,0,0.6); transform: scale(0.9); transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);">
        <h3 style="margin-top: 0; color: #fff; font-family: var(--font-display); font-weight: 800; font-size: 18px;">${title}</h3>
        <p style="color: var(--text-secondary); font-size: 13px; line-height: 1.5; margin: 16px 0 24px;">${message}</p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button id="custom-confirm-cancel" class="user-empty-btn" style="height: 38px; padding: 0 20px; font-size: 13px;">Cancel</button>
          <button id="custom-confirm-ok" class="user-empty-btn" style="height: 38px; padding: 0 20px; font-size: 13px; background: var(--accent, #a855f7); color: #fff; border-color: transparent; font-weight: 700;">Confirm</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => {
      modal.style.opacity = '1';
      modal.firstElementChild.style.transform = 'scale(1)';
    }, 10);
    
    const cleanup = (result) => {
      modal.style.opacity = '0';
      modal.firstElementChild.style.transform = 'scale(0.9)';
      setTimeout(() => {
        modal.remove();
        resolve(result);
      }, 200);
    };
    
    modal.querySelector('#custom-confirm-cancel').addEventListener('click', () => cleanup(false));
    modal.querySelector('#custom-confirm-ok').addEventListener('click', () => cleanup(true));
  });
}

export function showCustomAlert(title, message) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'custom-dialog-overlay';
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 999999;
      display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity 0.2s ease;
    `;
    
    modal.innerHTML = `
      <div class="glass-card" style="width: 90%; max-width: 400px; padding: 24px; text-align: center; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); background: rgba(18,18,24,0.85); box-shadow: 0 20px 50px rgba(0,0,0,0.6); transform: scale(0.9); transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);">
        <h3 style="margin-top: 0; color: #fff; font-family: var(--font-display); font-weight: 800; font-size: 18px;">${title}</h3>
        <p style="color: var(--text-secondary); font-size: 13px; line-height: 1.5; margin: 16px 0 24px;">${message}</p>
        <button id="custom-alert-ok" class="user-empty-btn" style="height: 38px; width: 100%; justify-content: center; font-size: 13px; background: var(--accent, #a855f7); color: #fff; border-color: transparent; font-weight: 700;">OK</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => {
      modal.style.opacity = '1';
      modal.firstElementChild.style.transform = 'scale(1)';
    }, 10);
    
    const cleanup = () => {
      modal.style.opacity = '0';
      modal.firstElementChild.style.transform = 'scale(0.9)';
      setTimeout(() => {
        modal.remove();
        resolve();
      }, 200);
    };
    
    modal.querySelector('#custom-alert-ok').addEventListener('click', cleanup);
  });
}
