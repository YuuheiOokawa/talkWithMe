(() => {
  const MAX_CHARS = 10000;
  const MAX_BYTES = 20000;

  const inviteToken = location.pathname.split('/').pop();
  const storeKey = 'twm:' + inviteToken;

  const el = {
    inviteBar: document.getElementById('inviteBar'),
    inviteLink: document.getElementById('inviteLink'),
    copyBtn: document.getElementById('copyBtn'),
    partnerStatus: document.getElementById('partnerStatus'),
    connStatus: document.getElementById('connStatus'),
    partnerMessages: document.getElementById('partnerMessages'),
    selfMessages: document.getElementById('selfMessages'),
    input: document.getElementById('input'),
    counter: document.getElementById('counter'),
    sendBtn: document.getElementById('sendBtn'),
    imageInput: document.getElementById('imageInput'),
    errorBar: document.getElementById('errorBar'),
    lightbox: document.getElementById('lightbox'),
    lightboxImg: document.getElementById('lightboxImg'),
  };

  const POLL_INTERVAL_MS = 2000;

  let me = null; // {userToken, participantId, role}
  let hasPartner = false;
  let connected = false;
  let lastMessageId = 0;
  let polling = false;
  const renderedIds = new Set();
  const encoder = new TextEncoder();

  // ---- 参加処理 ----
  async function join() {
    const saved = localStorage.getItem(storeKey);
    const body = saved ? { userToken: JSON.parse(saved).userToken } : {};
    const res = await fetch(`/api/rooms/${inviteToken}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      document.body.innerHTML =
        `<div class="landing"><h1>参加できません</h1><p class="tagline">${data.error}</p></div>`;
      throw new Error(data.error);
    }
    me = { userToken: data.userToken, participantId: data.participantId, role: data.role };
    localStorage.setItem(storeKey, JSON.stringify(me));
  }

  // ---- メッセージ描画 ----
  function renderMessage(m) {
    if (renderedIds.has(m.id)) return;
    renderedIds.add(m.id);
    const mine = m.participantId === me.participantId;
    if (!mine) hasPartner = true;
    const container = mine ? el.selfMessages : el.partnerMessages;

    const div = document.createElement('div');
    div.className = 'msg';
    if (m.type === 'text') {
      const p = document.createElement('p');
      p.className = 'msg-body';
      p.textContent = m.body;
      div.appendChild(p);
    } else {
      const img = document.createElement('img');
      img.className = 'msg-image';
      img.loading = 'lazy';
      img.src = `${m.imageUrl}?user=${encodeURIComponent(me.userToken)}`;
      img.addEventListener('click', () => {
        el.lightboxImg.src = img.src;
        el.lightbox.classList.remove('hidden');
      });
      div.appendChild(img);
    }
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = new Date(m.createdAt + (m.createdAt.endsWith('Z') ? '' : 'Z'))
      .toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    div.appendChild(time);

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  async function fetchMessages(since) {
    const res = await fetch(
      `/api/rooms/${inviteToken}/messages?since=${since}&user=${encodeURIComponent(me.userToken)}`
    );
    if (!res.ok) throw new Error('poll failed');
    return res.json();
  }

  async function loadHistory() {
    const data = await fetchMessages(0);
    data.messages.forEach(renderMessage);
    if (data.messages.length > 0) {
      lastMessageId = Math.max(...data.messages.map((m) => m.id));
    }
    setPartnerStatus(data.partnerOnline);
    if (data.partnerJoined) hasPartner = true;
    updateInviteBar();
  }

  // ---- ポーリング ----
  function startPolling() {
    setConn(true);
    setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const data = await fetchMessages(lastMessageId);
        setConn(true);
        data.messages.forEach(renderMessage);
        if (data.messages.length > 0) {
          lastMessageId = Math.max(lastMessageId, ...data.messages.map((m) => m.id));
        }
        setPartnerStatus(data.partnerOnline);
        if (data.partnerJoined) hasPartner = true;
        updateInviteBar();
      } catch {
        setConn(false);
        setPartnerStatus(false);
      } finally {
        polling = false;
      }
    }, POLL_INTERVAL_MS);
  }

  function setConn(ok) {
    connected = ok;
    el.connStatus.textContent = ok ? 'オンライン' : '再接続中...';
    el.connStatus.className = 'status ' + (ok ? 'status-on' : 'status-off');
    updateSendState();
  }

  function setPartnerStatus(online) {
    el.partnerStatus.textContent = online ? 'オンライン' : 'オフライン';
    el.partnerStatus.className = 'status ' + (online ? 'status-on' : 'status-off');
  }

  function updateInviteBar() {
    // 相手がまだ一度も現れていないホストにだけ招待リンクを表示
    const show = me.role === 'host' && !hasPartner;
    el.inviteBar.classList.toggle('hidden', !show);
    if (show) el.inviteLink.value = location.href;
  }

  // ---- 入力・送信 ----
  function counts() {
    const v = el.input.value;
    return { chars: [...v].length, bytes: encoder.encode(v).length };
  }

  function updateSendState() {
    const { chars, bytes } = counts();
    const over = chars > MAX_CHARS || bytes > MAX_BYTES;
    el.counter.innerHTML = `${chars} / ${MAX_CHARS}文字<br>${bytes} / ${MAX_BYTES}バイト`;
    el.counter.classList.toggle('over', over);
    el.sendBtn.disabled = over || el.input.value.trim().length === 0 || !connected;
  }

  async function sendText() {
    if (el.sendBtn.disabled) return;
    const body = el.input.value;
    el.input.value = '';
    updateSendState();
    el.input.focus();
    try {
      const res = await fetch(`/api/rooms/${inviteToken}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Token': me.userToken },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || '送信に失敗しました');
        return;
      }
      renderMessage(data.message);
      lastMessageId = Math.max(lastMessageId, data.message.id);
    } catch (e) {
      showError('送信に失敗しました: ' + e.message);
    }
  }

  async function sendImage(file) {
    if (!file) return;
    try {
      const res = await fetch(`/api/rooms/${inviteToken}/images`, {
        method: 'POST',
        headers: { 'Content-Type': file.type, 'X-User-Token': me.userToken },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || '画像の送信に失敗しました');
      } else {
        renderMessage(data.message);
        lastMessageId = Math.max(lastMessageId, data.message.id);
      }
    } catch (e) {
      showError('画像の送信に失敗しました: ' + e.message);
    } finally {
      el.imageInput.value = '';
    }
  }

  let errorTimer = null;
  function showError(text) {
    el.errorBar.textContent = text;
    el.errorBar.classList.remove('hidden');
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => el.errorBar.classList.add('hidden'), 5000);
  }

  // ---- イベント ----
  el.input.addEventListener('input', updateSendState);
  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendText();
    }
  });
  el.sendBtn.addEventListener('click', sendText);
  el.imageInput.addEventListener('change', () => sendImage(el.imageInput.files[0]));
  el.copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el.inviteLink.value);
      el.copyBtn.textContent = 'コピーしました';
      setTimeout(() => (el.copyBtn.textContent = 'コピー'), 2000);
    } catch {
      el.inviteLink.select();
      document.execCommand('copy');
    }
  });
  el.lightbox.addEventListener('click', () => el.lightbox.classList.add('hidden'));

  // ---- 起動 ----
  (async () => {
    await join();
    await loadHistory();
    startPolling();
    updateSendState();
  })();
})();
