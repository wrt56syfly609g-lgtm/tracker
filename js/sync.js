// Синхронизация через приватный репозиторий GitHub.
// Данные сжимаются и шифруются на устройстве (AES-256-GCM, ключ из пароля через PBKDF2).
// В репозитории лежит только зашифрованный файл data.enc. Пароль никуда не отправляется.
import { S, COLS, merge, same, replace, kvGet, kvSet, kvDel, setSyncHook } from './store.js';

const API = 'https://api.github.com', FILE = 'data.enc', ITER = 310000;
export const st = { on: false, state: 'off', msg: '', last: null, repo: '' };
let cfg = null, key = null, token = null, timer = null, busy = false, again = false;
const subs = new Set();
export const onStatus = f => subs.add(f);
const set = (state, msg = '') => { st.state = state; st.msg = msg; subs.forEach(f => f()); };

const te = new TextEncoder(), td = new TextDecoder();
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0));
const b64url = s => b64(te.encode(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => td.decode(unb64(s.replace(/-/g, '+').replace(/_/g, '/')));

async function derive(pass, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(k, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: b64(iv), ct: b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, bytes))) };
}
const unseal = async (k, o) => new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, k, unb64(o.ct)));
const gz = async str => new Uint8Array(await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const ungz = async u8 => new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).text();

