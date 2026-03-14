const DEFAULT_SOUND_CONFIG = {
  volume: 1,
  weight: 1,
  enabled: true,
  minInterval: null,
  maxInterval: null,
};

const state = {
  config: null,
  session: null,
  sounds: [],
  soundFilter: 'all',
  expandedSounds: new Set(),
  eventSource: null,
  reconnectTimer: null,
  volumeDebounceTimer: null,
  soundPatchTimers: new Map(),
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
  soundCount: document.querySelector('#sound-count'),
  soundFilter: document.querySelector('#sound-filter'),
  soundsList: document.querySelector('#sounds-list'),
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

const formatPercent = (value) => {
  return `${Math.round(value * 100)}%`;
};

const formatWeight = (value) => {
  return `${value.toFixed(2)}x`;
};

const isCustomizedSound = (sound) => {
  return (
    sound.config.volume !== DEFAULT_SOUND_CONFIG.volume ||
    sound.config.weight !== DEFAULT_SOUND_CONFIG.weight ||
    sound.config.enabled !== DEFAULT_SOUND_CONFIG.enabled ||
    sound.config.minInterval !== null && sound.config.minInterval !== undefined ||
    sound.config.maxInterval !== null && sound.config.maxInterval !== undefined
  );
};

const getCategoryOptions = () => {
  const categories = [...new Set(state.sounds.map((sound) => sound.category))].sort();
  return [
    { value: 'all', label: 'All Sounds' },
    ...categories.map((category) => ({
      value: `category:${category}`,
      label: `Category: ${category}`,
    })),
    { value: 'customized', label: 'Only Customized' },
    { value: 'disabled', label: 'Only Disabled' },
  ];
};

const getVisibleSounds = () => {
  if (state.soundFilter === 'customized') {
    return state.sounds.filter(isCustomizedSound);
  }

  if (state.soundFilter === 'disabled') {
    return state.sounds.filter((sound) => !sound.config.enabled);
  }

  if (state.soundFilter.startsWith('category:')) {
    const category = state.soundFilter.split(':', 2)[1];
    return state.sounds.filter((sound) => sound.category === category);
  }

  return state.sounds;
};

const weightToSliderValue = (weight) => {
  return Math.round(((Math.log10(weight) + 1) / 2) * 100);
};

const sliderValueToWeight = (sliderValue) => {
  const normalized = Number(sliderValue) / 100;
  return Number((10 ** (normalized * 2 - 1)).toFixed(2));
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
  elements.volumeValue.textContent = formatPercent(volume);

  const controlsDisabled = !session?.active;
  elements.startButton.disabled = controlsDisabled || session?.isPlaying === true;
  elements.stopButton.disabled = controlsDisabled || session?.isPlaying !== true;
  elements.leaveButton.disabled = controlsDisabled;
  elements.masterVolume.disabled = controlsDisabled;

  renderRecentPlays();
};

const renderSoundFilter = () => {
  const options = getCategoryOptions();
  elements.soundFilter.innerHTML = '';

  for (const option of options) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    element.selected = option.value === state.soundFilter;
    elements.soundFilter.appendChild(element);
  }
};

