(() => {
  const KEY = 'twm:rooms';
  const MAX_ROOMS = 30;

  function read() {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function write(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  function getRooms() {
    return read().sort((a, b) => new Date(b.lastVisitedAt) - new Date(a.lastVisitedAt));
  }

  function upsertRoom({ token, role, name }) {
    const list = read();
    const now = new Date().toISOString();
    const existing = list.find((r) => r.token === token);
    if (existing) {
      existing.role = role;
      existing.name = name || existing.name;
      existing.lastVisitedAt = now;
    } else {
      list.push({ token, role, name: name || null, createdAt: now, lastVisitedAt: now, lastReadId: 0 });
    }
    list.sort((a, b) => new Date(b.lastVisitedAt) - new Date(a.lastVisitedAt));
    write(list.slice(0, MAX_ROOMS));
  }

  // 既読位置を更新(ルーム画面で新着を見た時に呼ぶ)。トップページの未読バッジ算出に使う
  function markRead(token, messageId) {
    if (!messageId) return;
    const list = read();
    const existing = list.find((r) => r.token === token);
    if (!existing) return;
    existing.lastReadId = Math.max(existing.lastReadId || 0, messageId);
    write(list);
  }

  window.TwmRooms = { getRooms, upsertRoom, markRead };
})();
