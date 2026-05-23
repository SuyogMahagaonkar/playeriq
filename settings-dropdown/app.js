/**
 * ========================================================
 * PlayerIQ Settings Dropdown - Vanilla Javascript Engine
 * Features: Single-Open Accordion, Tab Filters, Lazy Loading,
 * Modal Focus Trap, Custom Toast Notifications, LocalStorage Sync.
 * ========================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Triggers & Dropdown
  const settingsTrigger = document.getElementById('settingsTrigger');
  const settingsDropdown = document.getElementById('settingsDropdown');
  const closeDropdown = document.getElementById('closeDropdown');
  const dropdownScrollBody = document.getElementById('dropdownScrollBody');
  const dropdownToast = document.getElementById('dropdownToast');

  // DOM Elements - Category Chips
  const categoryChips = document.querySelectorAll('.category-chip');

  // DOM Elements - Accordions
  const accordionItems = document.querySelectorAll('.accordion-item');
  const accordionHeaders = document.querySelectorAll('.accordion-header');

  // DOM Elements - Modals & Triggers
  const subtitleModal = document.getElementById('subtitleEditorModal');
  const btnOpenSubtitleEditor = document.getElementById('btnOpenSubtitleEditor');
  
  const downloadModal = document.getElementById('downloadManagerModal');
  const btnOpenDownloadManager = document.getElementById('btnOpenDownloadManager');

  // DOM Elements - Subtitle Editor Controls
  const prefSubSizeQuick = document.getElementById('prefSubSizeQuick');
  const prefSubSize = document.getElementById('prefSubSize');
  const prefSubColor = document.getElementById('prefSubColor');
  const prefSubOpacity = document.getElementById('prefSubOpacity');
  const liveSubtitleText = document.getElementById('liveSubtitleText');
  const btnSaveSubtitles = document.getElementById('btnSaveSubtitles');
  const lblSubSize = document.getElementById('lblSubSize');

  // DOM Elements - Lazy Loaded Storage Elements
  const storageGraphPlaceholder = document.getElementById('storageGraphPlaceholder');
  const storageGraphContainer = document.getElementById('storageGraphContainer');
  const offlineTitlesPlaceholder = document.getElementById('offlineTitlesPlaceholder');
  const offlineTitlesContainer = document.getElementById('offlineTitlesContainer');

  // State Tracks
  let activeModal = null;
  let previouslyFocusedElement = null;

  // Local Storage Settings Cache Keys
  const CACHE_KEYS = {
    oled: 'piq_theme_dark',
    language: 'piq_pref_lang',
    autoplay: 'piq_pref_autoplay',
    quality: 'piq_pref_quality',
    seek: 'piq_pref_seek',
    skip: 'piq_pref_skip',
    subSize: 'piq_sub_size',
    subColor: 'piq_sub_color',
    subOpacity: 'piq_sub_bg_opacity',
    wifiOnly: 'piq_pref_wifi_only',
    dlQuality: 'piq_pref_dl_quality'
  };

  // Mock Offline Database List Items
  const MOCK_OFFLINE_TITLES = [
    { id: '1', title: 'The dark knight', size: '1.2 GB' },
    { id: '2', title: 'Inception', size: '940 MB' },
    { id: '3', title: 'Interstellar', size: '1.8 GB' }
  ];

  // ==========================================
  // 1. DROPDOWN OPEN / CLOSE UTILITIES
  // ==========================================
  
  function toggleDropdown() {
    const isExpanded = settingsTrigger.getAttribute('aria-expanded') === 'true';
    if (isExpanded) {
      closeSettingsDropdown();
    } else {
      openSettingsDropdown();
    }
  }

  function openSettingsDropdown() {
    settingsTrigger.setAttribute('aria-expanded', 'true');
    settingsDropdown.classList.add('open');
    settingsDropdown.setAttribute('aria-hidden', 'false');
    closeDropdown.focus();
    
    // Auto sync loaded preferences
    loadPreferences();
  }

  function closeSettingsDropdown() {
    settingsTrigger.setAttribute('aria-expanded', 'false');
    settingsDropdown.classList.remove('open');
    settingsDropdown.setAttribute('aria-hidden', 'true');
    settingsTrigger.focus();
  }

  settingsTrigger.addEventListener('click', toggleDropdown);
  closeDropdown.addEventListener('click', closeSettingsDropdown);

  // Close dropdown on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (activeModal) {
        closeModal(activeModal);
      } else if (settingsDropdown.classList.contains('open')) {
        closeSettingsDropdown();
      }
    }
  });

  // ==========================================
  // 2. SINGLE-OPEN ACCORDION CONTROLLERS
  // ==========================================

  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      const isAlreadyOpen = item.classList.contains('open');

      // CRITICAL REQUIREMENT: Single-Open only! Close all first
      accordionItems.forEach(acc => {
        acc.classList.remove('open');
        acc.querySelector('.accordion-header').setAttribute('aria-expanded', 'false');
      });

      if (!isAlreadyOpen) {
        item.classList.add('open');
        header.setAttribute('aria-expanded', 'true');
        
        // Sync active top chip to category of opened accordion
        syncActiveChip(item.id);

        // Smooth scroll item to top of content body
        setTimeout(() => {
          item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 150);
      }
    });
  });

  // ==========================================
  // 3. CATEGORY CHIPS TAB FILTER NAVIGATION
  // ==========================================

  categoryChips.forEach((chip, index) => {
    chip.addEventListener('click', () => {
      // Switch active class
      categoryChips.forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-selected', 'false');
        c.setAttribute('tabindex', '-1');
      });
      chip.classList.add('active');
      chip.setAttribute('aria-selected', 'true');
      chip.setAttribute('tabindex', '0');

      const targetId = chip.getAttribute('aria-controls');
      const targetAccordion = document.getElementById(targetId);

      if (targetAccordion) {
        // Expand the targeted accordion panel & close others
        accordionItems.forEach(acc => {
          acc.classList.remove('open');
          acc.querySelector('.accordion-header').setAttribute('aria-expanded', 'false');
        });
        
        targetAccordion.classList.add('open');
        targetAccordion.querySelector('.accordion-header').setAttribute('aria-expanded', 'true');

        // Scroll smoothly inside dropdown container body
        setTimeout(() => {
          targetAccordion.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    });

    // Arrow keys navigation for chips row (tablist accessibility)
    chip.addEventListener('keydown', (e) => {
      let nextIndex = index;
      if (e.key === 'ArrowRight') {
        nextIndex = (index + 1) % categoryChips.length;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (index - 1 + categoryChips.length) % categoryChips.length;
      } else {
        return;
      }
      
      categoryChips[nextIndex].focus();
      categoryChips[nextIndex].click();
      e.preventDefault();
    });
  });

  function syncActiveChip(sectionId) {
    categoryChips.forEach(c => {
      c.classList.remove('active');
      c.setAttribute('aria-selected', 'false');
      c.setAttribute('tabindex', '-1');
      if (c.getAttribute('aria-controls') === sectionId) {
        c.classList.add('active');
        c.setAttribute('aria-selected', 'true');
        c.setAttribute('tabindex', '0');
      }
    });
  }

  // ==========================================
  // 4. COMPLEX EDITORS MODAL CONTROL (WITH ARIA & FOCUS TRAPS)
  // ==========================================

  function openModal(modal) {
    previouslyFocusedElement = document.activeElement;
    activeModal = modal;
    
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    
    // Accessibility: Focus first focusable node in modal
    const focusable = getFocusableElements(modal);
    if (focusable.length > 0) {
      focusable[0].focus();
    }

    // Lazy load metrics if opening download manager modal
    if (modal.id === 'downloadManagerModal') {
      triggerLazyLoad();
    }
  }

  function closeModal(modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    activeModal = null;
    
    if (previouslyFocusedElement) {
      previouslyFocusedElement.focus();
    }
  }

  btnOpenSubtitleEditor.addEventListener('click', () => openModal(subtitleModal));
  btnOpenDownloadManager.addEventListener('click', () => openModal(downloadModal));

  // Connect Close Buttons on modals
  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = btn.closest('.premium-modal-overlay');
      if (modal) closeModal(modal);
      e.stopPropagation();
    });
  });

  // Modal Focus Trap implementation
  document.querySelectorAll('.premium-modal-overlay').forEach(modal => {
    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      
      const focusable = getFocusableElements(modal);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) { // Back Tab
        if (document.activeElement === first) {
          last.focus();
          e.preventDefault();
        }
      } else { // Standard Tab
        if (document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    });

    // Close modal when clicking dark overlay backdrop
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal);
      }
    });
  });

  function getFocusableElements(el) {
    return Array.from(el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(node => !node.hasAttribute('disabled') && node.offsetParent !== null);
  }

  // ==========================================
  // 5. PERFORMANCE LAZY LOADING ALGORITHMS
  // ==========================================

  let isLazyMetricsLoaded = false;

  function triggerLazyLoad() {
    if (isLazyMetricsLoaded) return; // Only fetch once!
    
    // Simulate API fetch delay
    setTimeout(() => {
      // 1. Storage graph components
      storageGraphPlaceholder.classList.add('hidden');
      storageGraphContainer.classList.remove('hidden');

      // 2. Offline list items
      offlineTitlesPlaceholder.classList.add('hidden');
      renderOfflineList();
      offlineTitlesContainer.classList.remove('hidden');

      isLazyMetricsLoaded = true;
    }, 1200);
  }

  function renderOfflineList() {
    offlineTitlesContainer.innerHTML = '';
    MOCK_OFFLINE_TITLES.forEach(item => {
      const li = document.createElement('li');
      li.className = 'offline-title-item';
      li.innerHTML = `
        <div class="offline-title-meta">
          <span class="title-text">${item.title}</span>
          <span class="title-size">Downloaded · ${item.size}</span>
        </div>
        <button class="trash-btn" aria-label="Delete ${item.title} from cache" data-id="${item.id}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;
      offlineTitlesContainer.appendChild(li);
    });

    // Wire trash button delete event with visual list item slide outs
    offlineTitlesContainer.querySelectorAll('.trash-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.dataset.id;
        const parentLi = btn.closest('.offline-title-item');
        
        if (confirm('Are you sure you want to delete this downloaded video from your device storage?')) {
          parentLi.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
          parentLi.style.opacity = '0';
          parentLi.style.transform = 'translateX(50px)';
          
          setTimeout(() => {
            parentLi.remove();
            showToast('✓ Offline cache item deleted!');
            // Update graph allocation bounds
            const appSegment = document.querySelector('.bar-segment.app');
            if (appSegment) appSegment.style.width = '12%';
          }, 300);
        }
      });
    });
  }

  // ==========================================
  // 6. DETAILED SUBTITLE LIVE EDITOR LOGIC
  // ==========================================

  function updateLiveSubtitle() {
    const size = prefSubSize.value;
    const color = prefSubColor.value;
    const opacity = prefSubOpacity.value;

    liveSubtitleText.style.fontSize = size;
    liveSubtitleText.style.color = color;
    liveSubtitleText.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
  }

  [prefSubSize, prefSubColor, prefSubOpacity].forEach(ctrl => {
    ctrl.addEventListener('change', updateLiveSubtitle);
  });

  btnSaveSubtitles.addEventListener('click', () => {
    // Sync detailed modal choice with quick choice dropdown
    prefSubSizeQuick.value = prefSubSize.value;
    lblSubSize.textContent = prefSubSize.value;

    // Trigger save
    savePreference('subSize', prefSubSize.value);
    savePreference('subColor', prefSubColor.value);
    savePreference('subOpacity', prefSubOpacity.value);

    closeModal(subtitleModal);
    showToast('✓ Subtitle options saved!');
  });

  // Handle Quick subtitle customizer select changes
  prefSubSizeQuick.addEventListener('change', () => {
    prefSubSize.value = prefSubSizeQuick.value;
    lblSubSize.textContent = prefSubSizeQuick.value;
    savePreference('subSize', prefSubSizeQuick.value);
    showToast('✓ Subtitle size saved!');
  });

  // ==========================================
  // 7. COMPACT SETTINGS STATE CACHE ENGINES
  // ==========================================

  function savePreference(prefName, val) {
    const key = CACHE_KEYS[prefName];
    if (key) {
      localStorage.setItem(key, String(val));
    }
  }

  function loadPreferences() {
    try {
      // OLED Theme Mode
      const isOled = localStorage.getItem(CACHE_KEYS.oled) === 'oled';
      document.getElementById('prefOled').checked = isOled;

      // Language Option
      const lang = localStorage.getItem(CACHE_KEYS.language) || 'all';
      document.getElementById('prefLanguage').value = lang;

      // Playback Toggle Options
      const isAutoplay = localStorage.getItem(CACHE_KEYS.autoplay) !== 'false';
      document.getElementById('prefAutoplay').checked = isAutoplay;

      const isSkip = localStorage.getItem(CACHE_KEYS.skip) !== 'false';
      document.getElementById('prefSkip').checked = isSkip;

      // Playback Quality Settings
      const quality = localStorage.getItem(CACHE_KEYS.quality) || 'auto';
      document.getElementById('prefQuality').value = quality;

      const seek = localStorage.getItem(CACHE_KEYS.seek) || '10';
      document.getElementById('prefSeek').value = seek;

      // Detailed Subtitle Profiles
      const subSize = localStorage.getItem(CACHE_KEYS.subSize) || '100%';
      prefSubSizeQuick.value = subSize;
      prefSubSize.value = subSize;
      lblSubSize.textContent = subSize;

      const subColor = localStorage.getItem(CACHE_KEYS.subColor) || '#ffffff';
      prefSubColor.value = subColor;

      const subOpacity = localStorage.getItem(CACHE_KEYS.subOpacity) || '0.5';
      prefSubOpacity.value = subOpacity;
      
      updateLiveSubtitle();

      // Download Preferences
      const wifi = localStorage.getItem(CACHE_KEYS.wifiOnly) !== 'false';
      document.getElementById('prefWifiOnly').checked = wifi;

      const dlQuality = localStorage.getItem(CACHE_KEYS.dlQuality) || '480p';
      document.getElementById('prefDlQuality').value = dlQuality;

      // Active theme color chip sync
      const activeColor = localStorage.getItem('piq_theme_color') || 'purple';
      document.querySelectorAll('.theme-color-chip').forEach(chip => {
        if (chip.dataset.color === activeColor) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });

    } catch (e) {
      console.warn('Caching preferences unavailable:', e);
    }
  }

  // Bind change listeners to trigger dynamic saves and toasts
  document.getElementById('prefOled').addEventListener('change', (e) => {
    localStorage.setItem(CACHE_KEYS.oled, e.target.checked ? 'oled' : 'default');
    showToast('✓ OLED Dark Theme updated!');
  });

  document.getElementById('prefLanguage').addEventListener('change', (e) => {
    savePreference('language', e.target.value);
    showToast('✓ Content Language updated!');
  });

  document.getElementById('prefAutoplay').addEventListener('change', (e) => {
    savePreference('autoplay', e.target.checked);
    showToast('✓ Autoplay next episode toggle saved!');
  });

  document.getElementById('prefQuality').addEventListener('change', (e) => {
    savePreference('quality', e.target.value);
    showToast('✓ Preferred quality resolution updated!');
  });

  document.getElementById('prefSeek').addEventListener('change', (e) => {
    savePreference('seek', e.target.value);
    showToast('✓ Jump double tap interval saved!');
  });

  document.getElementById('prefSkip').addEventListener('change', (e) => {
    savePreference('skip', e.target.checked);
    showToast('✓ Auto skip recaps changed!');
  });

  document.getElementById('prefWifiOnly').addEventListener('change', (e) => {
    savePreference('wifiOnly', e.target.checked);
    showToast('✓ Wi-Fi download constraint saved!');
  });

  document.getElementById('prefDlQuality').addEventListener('change', (e) => {
    savePreference('dlQuality', e.target.value);
    showToast('✓ Download Quality saved!');
  });

  // Accent selector chips logic
  document.querySelectorAll('.theme-color-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.theme-color-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const color = chip.dataset.color;
      localStorage.setItem('piq_theme_color', color);
      showToast(`✓ Accent color set to ${color.toUpperCase()}!`);
    });
  });

  // Action Buttons
  document.getElementById('btnExportJSON').addEventListener('click', () => {
    const data = {
      version: '1.0',
      preferences: localStorage
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'playeriq_user_preferences_backup.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('✓ Preference JSON file generated!');
  });

  document.getElementById('btnImportJSON').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          if (parsed && parsed.preferences) {
            Object.keys(parsed.preferences).forEach(k => {
              localStorage.setItem(k, parsed.preferences[k]);
            });
            loadPreferences();
            showToast('✓ Backup preferences restored!');
          }
        } catch (err) {
          alert('Failed to read configuration file.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });

  document.getElementById('btnPurgeHistory').addEventListener('click', () => {
    if (confirm('Erase entire local watch logs history? This is an absolute deletion.')) {
      showToast('✓ Watch history purged!');
    }
  });

  document.getElementById('btnPurgeCache').addEventListener('click', () => {
    document.getElementById('lblCacheSize').textContent = '0.00 MB';
    showToast('🧹 Local assets cache size purged!');
  });

  // Toast Utility engine
  let toastTimer = null;
  function showToast(msg) {
    dropdownToast.textContent = msg;
    dropdownToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dropdownToast.classList.remove('show');
    }, 2000);
  }

  // Pre-load current preferences on DOM Ready
  loadPreferences();
});
