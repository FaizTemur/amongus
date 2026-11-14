// Among Us x Mafia Wars IRL - Netlify Function backend (storage: Netlify Blobs)
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

export const config = { path: '/api/*' };

const MAX = 170;
const USER = process.env.ADMIN_USER || 'Levi', PASS = process.env.ADMIN_PASS || 'Levi0321';
const SECRET = process.env.SECRET || crypto.createHash('sha256').update('amongus|' + PASS).digest('hex');
const DEADLINE = Date.UTC(2026, 10, 16, 18, 59, 59); // 16 Nov 2026 23:59:59 Pakistan time
const ST = ['pending', 'accepted', 'rejected'];
const store = () => globalThis.__STORE || getStore({ name: 'amongus', consistency: 'strong' });
const J = (o, c = 200, h = {}) => new Response(JSON.stringify(o), { status: c, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...h } });
const h = s => crypto.createHash('sha256').update(String(s || '')).digest();
const sign = e => crypto.createHmac('sha256', SECRET).update(String(e)).digest('hex');
const mkTok = () => { const e = Date.now() + 12 * 36e5; return e + '.' + sign(e); };
const okTok = t => { if (!t) return false; const [a, b] = String(t).split('.'); if (!a || !b || +a < Date.now()) return false; const x = Buffer.from(sign(a)), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const norm = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
const idOf = r => r.replace(/[^A-Z0-9]/g, '-');
const PR = { among: [350, 500], mafia: [350, 500], both: [700, 1000] }; // [early bird, regular]
const price = g => PR[g][Date.now() <= DEADLINE ? 0 : 1];
const tries = {};

async function find(S, id) { for (const s of ST) { const r = await S.get(s + '/' + id, { type: 'json' }); if (r) return r; } return null; }
async function keys(S, s) { return (await S.list({ prefix: s + '/' })).blobs.map(b => b.key); }
async function count(S) { const [a, b] = await Promise.all([keys(S, 'pending'), keys(S, 'accepted')]); return a.length + b.length; }

export default async (req) => {
  const u = new URL(req.url), p = u.pathname, m = req.method, S = store();
  const authed = () => okTok((req.headers.get('authorization') || '').replace('Bearer ', '') || u.searchParams.get('t'));
  try {
    if (m === 'GET' && p === '/api/info') {
      const n = await count(S);
      return J({ count: n, max: MAX, price: price('among'), both: price('both'), deadline: DEADLINE, full: n >= MAX }, 200, { 'Cache-Control': 'public, max-age=5' });
    }
    if (m === 'GET' && p === '/api/status') {
      const r = await find(S, idOf(norm(u.searchParams.get('roll'))));
      return r ? J({ status: r.status, name: r.name, game: r.game }) : J({ error: 'No registration found for that roll number.' }, 404);
    }
    if (m === 'POST' && p === '/api/register') {
      if (+req.headers.get('content-length') > 5e6) return J({ error: 'Image too large.' }, 413);
      const b = await req.json(), name = String(b.name || '').trim().slice(0, 80), roll = norm(b.roll).slice(0, 30), id = idOf(roll), game = String(b.game || '');
      const pr = String(b.proof || ''), i = pr.indexOf(','), mt = /^data:image\/(jpeg|png|webp);base64$/.exec(pr.slice(0, i));
      if (name.length < 3 || roll.length < 4 || !mt || !Object.hasOwn(PR, game)) return J({ error: 'Fill every field, pick a game and attach an image as payment proof.' }, 400);
      if (await count(S) >= MAX) return J({ error: 'SOLD OUT. All 170 seats are taken.' }, 409);
      const ex = await find(S, id);
      if (ex && ex.status !== 'rejected') return J({ error: 'This roll number is already registered.' }, 409);
      const buf = Buffer.from(pr.slice(i + 1), 'base64');
      if (buf.length < 500 || buf.length > 4.5e6) return J({ error: 'Proof image is invalid or too large.' }, 400);
      if (ex) await S.delete('rejected/' + id);
      await S.set('p/' + id, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const rec = { id, name, roll, price: price(game), game, status: 'pending', at: Date.now(), type: mt[1] };
      await S.setJSON('pending/' + id, rec);
      // race guard: if simultaneous signups overshot the cap, the latest ones lose
      const n = await count(S);
      if (n > MAX) {
        const all = [...await keys(S, 'pending'), ...await keys(S, 'accepted')];
        const recs = (await Promise.all(all.map(k => S.get(k, { type: 'json' })))).filter(Boolean).sort((a, c) => a.at - c.at || a.id.localeCompare(c.id));
        if (recs.findIndex(r => r.id === id) >= MAX) { await S.delete('pending/' + id); return J({ error: 'SOLD OUT. All 170 seats are taken.' }, 409); }
      }
      return J({ ok: true, id, price: rec.price, game, count: Math.min(n, MAX) });
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
        const regs = (await Promise.all(all.map(k => S.get(k, { type: 'json' })))).filter(Boolean).map(({ id, name, roll, price, game, status, at }) => ({ id, name, roll, price, game, status, at })).sort((a, c) => c.at - a.at);
        return J({ max: MAX, regs });
      }
      if (m === 'POST' && p === '/api/admin/set') {
        const b = await req.json(), r = typeof b.id === 'string' ? await find(S, b.id) : null;
        if (!r || !ST.includes(b.status)) return J({ error: 'Bad request' }, 400);
        if (r.status !== b.status) {
          if (b.status !== 'rejected' && r.status === 'rejected' && await count(S) >= MAX) return J({ error: 'All 170 seats are taken.' }, 409);
          await S.setJSON(b.status + '/' + r.id, { ...r, status: b.status });
          await S.delete(r.status + '/' + r.id);
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
