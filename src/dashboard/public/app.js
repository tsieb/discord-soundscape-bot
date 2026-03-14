const state = {
  config: null,
  session: null,
  eventSource: null,
  reconnectTimer: null,
  volumeDebounceTimer: null,
  connectionStatus: 'connecting',
};

const elements = {
  channelLabel: document.querySelector('#channel-label'),
  connectionPill: document.querySelector('#connection-pill'),
  guildLabel: document.querySelector('#guild-label'),
  leaveButton: document.querySelector('#leave-button'),
  masterVolume: document.querySelector('#master-volume'),
  nextSoundLabel: document.querySelector('#next-sound-label'),
  nowPlayingName: document.querySelector('#now-playing-name'),
  nowPlayingTime: document.querySelector('#now-playing-time'),
  playbackLabel: document.querySelector('#playback-label'),
  recentPlays: document.querySelector('#recent-plays'),
  sessionFeedback: document.querySelector('#session-feedback'),
  sessionIndicator: document.querySelector('#session-indicator'),
  soundBurst: document.querySelector('#sound-burst'),
  startButton: document.querySelector('#start-button'),
  stopButton: document.querySelector('#stop-button'),
  uptimeLabel: document.querySelector('#uptime-label'),
  volumeValue: document.querySelector('#volume-value'),
  workspaceNote: document.querySelector('#workspace-note'),
};

const formatRelativeTime = (timestamp) => {
  if (!timestamp) {
    return 'Waiting for a sound event.';
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000),
  );
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${seconds}s ago`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m ago`;
};

const formatUptime = (seconds) => {
  if (seconds === null || seconds === undefined) {
    return 'Waiting';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
};

const formatCountdown = (timestamp) => {
  if (!timestamp) {
    return 'Not scheduled';
  }

  const diffSeconds = Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
  if (diffSeconds < 60) {
    return `in ${diffSeconds}s`;
  }

  const minutes = Math.floor(diffSeconds / 60);
  const seconds = diffSeconds % 60;
  return `in ${minutes}m ${seconds}s`;
};

const setFeedback = (message, isError = false) => {
  elements.sessionFeedback.textContent = message;
  elements.sessionFeedback.style.color = isError ? 'var(--danger)' : 'var(--muted)';
};

const setConnectionStatus = (status) => {
  state.connectionStatus = status;
  const sessionActive = Boolean(state.session?.active);
  const isConnected = status === 'live';

  elements.connectionPill.textContent =
    status === 'live'
      ? 'SSE Live'
      : status === 'reconnecting'
        ? 'Reconnecting...'
        : 'Connecting...';
  elements.sessionIndicator.classList.toggle('offline', !isConnected || !sessionActive);
  elements.workspaceNote.textContent = sessionActive
    ? 'Watching the active guild session in real time.'
    : 'Dashboard is connected, but no voice session is active yet.';
};

const renderRecentPlays = () => {
  elements.recentPlays.innerHTML = '';
  const recentPlays = state.session?.recentPlays ?? [];

  if (recentPlays.length === 0) {
    const item = document.createElement('li');
    item.className = 'recent-item';
    item.innerHTML = '<span>No sounds played yet.</span><small>Waiting</small>';
    elements.recentPlays.appendChild(item);
    return;
  }

  for (const play of recentPlays) {
    const item = document.createElement('li');
    item.className = 'recent-item';
    item.innerHTML = `
      <span>${play.name}</span>
      <small>${formatRelativeTime(play.timestamp)}</small>
    `;
    elements.recentPlays.appendChild(item);
  }
};

const renderSession = () => {
  const session = state.session;
  const config = state.config;

  elements.guildLabel.textContent =
    session?.guildId !== null && session?.guildId !== undefined
      ? session.guildId
      : 'No active guild';
  elements.uptimeLabel.textContent = formatUptime(session?.uptime ?? null);
  elements.playbackLabel.textContent = session?.isPlaying ? 'Running' : 'Stopped';
  elements.nextSoundLabel.textContent =
    session?.active && session?.isPlaying
      ? formatCountdown(session.nextSoundEta)
      : 'Not scheduled';
  elements.channelLabel.textContent =
    session?.channelId !== null && session?.channelId !== undefined
      ? session.channelId
      : 'Not connected';

  const activePlay = session?.nowPlaying ?? session?.recentPlays?.[0] ?? null;
  elements.nowPlayingName.textContent = activePlay?.name ?? 'Idle';
  elements.nowPlayingTime.textContent = activePlay
    ? formatRelativeTime(activePlay.timestamp)
    : 'Waiting for the next sound event.';

  const volume = config?.volume ?? 0.5;
  elements.masterVolume.value = String(volume);
  elements.volumeValue.textContent = `${Math.round(volume * 100)}%`;

  const controlsDisabled = !session?.active;
  elements.startButton.disabled = controlsDisabled || session?.isPlaying === true;
  elements.stopButton.disabled = controlsDisabled || session?.isPlaying !== true;
  elements.leaveButton.disabled = controlsDisabled;
  elements.masterVolume.disabled = controlsDisabled;

  renderRecentPlays();
};

const updateSession = (session) => {
  state.session = session;
  renderSession();
};

const updateConfig = (config) => {
  state.config = config;
  renderSession();
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  if (response.status === 204) {
    return null;
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? 'Request failed');
  }

  return payload;
};

