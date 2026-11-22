// Among Us x Mafia Wars IRL - Netlify Function backend (storage: Netlify Blobs)
// Participants: "both" counts once in Among Us AND once in Mafia Wars (= 2 participants).
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

export const config = { path: '/api/*' };

const MAX = 170, LIM = { among: 95, mafia: 75 };
const USER = process.env.ADMIN_USER || 'Levi', PASS = process.env.ADMIN_PASS || 'Levi0321';
const SECRET = process.env.SECRET || crypto.createHash('sha256').update('amongus|' + PASS).digest('hex');
const DEADLINE = Date.UTC(2026, 10, 16, 18, 59, 59); // 16 Nov 2026 23:59:59 Pakistan time
const PR = { among: [350, 500], mafia: [350, 500], both: [700, 1000] }; // [early bird, regular]
const ST = ['pending', 'accepted', 'rejected'], GAMES = ['among', 'mafia', 'both'];
const store = () => globalThis.__STORE || getStore({ name: 'amongus', consistency: 'strong' });
const J = (o, c = 200, h = {}) => new Response(JSON.stringify(o), { status: c, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...h } });
const h = s => crypto.createHash('sha256').update(String(s || '')).digest();
const sign = e => crypto.createHmac('sha256', SECRET).update(String(e)).digest('hex');
const mkTok = () => { const e = Date.now() + 12 * 36e5; return e + '.' + sign(e); };
const okTok = t => { if (!t) return false; const [a, b] = String(t).split('.'); if (!a || !b || +a < Date.now()) return false; const x = Buffer.from(sign(a)), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const norm = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
const normPhone = s => { const m = /^(?:\+?92|0)(3\d{9})$/.exec(String(s || '').replace(/[\s\-()]/g, '')); return m ? '0' + m[1] : ''; };
const idOf = r => r.replace(/[^A-Z0-9]/g, '-');
const price = g => PR[g][Date.now() <= DEADLINE ? 0 : 1];
const kk = (s, g, id) => s + '/' + g + '/' + id;
const tries = {};

async function find(S, id) { const r = await Promise.all(ST.flatMap(s => GAMES.map(g => S.get(kk(s, g, id), { type: 'json' })))); return r.find(Boolean) || null; }
async function keys(S, s) { return (await S.list({ prefix: s + '/' })).blobs.map(b => b.key); }
async function counts(S) {
  const k = (await Promise.all(['pending', 'accepted'].map(s => keys(S, s)))).flat();
  let a = 0, m = 0; k.forEach(x => { const g = x.split('/')[1]; if (g !== 'mafia') a++; if (g !== 'among') m++; });
  return { among: a, mafia: m, keys: k };
}
// One-time, automatic: moves records saved by older versions (status/id) to the new layout (status/game/id).
let mig;
const migrate = S => mig || (mig = (async () => {
  for (const s of ST) for (const k of await keys(S, s)) {
    if (k.split('/').length !== 2) continue;
    const r = await S.get(k, { type: 'json' }); if (!r) continue;
    r.game = GAMES.includes(r.game) ? r.game : 'among';
    await S.setJSON(kk(s, r.game, r.id), r); await S.delete(k);
  }
})().catch(() => { mig = null; }));
const fullMsg = (c, g) => {
  const a = g !== 'mafia' && c.among >= LIM.among, m = g !== 'among' && c.mafia >= LIM.mafia;
  if (a && m) return 'Both games are sold out.';
  if (a) return g === 'both' ? 'Among Us is sold out (' + LIM.among + '/' + LIM.among + '). You can still pick Mafia Wars only.' : 'Among Us is sold out (' + LIM.among + '/' + LIM.among + ').';
  if (m) return g === 'both' ? 'Mafia Wars is sold out (' + LIM.mafia + '/' + LIM.mafia + '). You can still pick Among Us only.' : 'Mafia Wars is sold out (' + LIM.mafia + '/' + LIM.mafia + ').';
  return '';
};

export default async (req) => {
  const u = new URL(req.url), p = u.pathname, m = req.method, S = store();
  const authed = () => okTok((req.headers.get('authorization') || '').replace('Bearer ', '') || u.searchParams.get('t'));
  try {
    await migrate(S);
    if (m === 'GET' && p === '/api/info') {
      const c = await counts(S), af = c.among >= LIM.among, mf = c.mafia >= LIM.mafia;
      return J({ count: c.among + c.mafia, max: MAX, among: c.among, mafia: c.mafia, amongMax: LIM.among, mafiaMax: LIM.mafia, amongFull: af, mafiaFull: mf,
        price: price('among'), both: price('both'), deadline: DEADLINE, full: af && mf }, 200, { 'Cache-Control': 'public, max-age=5' });
    }
    if (m === 'GET' && p === '/api/status') {
      const r = await find(S, idOf(norm(u.searchParams.get('roll'))));
      return r ? J({ status: r.status, name: r.name, game: r.game }) : J({ error: 'No registration found for that roll number.' }, 404);
    }
    if (m === 'POST' && p === '/api/register') {
      if (+req.headers.get('content-length') > 5e6) return J({ error: 'Image too large.' }, 413);
      const b = await req.json(), name = String(b.name || '').trim().slice(0, 80), roll = norm(b.roll).slice(0, 30), id = idOf(roll), game = String(b.game || ''), phone = normPhone(b.phone);
      if (!phone) return J({ error: 'Enter a valid Pakistani mobile number, e.g. 0300 1234567.' }, 400);
      const pr = String(b.proof || ''), i = pr.indexOf(','), mt = /^data:image\/(jpeg|png|webp);base64$/.exec(pr.slice(0, i));
      if (name.length < 3 || roll.length < 4 || !mt || !Object.hasOwn(PR, game)) return J({ error: 'Fill every field, pick a game and attach an image as payment proof.' }, 400);
      const fm = fullMsg(await counts(S), game); if (fm) return J({ error: fm }, 409);
      const ex = await find(S, id);
      if (ex && ex.status !== 'rejected') return J({ error: 'This roll number is already registered.' }, 409);
      const buf = Buffer.from(pr.slice(i + 1), 'base64');
      if (buf.length < 500 || buf.length > 4.5e6) return J({ error: 'Proof image is invalid or too large.' }, 400);
      if (ex) await S.delete(kk('rejected', ex.game, id));
      await S.set('p/' + id, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const rec = { id, name, roll, phone, price: price(game), game, status: 'pending', at: Date.now(), type: mt[1] };
      await S.setJSON(kk('pending', game, id), rec);
      // race guard: if simultaneous signups overshot a game's cap, the latest ones lose
      const c2 = await counts(S);
      for (const g of ['among', 'mafia']) {
        if ((g === 'among' ? game === 'mafia' : game === 'among') || c2[g] <= LIM[g]) continue;
        const ks = c2.keys.filter(x => { const kg = x.split('/')[1]; return kg === g || kg === 'both'; });
        const recs = (await Promise.all(ks.map(x => S.get(x, { type: 'json' })))).filter(Boolean).sort((a, c) => a.at - c.at || a.id.localeCompare(c.id));
        if (recs.findIndex(r => r.id === id) >= LIM[g]) { await S.delete(kk('pending', game, id)); return J({ error: (g === 'among' ? 'Among Us' : 'Mafia Wars') + ' just sold out. Sorry!' }, 409); }
      }
      return J({ ok: true, id, price: rec.price, game, count: c2.among + c2.mafia });
    }
    if (m === 'POST' && p === '/api/admin/login') {
      const ip = req.headers.get('x-nf-client-connection-ip') || 'x', t = tries[ip] = (tries[ip] || []).filter(x => x > Date.now() - 6e4);
      if (t.length >= 6) return J({ error: 'Too many attempts. Wait a minute.' }, 429);
      const b = await req.json();
      if (!(crypto.timingSafeEqual(h(b.user), h(USER)) & crypto.timingSafeEqual(h(b.pass), h(PASS)))) { t.push(Date.now()); return J({ error: 'Wrong credentials.' }, 401); }
      return J({ token: mkTok() });
    }
    if (p.startsWith('/api/admin/')) {
      if (!authed()) return J({ error: 'Not logged in.' }, 401);
      if (m === 'GET' && p === '/api/admin/regs') {
        const all = (await Promise.all(ST.map(s => keys(S, s)))).flat();
        const regs = (await Promise.all(all.map(k => S.get(k, { type: 'json' })))).filter(Boolean).map(({ id, name, roll, phone, price, game, status, at }) => ({ id, name, roll, phone, price, game, status, at })).sort((a, c) => c.at - a.at);
        return J({ max: MAX, regs });
      }
      if (m === 'POST' && p === '/api/admin/set') {
        const b = await req.json(), r = typeof b.id === 'string' ? await find(S, b.id) : null;
        if (!r || !ST.includes(b.status)) return J({ error: 'Bad request' }, 400);
        if (r.status !== b.status) {
          if (b.status !== 'rejected' && r.status === 'rejected') { const fm = fullMsg(await counts(S), r.game); if (fm) return J({ error: fm }, 409); }
          await S.setJSON(kk(b.status, r.game, r.id), { ...r, status: b.status });
          await S.delete(kk(r.status, r.game, r.id));
        }
        return J({ ok: true });
      }
      if (m === 'GET' && p.startsWith('/api/admin/proof/')) {
        const id = decodeURIComponent(p.split('/').pop()), r = await find(S, id), buf = r && await S.get('p/' + id, { type: 'arrayBuffer' });
        return buf ? new Response(buf, { headers: { 'Content-Type': 'image/' + (r.type || 'jpeg'), 'Cache-Control': 'private, no-store' } }) : J({ error: 'None' }, 404);
      }
    }
    return J({ error: 'Not found' }, 404);
  } catch (e) { return J({ error: 'Bad request' }, 400); }
};
