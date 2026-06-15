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
  addPartyHistoryToCloud,
  createScheduledPartyInCloud,
  subscribeToScheduledParties,
  deleteScheduledPartyInCloud,
  getInitialsAvatar
} from '../services/firebase.js';
import { navigate } from '../services/router.js';
import { initFriendAutocomplete } from '../components/FriendAutocomplete.js';

export async function renderPartyWatchDashboard({ container }) {
  await waitAuthReady();
  const user = getUser();
  let currentFriendsList = [];
  let inviteesAutocomplete = null;

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
              <div class="glass-card">
                <div class="card-title-row" style="margin-bottom:12px; padding-bottom:6px;">
                  <h3>Join with Room ID</h3>
                </div>
                <div style="display:flex; gap:8px;">
                  <input type="text" id="direct-join-code-input" class="party-chat-input" placeholder="Enter Room ID" style="height:36px; box-sizing:border-box; padding:6px 12px;" />
                  <button class="party-chat-send-btn" id="direct-join-btn" style="width:36px; height:36px; flex-shrink:0;" title="Join Room">
                    <i data-lucide="arrow-right" style="width:16px; height:16px;"></i>
                  </button>
                </div>
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
              <div class="card-title-row">
                <h3>My Friends List</h3>
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
            <div class="card-title-row">
              <h3>Past Watched Parties History</h3>
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
  const joinBtn = container.querySelector('#direct-join-btn');
  const runJoin = async () => {
    const code = codeInput.value.trim();
    if (!code) return;
    codeInput.value = '';
    
    // Check if room code exists
    try {
      const room = await getWatchPartyFromCloud(code);
      if (!room) {
        showToast('Room not found. Check the ID and try again.');
        return;
      }
      navigate(`/watch-party/join/${code}`);
    } catch (e) {
      showToast('Error verifying room.');
    }
  };
  joinBtn?.addEventListener('click', runJoin);
  codeInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runJoin(); });

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
  const unsubFriends = subscribeToFriendsList(user.uid, (friends) => {
    currentFriendsList = friends;
    const listEl = container.querySelector('#friends-list-container');
    const presenceListEl = container.querySelector('#friend-activity-presence-list');
    
    // Clean up old status listeners
    Object.values(statusUnsubscribes).forEach(un => un());
    statusUnsubscribes = {};

    if (friends.length === 0) {
      if (listEl) listEl.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:12px 0;">No friends added yet.</div>';
      if (presenceListEl) presenceListEl.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:10px 0;">No active watch parties among friends.</div>';
      return;
    }

    if (listEl) {
      listEl.innerHTML = friends.map(f => `
        <div class="friend-card-detailed" id="friend-card-${f.uid}">
          <img class="friend-card-detailed-avatar" src="${f.avatar}" alt="" />
          <div class="friend-card-detailed-info">
            <div class="friend-card-detailed-name">${f.name}</div>
            <div class="friend-card-detailed-email">${f.email}</div>
          </div>
          <button class="friend-card-detailed-remove-btn" data-uid="${f.uid}" title="Remove Friend">
            <i data-lucide="user-minus" style="width:16px; height:16px;"></i>
          </button>
        </div>
      `).join('');

      listEl.querySelectorAll('.friend-card-detailed-remove-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm('Are you sure you want to remove this friend?')) {
            const uid = btn.dataset.uid;
            try {
              await removeFriendFromCloud(user.uid, uid);
              showToast('Friend removed.');
            } catch(e) {
              showToast('Error removing friend.');
            }
          }
        });
      });
      
      if (window.lucide) window.lucide.createIcons();
    }

    // Subscribe to statuses of each friend to populate presence lists in real-time
    const currentStatusStates = {};
    friends.forEach(f => {
      statusUnsubscribes[f.uid] = subscribeToFriendStatus(f.uid, (profile) => {
        currentStatusStates[f.uid] = { ...f, ...profile };
        recomputePresenceList(currentStatusStates);
      });
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

    listEl.querySelectorAll('.delete-sch-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Cancel this scheduled watch party?')) {
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

  // 4. Fetch History Logs
  const renderHistoryTab = async () => {
    const containerEl = container.querySelector('#history-logs-container');
    if (!containerEl) return;
    containerEl.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:20px 0;">Loading history...</div>';
    
    try {
      const logs = await fetchPartyHistoryFromCloud(user.uid);
      if (logs.length === 0) {
        containerEl.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:20px 0; text-align:center; grid-column:1/-1;">No watch party logs recorded.</div>';
        return;
      }

      containerEl.innerHTML = logs.map(log => {
        const dateStr = log.date ? new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date';
        const posterUrl = log.posterPath 
          ? (log.posterPath.startsWith('/') ? `https://image.tmdb.org/t/p/w154${log.posterPath}` : log.posterPath)
          : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150" fill="%23222"><rect width="100" height="150"/></svg>';
        
        const participants = Array.isArray(log.participants) ? log.participants.join(', ') : 'None';
        const messagesCount = Array.isArray(log.messages) ? log.messages.length : 0;

        return `
          <div class="history-card" data-log-id="${log.id}">
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

      if (window.lucide) window.lucide.createIcons();
    } catch(err) {
      containerEl.innerHTML = '<div style="color:#ef4444; font-size:12px; padding:20px 0;">Failed to load history logs.</div>';
    }
  };

  // Wire history tab clicks to fetch dynamically
  container.querySelector('.dashboard-tab-btn[data-tab="tab-history"]').addEventListener('click', renderHistoryTab);

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
    modalOverlay.innerHTML = `
      <div class="modal-content-card" style="max-width:440px;">
        <button class="modal-close-btn" id="modal-close-btn">
          <i data-lucide="x"></i>
        </button>
        <h3 style="margin-top:0; margin-bottom:16px; font-family:var(--font-display); font-size:18px; font-weight:800;">Schedule Future Watch Party</h3>
        <form id="schedule-party-form" style="display:flex; flex-direction:column; gap:12px;">
          
          <label style="font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">Room Code Name</label>
          <input type="text" id="sch-party-name" class="party-chat-input" placeholder="e.g. Anime Night with Crew" required />

          <!-- TMDB Search input -->
          <label style="font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">Search Content</label>
          <div style="position:relative;">
            <input type="text" id="sch-media-search" class="party-chat-input" placeholder="Search Movie/TV Show" required autocomplete="off" />
            <div id="sch-search-dropdown" class="party-gif-panel hidden" style="top:calc(100% + 4px); bottom:auto; max-height:160px; overflow-y:auto; padding:6px; background:rgba(18,18,24,0.98);"></div>
          </div>
          
          <!-- TV show season/ep selects (hidden initially) -->
          <div id="sch-tv-selectors" style="display:none; gap:10px;">
            <div style="flex:1;">
              <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Season</label>
              <select id="sch-tv-season" class="settings-select" style="width:100%; height:34px; min-width:0;"></select>
            </div>
            <div style="flex:1;">
              <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Episode</label>
              <select id="sch-tv-episode" class="settings-select" style="width:100%; height:34px; min-width:0;"></select>
            </div>
          </div>

          <label style="font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">Schedule Date & Time</label>
          <input type="datetime-local" id="sch-date-time" class="party-chat-input" required style="color:#fff;" />

          <label style="font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">Invite Friends (Emails, comma separated)</label>
          <input type="text" id="sch-invitees" class="party-chat-input" placeholder="friend1@email.com, friend2@email.com" />

          <div style="display:flex; gap:10px; margin-top:8px;">
            <div style="flex:1;">
              <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Privacy</label>
              <select id="sch-privacy" class="settings-select" style="width:100%; height:34px; min-width:0;">
                <option value="Open">Open (Friends join)</option>
                <option value="Friends-only">Friends-only</option>
                <option value="Closed">Closed (Invite only)</option>
              </select>
            </div>
            <div style="flex:1;">
              <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Max Guests</label>
              <select id="sch-max" class="settings-select" style="width:100%; height:34px; min-width:0;">
                <option value="5">5 People</option>
                <option value="10" selected>10 People</option>
                <option value="20">20 People</option>
              </select>
            </div>
          </div>

          <button type="submit" class="user-empty-btn" style="margin-top:10px; width:100%; justify-content:center; height:38px;">
            Create Event Calendar
          </button>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    const closeBtn = modalOverlay.querySelector('#modal-close-btn');
    const inviteesInput = modalOverlay.querySelector('#sch-invitees');

    if (inviteesAutocomplete) inviteesAutocomplete.destroy();
    if (inviteesInput) {
      inviteesAutocomplete = initFriendAutocomplete(inviteesInput, () => currentFriendsList, true);
    }

    closeBtn.addEventListener('click', () => {
      modalOverlay.classList.add('hidden');
      if (inviteesAutocomplete) {
        inviteesAutocomplete.destroy();
        inviteesAutocomplete = null;
      }
    });

    const searchInput = modalOverlay.querySelector('#sch-media-search');
    const dropdown = modalOverlay.querySelector('#sch-search-dropdown');
    const tvSelectors = modalOverlay.querySelector('#sch-tv-selectors');
    const seasonSelect = modalOverlay.querySelector('#sch-tv-season');
    const episodeSelect = modalOverlay.querySelector('#sch-tv-episode');
    const form = modalOverlay.querySelector('#schedule-party-form');

    let selectedMedia = null;
    let searchDebounce = null;

    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      const query = searchInput.value.trim();
      if (!query) {
        dropdown.classList.add('hidden');
        return;
      }

      searchDebounce = setTimeout(async () => {
        try {
          const data = await searchMovieBox(query);
          const results = data.results.slice(0, 5);
          if (results.length === 0) {
            dropdown.innerHTML = '<div style="color:var(--text-muted); font-size:11px; padding:6px;">No matches found.</div>';
            dropdown.classList.remove('hidden');
            return;
          }

          dropdown.innerHTML = results.map(item => {
            const title = item.title || item.name || 'Unknown';
            const year = (item.releaseDate || item.year || '').slice(0, 4);
            const type = item.subjectType === 2 ? 'TV' : 'Movie';
            return `
              <div class="search-suggestion-item sch-media-option" data-id="${item.id}" data-type="${type}" data-title="${title}" data-poster="${item.cover?.url || item.poster_path || ''}" style="padding:6px; margin-bottom:4px; font-size:12px;">
                <div style="font-weight:700;">${title} (${year})</div>
                <div style="font-size:10px; color:var(--text-muted);">${type}</div>
              </div>
            `;
          }).join('');

          dropdown.classList.remove('hidden');

          dropdown.querySelectorAll('.sch-media-option').forEach(opt => {
            opt.addEventListener('click', async () => {
              selectedMedia = {
                id: opt.dataset.id,
                type: opt.dataset.type === 'TV' ? 'tv' : 'movie',
                title: opt.dataset.title,
                posterPath: opt.dataset.poster
              };
              searchInput.value = selectedMedia.title;
              dropdown.classList.add('hidden');

              // If TV, load seasons
              if (selectedMedia.type === 'tv') {
                tvSelectors.style.display = 'flex';
                seasonSelect.innerHTML = '<option>Loading...</option>';
                try {
                  const tvId = selectedMedia.id.startsWith('mb_') ? selectedMedia.id : `mb_${selectedMedia.id}`;
                  const details = await getTVDetails(tvId);
                  if (details && details.seasons) {
                    seasonSelect.innerHTML = details.seasons.map(s => `<option value="${s.season_number}">${s.name}</option>`).join('');
                    
                    // Trigger episode population for first season
                    loadScheduleEpisodes(tvId, seasonSelect.value);
                  }
                } catch(e) {
                  seasonSelect.innerHTML = '<option value="1">Season 1</option>';
                  episodeSelect.innerHTML = '<option value="1">Episode 1</option>';
                }
              } else {
                tvSelectors.style.display = 'none';
              }
            });
          });

        } catch(e) {
          console.error(e);
        }
      }, 300);
    });

    // Load episodes when season changes
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
        } else {
          episodeSelect.innerHTML = '<option value="1">Episode 1</option>';
        }
      } catch(e) {
        episodeSelect.innerHTML = '<option value="1">Episode 1</option>';
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!selectedMedia) {
        showToast('Please search and select a movie or show first.');
        return;
      }

      const partyId = `party_${Math.random().toString(36).substring(2, 11)}`;
      const name = modalOverlay.querySelector('#sch-party-name').value.trim();
      const dateTime = modalOverlay.querySelector('#sch-date-time').value;
      const inviteesStr = modalOverlay.querySelector('#sch-invitees').value.trim();
      const privacy = modalOverlay.querySelector('#sch-privacy').value;
      const maxVal = modalOverlay.querySelector('#sch-max').value;

      const invitees = inviteesStr ? inviteesStr.split(',').map(em => em.trim().toLowerCase()).filter(Boolean) : [];

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
        scheduledTime: new Date(dateTime).toISOString(),
        invitees,
        privacy,
        maxParticipants: parseInt(maxVal)
      };

      try {
        await createScheduledPartyInCloud(partyId, scheduledData);
        showToast('Party Scheduled successfully!');
        
        // Auto send notification invites to friends in the invite list
        invitees.forEach(async (email) => {
          try {
            await sendPartyInviteNotification(
              user.uid,
              scheduledData.hostName,
              getInitialsAvatar(user.displayName, user.email, user.photoURL),
              email,
              partyId,
              `${name} (Scheduled: ${selectedMedia.title})`,
              selectedMedia.posterPath,
              selectedMedia.type
            );
          } catch(notifErr) {
            console.warn('Failed to send real-time notification to', email, notifErr);
          }
        });

        // Trigger calendar .ics download immediately!
        downloadCalendarFile(name, dateTime, partyId);

        modalOverlay.classList.add('hidden');
        if (inviteesAutocomplete) {
          inviteesAutocomplete.destroy();
          inviteesAutocomplete = null;
        }
      } catch(e) {
        showToast('Failed to schedule party.');
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
    modalOverlay.innerHTML = `
      <div class="modal-content-card" style="max-width:440px;">
        <button class="modal-close-btn" id="modal-close-btn">
          <i data-lucide="x"></i>
        </button>
        <h3 style="margin-top:0; margin-bottom:16px; font-family:var(--font-display); font-size:18px; font-weight:800;">Create Instant Watch Room</h3>
        <form id="start-party-form" style="display:flex; flex-direction:column; gap:12px;">
          
          <label style="font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">Room Name</label>
          <input type="text" id="start-party-name" class="party-chat-input" placeholder="e.g. Friday Movie Night" required />

          <!-- TMDB Search input -->
          <label style="font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">Search Content</label>
          <div style="position:relative;">
            <input type="text" id="start-media-search" class="party-chat-input" placeholder="Search Movie/TV Show" required autocomplete="off" />
            <div id="start-search-dropdown" class="party-gif-panel hidden" style="top:calc(100% + 4px); bottom:auto; max-height:160px; overflow-y:auto; padding:6px; background:rgba(18,18,24,0.98);"></div>
          </div>
          
          <!-- TV show season/ep selects (hidden initially) -->
          <div id="start-tv-selectors" style="display:none; gap:10px;">
            <div style="flex:1;">
              <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Season</label>
              <select id="start-tv-season" class="settings-select" style="width:100%; height:34px; min-width:0;"></select>
            </div>
            <div style="flex:1;">
              <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Episode</label>
              <select id="start-tv-episode" class="settings-select" style="width:100%; height:34px; min-width:0;"></select>
            </div>
          </div>

          <div style="display:flex; gap:10px; margin-top:8px;">
            <div style="flex:1;">
              <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Privacy</label>
              <select id="start-privacy" class="settings-select" style="width:100%; height:34px; min-width:0;">
                <option value="Open">Open (Friends join)</option>
                <option value="Friends-only">Friends-only</option>
                <option value="Closed">Closed (Invite only)</option>
              </select>
            </div>
            <div style="flex:1;">
              <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Max Guests</label>
              <select id="start-max" class="settings-select" style="width:100%; height:34px; min-width:0;">
                <option value="5">5 People</option>
                <option value="10" selected>10 People</option>
                <option value="20">20 People</option>
              </select>
            </div>
          </div>

          <button type="submit" class="user-empty-btn" style="margin-top:10px; width:100%; justify-content:center; height:38px;">
            Start Sync Room Now
          </button>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    const closeBtn = modalOverlay.querySelector('#modal-close-btn');
    closeBtn.addEventListener('click', () => modalOverlay.classList.add('hidden'));

    const searchInput = modalOverlay.querySelector('#start-media-search');
    const dropdown = modalOverlay.querySelector('#start-search-dropdown');
    const tvSelectors = modalOverlay.querySelector('#start-tv-selectors');
    const seasonSelect = modalOverlay.querySelector('#start-tv-season');
    const episodeSelect = modalOverlay.querySelector('#start-tv-episode');
    const form = modalOverlay.querySelector('#start-party-form');

    let selectedMedia = null;
    let searchDebounce = null;

    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      const query = searchInput.value.trim();
      if (!query) {
        dropdown.classList.add('hidden');
        return;
      }

      searchDebounce = setTimeout(async () => {
        try {
          const data = await searchMovieBox(query);
          const results = data.results.slice(0, 5);
          if (results.length === 0) {
            dropdown.innerHTML = '<div style="color:var(--text-muted); font-size:11px; padding:6px;">No matches found.</div>';
            dropdown.classList.remove('hidden');
            return;
          }

          dropdown.innerHTML = results.map(item => {
            const title = item.title || item.name || 'Unknown';
            const year = (item.releaseDate || item.year || '').slice(0, 4);
            const type = item.subjectType === 2 ? 'TV' : 'Movie';
            return `
              <div class="search-suggestion-item start-media-option" data-id="${item.id}" data-type="${type}" data-title="${title}" data-poster="${item.cover?.url || item.poster_path || ''}" style="padding:6px; margin-bottom:4px; font-size:12px;">
                <div style="font-weight:700;">${title} (${year})</div>
                <div style="font-size:10px; color:var(--text-muted);">${type}</div>
              </div>
            `;
          }).join('');

          dropdown.classList.remove('hidden');

          dropdown.querySelectorAll('.start-media-option').forEach(opt => {
            opt.addEventListener('click', async () => {
              selectedMedia = {
                id: opt.dataset.id,
                type: opt.dataset.type === 'TV' ? 'tv' : 'movie',
                title: opt.dataset.title,
                posterPath: opt.dataset.poster
              };
              searchInput.value = selectedMedia.title;
              dropdown.classList.add('hidden');

              // If TV, load seasons
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
                } catch(e) {
                  seasonSelect.innerHTML = '<option value="1">Season 1</option>';
                  episodeSelect.innerHTML = '<option value="1">Episode 1</option>';
                }
              } else {
                tvSelectors.style.display = 'none';
              }
            });
          });

        } catch(e) {
          console.error(e);
        }
      }, 300);
    });

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
        } else {
          episodeSelect.innerHTML = '<option value="1">Episode 1</option>';
        }
      } catch(e) {
        episodeSelect.innerHTML = '<option value="1">Episode 1</option>';
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!selectedMedia) {
        showToast('Please search and select a movie or show first.');
        return;
      }

      const partyId = `party_${Math.random().toString(36).substring(2, 11)}`;
      const name = modalOverlay.querySelector('#start-party-name').value.trim();
      const privacy = modalOverlay.querySelector('#start-privacy').value;
      const maxVal = modalOverlay.querySelector('#start-max').value;

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
        maxParticipants: parseInt(maxVal),
        status: 'paused',
        currentTime: 0,
        members: [],
        locked: false
      };

      try {
        await createWatchPartyInCloud(partyId, roomData);
        
        // Write to status database that we are hosting/watching this room
        await updateUserStatusInCloud(user.uid, 'online', partyId, roomData.mediaTitle);

        modalOverlay.classList.add('hidden');
        navigate(`/watch-party/${partyId}`);
      } catch(e) {
        showToast('Failed to start room.');
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
