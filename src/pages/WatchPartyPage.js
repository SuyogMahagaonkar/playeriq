// ========================================
// PlayerIQ — Watch Together Room Page
// ========================================

import { img, getMovieDetails, getTVDetails, NODE_PROXY } from '../services/api.js';
import { getUser, waitAuthReady } from '../services/auth.js';
import {
  getWatchPartyFromCloud,
  updateWatchPartyInCloud,
  joinWatchPartyInCloud,
  leaveWatchPartyInCloud,
  subscribeToWatchParty,
  sendChatMessageInCloud,
  subscribeToChatMessages
} from '../services/firebase.js';
import { createVideoPlayer } from '../components/VideoPlayer.js';
import { navigate } from '../services/router.js';
import '../styles/player.css';
import '../styles/video-player.css';
import '../styles/mobile-player.css';

// Default emojis for the reaction bar
const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

/**
 * Join Page Handler: processes join, updates Firestore members, and redirects to room page.
 */
export async function renderWatchPartyJoinPage({ params, container }) {
  container.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:80vh; color:var(--text-muted); flex-direction:column; gap:16px;">
      <div class="plc-spinner-ring">
        <svg viewBox="0 0 52 52" fill="none" style="width:50px; height:50px;">
          <circle cx="26" cy="26" r="22" stroke="rgba(255,255,255,0.08)" stroke-width="4"/>
          <circle cx="26" cy="26" r="22" stroke="var(--accent,#a855f7)" stroke-width="4" stroke-linecap="round" stroke-dasharray="138.2" stroke-dashoffset="100" class="plc-ring-arc"/>
        </svg>
      </div>
      <div style="font-size:16px; font-weight:600;">Joining Watch Party...</div>
    </div>
  `;

  const partyId = params.partyId;
  await waitAuthReady();
  const user = getUser();

  if (!user) {
    // Global main.js auth change overlay handles prompting login.
    // We wait until user is logged in.
    return;
  }

  try {
    const party = await getWatchPartyFromCloud(partyId);
    if (!party) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">Party Not Found</div>
          <div class="empty-state-text">This watch party does not exist or has expired.</div>
          <button class="login-submit-btn" style="margin-top:20px; width:auto; padding:10px 24px;" onclick="window.location.hash='#/'">Go to Home</button>
        </div>
      `;
      return;
    }

    const member = {
      uid: user.uid,
      name: user.displayName || user.email.split('@')[0] || 'Guest',
      avatar: user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60',
      role: 'guest'
    };

    await joinWatchPartyInCloud(partyId, member);
    navigate(`/watch-party/${partyId}`);
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Error Joining Party</div>
        <div class="empty-state-text">${err.message || 'Failed to join the watch party.'}</div>
        <button class="login-submit-btn" style="margin-top:20px; width:auto; padding:10px 24px;" onclick="window.location.hash='#/'">Go to Home</button>
      </div>
    `;
  }
}

/**
 * Main Room Page Handler: runs the real-time player and chat interface.
 */
export async function renderWatchPartyPage({ params, container }) {
  const partyId = params.partyId;
  await waitAuthReady();
  const user = getUser();

  if (!user) {
    // If not authenticated, we let the global overlay prompt sign in
    return;
  }

  container.innerHTML = `
    <div class="watch-party-layout" id="party-layout">
      <!-- Player Panel -->
      <div class="party-player-section">
        <div id="party-video-wrapper" class="party-video-wrapper">
          <div class="player-loading-overlay plc-overlay" id="party-loading">
            <div class="plc-card">
              <div class="plc-spinner-ring">
                <svg viewBox="0 0 52 52" fill="none">
                  <circle cx="26" cy="26" r="22" stroke="rgba(255,255,255,0.08)" stroke-width="4"/>
                  <circle cx="26" cy="26" r="22" stroke="var(--accent,#a855f7)" stroke-width="4" stroke-linecap="round" stroke-dasharray="138.2" stroke-dashoffset="100" class="plc-ring-arc"/>
                </svg>
              </div>
              <div class="plc-title">Connecting to Room...</div>
              <div class="plc-status">Fetching stream links and syncing timelines</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Panel: Sidebar with chat and members -->
      <div class="party-sidebar" id="party-sidebar">
        <!-- Sidebar Toggle (Collapsible hover area/button) -->
        <button class="party-sidebar-toggle" id="party-sidebar-toggle" aria-label="Toggle Sidebar">
          <i data-lucide="chevron-right" class="toggle-icon-right"></i>
          <i data-lucide="chevron-left" class="toggle-icon-left" style="display:none;"></i>
        </button>

        <div class="party-sidebar-content">
          <!-- Room Title -->
          <div class="party-room-header">
            <h2 id="party-media-title">Watch Together</h2>
            <div class="party-room-id-tag">Room ID: ${partyId}</div>
          </div>

          <!-- Active Members List -->
          <div class="party-members-block">
            <div class="party-section-label">Active Members</div>
            <div class="party-members-list" id="party-members-list">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <!-- Chat messages area -->
          <div class="party-chat-section">
            <div class="party-section-label">Live Chat</div>
            <div class="party-chat-messages" id="party-chat-messages">
              <!-- Chat messages rendered dynamically -->
            </div>
          </div>

          <!-- Chat input and reactions -->
          <div class="party-chat-input-area">
            <!-- Default Emoji Reactions Row -->
            <div class="party-reactions-row" id="party-reactions-row">
              ${REACTION_EMOJIS.map(emoji => `<button class="reaction-emoji-btn" data-emoji="${emoji}">${emoji}</button>`).join('')}
            </div>

            <!-- Input Box -->
            <form class="party-chat-form" id="party-chat-form">
              <input type="text" placeholder="Type a message..." class="party-chat-input" id="party-chat-input" required autocomplete="off" />
              <button type="submit" class="party-chat-send-btn" aria-label="Send message">
                <i data-lucide="send" style="width:16px; height:16px;"></i>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const videoWrapper = container.querySelector('#party-video-wrapper');
  const membersListEl = container.querySelector('#party-members-list');
  const chatMessagesEl = container.querySelector('#party-chat-messages');
  const chatForm = container.querySelector('#party-chat-form');
  const chatInput = container.querySelector('#party-chat-input');
  const reactionsRow = container.querySelector('#party-reactions-row');
  const mediaTitleEl = container.querySelector('#party-media-title');
  const sidebar = container.querySelector('#party-sidebar');
  const sidebarToggle = container.querySelector('#party-sidebar-toggle');

  let activePlayer = null;
  let videoEl = null;
  let isHost = false;
  let syncInterval = null;
  let isApplyingSync = false;
  let lastSpawnedMsgId = null;

  // Sidebar collapse toggle logic
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    sidebarToggle.querySelector('.toggle-icon-right').style.display = isCollapsed ? 'none' : 'block';
    sidebarToggle.querySelector('.toggle-icon-left').style.display = isCollapsed ? 'block' : 'none';
  });

  // Floating reactions generator
  function spawnFloatingEmoji(emoji) {
    const playerEl = document.getElementById('vp-player') || videoWrapper;
    if (!playerEl) return;
    const floating = document.createElement('div');
    floating.className = 'floating-emoji';
    floating.textContent = emoji;
    const randomLeft = 15 + Math.random() * 70; // between 15% and 85% width
    floating.style.left = `${randomLeft}%`;
    playerEl.appendChild(floating);
    setTimeout(() => floating.remove(), 2500);
  }

  try {
    // 1. Fetch Room Setup Details
    const partyData = await getWatchPartyFromCloud(partyId);
    if (!partyData) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">Room Expired</div>
          <div class="empty-state-text">This watch party room has ended.</div>
          <button class="login-submit-btn" style="margin-top:20px; width:auto; padding:10px 24px;" onclick="window.location.hash='#/'">Back to Home</button>
        </div>
      `;
      return;
    }

    isHost = partyData.hostId === user.uid;
    const displayNameStr = partyData.title + (partyData.type === 'tv' ? ` S${partyData.season} E${partyData.episode}` : '');
    mediaTitleEl.textContent = displayNameStr;

    // Auto-rejoin the user to the active members list if they refreshed or loaded directly
    const currentMember = {
      uid: user.uid,
      name: user.displayName || user.email.split('@')[0] || 'Guest',
      avatar: user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60',
      role: isHost ? 'host' : 'guest'
    };
    try {
      await joinWatchPartyInCloud(partyId, currentMember);
    } catch (joinErr) {
      console.warn('[WatchParty] Failed to auto-rejoin party:', joinErr);
    }

    // Detect HEVC support on client (Safari/iOS supports it, Chrome/Firefox on Windows/macOS usually does not)
    const supportsHEVC = document.createElement('video').canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') === 'probably';

    // 2. Fetch Direct Stream URL from proxy
    const streamEndpoint = partyData.type === 'tv'
      ? `${NODE_PROXY}/api/stream/tv/${partyData.id || partyData.partyId}/${partyData.season}/${partyData.episode}?hevc=${supportsHEVC}`
      : `${NODE_PROXY}/api/stream/movie/${partyData.id || partyData.partyId}?hevc=${supportsHEVC}`;

    const streamResponse = await fetch(streamEndpoint);
    if (!streamResponse.ok) {
      throw new Error('Streaming source endpoint failed.');
    }
    const streamData = await streamResponse.json();

    // Rewrite relative /api/* proxy URLs to absolute using NODE_PROXY
    const toAbsolute = (url) => {
      if (!url) return url;
      if (url.startsWith('/api/')) return `${NODE_PROXY}${url}`;
      return url;
    };
    streamData.url = toAbsolute(streamData.url);
    if (Array.isArray(streamData.all_streams)) {
      streamData.all_streams = streamData.all_streams.map(s => ({
        ...s,
        url: toAbsolute(s.url)
      }));
    }

    // 3. Clear loading overlay and mount VideoPlayer
    videoWrapper.innerHTML = '';
    activePlayer = createVideoPlayer(videoWrapper, streamData, {
      startTime: partyData.currentTime || 0,
      onEnded: () => {
        if (isHost) {
          updateWatchPartyInCloud(partyId, { status: 'paused', currentTime: 0 });
        }
      }
    });

    videoEl = document.getElementById('vp-video');
    if (!videoEl) {
      throw new Error('Video player media tag not found.');
    }

    // 4. Synchronization Logic Bindings
    if (isHost) {
      // Host: sends playback changes to database
      const updateHostStateInCloud = async () => {
        if (!videoEl || isApplyingSync) return;
        await updateWatchPartyInCloud(partyId, {
          status: videoEl.paused ? 'paused' : 'playing',
          currentTime: videoEl.currentTime
        });
      };

      videoEl.addEventListener('play', updateHostStateInCloud);
      videoEl.addEventListener('pause', updateHostStateInCloud);
      videoEl.addEventListener('seeked', updateHostStateInCloud);

      // Periodic timer to sync current playtime in Firestore while playing
      syncInterval = setInterval(() => {
        if (videoEl && !videoEl.paused && !isApplyingSync) {
          updateWatchPartyInCloud(partyId, {
            currentTime: videoEl.currentTime
          });
        }
      }, 2000);

    } else {
      // Guest: timeline updates from Host (Firestore subscriber)
      // Standard video controls remain usable, but drift check snaps them back to Host
    }

    // 5. Subscribe to Room State in Cloud
    const unsubRoom = subscribeToWatchParty(partyId, (partyDoc) => {
      if (!partyDoc) {
        // Party deleted
        showToastAlert('Watch party has been closed by the host.');
        navigate('/');
        return;
      }

      // Sync members list
      const members = partyDoc.members || [];
      membersListEl.innerHTML = members.map(m => `
        <div class="party-member-avatar-wrap" title="${m.name} (${m.role})">
          <img class="party-member-avatar" src="${m.avatar}" alt="${m.name}" />
          <span class="party-member-role-dot ${m.role}"></span>
          <div class="party-member-tooltip">${m.name} (${m.role})</div>
        </div>
      `).join('');

      // If Guest, apply Host playback sync updates
      if (!isHost && videoEl) {
        isApplyingSync = true;
        
        // Pause / Play Sync
        if (partyDoc.status === 'playing' && videoEl.paused) {
          videoEl.play().catch(() => {});
        } else if (partyDoc.status === 'paused' && !videoEl.paused) {
          videoEl.pause();
        }

        // Timeline drift alignment (2s threshold)
        const drift = Math.abs(videoEl.currentTime - partyDoc.currentTime);
        if (drift > 2) {
          console.log(`[Sync] Drift detected: ${drift.toFixed(1)}s. Snapping local playback to Host currentTime: ${partyDoc.currentTime.toFixed(1)}s`);
          videoEl.currentTime = partyDoc.currentTime;
        }

        isApplyingSync = false;
      }
    });

    // 6. Chat & Floating Emoji Reactions Sync
    const senderName = user.displayName || user.email.split('@')[0] || 'User';
    const senderAvatar = user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60';

    const sendChatMessage = async (text, type = 'chat', reactionEmoji = null) => {
      const msgObj = {
        senderId: user.uid,
        senderName,
        senderAvatar,
        text,
        type,
        reactionEmoji
      };
      await sendChatMessageInCloud(partyId, msgObj);
    };

    // Form submit
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const txt = chatInput.value.trim();
      if (!txt) return;
      chatInput.value = '';
      try {
        await sendChatMessage(txt, 'chat');
      } catch (err) {
        console.error(err);
      }
    });

    // Reaction click
    reactionsRow.querySelectorAll('.reaction-emoji-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const emoji = btn.dataset.emoji;
        try {
          await sendChatMessage('', 'reaction', emoji);
        } catch (err) {
          console.error(err);
        }
      });
    });

    // Subscribe to chat subcollection
    const unsubChat = subscribeToChatMessages(partyId, (messages) => {
      chatMessagesEl.innerHTML = messages.map(m => {
        if (m.type === 'reaction') {
          return `
            <div class="chat-message system">
              <span class="chat-sender">${m.senderName}</span>
              <span class="chat-text">reacted with ${m.reactionEmoji}</span>
            </div>
          `;
        }
        const isSelf = m.senderId === user.uid;
        return `
          <div class="chat-message ${isSelf ? 'self' : ''}">
            <img class="chat-msg-avatar" src="${m.senderAvatar}" alt="" />
            <div class="chat-msg-body">
              <div class="chat-msg-sender-name">${m.senderName}</div>
              <div class="chat-msg-text">${m.text}</div>
            </div>
          </div>
        `;
      }).join('');

      // Auto scroll chat to bottom
      chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

      // Handle floating reactions spawn on latest message
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.type === 'reaction' && lastMsg.id !== lastSpawnedMsgId) {
          lastSpawnedMsgId = lastMsg.id;
          spawnFloatingEmoji(lastMsg.reactionEmoji);
        }
      }
    });

    // 7. Cleanup callback
    return () => {
      console.log('[Room Cleanup] Cleaning up WatchTogether subscriptions and resources...');
      if (syncInterval) clearInterval(syncInterval);
      if (unsubRoom) unsubRoom();
      if (unsubChat) unsubChat();
      if (activePlayer) activePlayer.destroy();
      
      // Leave room
      leaveWatchPartyInCloud(partyId, user.uid);
    };

  } catch (err) {
    console.error('WatchParty Room error:', err);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Connection Error</div>
        <div class="empty-state-text">${err.message || 'Failed to establish watch together room.'}</div>
        <button class="login-submit-btn" style="margin-top:20px; width:auto; padding:10px 24px;" onclick="window.location.hash='#/'">Back to Home</button>
      </div>
    `;
  }
}

function showToastAlert(message) {
  let container = document.getElementById('piq-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'piq-toast-container';
    container.className = 'piq-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'piq-toast show';
  toast.innerHTML = `
    <i data-lucide="info" style="width: 16px; height: 16px;"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}