const renderSounds = () => {
  renderSoundFilter();

  elements.soundCount.textContent = `(${state.sounds.length})`;
  elements.soundsList.innerHTML = '';
  const visibleSounds = getVisibleSounds();

  if (visibleSounds.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No sounds match the current filter.';
    elements.soundsList.appendChild(empty);
    return;
  }

  for (const sound of visibleSounds) {
    const row = document.createElement('article');
    row.className = 'sound-row';
    const detailsOpen = state.expandedSounds.has(sound.name);
    const detailsButtonLabel = isCustomizedSound(sound) ? '⚙' : '⋯';

    row.innerHTML = `
      <div class="sound-main">
        <input class="sound-enabled" type="checkbox" ${sound.config.enabled ? 'checked' : ''} />
        <div class="sound-meta">
          <div class="sound-name">${sound.name}</div>
          <div class="sound-subline">
            <span class="sound-badge">${sound.category}</span>
            <span>${sound.lastPlayed ? `Last played ${formatRelativeTime(sound.lastPlayed)}` : 'Not played yet'}</span>
          </div>
        </div>
        <div class="sound-control">
          <label>Volume</label>
          <input class="sound-volume" type="range" min="0" max="2" step="0.05" value="${sound.config.volume}" />
          <strong>${formatPercent(sound.config.volume)}</strong>
        </div>
        <div class="sound-control">
          <label>Weight</label>
          <input class="sound-weight" type="range" min="0" max="100" step="1" value="${weightToSliderValue(sound.config.weight)}" />
          <strong>${formatWeight(sound.config.weight)}</strong>
        </div>
        <button class="icon-button sound-play" title="Play now">▶</button>
        <button class="icon-button sound-details ${detailsOpen ? 'active' : ''}" title="Toggle details">${detailsButtonLabel}</button>
      </div>
      <div class="detail-row ${detailsOpen ? 'open' : ''}">
        <div class="detail-grid">
          <label class="detail-field">
            <span>Min Interval Override</span>
            <input class="sound-min-interval" type="number" min="1" step="1" placeholder="Guild default" value="${sound.config.minInterval ?? ''}" />
          </label>
          <label class="detail-field">
            <span>Max Interval Override</span>
            <input class="sound-max-interval" type="number" min="1" step="1" placeholder="Guild default" value="${sound.config.maxInterval ?? ''}" />
          </label>
          <button class="sound-reset">Reset Defaults</button>
        </div>
      </div>
    `;

    const enabledCheckbox = row.querySelector('.sound-enabled');
    const playButton = row.querySelector('.sound-play');
    const detailButton = row.querySelector('.sound-details');
    const volumeSlider = row.querySelector('.sound-volume');
    const weightSlider = row.querySelector('.sound-weight');
    const volumeLabel = volumeSlider.nextElementSibling;
    const weightLabel = weightSlider.nextElementSibling;
    const minIntervalInput = row.querySelector('.sound-min-interval');
    const maxIntervalInput = row.querySelector('.sound-max-interval');
    const resetButton = row.querySelector('.sound-reset');

    enabledCheckbox.addEventListener('change', () => {
      void patchSound(sound.name, { enabled: enabledCheckbox.checked }, true);
    });

    playButton.addEventListener('click', () => {
      void playSound(sound.name);
    });

    detailButton.addEventListener('click', () => {
      if (detailsOpen) {
        state.expandedSounds.delete(sound.name);
      } else {
        state.expandedSounds.add(sound.name);
      }
      renderSounds();
    });

    volumeSlider.addEventListener('input', () => {
      const nextValue = Number(volumeSlider.value);
      volumeLabel.textContent = formatPercent(nextValue);
      queueSoundPatch(sound.name, { volume: nextValue });
    });

    weightSlider.addEventListener('input', () => {
      const nextValue = sliderValueToWeight(weightSlider.value);
      weightLabel.textContent = formatWeight(nextValue);
      queueSoundPatch(sound.name, { weight: nextValue });
    });

    const commitIntervals = () => {
      const minInterval = minIntervalInput.value === '' ? null : Number(minIntervalInput.value);
      const maxInterval = maxIntervalInput.value === '' ? null : Number(maxIntervalInput.value);
      void patchSound(sound.name, {
        minInterval,
        maxInterval,
      }, true);
    };

    minIntervalInput.addEventListener('change', commitIntervals);
    maxIntervalInput.addEventListener('change', commitIntervals);
    resetButton.addEventListener('click', () => {
      minIntervalInput.value = '';
      maxIntervalInput.value = '';
      void patchSound(
        sound.name,
        {
          volume: 1,
          weight: 1,
          enabled: true,
          minInterval: null,
          maxInterval: null,
        },
        true,
      );
    });

    elements.soundsList.appendChild(row);
  }
};

const updateSession = (session) => {
  state.session = session;
  renderSession();
};

const updateConfig = (config) => {
  state.config = config;
  renderSession();
};

const updateSounds = (sounds) => {
  state.sounds = sounds;
  renderSounds();
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

    if (state.session) {
      const nextRecentPlays = [payload, ...(state.session.recentPlays ?? [])].slice(0, 10);
      updateSession({
        ...state.session,
        nowPlaying: payload,
        recentPlays: nextRecentPlays,
      });
    }

    updateSounds(
      state.sounds.map((sound) => {
        return sound.name === payload.name
          ? { ...sound, lastPlayed: payload.timestamp }
          : sound;
      }),
    );
  });

  eventSource.onerror = () => {
    setConnectionStatus('reconnecting');
    eventSource.close();
    scheduleReconnect();
  };
};

const refreshState = async () => {
  const [session, config, soundsPayload] = await Promise.all([
    fetchJson('/api/session'),
    fetchJson('/api/config'),
    fetchJson('/api/sounds'),
  ]);
  updateSession(session);
  updateConfig(config);
  updateSounds(soundsPayload.sounds);
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

const queueSoundPatch = (soundName, patch) => {
  const timerKey = `sound:${soundName}`;
  const existingTimer = state.soundPatchTimers.get(timerKey);
  if (existingTimer !== undefined) {
    clearTimeout(existingTimer);
  }

  const timerId = window.setTimeout(() => {
    state.soundPatchTimers.delete(timerKey);
    void patchSound(soundName, patch, false);
  }, 400);
  state.soundPatchTimers.set(timerKey, timerId);

  updateSounds(
    state.sounds.map((sound) => {
      return sound.name === soundName
        ? {
            ...sound,
            config: {
              ...sound.config,
              ...patch,
            },
          }
        : sound;
    }),
  );
};

const patchSound = async (soundName, patch, showFeedback) => {
  try {
    const result = await fetchJson(`/api/sounds/${encodeURIComponent(soundName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });

    updateSounds(
      state.sounds.map((sound) => {
        return sound.name === soundName
          ? {
              ...sound,
              config: result.config,
            }
          : sound;
      }),
    );

    if (showFeedback) {
      setFeedback(`Updated ${soundName}.`);
    }
  } catch (error) {
    setFeedback(error.message, true);
    await refreshState();
  }
};

const playSound = async (soundName) => {
  try {
    await fetchJson(`/api/sounds/${encodeURIComponent(soundName)}/play`, {
      method: 'POST',
    });
    setFeedback(`Playing ${soundName}.`);
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

  elements.soundFilter.addEventListener('change', () => {
    state.soundFilter = elements.soundFilter.value;
    renderSounds();
  });

  elements.masterVolume.addEventListener('input', (event) => {
    const nextValue = Number(event.target.value);
    elements.volumeValue.textContent = formatPercent(nextValue);

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
