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

  function upsertRoom({ token, role }) {
    const list = read();
    const now = new Date().toISOString();
    const existing = list.find((r) => r.token === token);
    if (existing) {
      existing.role = role;
      existing.lastVisitedAt = now;
    } else {
      list.push({ token, role, createdAt: now, lastVisitedAt: now });
    }
    list.sort((a, b) => new Date(b.lastVisitedAt) - new Date(a.lastVisitedAt));
    write(list.slice(0, MAX_ROOMS));
  }

  window.TwmRooms = { getRooms, upsertRoom };
})();