async function gh(method, path, body, tk = token) {
  let r;
  try {
    r = await fetch(API + path, {
      method, cache: 'no-store', body: body ? JSON.stringify(body) : undefined,
      headers: { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
  } catch { const e = new Error('Нет связи с GitHub. Проверь интернет.'); e.net = true; throw e; }
  if (r.status === 404) return null;
  if (!r.ok) {
    const e = new Error(r.status === 401 ? 'Ключ GitHub не подходит или истёк. Создай новый ключ и подключись заново.'
      : r.status === 403 ? 'GitHub отказал в доступе. У ключа должно быть право Contents: Read and write на репозиторий с данными.'
      : r.status === 409 || r.status === 422 ? 'Конфликт версий.' : `GitHub ответил ошибкой ${r.status}.`);
    e.status = r.status; throw e;
  }
  return r.json();
}

async function fetchFile(tk, repo, ref) {
  const j = await gh('GET', `/repos/${repo}/contents/${FILE}${ref ? '?ref=' + ref : ''}`, null, tk);
  if (!j) return null;
  let content = j.content;
  if (!content && j.sha) content = (await gh('GET', `/repos/${repo}/git/blobs/${j.sha}`, null, tk)).content; // файл > 1 МБ
  return { sha: j.sha, f: JSON.parse(td.decode(unb64(content))) };
}
const decryptFile = async (k, f) => JSON.parse(await ungz(await unseal(k, f)));
async function encryptState(state) {
  return { v: 1, app: 'podhod', salt: cfg.salt, iter: ITER, ...(await seal(key, await gz(JSON.stringify(state)))) };
}

export async function init() {
  setSyncHook(() => schedule());
  try { cfg = await kvGet('sync'); key = await kvGet('synckey'); } catch { cfg = null; }
  if (cfg && key) {
    try {
      token = td.decode(await unseal(key, cfg.tok));
      st.on = true; st.last = cfg.last || null; st.repo = cfg.repo;
      set('idle'); syncNow();
    } catch { set('error', 'Не удалось прочитать настройки синхронизации. Подключись заново.'); }
  }
  addEventListener('online', () => st.on && syncNow());
  document.addEventListener('visibilitychange', () => st.on && syncNow());
}

const cleanRepo = r => r.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');

// Первое подключение. pass2 нужен, только если данных в репозитории ещё нет.
export async function connect(tk, repoIn, pass, pass2) {
  tk = tk.trim();
  const repo = cleanRepo(repoIn);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Укажи репозиторий в виде владелец/название, например ivan/tracker-data.');
  if (!tk) throw new Error('Вставь ключ доступа GitHub.');
  if ((pass || '').length < 8) throw new Error('Пароль должен быть не короче 8 символов.');
  const info = await gh('GET', `/repos/${repo}`, null, tk);
  if (!info) throw new Error('Репозиторий не найден. Проверь название и что ключ выдан именно на него.');
  if (!info.private) throw new Error('Этот репозиторий открытый. Для данных нужен приватный (Private).');
  const ex = await fetchFile(tk, repo);
  let salt, k;
  if (ex) {
    salt = ex.f.salt; k = await derive(pass, unb64(salt));
    let remote;
    try { remote = await decryptFile(k, ex.f); } catch { throw new Error('Пароль не подходит к данным в этом репозитории.'); }
    replace(merge(S, remote));
  } else {
    if (pass2 !== pass) { const e = new Error('NEW'); e.code = 'new'; throw e; }
    const s = crypto.getRandomValues(new Uint8Array(16)); salt = b64(s); k = await derive(pass, s);
  }
  await saveCfg(tk, repo, salt, k);
  await syncNow();
  return !!ex;
}
async function saveCfg(tk, repo, salt, k) {
  token = tk; key = k;
  cfg = { repo, salt, tok: await seal(k, te.encode(tk)), last: null };
  await kvSet('synckey', k); await kvSet('sync', cfg);
  st.on = true; st.repo = repo; set('idle');
}

export async function syncNow() {
  if (!st.on) return;
  if (busy) { again = true; return; }
  if (!navigator.onLine) { set('offline', 'Нет интернета. Синхронизирую, когда появится.'); return; }
  busy = true; clearTimeout(timer); set('syncing');
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ex = await fetchFile(token, cfg.repo);
      let remote = null;
      if (ex) {
        if (ex.f.salt !== cfg.salt) throw new Error('Данные в репозитории зашифрованы другим паролем. Отключи синхронизацию и подключись заново.');
        remote = await decryptFile(key, ex.f);
        const m = merge(S, remote);
        if (!same(m, S)) replace(m, false);
        if (same(S, remote)) break;
      }
      const body = { message: 'Синхронизация ' + new Date().toLocaleString('ru-RU'), content: b64(te.encode(JSON.stringify(await encryptState(S)))) };
      if (ex) body.sha = ex.sha;
      try { await gh('PUT', `/repos/${cfg.repo}/contents/${FILE}`, body); break; }
      catch (e) { if ((e.status === 409 || e.status === 422) && attempt < 2) continue; throw e; }
    }
    cfg.last = st.last = Date.now();
    await kvSet('sync', cfg);
    set('idle');
  } catch (e) {
    console.error(e);
    set(e.net ? 'offline' : 'error', e.message || 'Ошибка синхронизации.');
  } finally {
    busy = false;
    if (again) { again = false; schedule(1500); }
  }
}
export function schedule(ms = 6000) { if (!st.on) return; clearTimeout(timer); timer = setTimeout(syncNow, ms); }

// Код для второго устройства: репозиторий, соль и ключ GitHub, зашифрованный паролем.
export async function setupLink() {
  const code = b64url(JSON.stringify({ v: 1, r: cfg.repo, s: cfg.salt, t: await seal(key, te.encode(token)) }));
  return location.origin + location.pathname + '#join=' + code;
}
export async function join(text, pass) {
  const code = (text || '').trim().replace(/^.*#join=/, '');
  let o;
  try { o = JSON.parse(unb64url(code)); } catch { throw new Error('Код подключения не распознан. Скопируй его целиком.'); }
  const k = await derive(pass, unb64(o.s));
  let tk;
  try { tk = td.decode(await unseal(k, o.t)); } catch { throw new Error('Пароль не подходит.'); }
  const ex = await fetchFile(tk, o.r);
  if (ex) replace(merge(S, await decryptFile(k, ex.f)));
  await saveCfg(tk, o.r, o.s, k);
  await syncNow();
}

export async function history() {
  const list = await gh('GET', `/repos/${cfg.repo}/commits?path=${FILE}&per_page=30`);
  return (list || []).map(c => ({ sha: c.sha, date: c.commit.author.date }));
}
// Откат: старая версия становится новой (все её записи получают свежую метку времени).
export async function restore(sha) {
  const ex = await fetchFile(token, cfg.repo, sha);
  if (!ex) throw new Error('Версия не найдена.');
  const old = await decryptFile(key, ex.f), ts = Date.now();
  for (const k of ['profile', 'settings']) if (old[k]) old[k].u = ts;
  for (const c of COLS) {
    old[c] ||= {};
    for (const r of Object.values(old[c])) r.u = ts;
    for (const [id, r] of Object.entries(S[c] || {})) if (!old[c][id]) old[c][id] = { ...r, deleted: true, u: ts };
  }
  replace(old, true);
  await syncNow();
}

export async function disconnect() {
  clearTimeout(timer);
  await kvDel('sync'); await kvDel('synckey');
  cfg = key = token = null; st.on = false; st.last = null; st.repo = '';
  set('off');
}
