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
  subscribeToChatMessages,
  lockWatchPartyInCloud,
  promoteMemberRoleInCloud,
  removeMemberFromCloud,
  deleteChatMessageInCloud,
  createScheduledPartyInCloud,
  subscribeToScheduledParties,
  deleteScheduledPartyInCloud,
  getInitialsAvatar,
  subscribeToFriendsList
} from '../services/firebase.js';
import { initFriendAutocomplete } from '../components/FriendAutocomplete.js';
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

    if (party.locked === true) {
      const isAlreadyMember = (party.members || []).some(m => m.uid === user.uid);
      if (!isAlreadyMember) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-title">Room Locked</div>
            <div class="empty-state-text">This watch party has been locked by the host. New participants cannot join.</div>
            <button class="login-submit-btn" style="margin-top:20px; width:auto; padding:10px 24px;" onclick="window.location.hash='#/'">Go to Home</button>
          </div>
        `;
        return;
      }
    }

    let currentSessionToken = sessionStorage.getItem('piq_party_session');
    if (!currentSessionToken) {
      currentSessionToken = Math.random().toString(36).substring(2);
      sessionStorage.setItem('piq_party_session', currentSessionToken);
    }

    const member = {
      uid: user.uid,
      name: user.displayName || user.email.split('@')[0] || 'Guest',
      avatar: getInitialsAvatar(user.displayName, user.email, user.photoURL),
      role: 'guest',
      sessionToken: currentSessionToken
    };

    const isAlreadyMember = (party.members || []).some(m => m.uid === user.uid);
    if (isAlreadyMember) {
      container.innerHTML = `
        <div class="user-page" style="display:flex; justify-content:center; align-items:center; min-height:80vh; padding:20px;">
          <div class="glass-card" style="max-width:400px; width:100%; text-align:center; padding:32px;">
            <div class="dashboard-icon" style="margin:0 auto 20px auto; width:52px; height:52px; display:flex; align-items:center; justify-content:center; background:var(--accent-soft); border:1px solid var(--accent); border-radius:12px;">
              <i data-lucide="monitor" style="color:var(--accent); width:24px; height:24px;"></i>
            </div>
            <h2 style="font-family:var(--font-display); font-size:20px; font-weight:800; color:#fff; margin-bottom:12px;">Active Session Detected</h2>
            <p style="font-size:13px; color:var(--text-secondary); line-height:1.5; margin-bottom:24px;">You are already in this room on another device or tab. How would you like to proceed?</p>
            <div style="display:flex; flex-direction:column; gap:10px;">
              <button id="session-switch-btn" class="user-empty-btn" style="width:100%; justify-content:center; height:38px;">Switch Session to this Device</button>
              <button id="session-both-btn" class="login-input" style="width:100%; height:38px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); cursor:pointer; color:#fff; border-radius:8px;">Continue Both Sessions</button>
              <button id="session-cancel-btn" class="login-input" style="width:100%; height:38px; background:transparent; border:none; cursor:pointer; color:var(--text-muted);">Cancel & Go Home</button>
            </div>
          </div>
        </div>
      `;

      if (window.lucide) window.lucide.createIcons();

      container.querySelector('#session-cancel-btn').addEventListener('click', () => navigate('/'));

      container.querySelector('#session-both-btn').addEventListener('click', async () => {
        await joinWatchPartyInCloud(partyId, member);
        navigate(`/watch-party/${partyId}`);
      });

      container.querySelector('#session-switch-btn').addEventListener('click', async () => {
        const sessionToken = Math.random().toString(36).substring(2);
        sessionStorage.setItem('piq_party_session', sessionToken);
        await joinWatchPartyInCloud(partyId, { ...member, sessionToken });
        navigate(`/watch-party/${partyId}`);
      });

      return;
    }

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
          <div class="party-room-header" style="position:relative;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h2 id="party-media-title" style="flex:1; margin-right:8px;">Watch Together</h2>
              <button class="party-exit-btn" id="party-exit-btn" title="Leave Watch Party" aria-label="Leave Watch Party">
                <i data-lucide="log-out" style="width:16px; height:16px;"></i>
              </button>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:6px;">
              <div class="party-room-id-tag">Room ID: ${partyId}</div>
              <div id="room-lock-control-wrapper"></div>
            </div>
          </div>

          <!-- Active Members List -->
          <div class="party-members-block">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <div class="party-section-label" style="margin:0;">Active Members</div>
              <button class="party-invite-toggle-btn" id="party-invite-toggle-btn" title="Invite Friends" aria-label="Invite Friends">
                <i data-lucide="user-plus" style="width:14px; height:14px;"></i>
              </button>
            </div>

            <!-- Invite Drawer -->
            <div class="party-invite-drawer collapsed" id="party-invite-drawer">
              <div style="display:flex; gap:6px; margin-top:4px; margin-bottom:12px;">
                <input type="email" placeholder="friend@example.com" class="party-chat-input" id="sidebar-invite-email" style="padding:6px 10px; font-size:12px; height:32px; box-sizing:border-box;" />
                <button class="party-chat-send-btn" id="sidebar-send-invite-btn" style="width:32px; height:32px; flex-shrink:0;" aria-label="Send Invite">
                  <i data-lucide="mail" style="width:14px; height:14px;"></i>
                </button>
              </div>
              <div id="sidebar-invite-status" style="font-size:11px; display:none; margin-bottom:8px;"></div>
            </div>

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
          <div class="party-chat-input-area" style="position:relative;">
            <!-- Default Emoji Reactions Row -->
            <div class="party-reactions-row" id="party-reactions-row">
              ${REACTION_EMOJIS.map(emoji => `<button class="reaction-emoji-btn" data-emoji="${emoji}">${emoji}</button>`).join('')}
            </div>

            <!-- Input Box -->
            <form class="party-chat-form" id="party-chat-form" style="position:relative;">
              <button type="button" class="party-gif-toggle-btn" id="party-gif-toggle-btn" aria-label="Insert GIF">
                GIF
              </button>
              <input type="text" placeholder="Type a message..." class="party-chat-input" id="party-chat-input" required autocomplete="off" style="padding-left:46px;" />
              <button type="submit" class="party-chat-send-btn" aria-label="Send message">
                <i data-lucide="send" style="width:16px; height:16px;"></i>
              </button>

              <!-- GIF Popover Panel -->
              <div class="party-gif-panel hidden" id="party-gif-panel">
                <div class="gif-panel-header">
                  <input type="text" placeholder="Search GIPHY..." class="gif-search-input" id="gif-search-input" />
                </div>
                <div class="gif-results-grid" id="gif-results-grid"></div>
                <div class="gif-attribution">Powered by GIPHY</div>
              </div>
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
  let latestChatMessages = [];
  let partyDataObj = null;

  let currentFriends = [];
  let inviteAutocomplete = null;
  const unsubFriends = subscribeToFriendsList(user.uid, (friends) => {
    currentFriends = friends;
  });

  let currentSessionToken = sessionStorage.getItem('piq_party_session');
  if (!currentSessionToken) {
    currentSessionToken = Math.random().toString(36).substring(2);
    sessionStorage.setItem('piq_party_session', currentSessionToken);
  }

  const saveCurrentPartyToHistory = async () => {
    if (!partyDataObj) return;
    try {
      const { addPartyHistoryToCloud } = await import('../services/firebase.js');
      const historyData = {
        partyId,
        title: mediaTitleEl.textContent || 'Watch Together Session',
        posterPath: partyDataObj.posterPath || '',
        date: new Date().toISOString(),
        participants: (membersListEl._latestMembers || []).map(m => m.name),
        messages: latestChatMessages.map(m => ({
          id: m.id || Math.random().toString(),
          senderId: m.senderId,
          senderName: m.senderName,
          senderAvatar: m.senderAvatar,
          text: m.text || '',
          type: m.type || 'chat',
          reactionEmoji: m.reactionEmoji || null,
          gifUrl: m.gifUrl || null,
          timestamp: m.timestamp ? { seconds: m.timestamp.seconds || (typeof m.timestamp.toMillis === 'function' ? Math.floor(m.timestamp.toMillis() / 1000) : Math.floor(Date.now() / 1000)) } : { seconds: Math.floor(Date.now() / 1000) }
        }))
      };
      await addPartyHistoryToCloud(user.uid, historyData);
    } catch(err) {
      console.warn('[History] Failed to log party history:', err);
    }
  };

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
    let currentUserRole = isHost ? 'host' : 'guest';
    let hasPlaybackControl = isHost;
    let hostDisconnectCountdown = 30;
    let countdownInterval = null;

    const displayNameStr = partyData.title + (partyData.type === 'tv' ? ` S${partyData.season} E${partyData.episode}` : '');
    mediaTitleEl.textContent = displayNameStr;

    partyDataObj = partyData;

    // Auto-rejoin the user to the active members list if they refreshed or loaded directly
    const currentMember = {
      uid: user.uid,
      name: user.displayName || user.email.split('@')[0] || 'Guest',
      avatar: getInitialsAvatar(user.displayName, user.email, user.photoURL),
      role: isHost ? 'host' : 'guest',
      sessionToken: currentSessionToken
    };
    try {
      await joinWatchPartyInCloud(partyId, currentMember);
      const { updateUserStatusInCloud } = await import('../services/firebase.js');
      await updateUserStatusInCloud(user.uid, 'online', partyId, displayNameStr);
    } catch (joinErr) {
      console.warn('[WatchParty] Failed to auto-rejoin party:', joinErr);
    }

    // Detect HEVC support — query the browser directly via canPlayType().
    // Chrome 108+ on Windows/macOS with Media Foundation hardware support CAN play H.265.
    const supportsHEVC = document.createElement('video').canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') !== '' ||
                         document.createElement('video').canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"') !== '';

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
      isWatchParty: true,
      hasPlaybackControl: hasPlaybackControl,
      onEnded: () => {
        if (currentUserRole === 'host' || currentUserRole === 'co-host') {
          updateWatchPartyInCloud(partyId, { status: 'paused', currentTime: 0, lastUpdatedBy: user.uid });
        }
      }
    });

    videoEl = document.getElementById('vp-video');
    const isEmbed = streamData.type === 'embed';
    if (!videoEl && !isEmbed) {
      throw new Error('Video player media tag not found.');
    }

    // 4. Synchronization Logic Bindings
    const updateRoomStateInCloud = async (event) => {
      if (!videoEl || isApplyingSync) return;
      if (currentUserRole === 'host' || currentUserRole === 'co-host') {
        await updateWatchPartyInCloud(partyId, {
          status: videoEl.paused ? 'paused' : 'playing',
          currentTime: videoEl.currentTime,
          lastUpdatedBy: user.uid
        });
      }
    };

    if (videoEl) {
      videoEl.addEventListener('play', () => updateRoomStateInCloud('play'));
      videoEl.addEventListener('pause', () => updateRoomStateInCloud('pause'));
      videoEl.addEventListener('seeked', () => updateRoomStateInCloud('seeked'));

      // Periodic timer to sync current playtime in Firestore while playing
      syncInterval = setInterval(() => {
        if (videoEl && !videoEl.paused && !isApplyingSync) {
          if (currentUserRole === 'host' || currentUserRole === 'co-host') {
            updateWatchPartyInCloud(partyId, {
              currentTime: videoEl.currentTime,
              lastUpdatedBy: user.uid
            });
          }
        }
      }, 2000);
    } else {
      console.log('[WatchParty] Embed player loaded. Direct media sync controls bypassed.');
    }

    function showHostDisconnectOverlay() {
      const parent = document.getElementById('vp-player') || videoWrapper;
      if (!parent) return;
      if (document.getElementById('host-disconnect-overlay')) return;

      const overlay = document.createElement('div');
      overlay.id = 'host-disconnect-overlay';
      overlay.className = 'host-disconnect-overlay';
      overlay.innerHTML = `
        <div class="disconnect-card">
          <div class="disconnect-icon-wrap">
            <svg class="disconnect-circle" viewBox="0 0 100 100">
              <circle class="disconnect-circle-bg" cx="50" cy="50" r="44"></circle>
              <circle id="disconnect-circle-bar" class="disconnect-circle-bar" cx="50" cy="50" r="44" stroke-dasharray="276.4" stroke-dashoffset="0"></circle>
            </svg>
            <i data-lucide="wifi-off" class="disconnect-icon"></i>
          </div>
          <div class="disconnect-title">Host Disconnected</div>
          <div class="disconnect-subtitle">Waiting for host to return... <span id="disconnect-timer">30</span>s</div>
        </div>
      `;
      parent.appendChild(overlay);
      if (window.lucide) window.lucide.createIcons();

      let count = 30;
      const bar = overlay.querySelector('#disconnect-circle-bar');
      const timerText = overlay.querySelector('#disconnect-timer');

      if (countdownInterval) clearInterval(countdownInterval);
      countdownInterval = setInterval(() => {
        count--;
        if (timerText) timerText.textContent = count;
        if (bar) {
          const offset = 276.4 - (count / 30) * 276.4;
          bar.style.strokeDashoffset = offset;
        }

        if (count <= 0) {
          clearInterval(countdownInterval);
          countdownInterval = null;
          overlay.remove();
          showToastAlert('Watch party ended: host disconnected.');
          navigate('/');
        }
      }, 1000);
    }

    // 5. Subscribe to Room State in Cloud
    const unsubRoom = subscribeToWatchParty(partyId, (partyDoc) => {
      if (!partyDoc || partyDoc.status === 'ended') {
        // Party closed
        showToastAlert('Watch party has been closed by the host.');
        saveCurrentPartyToHistory().then(() => {
          navigate('/');
        });
        return;
      }

      // Check duplicate join session override
      const myMember = (partyDoc.members || []).find(m => m.uid === user.uid);
      if (myMember && myMember.sessionToken && currentSessionToken && myMember.sessionToken !== currentSessionToken) {
        showToastAlert('Disconnected: Joined this room on another device.');
        navigate('/');
        return;
      }

      // Check if current user is still in the room members (not kicked)
      if (!myMember) {
        showToastAlert('You have been removed from the watch party by the host.');
        navigate('/');
        return;
      }

      // Dynamic role updates
      currentUserRole = myMember.role;
      const oldControl = hasPlaybackControl;
      hasPlaybackControl = currentUserRole === 'host' || currentUserRole === 'co-host';
      if (activePlayer && oldControl !== hasPlaybackControl) {
        activePlayer.setPlaybackControl(hasPlaybackControl);
      }

      // Sync members list
      const members = partyDoc.members || [];
      membersListEl._latestMembers = members; // cache for exit modal
      membersListEl.innerHTML = members.map(m => {
        const isMe = m.uid === user.uid;
        let actionsHtml = '';
        if (!isMe) {
          if (currentUserRole === 'host') {
            actionsHtml = `
              <div class="party-member-actions">
                <button class="member-action-btn promote" data-uid="${m.uid}" data-role="${m.role}">
                  ${m.role === 'co-host' ? 'Demote Guest' : 'Promote Co-host'}
                </button>
                <button class="member-action-btn kick" data-uid="${m.uid}">Kick</button>
              </div>
            `;
          } else if (currentUserRole === 'co-host' && m.role === 'guest') {
            actionsHtml = `
              <div class="party-member-actions">
                <button class="member-action-btn kick" data-uid="${m.uid}">Kick</button>
              </div>
            `;
          }
        }
        return `
          <div class="party-member-item" id="member-item-${m.uid}">
            <div class="party-member-avatar-wrap" title="${m.name} (${m.role})">
              <img class="party-member-avatar" src="${m.avatar}" alt="${m.name}" />
              <span class="party-member-role-dot ${m.role}"></span>
              <div class="party-member-tooltip">
                <div class="tooltip-name">${m.name}</div>
                <div class="tooltip-role">${m.role}</div>
                ${actionsHtml}
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Wire Admin Clicks on updated members list
      membersListEl.querySelectorAll('.member-action-btn.promote').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const uid = btn.dataset.uid;
          const currentRole = btn.dataset.role;
          const nextRole = currentRole === 'co-host' ? 'guest' : 'co-host';
          try {
            await promoteMemberRoleInCloud(partyId, uid, nextRole);
            showToastAlert(nextRole === 'co-host' ? 'Promoted guest to Co-host' : 'Revoked Co-host privileges');
          } catch(err) {
            console.error(err);
          }
        });
      });

      membersListEl.querySelectorAll('.member-action-btn.kick').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const uid = btn.dataset.uid;
          try {
            await removeMemberFromCloud(partyId, uid);
            showToastAlert('Kicked guest from room');
          } catch(err) {
            console.error(err);
          }
        });
      });

      // Lock toggle button rendering (for Host only, passive badge for guests)
      const lockWrapper = container.querySelector('#room-lock-control-wrapper');
      if (lockWrapper) {
        const isLocked = partyDoc.locked === true;
        if (currentUserRole === 'host') {
          lockWrapper.innerHTML = `
            <button class="party-lock-btn ${isLocked ? 'locked' : ''}" id="party-lock-toggle">
              <i data-lucide="${isLocked ? 'lock' : 'unlock'}" style="width:12px;height:12px;"></i>
              <span>${isLocked ? 'Locked' : 'Unlocked'}</span>
            </button>
          `;
          const btn = lockWrapper.querySelector('#party-lock-toggle');
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            btn.disabled = true;
            try {
              await lockWatchPartyInCloud(partyId, !isLocked);
              showToastAlert(!isLocked ? 'Watch Together room is now LOCKED.' : 'Watch Together room is now UNLOCKED.');
            } catch(e) {
              console.error(e);
            } finally {
              btn.disabled = false;
            }
          });
        } else {
          lockWrapper.innerHTML = `
            <span class="party-lock-status-badge ${isLocked ? 'locked' : ''}">
              <i data-lucide="${isLocked ? 'lock' : 'unlock'}" style="width:10px;height:10px;"></i>
              <span>${isLocked ? 'Locked' : 'Public'}</span>
            </span>
          `;
        }
        if (window.lucide) window.lucide.createIcons();
      }

      // Check Host presence (grace countdown warning overlay)
      const isHostActive = members.some(m => m.uid === partyDoc.hostId);
      const hostWarningEl = document.getElementById('host-disconnect-overlay');
      if (!isHostActive) {
        if (!hostWarningEl) {
          showHostDisconnectOverlay();
        }
      } else {
        if (hostWarningEl) {
          hostWarningEl.remove();
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
      }

      // If Guest/Co-host (who is not the event initiator), apply Host playback sync updates
      if (partyDoc.lastUpdatedBy !== user.uid && videoEl) {
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
    const senderAvatar = getInitialsAvatar(user.displayName, user.email, user.photoURL);

    const sendChatMessage = async (text, type = 'chat', reactionEmoji = null, gifUrl = null) => {
      const msgObj = {
        senderId: user.uid,
        senderName,
        senderAvatar,
        text,
        type,
        reactionEmoji,
        gifUrl
      };
      await sendChatMessageInCloud(partyId, msgObj);
    };

    // Exit button logic
    const exitBtn = container.querySelector('#party-exit-btn');
    if (exitBtn) {
      exitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleExitFlow();
      });
    }

    async function handleExitFlow() {
      if (currentUserRole === 'host') {
        showHostExitModal();
      } else {
        await saveCurrentPartyToHistory();
        try { leaveWatchPartyInCloud(partyId, user.uid); } catch(e){}
        navigate('/');
      }
    }

    function showHostExitModal() {
      const modal = document.createElement('div');
      modal.className = 'detail-modal';
      modal.style.cssText = `
        display: flex;
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(12px);
        z-index: 1010;
        justify-content: center; align-items: center;
        padding: 20px;
        animation: fadeIn 0.3s ease;
      `;

      const otherMembers = (membersListEl._latestMembers || []).filter(m => m.uid !== user.uid);
      let transferHtml = '';
      if (otherMembers.length > 0) {
        transferHtml = `
          <div style="margin-top:20px; text-align:left;">
            <label style="font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">Transfer Host Role</label>
            <select id="transfer-host-select" class="login-input" style="background: rgba(255,255,255,0.03); color: #fff; margin-top:8px; display:block; width:100%;">
              ${otherMembers.map(m => `<option value="${m.uid}" style="background:#141419; color:#fff;">${m.name} (${m.role})</option>`).join('')}
            </select>
            <button id="exit-transfer-btn" class="login-submit-btn" style="margin-top:12px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent); font-weight:600; padding:8px 0; font-size:13px; height:auto; display:block; width:100%;">
              Transfer & Leave
            </button>
          </div>
        `;
      }

      modal.innerHTML = `
        <div style="background: rgba(20, 20, 25, 0.85); border: 1.5px solid rgba(255,255,255,0.08); backdrop-filter: blur(20px); max-width: 420px; width: 100%; border-radius: 16px; padding: 28px; position: relative; box-shadow: 0 20px 50px rgba(0,0,0,0.5); text-align:center;">
          <h2 style="margin-top: 0; margin-bottom: 8px; font-size: 20px; font-weight: 800; color: #fff;">Exit Watch Party</h2>
          <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 24px; line-height: 1.5;">You are the host. Ending the party will close the room for everyone.</p>
          
          <div style="display:flex; flex-direction:column; gap:12px;">
            <button id="exit-end-btn" class="login-submit-btn" style="background:#ef4444; font-weight:700; font-size:14px; padding:10px 0; height:auto;">
              End Party for Everyone
            </button>
            ${transferHtml}
            <button id="exit-cancel-btn" class="login-input" style="background:rgba(255,255,255,0.02); border:1.5px solid var(--border-color); cursor:pointer; font-weight:600; padding:10px 0; height:auto; margin-top:8px;">
              Cancel
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      modal.querySelector('#exit-cancel-btn').addEventListener('click', () => modal.remove());
      
      modal.querySelector('#exit-end-btn').addEventListener('click', async () => {
        modal.remove();
        await saveCurrentPartyToHistory();
        try {
          await updateWatchPartyInCloud(partyId, { status: 'ended' });
          await leaveWatchPartyInCloud(partyId, user.uid);
        } catch(e){}
        navigate('/');
      });

      const transferBtn = modal.querySelector('#exit-transfer-btn');
      if (transferBtn) {
        transferBtn.addEventListener('click', async () => {
          const targetUid = modal.querySelector('#transfer-host-select').value;
          modal.remove();
          await saveCurrentPartyToHistory();
          try {
            await promoteMemberRoleInCloud(partyId, targetUid, 'host');
            await updateWatchPartyInCloud(partyId, { hostId: targetUid });
            await leaveWatchPartyInCloud(partyId, user.uid);
          } catch(e){}
          navigate('/');
        });
      }
    }

    // Invite Friends Drawer logic
    const inviteToggleBtn = container.querySelector('#party-invite-toggle-btn');
    const inviteDrawer = container.querySelector('#party-invite-drawer');
    const inviteStatus = container.querySelector('#sidebar-invite-status');
    const inviteEmailInput = container.querySelector('#sidebar-invite-email');
    const sendInviteBtn = container.querySelector('#sidebar-send-invite-btn');

    if (inviteEmailInput) {
      inviteAutocomplete = initFriendAutocomplete(inviteEmailInput, () => currentFriends, false);
    }

    if (inviteToggleBtn) {
      inviteToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        inviteDrawer.classList.toggle('collapsed');
      });
    }

    if (sendInviteBtn) {
      sendInviteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const email = inviteEmailInput.value.trim();
        if (!email) return;

        sendInviteBtn.disabled = true;
        inviteStatus.style.display = 'block';
        inviteStatus.style.color = 'var(--text-muted)';
        inviteStatus.textContent = 'Sending...';

        try {
          const response = await fetch(`${NODE_PROXY}/api/email/send-invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hostName: user.displayName || user.email.split('@')[0] || 'Host',
              inviteeEmail: email,
              title: displayNameStr,
              partyId,
              mediaType: partyData.type,
              posterPath: partyData.posterPath
            })
          });

          if (response.ok) {
            inviteStatus.style.color = '#10b981';
            inviteStatus.textContent = 'Invite sent!';
            inviteEmailInput.value = '';
            setTimeout(() => { inviteStatus.style.display = 'none'; }, 3000);
          } else {
            const resData = await response.json();
            throw new Error(resData.error || 'Failed to send invite.');
          }
        } catch(err) {
          inviteStatus.style.color = '#fbbf24';
          inviteStatus.textContent = 'Fallback: logged to console.';
          console.log('\n  [Mock Invite Link]:', `https://playeriq.suyogmahagaonkar.me/#/watch-party/join/${partyId}\n`);
        } finally {
          sendInviteBtn.disabled = false;
        }
      });
    }

    // GIF Panel logic
    const gifToggleBtn = container.querySelector('#party-gif-toggle-btn');
    const gifPanel = container.querySelector('#party-gif-panel');
    const gifSearchInput = container.querySelector('#gif-search-input');
    const gifResultsGrid = container.querySelector('#gif-results-grid');

    if (gifToggleBtn) {
      gifToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        gifPanel.classList.toggle('hidden');
        if (!gifPanel.classList.contains('hidden')) {
          loadTrendingGIFs();
        }
      });
    }

    // Close GIF panel when clicking outside
    document.addEventListener('click', (e) => {
      if (gifPanel && !gifPanel.classList.contains('hidden') && !gifPanel.contains(e.target) && e.target !== gifToggleBtn) {
        gifPanel.classList.add('hidden');
      }
    });

    async function loadTrendingGIFs() {
      gifResultsGrid.innerHTML = '<div style="color:var(--text-muted); font-size:11px; padding:12px; text-align:center;">Loading...</div>';
      try {
        const res = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=dc6zaTOxFJmzC&limit=15&rating=g`);
        const data = await res.json();
        renderGIFs(data.data);
      } catch(e) {
        gifResultsGrid.innerHTML = '<div style="color:#ef4444; font-size:11px; padding:12px; text-align:center;">Failed to load trending.</div>';
      }
    }

    let debounceTimer = null;
    if (gifSearchInput) {
      gifSearchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const query = gifSearchInput.value.trim();
          if (query) {
            searchGIFs(query);
          } else {
            loadTrendingGIFs();
          }
        }, 300); // 300ms debounce
      });
      gifSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          clearTimeout(debounceTimer);
          const query = gifSearchInput.value.trim();
          if (query) searchGIFs(query);
        }
      });
    }

    async function searchGIFs(query) {
      gifResultsGrid.innerHTML = '<div style="color:var(--text-muted); font-size:11px; padding:12px; text-align:center;">Searching...</div>';
      try {
        const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(query)}&limit=15&rating=g`);
        const data = await res.json();
        renderGIFs(data.data);
      } catch(e) {
        gifResultsGrid.innerHTML = '<div style="color:#ef4444; font-size:11px; padding:12px; text-align:center;">Failed to search.</div>';
      }
    }

    function renderGIFs(gifs) {
      if (!gifs || gifs.length === 0) {
        gifResultsGrid.innerHTML = '<div style="color:var(--text-muted); font-size:11px; padding:12px; text-align:center;">No GIFs found.</div>';
        return;
      }

      gifResultsGrid.innerHTML = gifs.map(g => `
        <img class="gif-grid-thumb" src="${g.images.fixed_width_small.url}" data-full-url="${g.images.fixed_height.url}" alt="${g.title}" />
      `).join('');

      gifResultsGrid.querySelectorAll('.gif-grid-thumb').forEach(img => {
        img.addEventListener('click', async (e) => {
          e.stopPropagation();
          const fullUrl = img.dataset.fullUrl;
          gifPanel.classList.add('hidden');
          if (gifSearchInput) gifSearchInput.value = '';
          try {
            await sendChatMessage('', 'gif', null, fullUrl);
          } catch(err) {
            console.error(err);
          }
        });
      });
    }

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
      latestChatMessages = messages;
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
        const deleteBtn = (currentUserRole === 'host' || currentUserRole === 'co-host') 
          ? `<button class="chat-delete-btn" data-msg-id="${m.id}" title="Delete Message"><i data-lucide="trash-2" style="width:12px;height:12px;"></i></button>`
          : '';

        if (m.type === 'gif') {
          return `
            <div class="chat-message ${isSelf ? 'self' : ''}">
              <img class="chat-msg-avatar" src="${m.senderAvatar}" alt="" />
              <div class="chat-msg-body">
                <div class="chat-msg-sender-name" style="display:flex; justify-content:space-between; align-items:center;">
                  <span>${m.senderName}</span>
                  ${deleteBtn}
                </div>
                <div class="chat-msg-text gif" style="padding:4px; background:transparent; border:none; display:block;">
                  <img src="${m.gifUrl}" alt="GIF" style="border-radius:8px; max-width:180px; display:block; box-shadow: 0 4px 10px rgba(0,0,0,0.3);" />
                </div>
              </div>
            </div>
          `;
        }

        return `
          <div class="chat-message ${isSelf ? 'self' : ''}">
            <img class="chat-msg-avatar" src="${m.senderAvatar}" alt="" />
            <div class="chat-msg-body">
              <div class="chat-msg-sender-name" style="display:flex; justify-content:space-between; align-items:center;">
                <span>${m.senderName}</span>
                ${deleteBtn}
              </div>
              <div class="chat-msg-text">${m.text}</div>
            </div>
          </div>
        `;
      }).join('');

      // Auto scroll chat to bottom
      chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

      if (window.lucide) window.lucide.createIcons();

      // Wire Chat delete clicks
      chatMessagesEl.querySelectorAll('.chat-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const msgId = btn.dataset.msgId;
          try {
            await deleteChatMessageInCloud(partyId, msgId);
          } catch(err) {
            console.error(err);
          }
        });
      });

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
      if (countdownInterval) clearInterval(countdownInterval);
      if (unsubRoom) unsubRoom();
      if (unsubChat) unsubChat();
      if (unsubFriends) unsubFriends();
      if (inviteAutocomplete) {
        inviteAutocomplete.destroy();
        inviteAutocomplete = null;
      }
      if (activePlayer) activePlayer.destroy();
      
      // Leave room and reset status
      leaveWatchPartyInCloud(partyId, user.uid);
      import('../services/firebase.js').then(({ updateUserStatusInCloud }) => {
        updateUserStatusInCloud(user.uid, 'online', null, null);
      });
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
