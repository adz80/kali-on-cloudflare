(function() {
  'use strict';

  let currentSessionId = null;

  const elements = {
    btnCreate: document.getElementById('btn-create'),
    btnStart: document.getElementById('btn-start'),
    btnStop: document.getElementById('btn-stop'),
    btnDestroy: document.getElementById('btn-destroy'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnFullscreen: document.getElementById('btn-fullscreen'),
    sessionStatus: document.getElementById('session-status'),
    desktopContainer: document.getElementById('desktop-container'),
    vncFrame: document.getElementById('vnc-frame'),
    connectionStatus: document.getElementById('connection-status'),
    sessionsTableBody: document.querySelector('#sessions-table tbody'),
    userInfo: document.getElementById('user-info'),
  };

  async function apiRequest(method, path, body = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Request failed');
    }
    return response.json();
  }

  async function createSession() {
    try {
      setLoading(true);
      const result = await apiRequest('POST', '/api/sessions');
      currentSessionId = result.sessionId;
      updateStatus(`Session created: ${currentSessionId}`);
      updateButtons('created');
      await refreshSessions();
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function startSession() {
    if (!currentSessionId) return;
    try {
      setLoading(true);
      await apiRequest('POST', `/api/sessions/${currentSessionId}/start`);
      updateStatus(`Session starting: ${currentSessionId}`);
      updateButtons('starting');
      
      // Poll for running status
      await pollSessionStatus();
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function pollSessionStatus() {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const status = await apiRequest('GET', `/api/sessions/${currentSessionId}`);
        if (status.status === 'running') {
          updateStatus(`Session running: ${currentSessionId}`);
          updateButtons('running');
          connectDesktop();
          await refreshSessions();
          return;
        } else if (status.status === 'error') {
          throw new Error(status.errorMessage || 'Session failed to start');
        }
      } catch (err) {
        if (i === maxAttempts - 1) throw err;
      }
    }
    throw new Error('Session start timeout');
  }

  async function stopSession() {
    if (!currentSessionId) return;
    try {
      setLoading(true);
      disconnectDesktop();
      await apiRequest('POST', `/api/sessions/${currentSessionId}/stop`);
      updateStatus(`Session stopped: ${currentSessionId}`);
      updateButtons('stopped');
      hideDesktop();
      await refreshSessions();
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function destroySession() {
    if (!currentSessionId) return;
    if (!confirm('Are you sure you want to destroy this session?')) return;
    try {
      setLoading(true);
      disconnectDesktop();
      await apiRequest('DELETE', `/api/sessions/${currentSessionId}`);
      updateStatus('Session destroyed');
      currentSessionId = null;
      updateButtons(null);
      hideDesktop();
      await refreshSessions();
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshSessions() {
    try {
      const result = await apiRequest('GET', '/api/sessions');
      renderSessionsTable(result.sessions || []);
    } catch (err) {
      console.error('Failed to refresh sessions:', err);
    }
  }

  function renderSessionsTable(sessions) {
    elements.sessionsTableBody.innerHTML = '';
    if (sessions.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="5" style="text-align: center; color: var(--text-secondary);">No sessions</td>';
      elements.sessionsTableBody.appendChild(row);
      return;
    }

    sessions.forEach(session => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><code>${session.sessionId.substring(0, 8)}...</code></td>
        <td><span class="status-badge status-${session.status}">${session.status}</span></td>
        <td>${formatDate(session.createdAt)}</td>
        <td>${formatDate(session.lastSeen)}</td>
        <td>
          <button class="btn table-btn" onclick="window.selectSession('${session.sessionId}')">Select</button>
        </td>
      `;
      elements.sessionsTableBody.appendChild(row);
    });
  }

  window.selectSession = async function(sessionId) {
    currentSessionId = sessionId;
    try {
      const status = await apiRequest('GET', `/api/sessions/${sessionId}`);
      updateStatus(`Selected session: ${sessionId} (${status.status})`);
      updateButtons(status.status);
      
      if (status.status === 'running') {
        connectDesktop();
      } else {
        hideDesktop();
      }
    } catch (err) {
      showError(err.message);
    }
  };

  function connectDesktop() {
    const vncUrl = `/session/${currentSessionId}/vnc/vnc.html?autoconnect=true&resize=scale`;
    elements.vncFrame.src = vncUrl;
    elements.connectionStatus.textContent = 'Connecting...';
    
    elements.vncFrame.onload = () => {
      elements.connectionStatus.textContent = 'Connected';
    };
    
    showDesktop();
  }

  function disconnectDesktop() {
    elements.vncFrame.src = '';
    elements.connectionStatus.textContent = 'Disconnected';
  }

  function showDesktop() {
    elements.desktopContainer.classList.remove('hidden');
  }

  function hideDesktop() {
    elements.desktopContainer.classList.add('hidden');
  }

  function toggleFullscreen() {
    const container = elements.desktopContainer;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }

  function updateStatus(message) {
    elements.sessionStatus.textContent = message;
    elements.sessionStatus.classList.remove('error-message');
  }

  function showError(message) {
    elements.sessionStatus.textContent = `Error: ${message}`;
    elements.sessionStatus.classList.add('error-message');
  }

  function updateButtons(status) {
    elements.btnCreate.disabled = !!currentSessionId;
    elements.btnStart.disabled = !currentSessionId || status === 'running' || status === 'starting';
    elements.btnStop.disabled = !currentSessionId || status !== 'running';
    elements.btnDestroy.disabled = !currentSessionId;
  }

  function setLoading(loading) {
    document.body.classList.toggle('loading', loading);
  }

  function formatDate(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString();
  }

  function init() {
    elements.btnCreate.addEventListener('click', createSession);
    elements.btnStart.addEventListener('click', startSession);
    elements.btnStop.addEventListener('click', stopSession);
    elements.btnDestroy.addEventListener('click', destroySession);
    elements.btnRefresh.addEventListener('click', refreshSessions);
    elements.btnFullscreen.addEventListener('click', toggleFullscreen);

    refreshSessions();
    updateButtons(null);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