const flashSoundBurst = () => {
  elements.soundBurst.classList.remove('flash');
  void elements.soundBurst.offsetWidth;
  elements.soundBurst.classList.add('flash');
};

const scheduleReconnect = () => {
  if (state.reconnectTimer !== null) {
    return;
  }

  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null;
    connectEvents();
  }, 1500);
};

const connectEvents = () => {
  if (state.eventSource !== null) {
    state.eventSource.close();
  }

  setConnectionStatus('connecting');
  const eventSource = new EventSource('/api/events');
  state.eventSource = eventSource;

  eventSource.addEventListener('open', () => {
    setConnectionStatus('live');
  });

  eventSource.addEventListener('session_update', (event) => {
    updateSession(JSON.parse(event.data));
  });

  eventSource.addEventListener('sound_played', (event) => {
    const payload = JSON.parse(event.data);
    flashSoundBurst();

    if (!state.session) {
      return;
    }

    const nextRecentPlays = [payload, ...(state.session.recentPlays ?? [])].slice(0, 10);
    updateSession({
      ...state.session,
      nowPlaying: payload,
      recentPlays: nextRecentPlays,
    });
  });

  eventSource.onerror = () => {
    setConnectionStatus('reconnecting');
    eventSource.close();
    scheduleReconnect();
  };
};

const refreshState = async () => {
  const [session, config] = await Promise.all([
    fetchJson('/api/session'),
    fetchJson('/api/config'),
  ]);
  updateSession(session);
  updateConfig(config);
};

const runAction = async (url, method, successMessage) => {
  try {
    await fetchJson(url, { method });
    await refreshState();
    setFeedback(successMessage);
  } catch (error) {
    setFeedback(error.message, true);
  }
};

const saveMasterVolume = async (value) => {
  try {
    const config = await fetchJson('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume: Number(value) }),
    });
    updateConfig(config);
    setFeedback('Master volume updated.');
  } catch (error) {
    setFeedback(error.message, true);
  }
};

const bindEvents = () => {
  elements.startButton.addEventListener('click', () => {
    void runAction('/api/session/start', 'POST', 'Playback started.');
  });

  elements.stopButton.addEventListener('click', () => {
    void runAction('/api/session/stop', 'POST', 'Playback stopped.');
  });

  elements.leaveButton.addEventListener('click', () => {
    void runAction('/api/session/leave', 'POST', 'Session disconnected.');
  });

  elements.masterVolume.addEventListener('input', (event) => {
    const nextValue = Number(event.target.value);
    elements.volumeValue.textContent = `${Math.round(nextValue * 100)}%`;

    if (state.volumeDebounceTimer !== null) {
      clearTimeout(state.volumeDebounceTimer);
    }

    state.volumeDebounceTimer = window.setTimeout(() => {
      void saveMasterVolume(nextValue);
    }, 250);
  });
};

const startTicker = () => {
  window.setInterval(() => {
    renderSession();
  }, 1000);
};

const bootstrap = async () => {
  bindEvents();
  startTicker();

  try {
    await refreshState();
    setFeedback('Dashboard connected.');
  } catch (error) {
    setFeedback(error.message, true);
  }

  connectEvents();
};

void bootstrap();
