// ============================================================
// PlayerIQ — Watch Together Dashboard / Party Watch Page
// ============================================================

import { img, getMovieDetails, getTVDetails, searchMovieBox, NODE_PROXY } from '../services/api.js';
import { getUser, waitAuthReady } from '../services/auth.js';
import {
  createWatchPartyInCloud,
  getWatchPartyFromCloud,
  subscribeToFriendsList,
  subscribeToFriendRequests,
  subscribeToFriendStatus,
  sendFriendRequestInCloud,
  acceptFriendRequestInCloud,
  declineFriendRequestInCloud,
  removeFriendFromCloud,
  updateUserStatusInCloud,
  sendPartyInviteNotification,
  fetchPartyHistoryFromCloud,
  removePartyHistoryItemFromCloud,
  clearAllPartyHistoryFromCloud,
  addPartyHistoryToCloud,
  createScheduledPartyInCloud,
  subscribeToScheduledParties,
  deleteScheduledPartyInCloud,
  updateScheduledPartyInviteesInCloud,
  getInitialsAvatar
} from '../services/firebase.js';
import { navigate } from '../services/router.js';
import { initFriendAutocomplete } from '../components/FriendAutocomplete.js';
import { showCustomConfirm } from '../components/CustomDialog.js';

export async function renderPartyWatchDashboard({ container }) {
  await waitAuthReady();
  const user = getUser();
  let currentFriendsList = [];
  let currentScheduledParties = [];
  let currentFriendsFilter = 'all';
  let inviteesAutocomplete = null;

  function getNextRoomNumber() {
    const numbers = new Set();
    const regex = /^Room\s+no\.\s*(\d+)$/i;
    if (Array.isArray(currentScheduledParties)) {
      currentScheduledParties.forEach(sch => {
        const title = sch.title || '';
        const match = title.trim().match(regex);
        if (match) {
          numbers.add(parseInt(match[1], 10));
        }
      });
    }
    let nextNum = 1;
    while (numbers.has(nextNum)) {
      nextNum++;
    }
    return nextNum;
  }

  if (!user) {
    container.innerHTML = `
      <div class="user-page">
        <div class="user-guest-prompt">
          <div class="user-guest-prompt-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <h2>Join the Party</h2>
          <p>Sign in to start synchronized watch parties, schedule future rooms, add friends, and look through your logs.</p>
          <button class="user-guest-signin-btn" id="dashboard-guest-signin">
            <i data-lucide="log-in"></i> Sign In to Account
          </button>
        </div>
      </div>
    `;

    const signinBtn = container.querySelector('#dashboard-guest-signin');
    signinBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      const existing = document.getElementById('login-overlay');
      if (!existing) {
        const loginContainer = document.createElement('div');
        loginContainer.id = 'login-overlay';
        document.body.appendChild(loginContainer);
        import('./LoginPage.js').then(m => m.renderLoginPage(loginContainer));
      }
    });

    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // ---- Page Shell Layout ----
  container.innerHTML = `
    <div class="party-dashboard">
      <div class="dashboard-header">
        <div class="dashboard-icon">
          <i data-lucide="users"></i>
        </div>
        <div class="dashboard-meta">
          <h1 class="dashboard-title">Party Watch Hub</h1>
          <div class="dashboard-subtitle">Host synchronized streams with friends, check schedules, and manage requests.</div>
        </div>
      </div>

      <!-- Tab Selection Bar -->
      <div class="dashboard-tabs-bar">
        <button class="dashboard-tab-btn active" data-tab="tab-dashboard">
          <i data-lucide="tv"></i> Dashboard
        </button>
        <button class="dashboard-tab-btn" data-tab="tab-friends">
          <i data-lucide="user-plus"></i> Friends & Social
          <span id="requests-badge-count" style="display:none; background:#ef4444; color:#fff; border-radius:50%; width:16px; height:16px; font-size:10px; font-weight:700; align-items:center; justify-content:center; line-height:16px; text-align:center; margin-left:4px;">0</span>
        </button>
        <button class="dashboard-tab-btn" data-tab="tab-history">
          <i data-lucide="history"></i> Party Logs
        </button>
      </div>

      <div class="dashboard-tab-content">
        <!-- TAB 1: DASHBOARD -->
        <div class="dashboard-panel active" id="tab-dashboard">
          <div class="dashboard-grid">
            <div style="display:flex; flex-direction:column; gap:24px;">
              <!-- Start / Join Modules -->
              <div class="glass-card" style="display:flex; flex-wrap:wrap; gap:20px; align-items:center; justify-content:space-between;">
                <div>
                  <h3 style="margin:0 0 6px 0; font-family:var(--font-display); font-size:18px; font-weight:800;">Start a Watch Party</h3>
                  <p style="margin:0; font-size:12px; color:var(--text-secondary);">Select a movie or episode to invite friends and synchronize playback.</p>
                </div>
                <button class="user-empty-btn" id="start-party-btn" style="margin:0; height:42px; display:inline-flex; align-items:center; gap:8px;">
                  <i data-lucide="plus-circle" style="width:16px; height:16px;"></i> Create Room
                </button>
              </div>

              <!-- Scheduled Parties -->
              <div class="glass-card">
                <div class="card-title-row">
                  <h3>Scheduled watch sessions</h3>
                  <button class="history-replay-btn" id="schedule-party-trigger" style="padding:4px 10px; font-size:11px;">
                    <i data-lucide="calendar"></i> Schedule Future
                  </button>
                </div>
                <div id="scheduled-parties-container" class="scheduled-list">
                  <!-- Rendered dynamically -->
                </div>
              </div>
            </div>

            <!-- Right Column: Direct Join & Friend Activity -->
            <div style="display:flex; flex-direction:column; gap:24px;">
              <!-- Direct Join Card -->
              <div class="glass-card" id="direct-join-card" style="transition: all 0.3s ease;">
                <div class="card-title-row" style="margin-bottom:12px; padding-bottom:6px;">
                  <h3>Join with Room ID</h3>
                </div>
                <form id="direct-join-form" style="display:flex; gap:8px; margin:0; padding:0; width:100%;">
                  <input type="text" id="direct-join-code-input" class="party-chat-input" placeholder="Enter Room ID" style="flex:1; height:36px; box-sizing:border-box; padding:6px 12px;" required />
                  <button type="submit" class="party-chat-send-btn" id="direct-join-btn" style="width:36px; height:36px; flex-shrink:0; cursor:pointer;" title="Join Room">
                    <i data-lucide="arrow-right" style="width:16px; height:16px;"></i>
                  </button>
                </form>
              </div>

              <!-- Friend Activity presence panel -->
              <div class="glass-card">
                <div class="card-title-row" style="margin-bottom:12px; padding-bottom:6px;">
                  <h3>Active Friend Parties</h3>
                </div>
                <div id="friend-activity-presence-list" class="friends-activity-list">
                  <!-- Live friends watching -->
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: FRIENDS & SOCIAL -->
        <div class="dashboard-panel" id="tab-friends">
          <div class="friends-tab-grid">
            <div class="glass-card">
              <div class="card-title-row" style="flex-wrap: wrap; gap: 10px;">
                <h3>My Friends List</h3>
                <div class="friends-filter-buttons" style="display: flex; gap: 4px; background: rgba(255,255,255,0.05); padding: 3px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                  <button class="filter-btn active" data-filter="all" style="background: rgba(255,255,255,0.1); border: none; color: #fff; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;">All</button>
                  <button class="filter-btn" data-filter="friends" style="background: none; border: none; color: var(--text-muted); padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Friends</button>
                  <button class="filter-btn" data-filter="pending" style="background: none; border: none; color: var(--text-muted); padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Pending</button>
                </div>
              </div>
              <div id="friends-list-container" class="friends-list-container">
                <!-- Mutual friends list -->
              </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:24px;">
              <!-- Add Friend form -->
              <div class="glass-card">
                <div class="card-title-row" style="margin-bottom:12px; padding-bottom:6px;">
                  <h3>Add Friend via Email</h3>
                </div>
                <form id="add-friend-form" style="display:flex; flex-direction:column; gap:10px;">
                  <input type="email" id="friend-email-input" class="party-chat-input" placeholder="friend@email.com" required style="height:36px; box-sizing:border-box;" />
                  <button type="submit" class="user-empty-btn" style="width:100%; justify-content:center; height:36px; padding:0;">
                    Send Request
                  </button>
                </form>
              </div>

              <!-- Friend Requests list -->
              <div class="glass-card">
                <div class="card-title-row" style="margin-bottom:12px; padding-bottom:6px;">
                  <h3>Incoming Requests</h3>
                </div>
                <div id="friend-requests-list" class="friend-requests-list">
                  <!-- Pending incoming requests -->
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 3: PARTY HISTORY LOGS -->
        <div class="dashboard-panel" id="tab-history">
          <div class="glass-card">
            <div class="card-title-row" style="flex-wrap: wrap; gap: 10px;">
              <h3>Past Watched Parties History</h3>
              <button id="clear-all-history-btn" class="user-empty-btn" style="height:32px; padding:0 12px; font-size:12px; border-color:rgba(239, 68, 68, 0.4); color:#ef4444; background:rgba(239, 68, 68, 0.05); display:none; align-items:center; justify-content:center; gap:4px;">
                <i data-lucide="trash-2" style="width:13px; height:13px;"></i> Clear All History
              </button>
            </div>
            <div id="history-logs-container" class="history-list-container">
              <!-- Party History cards -->
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals Mount Point -->
    <div id="dashboard-modal-overlay" class="dashboard-modal hidden"></div>
  `;

  // Start checking Lucide icons
  if (window.lucide) window.lucide.createIcons();

  // ---- Selectors ----
  const tabs = container.querySelectorAll('.dashboard-tab-btn');
  const panels = container.querySelectorAll('.dashboard-panel');
  const requestsBadge = container.querySelector('#requests-badge-count');
  const modalOverlay = container.querySelector('#dashboard-modal-overlay');

  // Tab switching logic
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPanel = container.querySelector(`#${btn.dataset.tab}`);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // Direct Code Join
  const codeInput = container.querySelector('#direct-join-code-input');
  const directJoinForm = container.querySelector('#direct-join-form');
  const directJoinCard = container.querySelector('#direct-join-card');

  const runJoin = async (e) => {
    if (e) e.preventDefault();
    const code = codeInput.value.trim();
    if (!code) {
      directJoinCard?.classList.add('piq-shake-error');
      setTimeout(() => directJoinCard?.classList.remove('piq-shake-error'), 450);
      return;
    }
    
    // Check if room code exists
    try {
      const room = await getWatchPartyFromCloud(code);
      if (!room) {
        directJoinCard?.classList.add('piq-shake-error');
        setTimeout(() => directJoinCard?.classList.remove('piq-shake-error'), 450);
        showToast('Room not found. Check the ID and try again.');
        return;
      }
      codeInput.value = '';
      navigate(`/watch-party/join/${code}`);
    } catch (err) {
      directJoinCard?.classList.add('piq-shake-error');
      setTimeout(() => directJoinCard?.classList.remove('piq-shake-error'), 450);
      showToast('Error verifying room.');
    }
  };
  directJoinForm?.addEventListener('submit', runJoin);

  // Add Friend Request
  const addFriendForm = container.querySelector('#add-friend-form');
  const friendEmailInput = container.querySelector('#friend-email-input');
  addFriendForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = friendEmailInput.value.trim();
    if (!email) return;

    try {
      await sendFriendRequestInCloud(user.uid, email);
      showToast('Friend request sent!');
      friendEmailInput.value = '';
    } catch(err) {
      showToast(err.message || 'Failed to send request.');
    }
  });

  // Friends list filter buttons setup
  const filterBtns = container.querySelectorAll('.friends-filter-buttons .filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => {
        b.classList.remove('active');
        b.style.color = 'var(--text-muted)';
        b.style.background = 'none';
      });
      btn.classList.add('active');
      btn.style.color = '#fff';
      btn.style.background = 'rgba(255,255,255,0.1)';
      
      currentFriendsFilter = btn.dataset.filter;
      renderFriendsList();
    });
  });

  // ---- Real-time listeners ----

  // 1. Friend Requests listener
  const unsubRequests = subscribeToFriendRequests(user.uid, (requests) => {
    const listEl = container.querySelector('#friend-requests-list');
    if (!listEl) return;

    if (requests.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:10px 0;">No pending requests.</div>';
      requestsBadge.style.display = 'none';
      return;
    }

    requestsBadge.style.display = 'inline-flex';
    requestsBadge.textContent = String(requests.length);

    listEl.innerHTML = requests.map(req => `
      <div class="friend-request-card" id="req-card-${req.senderUid}">
        <img class="friend-status-avatar" src="${req.senderAvatar}" alt="" />
        <div class="friend-request-info">
          <div style="font-weight:700; font-size:13px; color:#fff;">${req.senderName}</div>
          <div style="font-size:11px; color:var(--text-muted);">${req.senderEmail}</div>
        </div>
        <div class="request-actions-row">
          <button class="request-btn accept" data-uid="${req.senderUid}">Accept</button>
          <button class="request-btn decline" data-uid="${req.senderUid}">Decline</button>
        </div>
      </div>
    `).join('');

    // Wire accept/decline buttons
    listEl.querySelectorAll('.request-btn.accept').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.uid;
        try {
          await acceptFriendRequestInCloud(user.uid, uid);
          showToast('Accepted request!');
        } catch(e) {
          showToast('Failed to accept request.');
        }
      });
    });

    listEl.querySelectorAll('.request-btn.decline').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.uid;
        try {
          await declineFriendRequestInCloud(user.uid, uid);
          showToast('Declined request.');
        } catch(e) {
          showToast('Failed to decline request.');
        }
      });
    });
  });

  // 2. Mutual Friends and Presence Status listeners
  let statusUnsubscribes = {};

  function renderFriendsList() {
    const listEl = container.querySelector('#friends-list-container');
    if (!listEl) return;

    const filtered = currentFriendsList.filter(f => {
      if (currentFriendsFilter === 'friends') return !f.isPending;
      if (currentFriendsFilter === 'pending') return f.isPending;
      return true;
    });

    if (filtered.length === 0) {
      const emptyMsg = currentFriendsFilter === 'friends' 
        ? 'No accepted friends yet.' 
        : currentFriendsFilter === 'pending' 
          ? 'No pending friend requests sent.' 
          : 'No friends added yet.';
      listEl.innerHTML = `<div style="color:var(--text-muted); font-size:12px; padding:12px 0;">${emptyMsg}</div>`;
      return;
    }

    listEl.innerHTML = filtered.map(f => `
      <div class="friend-card-detailed" id="friend-card-${f.uid}">
        <img class="friend-card-detailed-avatar" src="${f.avatar}" alt="" style="${f.isPending ? 'opacity: 0.6;' : ''}" />
        <div class="friend-card-detailed-info" style="${f.isPending ? 'opacity: 0.8;' : ''}">
          <div class="friend-card-detailed-name" style="display: flex; align-items: center; gap: 6px;">
            <span>${f.name}</span>
            ${f.isPending ? `<span style="font-size: 10px; background: rgba(168, 85, 247, 0.15); border: 1.5px solid rgba(168, 85, 247, 0.3); padding: 2px 6px; border-radius: 4px; color: var(--accent, #a855f7); font-weight: 700; display: inline-block;">Pending</span>` : ''}
          </div>
          <div class="friend-card-detailed-email">${f.email}</div>
        </div>
        <button class="friend-card-detailed-remove-btn" data-uid="${f.uid}" data-pending="${f.isPending}" title="${f.isPending ? 'Cancel Friend Request' : 'Remove Friend'}">
          <i data-lucide="${f.isPending ? 'x' : 'user-minus'}" style="width:16px; height:16px;"></i>
        </button>
      </div>
    `).join('');

    listEl.querySelectorAll('.friend-card-detailed-remove-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const isPending = btn.dataset.pending === 'true';
        const confirmMsg = isPending 
          ? 'Cancel friend request?' 
          : 'Are you sure you want to remove this friend?';
        const confirmed = await showCustomConfirm(isPending ? 'Cancel Request' : 'Remove Friend', confirmMsg);
        if (confirmed) {
          const uid = btn.dataset.uid;
          try {
            await removeFriendFromCloud(user.uid, uid);
            showToast(isPending ? 'Friend request canceled.' : 'Friend removed.');
          } catch(e) {
            showToast(isPending ? 'Error canceling request.' : 'Error removing friend.');
          }
        }
      });
    });
    
    if (window.lucide) window.lucide.createIcons();
  }

  const unsubFriends = subscribeToFriendsList(user.uid, (friends) => {
    currentFriendsList = friends;
    const presenceListEl = container.querySelector('#friend-activity-presence-list');
    
    // Clean up old status listeners
    Object.values(statusUnsubscribes).forEach(un => un());
    statusUnsubscribes = {};
 
    if (friends.length === 0) {
      if (presenceListEl) presenceListEl.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:10px 0;">No active watch parties among friends.</div>';
    }
 
    renderFriendsList();
 
    // Subscribe to statuses of each friend to populate presence lists in real-time
    const currentStatusStates = {};
    friends.forEach(f => {
      if (!f.isPending) {
        statusUnsubscribes[f.uid] = subscribeToFriendStatus(f.uid, (profile) => {
          currentStatusStates[f.uid] = { ...f, ...profile };
          recomputePresenceList(currentStatusStates);
        });
      }
    });
  });

  // Dynamically recompute the list of friend activities
  function recomputePresenceList(states) {
    const listEl = container.querySelector('#friend-activity-presence-list');
    if (!listEl) return;

    const list = Object.values(states);
    const activeInvites = list.filter(f => f.status === 'online' && f.activePartyId);

    if (activeInvites.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:10px 0;">No active watch parties.</div>';
      return;
    }

    listEl.innerHTML = activeInvites.map(f => `
      <div class="friend-activity-card">
        <div class="friend-status-avatar-wrap">
          <img class="friend-status-avatar" src="${f.avatar}" alt="" />
          <span class="friend-status-dot online"></span>
        </div>
        <div class="friend-status-info">
          <div class="friend-status-name">${f.name}</div>
          <div class="friend-status-activity watching">Watching: ${f.activeWatchMedia || 'Live Stream'}</div>
        </div>
        <button class="join-party-badge-btn" data-party-id="${f.activePartyId}">
          <i data-lucide="play" style="width:10px; height:10px; fill:currentColor;"></i> Join
        </button>
      </div>
    `).join('');

    listEl.querySelectorAll('.join-party-badge-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigate(`/watch-party/join/${btn.dataset.partyId}`);
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }

  // 3. Scheduled Parties list listener
  const unsubScheduled = subscribeToScheduledParties(user.uid, user.email, (scheduled) => {
    currentScheduledParties = scheduled;
    const listEl = container.querySelector('#scheduled-parties-container');
    if (!listEl) return;

    if (scheduled.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:20px 0; grid-column:1/-1; text-align:center;">No scheduled parties.</div>';
      return;
    }

    // Sort by scheduled time ascending
    scheduled.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

    listEl.innerHTML = scheduled.map(sch => {
      const isHost = sch.hostId === user.uid;
      const dateStr = new Date(sch.scheduledTime).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
      const posterUrl = sch.posterPath 
        ? (sch.posterPath.startsWith('/') ? `https://image.tmdb.org/t/p/w154${sch.posterPath}` : sch.posterPath)
        : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150" fill="%23222"><rect width="100" height="150"/></svg>';

      return `
        <div class="scheduled-card">
          <img class="scheduled-poster" src="${posterUrl}" alt="" />
          <div class="scheduled-info">
            <div>
              <div class="scheduled-title">${sch.title}</div>
              <div class="scheduled-time">${dateStr}</div>
              <div class="scheduled-host">${isHost ? 'Hosted by you' : `Host: ${sch.hostName}`}</div>
            </div>
            <div class="scheduled-actions">
              <button class="join-party-badge-btn start-sch-btn" data-party-id="${sch.partyId}" style="padding:4px 10px; font-size:10px;">
                ${isHost ? 'Start Room' : 'Join'}
              </button>
              <button class="calendar-invite-btn add-cal-btn" data-title="${sch.title}" data-time="${sch.scheduledTime}" data-id="${sch.partyId}" title="Add to Calendar">
                <i data-lucide="calendar" style="width:12px;height:12px;"></i>
              </button>
              <button class="calendar-invite-btn participants-sch-btn" data-party-id="${sch.partyId}" title="View Participants" style="padding:2px; width:22px; height:22px;">
                <i data-lucide="users" style="width:12px;height:12px;"></i>
              </button>
              ${isHost ? `
              <button class="friend-card-detailed-remove-btn delete-sch-btn" data-party-id="${sch.partyId}" title="Delete Schedule" style="padding:2px; width:22px; height:22px;">
                <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
              </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Wire clicks
    listEl.querySelectorAll('.start-sch-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const partyId = btn.dataset.partyId;
        // Verify if room document exists, if not, create it!
        try {
          const room = await getWatchPartyFromCloud(partyId);
          if (!room) {
            // Find the scheduled item details
            const schItem = scheduled.find(s => s.partyId === partyId);
            if (schItem) {
              await createWatchPartyInCloud(partyId, {
                partyId,
                hostId: user.uid,
                hostName: user.displayName || user.email.split('@')[0] || 'Host',
                hostAvatar: getInitialsAvatar(user.displayName, user.email, user.photoURL),
                title: schItem.title,
                posterPath: schItem.posterPath,
                type: schItem.mediaType,
                id: schItem.mediaId,
                season: schItem.season || null,
                episode: schItem.episode || null,
                privacy: schItem.privacy || 'Open',
                maxParticipants: schItem.maxParticipants || 10,
                status: 'paused',
                currentTime: 0,
                members: [],
                locked: false
              });
            }
          }
          navigate(`/watch-party/join/${partyId}`);
        } catch(e) {
          showToast('Failed to start party.');
        }
      });
    });

    listEl.querySelectorAll('.add-cal-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadCalendarFile(btn.dataset.title, btn.dataset.time, btn.dataset.id);
      });
    });

    listEl.querySelectorAll('.participants-sch-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const partyId = btn.dataset.partyId;
        const schItem = scheduled.find(s => s.partyId === partyId);
        if (schItem) {
          showParticipantsModal(schItem);
        }
      });
    });

    listEl.querySelectorAll('.delete-sch-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await showCustomConfirm('Cancel Party', 'Cancel this scheduled watch party?');
        if (confirmed) {
          try {
            await deleteScheduledPartyInCloud(btn.dataset.partyId);
            showToast('Scheduled party canceled.');
          } catch(e) {
            showToast('Failed to cancel scheduled party.');
          }
        }
      });
    });

    if (window.lucide) window.lucide.createIcons();
  });

  // Calendar .ics generator download
  function downloadCalendarFile(title, time, partyId) {
    const desc = `Join the watch party room: https://playeriq.suyogmahagaonkar.me/#/watch-party/join/${partyId}`;
    const startTimeStr = new Date(time).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const endTimeStr = new Date(new Date(time).getTime() + 2 * 3600000).toISOString().replace(/-|:|\.\d\d\d/g, "");
    
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:${title}
DESCRIPTION:${desc}
DTSTART:${startTimeStr}
DTEND:${endTimeStr}
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `party-${partyId}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function showParticipantsModal(sch) {
    const isHost = sch.hostId === user.uid;
    const modal = document.createElement('div');
    modal.className = 'piq-confirm-overlay'; 
    modal.style.zIndex = '2000';
    
    const maxGuests = sch.maxParticipants || 4;
    let autocompleteInst = null;
    
    function renderModalContent() {
      const currentGuestsCount = sch.invitees ? sch.invitees.length : 0;
      const totalCount = currentGuestsCount + 1; 
      const limitReached = totalCount >= maxGuests;
      const pct = Math.min(100, (totalCount / maxGuests) * 100);

      modal.innerHTML = `
        <div class="piq-confirm-card" style="max-width: 480px; width: 90%;">
          <button class="modal-close-btn" id="close-part-x-btn" style="position:absolute; top:20px; right:20px;">
            <i data-lucide="x"></i>
          </button>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h3 style="margin: 0; font-family: var(--font-display); font-size: 18px; font-weight: 800; color: #fff;">Invited Participants</h3>
            <span id="sch-part-count" style="font-size: 12px; color: ${limitReached ? '#ef4444' : 'var(--accent, #a855f7)'}; font-weight: 700; transition: color 0.3s;">
              ${totalCount} / ${maxGuests} Members ${limitReached ? '(Full)' : ''}
            </span>
          </div>

          <!-- Capacity gauge -->
          <div class="sch-progress-bar-wrap">
            <div class="sch-progress-bar-fill ${limitReached ? 'full' : ''}" style="width: ${pct}%;"></div>
          </div>

          <div style="max-height: 200px; overflow-y: auto; margin-bottom: 20px; display: flex; flex-direction: column; gap: 8px; padding-right: 4px;" id="sch-part-list">
            <!-- Host -->
            <div class="participant-item-card" style="animation-delay: 0.05s;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; box-shadow:0 0 10px rgba(168,85,247,0.3);">H</div>
                <div style="font-size: 13px; color: #fff; font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 200px;">${sch.hostName} (Host)</div>
              </div>
              <span style="font-size: 10px; color: var(--accent); font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Host</span>
            </div>
            
            <!-- Invitees with staggered delay animation -->
            ${sch.invitees && sch.invitees.length > 0 ? sch.invitees.map((email, idx) => `
              <div class="participant-item-card" style="animation-delay: ${(idx + 2) * 0.05}s;">
                <div style="font-size: 13px; color: var(--text-secondary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 240px; display:flex; align-items:center; gap:8px;" title="${email}">
                  <div style="width: 8px; height: 8px; border-radius: 50%; background: rgba(168,85,247,0.4);"></div>
                  <span>${email}</span>
                </div>
                ${isHost ? `
                  <button class="remind-participant-btn" data-email="${email}" style="background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.15); color: var(--accent); font-size: 10px; font-weight: 700; padding: 5px 10px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                    <i data-lucide="bell" style="width: 10px; height: 10px;"></i>
                    <span>Remind</span>
                  </button>
                ` : ''}
              </div>
            `).join('') : `<div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 24px 12px;">No invited participants yet.</div>`}
          </div>

          ${isHost ? `
            <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 16px;">
              <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 8px; letter-spacing:0.5px;">Invite New Member</label>
              <div style="display: flex; gap: 8px; position: relative;">
                <input type="email" id="new-part-email" class="party-chat-input" style="flex: 1; height: 36px; min-width: 0;" 
                  ${limitReached ? `disabled placeholder="Selected limit of ${maxGuests} reached"` : 'placeholder="friend@email.com"'} />
                <button id="add-part-btn" class="user-empty-btn" style="height: 36px; padding: 0 16px; margin:0;" ${limitReached ? 'disabled' : ''}>Add</button>
              </div>
              <div id="add-part-error" style="color: #ef4444; font-size: 11px; margin-top: 4px; display: none;"></div>
            </div>
          ` : ''}

          <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
            <button id="close-part-modal-btn" class="user-empty-btn" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: var(--text-secondary); height:36px; padding:0 20px; font-size:12px; margin:0;">Close</button>
          </div>
        </div>
      `;

      if (window.lucide) window.lucide.createIcons();

      const closeBtn = modal.querySelector('#close-part-modal-btn');
      const closeXBtn = modal.querySelector('#close-part-x-btn');
      const cleanupAndClose = () => {
        if (autocompleteInst) autocompleteInst.destroy();
        modal.remove();
      };
      closeBtn?.addEventListener('click', cleanupAndClose);
      closeXBtn?.addEventListener('click', cleanupAndClose);

      modal.querySelectorAll('.remind-participant-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const email = btn.dataset.email;
          btn.disabled = true;
          const originalText = btn.innerHTML;
          btn.innerHTML = '<span>Sending...</span>';
          try {
            await sendPartyInviteNotification(
              user.uid,
              sch.hostName,
              getInitialsAvatar(user.displayName, user.email, user.photoURL),
              email,
              sch.partyId,
              `${sch.title} (Reminder: Watch party starts soon!)`,
              sch.posterPath,
              sch.mediaType
            );

            const emailResponse = await fetch(`${NODE_PROXY}/api/email/send-invite`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                hostName: sch.hostName,
                inviteeEmail: email,
                title: `${sch.title} (Reminder: Watch party scheduled soon!)`,
                partyId: sch.partyId,
                mediaType: sch.mediaType,
                posterPath: sch.posterPath
              })
            });

            if (emailResponse.ok) {
              btn.innerHTML = '<i data-lucide="check" style="width:10px; height:10px;"></i><span>Sent!</span>';
              btn.className = 'remind-participant-btn sent';
              if (window.lucide) window.lucide.createIcons();
            } else {
              const resData = await emailResponse.json().catch(() => ({}));
              throw new Error(resData.details || resData.error || 'Failed to send email');
            }
          } catch (err) {
            console.error(err);
            showToast(`Reminder failed: ${err.message}`);
            btn.innerHTML = '<span>Failed</span>';
            btn.disabled = false;
            setTimeout(() => {
              btn.innerHTML = originalText;
            }, 2000);
          }
        });
      });

      if (isHost) {
        const addBtn = modal.querySelector('#add-part-btn');
        const emailInput = modal.querySelector('#new-part-email');
        const errorDiv = modal.querySelector('#add-part-error');

        const runAdd = async () => {
          const email = emailInput.value.trim().toLowerCase();
          if (!email) return;

          errorDiv.style.display = 'none';

          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            errorDiv.textContent = 'Please enter a valid email address.';
            errorDiv.style.display = 'block';
            emailInput.classList.add('piq-shake-error');
            setTimeout(() => emailInput.classList.remove('piq-shake-error'), 450);
            return;
          }

          if (email === user.email.toLowerCase()) {
            errorDiv.textContent = 'You cannot add yourself as a guest.';
            errorDiv.style.display = 'block';
            emailInput.classList.add('piq-shake-error');
            setTimeout(() => emailInput.classList.remove('piq-shake-error'), 450);
            return;
          }

          if (sch.invitees && sch.invitees.includes(email)) {
            errorDiv.textContent = 'This participant is already invited.';
            errorDiv.style.display = 'block';
            emailInput.classList.add('piq-shake-error');
            setTimeout(() => emailInput.classList.remove('piq-shake-error'), 450);
            return;
          }

          const currentCount = sch.invitees ? sch.invitees.length : 0;
          if (currentCount + 1 >= maxGuests) {
            errorDiv.textContent = `Selected limit of ${maxGuests} reached. Cannot add more participants.`;
            errorDiv.style.display = 'block';
            emailInput.classList.add('piq-shake-error');
            setTimeout(() => emailInput.classList.remove('piq-shake-error'), 450);
            return;
          }

          addBtn.disabled = true;
          addBtn.textContent = 'Adding...';

          try {
            const updatedInvitees = [...(sch.invitees || []), email];
            await updateScheduledPartyInviteesInCloud(sch.partyId, updatedInvitees);
            sch.invitees = updatedInvitees; 

            try {
              await sendPartyInviteNotification(
                user.uid,
                sch.hostName,
                getInitialsAvatar(user.displayName, user.email, user.photoURL),
                email,
                sch.partyId,
                `${sch.title} (Scheduled Watch Party)`,
                sch.posterPath,
                sch.mediaType
              );
            } catch (notifErr) {
              console.warn('Failed to send real-time notification to', email, notifErr);
            }

            try {
              const res = await fetch(`${NODE_PROXY}/api/email/send-invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  hostName: sch.hostName,
                  inviteeEmail: email,
                  title: `${sch.title} (Scheduled Watch Party)`,
                  partyId: sch.partyId,
                  mediaType: sch.mediaType,
                  posterPath: sch.posterPath
                })
              });
              if (!res.ok) {
                const resData = await res.json().catch(() => ({}));
                throw new Error(resData.details || resData.error || 'Failed to send invite email.');
              }
            } catch (emailErr) {
              console.warn('Failed to send email invite to', email, emailErr);
              showToast(`Warning: Email invite failed (${emailErr.message}).`);
            }

            if (autocompleteInst) {
              autocompleteInst.destroy();
              autocompleteInst = null;
            }
            renderModalContent();
          } catch (err) {
            console.error(err);
            errorDiv.textContent = 'Failed to add participant.';
            errorDiv.style.display = 'block';
            addBtn.disabled = false;
            addBtn.textContent = 'Add';
          }
        };

        addBtn.addEventListener('click', runAdd);
        emailInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            runAdd();
          }
        });

        autocompleteInst = initFriendAutocomplete(emailInput, () => currentFriendsList.filter(f => !f.isPending), false);
      }
    }

    renderModalContent();
    document.body.appendChild(modal);
  }

  // 4. Fetch History Logs
  const renderHistoryTab = async () => {
    const containerEl = container.querySelector('#history-logs-container');
    if (!containerEl) return;
    containerEl.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:20px 0;">Loading history...</div>';
    
    try {
      const logs = await fetchPartyHistoryFromCloud(user.uid);
      const clearAllBtn = container.querySelector('#clear-all-history-btn');
      if (logs.length === 0) {
        if (clearAllBtn) clearAllBtn.style.display = 'none';
        containerEl.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:20px 0; text-align:center; grid-column:1/-1;">No watch party logs recorded.</div>';
        return;
      }

      if (clearAllBtn) clearAllBtn.style.display = 'inline-flex';

      containerEl.innerHTML = logs.map(log => {
        const dateStr = log.date ? new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date';
        const posterUrl = log.posterPath 
          ? (log.posterPath.startsWith('/') ? `https://image.tmdb.org/t/p/w154${log.posterPath}` : log.posterPath)
          : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150" fill="%23222"><rect width="100" height="150"/></svg>';
        
        const participants = Array.isArray(log.participants) ? log.participants.join(', ') : 'None';
        const messagesCount = Array.isArray(log.messages) ? log.messages.length : 0;

        return `
          <div class="history-card" data-log-id="${log.id}">
            <button class="history-delete-btn" data-log-id="${log.id}" title="Delete watch party from history">
              <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
            </button>
            <img class="history-poster" src="${posterUrl}" alt="" />
            <div class="history-info">
              <div>
                <div class="history-title">${log.title}</div>
                <div class="history-date">${dateStr}</div>
                <div class="history-participants" title="${participants}">Members: ${participants}</div>
              </div>
              <div class="history-actions-row">
                <button class="history-replay-btn replay-chats-trigger" data-log-id="${log.id}">
                  <i data-lucide="play-circle"></i> Replay Chat (${messagesCount})
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Wire replay triggers
      containerEl.querySelectorAll('.replay-chats-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const logId = btn.dataset.logId;
          const matchedLog = logs.find(l => l.id === logId);
          if (matchedLog) showChatReplayModal(matchedLog);
        });
      });

      // Wire individual delete triggers
      containerEl.querySelectorAll('.history-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const logId = btn.dataset.logId;
          const confirmed = await showCustomConfirm('Delete History', 'Delete this watch party from history?');
          if (confirmed) {
            try {
              await removePartyHistoryItemFromCloud(user.uid, logId);
              showToast('History entry deleted.');
              renderHistoryTab();
            } catch (err) {
              showToast('Failed to delete history entry.');
            }
          }
        });
      });

      if (window.lucide) window.lucide.createIcons();
    } catch(err) {
      containerEl.innerHTML = '<div style="color:#ef4444; font-size:12px; padding:20px 0;">Failed to load history logs.</div>';
    }
  };

  // Wire history tab clicks to fetch dynamically
  container.querySelector('.dashboard-tab-btn[data-tab="tab-history"]').addEventListener('click', renderHistoryTab);

  // Wire clear all history button
  const clearAllBtn = container.querySelector('#clear-all-history-btn');
  clearAllBtn?.addEventListener('click', async () => {
    const confirmed = await showCustomConfirm('Clear History', 'Are you sure you want to clear your entire watch party history? This cannot be undone.');
    if (confirmed) {
      try {
        await clearAllPartyHistoryFromCloud(user.uid);
        showToast('Watch party history cleared.');
        renderHistoryTab();
      } catch (e) {
        showToast('Failed to clear history.');
      }
    }
  });

  // ---- Modals Implementation ----

  // 1. Replay Chat Modal (Cinematic Replay)
  function showChatReplayModal(log) {
    const overlay = document.createElement('div');
    overlay.className = 'replay-modal-overlay';
    
    const posterUrl = log.posterPath 
      ? (log.posterPath.startsWith('/') ? `https://image.tmdb.org/t/p/w780${log.posterPath}` : log.posterPath)
      : '';

    overlay.innerHTML = `
      <!-- Left side: Simulated Screen -->
      <div class="replay-left-pane">
        ${posterUrl ? `<img class="replay-poster-blur" src="${posterUrl}" alt="" />` : ''}
        <div class="replay-cinematic-screen">
          ${posterUrl ? `<img src="${posterUrl}" alt="" />` : '<div style="width:300px; height:450px; background:#141419; border-radius:12px; border:1px solid rgba(255,255,255,0.08);"></div>'}
          <div class="replay-cinematic-title">${log.title}</div>
          <div style="font-size:13px; color:var(--text-muted); margin-top:8px;">Reliving watch party chat highlights & reaction spikes</div>
        </div>

        <!-- Controls HUD -->
        <div class="replay-controls-hud">
          <button class="replay-play-btn" id="replay-play-toggle" title="Play Replay">
            <i data-lucide="play" style="width:16px;height:16px;fill:currentColor;"></i>
          </button>
          <div class="replay-timeline-track">
            <div class="replay-timeline-fill" id="replay-timeline-fill"></div>
          </div>
          <div class="replay-time-tag" id="replay-time-tag">00:00</div>
        </div>
      </div>

      <!-- Right side: Chat Log stream -->
      <div class="replay-right-pane">
        <div class="replay-chat-header">
          <h3>Memory Lane Chat</h3>
          <button class="modal-close-btn" id="replay-close-btn" style="position:static; width:28px; height:28px;">
            <i data-lucide="x" style="width:14px;height:14px;"></i>
          </button>
        </div>
        <div class="replay-chat-body" id="replay-chat-body">
          <div style="color:var(--text-dim); text-align:center; font-size:11px; padding:20px 0;">Click Play to start replaying the chat session.</div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();

    // Floating reaction emoji simulator
    function spawnReplayFloatingEmoji(emoji) {
      const leftPane = overlay.querySelector('.replay-left-pane');
      if (!leftPane) return;
      const floating = document.createElement('div');
      floating.className = 'floating-emoji';
      floating.textContent = emoji;
      floating.style.left = `${20 + Math.random() * 60}%`; // center areas
      leftPane.appendChild(floating);
      setTimeout(() => floating.remove(), 2500);
    }

    const closeBtn = overlay.querySelector('#replay-close-btn');
    const playToggle = overlay.querySelector('#replay-play-toggle');
    const timelineFill = overlay.querySelector('#replay-timeline-fill');
    const timeTag = overlay.querySelector('#replay-time-tag');
    const chatBody = overlay.querySelector('#replay-chat-body');

    let isPlaying = false;
    let elapsedMs = 0;
    let timerInterval = null;
    const sortedMessages = [...(log.messages || [])];
    
    // Sort messages chronologically by timestamp
    sortedMessages.sort((a, b) => {
      const ta = a.timestamp?.seconds ?? 0;
      const tb = b.timestamp?.seconds ?? 0;
      return ta - tb;
    });

    // Compute original relative times in milliseconds
    const firstMsgTime = sortedMessages[0]?.timestamp?.seconds ?? 0;
    const msgOffsets = sortedMessages.map(m => {
      const t = m.timestamp?.seconds ?? 0;
      return {
        ...m,
        offsetMs: (t - firstMsgTime) * 1000 // difference relative to start
      };
    });

    const maxDurationMs = msgOffsets.length > 0 ? (msgOffsets[msgOffsets.length - 1].offsetMs + 5000) : 60000; // default 1 minute

    const renderedMsgIds = new Set();

    const formatReplayTime = (ms) => {
      const sec = Math.floor(ms / 1000) % 60;
      const min = Math.floor(ms / 60000);
      return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };

    const updateTimeline = () => {
      const pct = Math.min((elapsedMs / maxDurationMs) * 100, 100);
      timelineFill.style.width = `${pct}%`;
      timeTag.textContent = formatReplayTime(elapsedMs);

      // Render messages whose offset has passed
      let added = false;
      msgOffsets.forEach(msg => {
        if (msg.offsetMs <= elapsedMs && !renderedMsgIds.has(msg.id)) {
          renderedMsgIds.add(msg.id);
          appendReplayChatMessage(msg);
          added = true;

          // Spawn emoji reactions dynamically
          if (msg.type === 'reaction' && msg.reactionEmoji) {
            spawnReplayFloatingEmoji(msg.reactionEmoji);
          }
        }
      });

      if (added) {
        chatBody.scrollTop = chatBody.scrollHeight;
      }

      if (elapsedMs >= maxDurationMs) {
        pauseReplay();
      }
    };

    const appendReplayChatMessage = (m) => {
      if (renderedMsgIds.size === 1 && chatBody.firstElementChild?.textContent?.includes('Click Play')) {
        chatBody.innerHTML = '';
      }

      if (m.type === 'reaction') {
        chatBody.innerHTML += `
          <div class="chat-message system" style="margin-bottom:6px;">
            <span class="chat-sender">${m.senderName}</span>
            <span class="chat-text">reacted with ${m.reactionEmoji}</span>
          </div>
        `;
        return;
      }

      const posterPath = m.gifUrl;
      if (m.type === 'gif' && posterPath) {
        chatBody.innerHTML += `
          <div class="chat-message" style="margin-bottom:8px;">
            <img class="chat-msg-avatar" src="${m.senderAvatar}" alt="" />
            <div class="chat-msg-body">
              <div class="chat-msg-sender-name">${m.senderName}</div>
              <div class="chat-msg-text gif" style="padding:4px; background:transparent; border:none; display:block;">
                <img src="${posterPath}" alt="GIF" style="border-radius:8px; max-width:140px; display:block;" />
              </div>
            </div>
          </div>
        `;
        return;
      }

      chatBody.innerHTML += `
        <div class="chat-message" style="margin-bottom:8px;">
          <img class="chat-msg-avatar" src="${m.senderAvatar}" alt="" />
          <div class="chat-msg-body">
            <div class="chat-msg-sender-name">${m.senderName}</div>
            <div class="chat-msg-text">${m.text || ''}</div>
          </div>
        </div>
      `;
    };

    const startReplay = () => {
      isPlaying = true;
      playToggle.innerHTML = `<i data-lucide="pause" style="width:16px;height:16px;fill:currentColor;"></i>`;
      if (window.lucide) window.lucide.createIcons();

      timerInterval = setInterval(() => {
        elapsedMs += 400; // speed up simulation (replays 400ms per 100ms real time, 4x speed)
        updateTimeline();
      }, 100);
    };

    const pauseReplay = () => {
      isPlaying = false;
      playToggle.innerHTML = `<i data-lucide="play" style="width:16px;height:16px;fill:currentColor;"></i>`;
      if (window.lucide) window.lucide.createIcons();

      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    };

    playToggle.addEventListener('click', () => {
      if (isPlaying) pauseReplay();
      else startReplay();
    });

    closeBtn.addEventListener('click', () => {
      pauseReplay();
      overlay.remove();
    });
  }

  // 2. Schedule Watch Party Modal
  const scheduleTrigger = container.querySelector('#schedule-party-trigger');
  scheduleTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    showScheduleModal();
  });

  function showScheduleModal() {
    modalOverlay.classList.remove('hidden');

    const defaultRoomName = `Room no. ${getNextRoomNumber()}`;

    // Build next 8 days for the date strip
    const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dayChips = [];
    const today = new Date();
    for (let i = 0; i < 8; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dayChips.push({
        label: i === 0 ? 'Today' : DAY_NAMES[d.getDay()],
        date: d.getDate(),
        month: MONTH_NAMES[d.getMonth()],
        fullDate: d.toISOString().split('T')[0]
      });
    }
    const todayStr = today.toISOString().split('T')[0];

    modalOverlay.innerHTML = `
      <div class="modal-wrapper piq-modal-bg">
        <!-- Protruding Document Tab: Room Name -->
        <div class="piq-modal-tab">
          <input type="text" id="sch-party-name" class="piq-tab-input" value="${defaultRoomName}" required autocomplete="off" />
          <i data-lucide="edit-3" style="width: 12px; height: 12px; color: var(--text-muted);"></i>
        </div>

        <!-- Right: Form Panel (Actually the main two-column grid) -->
        <div class="piq-form-panel">
          <button class="piq-close-btn" id="modal-close-btn"><i data-lucide="x"></i></button>

          <div class="piq-modal-header">
            <div class="piq-modal-header-icon"><i data-lucide="calendar"></i></div>
            <div>
              <h2 class="piq-modal-title">Plan Your Screening</h2>
              <p class="piq-modal-subtitle">Schedule a future watch party with friends</p>
            </div>
          </div>

          <form id="schedule-party-form" novalidate>
            <div class="piq-modal-two-col">
              <!-- Left Column: Search & Preview -->
              <div class="piq-modal-left-col">
                <!-- Content Search -->
                <div class="piq-field" style="position:relative; margin-bottom:0;">
                  <div class="piq-floating-label">
                    <input type="text" id="sch-media-search" class="piq-input" placeholder=" " autocomplete="off" />
                    <label for="sch-media-search">Search Movie or TV Show</label>
                    <i data-lucide="search" class="piq-input-icon" id="sch-search-icon"></i>
                  </div>
                  <div id="sch-search-dropdown" class="piq-search-dropdown hidden"></div>
                </div>

                <!-- TV Selectors -->
                <div id="sch-tv-selectors" class="piq-tv-selectors">
                  <div style="flex:1;"><select id="sch-tv-season" class="piq-select"></select></div>
                  <div style="flex:1;"><select id="sch-tv-episode" class="piq-select"></select></div>
                </div>

                <!-- Media Preview Card -->
                <div class="piq-media-preview-card" id="sch-preview-card">
                  <div id="sch-preview-placeholder" class="piq-preview-placeholder">
                    <i data-lucide="film" class="piq-preview-ph-icon"></i>
                    <div class="piq-preview-ph-title">No Media Selected</div>
                    <div class="piq-preview-ph-text">Search and select a movie or show to preview details.</div>
                  </div>
                  <div id="sch-preview-content" style="display:none; flex-direction:column; gap:12px; height:100%;">
                    <div class="piq-preview-poster-wrap">
                      <img id="drawer-poster" class="piq-preview-poster" src="" alt="" style="display:none;" />
                      <div id="drawer-poster-ph" style="width:110px;height:165px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;">
                        <i data-lucide="film" style="width:28px;height:28px;color:rgba(168,85,247,0.3);"></i>
                      </div>
                    </div>
                    <div class="piq-preview-meta">
                      <div class="piq-drawer-title" id="drawer-media-title">Select a title</div>
                      <div class="piq-drawer-badges">
                        <span class="piq-drawer-badge" id="drawer-media-type">—</span>
                        <span class="piq-drawer-badge" id="drawer-media-release">—</span>
                      </div>
                      <div class="piq-drawer-rating">
                        <i data-lucide="star" style="width:12px;height:12px;fill:#fbbf24;color:#fbbf24;"></i>
                        <span id="drawer-media-rating">—</span>
                      </div>
                      <div class="piq-drawer-overview" id="drawer-media-overview" style="margin-top:4px;"></div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Right Column: Settings -->
              <div class="piq-modal-right-col">
                <!-- Date Strip -->
                <div class="piq-section-label" style="margin-top:0;">
                  <i data-lucide="calendar-days" style="width:13px;height:13px;"></i> Pick a Date
                </div>
                <div id="sch-day-strip" class="piq-day-strip">
                  ${dayChips.map((chip, i) => `
                    <div class="piq-day-chip ${i === 0 ? 'active' : ''}" data-date="${chip.fullDate}" role="button" tabindex="0">
                      <span class="piq-day-chip-name">${chip.label}</span>
                      <span class="piq-day-chip-num">${chip.date}</span>
                      <span class="piq-day-chip-month">${chip.month}</span>
                    </div>
                  `).join('')}
                </div>

                <!-- Suggested Times -->
                <div class="piq-section-label" style="margin-top:14px;">
                  <i data-lucide="zap" style="width:13px;height:13px;color:#f59e0b;"></i> Suggested Times
                </div>
                <div id="sch-suggested-pills" class="piq-suggested-pills"></div>

                <!-- Time Grid -->
                <div class="piq-section-label" style="margin-top:14px;">
                  <i data-lucide="clock" style="width:13px;height:13px;"></i> Select Time
                </div>
                <div id="sch-time-grid" class="piq-time-grid"></div>
                <input type="hidden" id="sch-time" value="" />
                <input type="hidden" id="sch-date" value="${todayStr}" />

                <!-- Invite Friends -->
                <div class="piq-section-label" style="margin-top:14px;">
                  <i data-lucide="user-plus" style="width:13px;height:13px;"></i> Invite Friends
                </div>
                <div class="piq-invite-input-wrap">
                  <div class="piq-floating-label">
                    <input type="email" id="sch-invitee-input" class="piq-input" placeholder=" " autocomplete="off" />
                    <label for="sch-invitee-input">Email address</label>
                    <i data-lucide="at-sign" class="piq-input-icon"></i>
                  </div>
                  <button type="button" id="sch-add-invitee-btn" class="piq-add-btn">Add</button>
                </div>
                <div id="sch-invitee-pills" class="piq-invitee-pills"></div>

                <!-- Privacy & Stepper side-by-side row -->
                <div class="piq-bottom-controls-row">
                  <div style="flex:1.4;">
                    <!-- Privacy -->
                    <div class="piq-section-label" style="margin-top:0;">
                      <i data-lucide="shield" style="width:13px;height:13px;"></i> Privacy
                    </div>
                    <div class="piq-privacy-group">
                      <label class="piq-privacy-card active">
                        <input type="radio" name="sch-privacy" value="Open" checked style="display:none;" />
                        <i data-lucide="globe"></i>
                        <span class="piq-privacy-title">Open</span>
                      </label>
                      <label class="piq-privacy-card">
                        <input type="radio" name="sch-privacy" value="Friends-only" style="display:none;" />
                        <i data-lucide="users"></i>
                        <span class="piq-privacy-title">Friends</span>
                      </label>
                      <label class="piq-privacy-card">
                        <input type="radio" name="sch-privacy" value="Closed" style="display:none;" />
                        <i data-lucide="lock"></i>
                        <span class="piq-privacy-title">Private</span>
                      </label>
                    </div>
                  </div>

                  <div style="flex:1;">
                    <!-- Guest Stepper -->
                    <div class="piq-section-label" style="margin-top:0;">
                      <i data-lucide="users" style="width:13px;height:13px;"></i> Max Guests
                    </div>
                    <div class="piq-guest-stepper">
                      <button type="button" id="sch-guest-minus" class="piq-stepper-btn" aria-label="Decrease"><i data-lucide="minus"></i></button>
                      <div class="piq-stepper-count">
                        <span class="piq-stepper-num" id="sch-guest-count">4</span>
                        <span class="piq-stepper-label">max</span>
                      </div>
                      <button type="button" id="sch-guest-plus" class="piq-stepper-btn" aria-label="Increase"><i data-lucide="plus"></i></button>
                    </div>
                    <input type="hidden" id="sch-max" value="4" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Validation Error -->
            <div id="sch-validation-error" class="piq-validation-error"></div>

            <!-- CTA -->
            <button type="submit" class="piq-hero-btn" id="sch-submit-btn">
              <i data-lucide="calendar-plus"></i>
              Schedule Watch Party
            </button>
          </form>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // ---- Element refs ----
    const closeBtn = modalOverlay.querySelector('#modal-close-btn');
    const inviteeInput = modalOverlay.querySelector('#sch-invitee-input');
    const addInviteeBtn = modalOverlay.querySelector('#sch-add-invitee-btn');
    const inviteePillsContainer = modalOverlay.querySelector('#sch-invitee-pills');
    const timeGrid = modalOverlay.querySelector('#sch-time-grid');
    const suggestedPillsContainer = modalOverlay.querySelector('#sch-suggested-pills');
    const hiddenTime = modalOverlay.querySelector('#sch-time');
    const hiddenDate = modalOverlay.querySelector('#sch-date');
    const dayStrip = modalOverlay.querySelector('#sch-day-strip');
    const privacyCards = modalOverlay.querySelectorAll('.piq-privacy-card');
    const guestCountEl = modalOverlay.querySelector('#sch-guest-count');
    const guestMinusBtn = modalOverlay.querySelector('#sch-guest-minus');
    const guestPlusBtn = modalOverlay.querySelector('#sch-guest-plus');
    const guestMaxInput = modalOverlay.querySelector('#sch-max');
    const validationError = modalOverlay.querySelector('#sch-validation-error');
    const submitBtn = modalOverlay.querySelector('#sch-submit-btn');
    const searchInput = modalOverlay.querySelector('#sch-media-search');
    const dropdown = modalOverlay.querySelector('#sch-search-dropdown');
    const tvSelectors = modalOverlay.querySelector('#sch-tv-selectors');
    const seasonSelect = modalOverlay.querySelector('#sch-tv-season');
    const episodeSelect = modalOverlay.querySelector('#sch-tv-episode');
    const searchIcon = modalOverlay.querySelector('#sch-search-icon');
    const drawer = modalOverlay.querySelector('#sch-preview-card');
    const drawerPoster = drawer.querySelector('#drawer-poster');
    const drawerPh = drawer.querySelector('#drawer-poster-ph');

    // ---- Invitees ----
    const inviteesList = [];

    function renderInviteePills() {
      inviteePillsContainer.innerHTML = inviteesList.map((email, idx) => {
        const initials = email.substring(0, 2).toUpperCase();
        return `
          <div class="piq-invite-pill">
            <span class="piq-invite-pill-avatar">${initials}</span>
            <span class="piq-invite-pill-text">${email}</span>
            <button type="button" class="piq-invite-pill-remove" data-index="${idx}" aria-label="Remove">
              <i data-lucide="x"></i>
            </button>
          </div>`;
      }).join('');
      if (window.lucide) window.lucide.createIcons();
      inviteePillsContainer.querySelectorAll('.piq-invite-pill-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.index);
          const pill = btn.closest('.piq-invite-pill');
          pill.style.transition = 'all 0.15s';
          pill.style.transform = 'scale(0)';
          pill.style.opacity = '0';
          setTimeout(() => { inviteesList.splice(idx, 1); renderInviteePills(); }, 150);
        });
      });
    }

    const addInvitee = () => {
      const email = inviteeInput.value.trim().toLowerCase();
      if (!email) return;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Please enter a valid email address.'); return; }
      if (inviteesList.includes(email)) { showToast('This email has already been added.'); return; }
      inviteesList.push(email);
      inviteeInput.value = '';
      renderInviteePills();
    };
    addInviteeBtn.addEventListener('click', (e) => { e.preventDefault(); addInvitee(); });
    inviteeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addInvitee(); } });

    // ---- Privacy ----
    function updatePrivacyCards() {
      privacyCards.forEach(c => c.classList.toggle('active', c.querySelector('input').checked));
    }
    privacyCards.forEach(card => {
      card.addEventListener('click', () => { card.querySelector('input').checked = true; updatePrivacyCards(); });
    });
    updatePrivacyCards();

    // ---- Guest Stepper ----
    let guestCount = 4;
    const GUEST_MIN = 2, GUEST_MAX = 10;
    function updateStepper() {
      guestCountEl.textContent = guestCount;
      guestMaxInput.value = guestCount;
      guestMinusBtn.disabled = guestCount <= GUEST_MIN;
      guestPlusBtn.disabled = guestCount >= GUEST_MAX;
      guestCountEl.style.transition = 'none';
      guestCountEl.style.transform = 'scale(1.3)';
      requestAnimationFrame(() => {
        guestCountEl.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)';
        guestCountEl.style.transform = 'scale(1)';
      });
    }
    guestMinusBtn.addEventListener('click', () => { if (guestCount > GUEST_MIN) { guestCount--; updateStepper(); } });
    guestPlusBtn.addEventListener('click', () => { if (guestCount < GUEST_MAX) { guestCount++; updateStepper(); } });
    updateStepper();

    // ---- Time logic ----
    let selectedDateStr = todayStr;

    function buildTimeSlots(dateStr) {
      const now = new Date();
      const todayDateStr = now.toISOString().split('T')[0];
      const isToday = dateStr === todayDateStr;
      const slots = [];
      for (let h = 0; h < 24; h++) {
        for (const m of [0, 30]) {
          if (isToday) {
            if (h < now.getHours()) continue;
            if (h === now.getHours() && m <= now.getMinutes()) continue;
          }
          const ampm = h >= 12 ? 'PM' : 'AM';
          const displayHr = h % 12 === 0 ? 12 : h % 12;
          const minStr = m === 0 ? '00' : '30';
          slots.push({ value: `${String(h).padStart(2,'0')}:${minStr}`, label: `${displayHr}:${minStr} ${ampm}` });
        }
      }
      return slots;
    }

    function renderTimeSection(dateStr) {
      const slots = buildTimeSlots(dateStr);
      if (slots.length === 0) {
        timeGrid.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:6px 0;">No future times for today — select another day.</div>';
        suggestedPillsContainer.innerHTML = '';
        hiddenTime.value = '';
        return;
      }

      const suggestions = slots.slice(0, 4);
      suggestedPillsContainer.innerHTML = suggestions.map(s => `
        <button type="button" class="piq-suggested-pill" data-value="${s.value}">
          <i data-lucide="zap" style="width:11px;height:11px;color:#f59e0b;"></i> ${s.label}
        </button>`).join('');

      const selectedVal = (hiddenTime.value && slots.some(t => t.value === hiddenTime.value)) ? hiddenTime.value : slots[0].value;
      hiddenTime.value = selectedVal;

      timeGrid.innerHTML = slots.map(t => `
        <div class="piq-time-chip ${t.value === selectedVal ? 'active' : ''}" data-value="${t.value}" role="button" tabindex="0">${t.label}</div>
      `).join('');

      if (window.lucide) window.lucide.createIcons();

      // Wire time chips
      timeGrid.querySelectorAll('.piq-time-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          timeGrid.querySelectorAll('.piq-time-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          hiddenTime.value = chip.dataset.value;
          suggestedPillsContainer.querySelectorAll('.piq-suggested-pill').forEach(p => p.classList.toggle('selected', p.dataset.value === chip.dataset.value));
        });
      });

      // Wire suggested pills
      suggestedPillsContainer.querySelectorAll('.piq-suggested-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          const val = pill.dataset.value;
          hiddenTime.value = val;
          timeGrid.querySelectorAll('.piq-time-chip').forEach(c => {
            c.classList.toggle('active', c.dataset.value === val);
            if (c.dataset.value === val) c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
          suggestedPillsContainer.querySelectorAll('.piq-suggested-pill').forEach(p => p.classList.remove('selected'));
          pill.classList.add('selected');
          pill.style.transform = 'scale(0.92)';
          setTimeout(() => { pill.style.transform = ''; }, 150);
        });
      });
    }

    // Wire day chips
    dayStrip.querySelectorAll('.piq-day-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        dayStrip.querySelectorAll('.piq-day-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedDateStr = chip.dataset.date;
        hiddenDate.value = selectedDateStr;
        hiddenTime.value = '';
        renderTimeSection(selectedDateStr);
      });
    });
    renderTimeSection(todayStr);

    // ---- Media Search ----
    let selectedMedia = null;
    let searchDebounce = null;

    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      const query = searchInput.value.trim();
      if (!query) { dropdown.classList.add('hidden'); return; }
      if (searchIcon) { searchIcon.setAttribute('data-lucide', 'loader'); searchIcon.classList.add('spinning'); if (window.lucide) window.lucide.createIcons(); }
      searchDebounce = setTimeout(async () => {
        try {
          const data = await searchMovieBox(query);
          const results = data.results.slice(0, 6);
          if (searchIcon) { searchIcon.setAttribute('data-lucide', 'search'); searchIcon.classList.remove('spinning'); if (window.lucide) window.lucide.createIcons(); }
          if (results.length === 0) {
            dropdown.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:12px;text-align:center;">No matches found</div>';
            dropdown.classList.remove('hidden'); return;
          }
          dropdown.innerHTML = results.map(item => {
            const title = item.title || item.name || 'Unknown';
            const year = (item.releaseDate || item.year || '').slice(0, 4);
            const type = item.subjectType === 2 ? 'TV' : 'Movie';
            const poster = item.cover?.url || item.poster_path || '';
            return `
              <div class="piq-search-result sch-media-option" data-id="${item.id}" data-type="${type}" data-title="${title}" data-poster="${poster}">
                ${poster ? `<img class="piq-search-result-poster" src="${poster}" alt="" />` : `<div class="piq-search-result-poster" style="background:rgba(168,85,247,0.08);display:flex;align-items:center;justify-content:center;"><i data-lucide="film" style="width:14px;height:14px;color:rgba(168,85,247,0.4);"></i></div>`}
                <div class="piq-search-result-info">
                  <div class="piq-search-result-title">${title}</div>
                  <div class="piq-search-result-meta">${year}</div>
                </div>
                <span class="piq-search-result-badge ${type === 'TV' ? 'piq-badge-tv' : 'piq-badge-movie'}">${type}</span>
              </div>`;
          }).join('');
          dropdown.classList.remove('hidden');
          if (window.lucide) window.lucide.createIcons();

          dropdown.querySelectorAll('.sch-media-option').forEach(opt => {
            opt.addEventListener('click', async () => {
              selectedMedia = { id: opt.dataset.id, type: opt.dataset.type === 'TV' ? 'tv' : 'movie', title: opt.dataset.title, posterPath: opt.dataset.poster };
              searchInput.value = selectedMedia.title;
              dropdown.classList.add('hidden');

              const ph = drawer.querySelector('#sch-preview-placeholder');
              const content = drawer.querySelector('#sch-preview-content');
              if (ph) ph.style.display = 'none';
              if (content) content.style.display = 'flex';

              // Show drawer
              drawer.classList.add('show');
              drawer.querySelector('#drawer-media-title').textContent = selectedMedia.title;
              drawer.querySelector('#drawer-media-type').textContent = selectedMedia.type === 'tv' ? 'TV Show' : 'Movie';
              drawer.querySelector('#drawer-media-overview').textContent = 'Loading...';
              if (selectedMedia.posterPath) { drawerPoster.src = selectedMedia.posterPath; drawerPoster.style.display = 'block'; if (drawerPh) drawerPh.style.display = 'none'; }

              try {
                const details = selectedMedia.type === 'tv' ? await getTVDetails(selectedMedia.id) : await getMovieDetails(selectedMedia.id);
                if (details) {
                  const posterUrl = details.poster_path ? `https://image.tmdb.org/t/p/w342${details.poster_path}` : selectedMedia.posterPath;
                  if (posterUrl) { drawerPoster.src = posterUrl; drawerPoster.style.display = 'block'; if (drawerPh) drawerPh.style.display = 'none'; }
                  drawer.querySelector('#drawer-media-rating').textContent = details.vote_average ? details.vote_average.toFixed(1) : '—';
                  drawer.querySelector('#drawer-media-release').textContent = (details.release_date || details.first_air_date || '—').slice(0, 4);
                  drawer.querySelector('#drawer-media-overview').textContent = details.overview || 'No overview available.';
                }
              } catch(err) { drawer.querySelector('#drawer-media-overview').textContent = 'Summary unavailable.'; }

              if (selectedMedia.type === 'tv') {
                tvSelectors.style.display = 'flex';
                seasonSelect.innerHTML = '<option>Loading...</option>';
                try {
                  const tvId = selectedMedia.id.startsWith('mb_') ? selectedMedia.id : `mb_${selectedMedia.id}`;
                  const details = await getTVDetails(tvId);
                  if (details && details.seasons) {
                    seasonSelect.innerHTML = details.seasons.map(s => `<option value="${s.season_number}">${s.name}</option>`).join('');
                    loadScheduleEpisodes(tvId, seasonSelect.value);
                  }
                } catch(e) { seasonSelect.innerHTML = '<option value="1">Season 1</option>'; episodeSelect.innerHTML = '<option value="1">Episode 1</option>'; }
              } else {
                tvSelectors.style.display = 'none';
              }
            });
          });
        } catch(e) {
          console.error(e);
          if (searchIcon) { searchIcon.setAttribute('data-lucide', 'search'); searchIcon.classList.remove('spinning'); if (window.lucide) window.lucide.createIcons(); }
        }
      }, 300);
    });

    // Close dropdown on outside click
    const hideSchDropdown = (e) => { if (!dropdown.contains(e.target) && !searchInput.contains(e.target)) { dropdown.classList.add('hidden'); document.removeEventListener('click', hideSchDropdown); } };
    document.addEventListener('click', hideSchDropdown);

    seasonSelect.addEventListener('change', () => {
      const tvId = selectedMedia.id.startsWith('mb_') ? selectedMedia.id : `mb_${selectedMedia.id}`;
      loadScheduleEpisodes(tvId, seasonSelect.value);
    });

    async function loadScheduleEpisodes(tvId, seasonNum) {
      episodeSelect.innerHTML = '<option>Loading...</option>';
      try {
        const { getSeasonDetails } = await import('../services/api.js');
        const seasonDetails = await getSeasonDetails(tvId, seasonNum, selectedMedia.title);
        if (seasonDetails && seasonDetails.episodes) {
          episodeSelect.innerHTML = seasonDetails.episodes.map(ep => `<option value="${ep.episode_number}">Episode ${ep.episode_number}</option>`).join('');
        } else { episodeSelect.innerHTML = '<option value="1">Episode 1</option>'; }
      } catch(e) { episodeSelect.innerHTML = '<option value="1">Episode 1</option>'; }
    }

    // ---- Autocomplete ----
    if (inviteesAutocomplete) inviteesAutocomplete.destroy();
    if (inviteeInput) {
      inviteesAutocomplete = initFriendAutocomplete(inviteeInput, () => currentFriendsList.filter(f => !f.isPending), false);
    }

    // ---- Close ----
    const closeModal = () => {
      modalOverlay.classList.add('hidden');
      if (inviteesAutocomplete) { inviteesAutocomplete.destroy(); inviteesAutocomplete = null; }
    };
    closeBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

    // ---- Form Submit ----
    const form = modalOverlay.querySelector('#schedule-party-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      validationError.style.display = 'none';

      const nameInput = modalOverlay.querySelector('#sch-party-name');
      const name = nameInput.value.trim();
      if (!name) {
        validationError.textContent = 'Please enter a Room Name.';
        validationError.style.display = 'block';
        nameInput.classList.add('piq-shake-error');
        setTimeout(() => nameInput.classList.remove('piq-shake-error'), 450);
        nameInput.focus();
        return;
      }

      if (!selectedMedia) {
        validationError.textContent = 'Please search and select a movie or show first.';
        validationError.style.display = 'block';
        return;
      }

      const timeVal = hiddenTime.value;
      const dateVal = hiddenDate.value;
      if (!timeVal) {
        validationError.textContent = 'Please select a time for the party.';
        validationError.style.display = 'block';
        return;
      }

      const selectedDate = new Date(`${dateVal}T${timeVal}`);
      if (selectedDate <= new Date()) {
        validationError.textContent = 'Selected time must be in the future.';
        validationError.style.display = 'block';
        return;
      }

      const partyId = `party_${Math.random().toString(36).substring(2, 11)}`;
      const privacy = modalOverlay.querySelector('input[name="sch-privacy"]:checked').value;
      const maxVal = parseInt(guestMaxInput.value);
      const invitees = [...inviteesList];

      const scheduledData = {
        partyId,
        hostId: user.uid,
        hostName: user.displayName || user.email.split('@')[0] || 'Host',
        title: name,
        mediaTitle: selectedMedia.title,
        mediaId: selectedMedia.id,
        mediaType: selectedMedia.type,
        posterPath: selectedMedia.posterPath,
        season: selectedMedia.type === 'tv' ? parseInt(seasonSelect.value) : null,
        episode: selectedMedia.type === 'tv' ? parseInt(episodeSelect.value) : null,
        scheduledTime: selectedDate.toISOString(),
        invitees,
        privacy,
        maxParticipants: maxVal
      };

      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader" class="btn-spinner" style="width:17px;height:17px;"></i> Creating...`;
      if (window.lucide) window.lucide.createIcons();

      try {
        await createScheduledPartyInCloud(partyId, scheduledData);
        showToast('🎉 Watch party scheduled!');

        invitees.forEach(async (email) => {
          try {
            await sendPartyInviteNotification(
              user.uid,
              scheduledData.hostName,
              getInitialsAvatar(user.displayName, user.email, user.photoURL),
              email, partyId,
              `${name} (Scheduled: ${selectedMedia.title})`,
              selectedMedia.posterPath,
              selectedMedia.type
            );
            try {
              const emailRes = await fetch(`${NODE_PROXY}/api/email/send-invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  hostName: scheduledData.hostName,
                  inviteeEmail: email,
                  title: `${name} (Scheduled: ${selectedMedia.title})`,
                  partyId, mediaType: selectedMedia.type, posterPath: selectedMedia.posterPath
                })
              });
              if (!emailRes.ok) {
                const resData = await emailRes.json().catch(() => ({}));
                throw new Error(resData.details || resData.error || 'Failed to send invite email.');
              }
            } catch (emailErr) {
              console.warn('Email send failed for', email, emailErr);
              showToast(`Warning: Email invite failed for ${email} (${emailErr.message}).`);
            }
          } catch(notifErr) { console.warn('Notification failed for', email, notifErr); }
        });

        downloadCalendarFile(name, scheduledData.scheduledTime, partyId);

        submitBtn.innerHTML = `<i data-lucide="check" style="width:17px;height:17px;"></i> Scheduled!`;
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => closeModal(), 900);
      } catch(err) {
        showToast('Failed to schedule party.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="calendar-plus"></i> Schedule Watch Party`;
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }

  // 3. Quick Start Party Modal (Live Room creation)
  const startPartyBtn = container.querySelector('#start-party-btn');
  startPartyBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    showStartPartyModal();
  });

  function showStartPartyModal() {
    modalOverlay.classList.remove('hidden');
    const defaultRoomName = `Room no. ${getNextRoomNumber()}`;
    modalOverlay.innerHTML = `
      <div class="modal-wrapper piq-modal-bg">
        <!-- Protruding Document Tab: Room Name -->
        <div class="piq-modal-tab">
          <input type="text" id="start-party-name" class="piq-tab-input" value="${defaultRoomName}" required autocomplete="off" />
          <i data-lucide="edit-3" style="width: 12px; height: 12px; color: var(--text-muted);"></i>
        </div>

        <!-- Right: Form Panel (Actually the main two-column grid) -->
        <div class="piq-form-panel">
          <button class="piq-close-btn" id="modal-close-btn"><i data-lucide="x"></i></button>

          <div class="piq-modal-header">
            <div class="piq-modal-header-icon"><i data-lucide="tv"></i></div>
            <div>
              <h2 class="piq-modal-title">Create Watch Room</h2>
              <p class="piq-modal-subtitle">Start watching instantly with friends</p>
            </div>
          </div>

          <form id="start-party-form" novalidate>
            <div class="piq-modal-two-col">
              <!-- Left Column: Search & Preview -->
              <div class="piq-modal-left-col">
                <!-- Content Search -->
                <div class="piq-field" style="position:relative; margin-bottom:0;">
                  <div class="piq-floating-label">
                    <input type="text" id="start-media-search" class="piq-input" placeholder=" " autocomplete="off" />
                    <label for="start-media-search">Search Movie or TV Show</label>
                    <i data-lucide="search" class="piq-input-icon" id="start-search-icon"></i>
                  </div>
                  <div id="start-search-dropdown" class="piq-search-dropdown hidden"></div>
                </div>

                <!-- TV Selectors -->
                <div id="start-tv-selectors" class="piq-tv-selectors">
                  <div style="flex:1;"><select id="start-tv-season" class="piq-select"></select></div>
                  <div style="flex:1;"><select id="start-tv-episode" class="piq-select"></select></div>
                </div>

                <!-- Media Preview Card -->
                <div class="piq-media-preview-card" id="start-preview-card">
                  <div id="start-preview-placeholder" class="piq-preview-placeholder">
                    <i data-lucide="film" class="piq-preview-ph-icon"></i>
                    <div class="piq-preview-ph-title">No Media Selected</div>
                    <div class="piq-preview-ph-text">Search and select a movie or show to preview details.</div>
                  </div>
                  <div id="start-preview-content" style="display:none; flex-direction:column; gap:12px; height:100%;">
                    <div class="piq-preview-poster-wrap">
                      <img id="start-drawer-poster" class="piq-preview-poster" src="" alt="" style="display:none;" />
                      <div id="start-drawer-poster-ph" style="width:110px;height:165px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;">
                        <i data-lucide="film" style="width:28px;height:28px;color:rgba(168,85,247,0.3);"></i>
                      </div>
                    </div>
                    <div class="piq-preview-meta">
                      <div class="piq-drawer-title" id="start-drawer-media-title">Select a title</div>
                      <div class="piq-drawer-badges">
                        <span class="piq-drawer-badge" id="start-drawer-media-type">—</span>
                        <span class="piq-drawer-badge" id="start-drawer-media-release">—</span>
                      </div>
                      <div class="piq-drawer-rating">
                        <i data-lucide="star" style="width:12px;height:12px;fill:#fbbf24;color:#fbbf24;"></i>
                        <span id="start-drawer-media-rating">—</span>
                      </div>
                      <div class="piq-drawer-overview" id="start-drawer-media-overview" style="margin-top:4px;"></div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Right Column: Settings -->
              <div class="piq-modal-right-col">
                <!-- Privacy -->
                <div class="piq-section-label" style="margin-top:0;">
                  <i data-lucide="shield" style="width:13px;height:13px;"></i> Privacy
                </div>
                <div class="piq-privacy-group">
                  <label class="piq-privacy-card active">
                    <input type="radio" name="start-privacy" value="Open" checked style="display:none;" />
                    <i data-lucide="globe"></i>
                    <span class="piq-privacy-title">Open</span>
                    <span class="piq-privacy-sub">Anyone with link</span>
                  </label>
                  <label class="piq-privacy-card">
                    <input type="radio" name="start-privacy" value="Friends-only" style="display:none;" />
                    <i data-lucide="users"></i>
                    <span class="piq-privacy-title">Friends</span>
                    <span class="piq-privacy-sub">Only your friends</span>
                  </label>
                  <label class="piq-privacy-card">
                    <input type="radio" name="start-privacy" value="Closed" style="display:none;" />
                    <i data-lucide="lock"></i>
                    <span class="piq-privacy-title">Private</span>
                    <span class="piq-privacy-sub">Invite only</span>
                  </label>
                </div>

                <!-- Guest Stepper -->
                <div class="piq-section-label">
                  <i data-lucide="users" style="width:13px;height:13px;"></i> Max Guests
                </div>
                <div class="piq-guest-stepper">
                  <button type="button" id="start-guest-minus" class="piq-stepper-btn" aria-label="Decrease"><i data-lucide="minus"></i></button>
                  <div class="piq-stepper-count">
                    <span class="piq-stepper-num" id="start-guest-count">4</span>
                    <span class="piq-stepper-label">guests max</span>
                  </div>
                  <button type="button" id="start-guest-plus" class="piq-stepper-btn" aria-label="Increase"><i data-lucide="plus"></i></button>
                </div>
                <input type="hidden" id="start-max" value="4" />
              </div>
            </div>

            <!-- Validation Error -->
            <div id="start-validation-error" class="piq-validation-error"></div>

            <!-- CTA -->
            <button type="submit" class="piq-hero-btn" id="start-submit-btn">
              <i data-lucide="play-circle"></i>
              Open the Room
            </button>
          </form>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    const closeBtn = modalOverlay.querySelector('#modal-close-btn');
    const form = modalOverlay.querySelector('#start-party-form');
    const privacyCards = modalOverlay.querySelectorAll('.piq-privacy-card');
    const guestCountEl = modalOverlay.querySelector('#start-guest-count');
    const guestMinusBtn = modalOverlay.querySelector('#start-guest-minus');
    const guestPlusBtn = modalOverlay.querySelector('#start-guest-plus');
    const guestMaxInput = modalOverlay.querySelector('#start-max');
    const validationError = modalOverlay.querySelector('#start-validation-error');
    const submitBtn = modalOverlay.querySelector('#start-submit-btn');
    const searchInput = modalOverlay.querySelector('#start-media-search');
    const dropdown = modalOverlay.querySelector('#start-search-dropdown');
    const tvSelectors = modalOverlay.querySelector('#start-tv-selectors');
    const seasonSelect = modalOverlay.querySelector('#start-tv-season');
    const episodeSelect = modalOverlay.querySelector('#start-tv-episode');
    const searchIcon = modalOverlay.querySelector('#start-search-icon');
    const drawer = modalOverlay.querySelector('#start-preview-card');
    const drawerPoster = drawer.querySelector('#start-drawer-poster');
    const drawerPh = drawer.querySelector('#start-drawer-poster-ph');

    // Privacy cards
    function updatePrivacyCards() {
      privacyCards.forEach(c => c.classList.toggle('active', c.querySelector('input').checked));
    }
    privacyCards.forEach(card => {
      card.addEventListener('click', () => { card.querySelector('input').checked = true; updatePrivacyCards(); });
    });
    updatePrivacyCards();

    // Guest stepper
    let guestCount = 4;
    const GUEST_MIN = 2, GUEST_MAX = 10;
    function updateStepper() {
      guestCountEl.textContent = guestCount;
      guestMaxInput.value = guestCount;
      guestMinusBtn.disabled = guestCount <= GUEST_MIN;
      guestPlusBtn.disabled = guestCount >= GUEST_MAX;
      guestCountEl.style.transition = 'none';
      guestCountEl.style.transform = 'scale(1.3)';
      requestAnimationFrame(() => {
        guestCountEl.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)';
        guestCountEl.style.transform = 'scale(1)';
      });
    }
    guestMinusBtn.addEventListener('click', () => { if (guestCount > GUEST_MIN) { guestCount--; updateStepper(); } });
    guestPlusBtn.addEventListener('click', () => { if (guestCount < GUEST_MAX) { guestCount++; updateStepper(); } });
    updateStepper();

    // Media search
    let selectedMedia = null;
    let searchDebounce = null;

    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      const query = searchInput.value.trim();
      if (!query) { dropdown.classList.add('hidden'); return; }
      if (searchIcon) { searchIcon.setAttribute('data-lucide', 'loader'); searchIcon.classList.add('spinning'); if (window.lucide) window.lucide.createIcons(); }
      searchDebounce = setTimeout(async () => {
        try {
          const data = await searchMovieBox(query);
          const results = data.results.slice(0, 6);
          if (searchIcon) { searchIcon.setAttribute('data-lucide', 'search'); searchIcon.classList.remove('spinning'); if (window.lucide) window.lucide.createIcons(); }
          if (results.length === 0) {
            dropdown.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:12px;text-align:center;">No matches found</div>';
            dropdown.classList.remove('hidden'); return;
          }
          dropdown.innerHTML = results.map(item => {
            const title = item.title || item.name || 'Unknown';
            const year = (item.releaseDate || item.year || '').slice(0, 4);
            const type = item.subjectType === 2 ? 'TV' : 'Movie';
            const poster = item.cover?.url || item.poster_path || '';
            return `
              <div class="piq-search-result start-media-option" data-id="${item.id}" data-type="${type}" data-title="${title}" data-poster="${poster}">
                ${poster ? `<img class="piq-search-result-poster" src="${poster}" alt="" />` : `<div class="piq-search-result-poster" style="background:rgba(168,85,247,0.08);display:flex;align-items:center;justify-content:center;"><i data-lucide="film" style="width:14px;height:14px;color:rgba(168,85,247,0.4);"></i></div>`}
                <div class="piq-search-result-info">
                  <div class="piq-search-result-title">${title}</div>
                  <div class="piq-search-result-meta">${year}</div>
                </div>
                <span class="piq-search-result-badge ${type === 'TV' ? 'piq-badge-tv' : 'piq-badge-movie'}">${type}</span>
              </div>`;
          }).join('');
          dropdown.classList.remove('hidden');
          if (window.lucide) window.lucide.createIcons();

          dropdown.querySelectorAll('.start-media-option').forEach(opt => {
            opt.addEventListener('click', async () => {
              selectedMedia = { id: opt.dataset.id, type: opt.dataset.type === 'TV' ? 'tv' : 'movie', title: opt.dataset.title, posterPath: opt.dataset.poster };
              searchInput.value = selectedMedia.title;
              dropdown.classList.add('hidden');

              const ph = drawer.querySelector('#start-preview-placeholder');
              const content = drawer.querySelector('#start-preview-content');
              if (ph) ph.style.display = 'none';
              if (content) content.style.display = 'flex';

              drawer.classList.add('show');
              drawer.querySelector('#start-drawer-media-title').textContent = selectedMedia.title;
              drawer.querySelector('#start-drawer-media-type').textContent = selectedMedia.type === 'tv' ? 'TV Show' : 'Movie';
              drawer.querySelector('#start-drawer-media-overview').textContent = 'Loading...';
              if (selectedMedia.posterPath) { drawerPoster.src = selectedMedia.posterPath; drawerPoster.style.display = 'block'; if (drawerPh) drawerPh.style.display = 'none'; }

              try {
                const details = selectedMedia.type === 'tv' ? await getTVDetails(selectedMedia.id) : await getMovieDetails(selectedMedia.id);
                if (details) {
                  const posterUrl = details.poster_path ? `https://image.tmdb.org/t/p/w342${details.poster_path}` : selectedMedia.posterPath;
                  if (posterUrl) { drawerPoster.src = posterUrl; drawerPoster.style.display = 'block'; if (drawerPh) drawerPh.style.display = 'none'; }
                  drawer.querySelector('#start-drawer-media-rating').textContent = details.vote_average ? details.vote_average.toFixed(1) : '—';
                  drawer.querySelector('#start-drawer-media-release').textContent = (details.release_date || details.first_air_date || '—').slice(0, 4);
                  drawer.querySelector('#start-drawer-media-overview').textContent = details.overview || 'No overview available.';
                }
              } catch(err) { drawer.querySelector('#start-drawer-media-overview').textContent = 'Summary unavailable.'; }

              if (selectedMedia.type === 'tv') {
                tvSelectors.style.display = 'flex';
                seasonSelect.innerHTML = '<option>Loading...</option>';
                try {
                  const tvId = selectedMedia.id.startsWith('mb_') ? selectedMedia.id : `mb_${selectedMedia.id}`;
                  const details = await getTVDetails(tvId);
                  if (details && details.seasons) {
                    seasonSelect.innerHTML = details.seasons.map(s => `<option value="${s.season_number}">${s.name}</option>`).join('');
                    loadStartEpisodes(tvId, seasonSelect.value);
                  }
                } catch(e) { seasonSelect.innerHTML = '<option value="1">Season 1</option>'; episodeSelect.innerHTML = '<option value="1">Episode 1</option>'; }
              } else {
                tvSelectors.style.display = 'none';
              }
            });
          });
        } catch(e) {
          console.error(e);
          if (searchIcon) { searchIcon.setAttribute('data-lucide', 'search'); searchIcon.classList.remove('spinning'); if (window.lucide) window.lucide.createIcons(); }
        }
      }, 300);
    });

    const hideStartDropdown = (e) => { if (!dropdown.contains(e.target) && !searchInput.contains(e.target)) { dropdown.classList.add('hidden'); document.removeEventListener('click', hideStartDropdown); } };
    document.addEventListener('click', hideStartDropdown);

    seasonSelect.addEventListener('change', () => {
      const tvId = selectedMedia.id.startsWith('mb_') ? selectedMedia.id : `mb_${selectedMedia.id}`;
      loadStartEpisodes(tvId, seasonSelect.value);
    });

    async function loadStartEpisodes(tvId, seasonNum) {
      episodeSelect.innerHTML = '<option>Loading...</option>';
      try {
        const { getSeasonDetails } = await import('../services/api.js');
        const seasonDetails = await getSeasonDetails(tvId, seasonNum, selectedMedia.title);
        if (seasonDetails && seasonDetails.episodes) {
          episodeSelect.innerHTML = seasonDetails.episodes.map(ep => `<option value="${ep.episode_number}">Episode ${ep.episode_number}</option>`).join('');
        } else { episodeSelect.innerHTML = '<option value="1">Episode 1</option>'; }
      } catch(e) { episodeSelect.innerHTML = '<option value="1">Episode 1</option>'; }
    }

    closeBtn.addEventListener('click', () => modalOverlay.classList.add('hidden'));
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.add('hidden'); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      validationError.style.display = 'none';

      const nameInput = modalOverlay.querySelector('#start-party-name');
      const name = nameInput.value.trim();
      if (!name) {
        validationError.textContent = 'Please enter a Room Name.';
        validationError.style.display = 'block';
        nameInput.classList.add('piq-shake-error');
        setTimeout(() => nameInput.classList.remove('piq-shake-error'), 450);
        nameInput.focus();
        return;
      }

      if (!selectedMedia) {
        validationError.textContent = 'Please search and select a movie or show first.';
        validationError.style.display = 'block';
        return;
      }

      const partyId = `party_${Math.random().toString(36).substring(2, 11)}`;
      const privacy = modalOverlay.querySelector('input[name="start-privacy"]:checked').value;
      const maxVal = parseInt(guestMaxInput.value);

      const roomData = {
        partyId,
        hostId: user.uid,
        hostName: user.displayName || user.email.split('@')[0] || 'Host',
        hostAvatar: getInitialsAvatar(user.displayName, user.email, user.photoURL),
        title: name,
        mediaTitle: selectedMedia.title,
        mediaId: selectedMedia.id,
        mediaType: selectedMedia.type,
        posterPath: selectedMedia.posterPath,
        season: selectedMedia.type === 'tv' ? parseInt(seasonSelect.value) : null,
        episode: selectedMedia.type === 'tv' ? parseInt(episodeSelect.value) : null,
        privacy,
        maxParticipants: maxVal,
        status: 'paused',
        currentTime: 0,
        members: [],
        locked: false
      };

      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i data-lucide="loader" class="btn-spinner" style="width:17px;height:17px;"></i> Starting...`;
      if (window.lucide) window.lucide.createIcons();

      try {
        await createWatchPartyInCloud(partyId, roomData);
        // Write to status database that we are hosting/watching this room
        await updateUserStatusInCloud(user.uid, 'online', partyId, roomData.mediaTitle);
        modalOverlay.classList.add('hidden');
        navigate(`/watch-party/${partyId}`);
      } catch(e) {
        showToast('Failed to start room.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="play-circle"></i> Open the Room`;
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }




  // Toast notifier
  function showToast(message) {
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

  // Return Cleanup callback
  return () => {
    console.log('[Dashboard Cleanup] Stopping real-time dashboard listeners...');
    if (unsubRequests) unsubRequests();
    if (unsubFriends) unsubFriends();
    if (unsubScheduled) unsubScheduled();
    Object.values(statusUnsubscribes).forEach(un => un());
    if (inviteesAutocomplete) {
      inviteesAutocomplete.destroy();
      inviteesAutocomplete = null;
    }
  };
}
