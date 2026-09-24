/**
 * Thin WebSocket wrapper with a tiny pub/sub layer keyed by message "type",
 * so the rest of the app can do `net.on('room_update', fn)` instead of
 * parsing every incoming frame itself.
 */
class ScoreItNetwork {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.ready = null;
  }

  connect() {
    if (this.ready) return this.ready;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws`;

    this.ready = new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', reject);
      this.ws.addEventListener('message', (evt) => {
        let data;
        try { data = JSON.parse(evt.data); } catch { return; }
        const list = this.handlers.get(data.type);
        if (list) list.forEach((fn) => fn(data));
      });
      this.ws.addEventListener('close', () => {
        this.ready = null;
        const list = this.handlers.get('__close');
        if (list) list.forEach((fn) => fn());
      });
    });
    return this.ready;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  async send(message) {
    await this.connect();
    this.ws.send(JSON.stringify(message));
  }
}

const net = new ScoreItNetwork();
