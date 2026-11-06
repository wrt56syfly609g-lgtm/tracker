// Синхронизация через приватный репозиторий GitHub.
// Данные сжимаются и шифруются на устройстве (AES-256-GCM, ключ из пароля через PBKDF2).
// В репозитории лежит только зашифрованный файл data.enc. Пароль никуда не отправляется.
import { S, COLS, OBJS, merge, same, replace, kvGet, kvSet, kvDel, setSyncHook } from './store.js';

const API = 'https://api.github.com', FILE = 'data.enc', ITER = 310000;
export const st = { on: false, state: 'off', msg: '', last: null, repo: '', exp: null };
let cfg = null, key = null, token = null, timer = null, busy = false, again = false, hadActive = false;
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

/* ---------- когда отправлять ---------- */
// Каждая отправка — новая версия в репозитории. Поэтому не после каждого нажатия:
// во время тренировки — при завершении и при сворачивании, в остальное время — через минуту после последней правки.
// При сворачивании и открытии приложения синхронизация идёт сразу.
export const DELAY = { idle: 60000, workout: 15 * 60000, finished: 2000 };
export const hasActive = state => Object.values(state?.wo || {}).some(w => w.active && !w.deleted);
export const syncDelay = state => (hasActive(state) ? DELAY.workout : DELAY.idle);

/* ---------- ключ GitHub: срок и передача на другие устройства ---------- */
// GitHub присылает срок ключа в заголовке; если браузер его не отдаёт, срок можно указать вручную.
export function parseExp(v) {
  const m = String(v || '').match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
// Дней до истечения ключа (отрицательное — уже истёк) или null, если срок неизвестен.
export function daysLeft(exp, now = new Date()) {
  if (!exp) return null;
  const [y, m, d] = exp.split('-').map(Number);
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d) - t0) / 864e5);
}
export const keyDaysLeft = () => daysLeft(st.exp);
// Новый ключ, заменённый на одном устройстве, лежит в файле данных (зашифрован паролем).
// Другие устройства подхватывают его при синхронизации, если их старый ключ ещё работает.
export function newerToken(c, f) {
  if (!f?.tk || !(f.tkU > (c?.tkU || 0))) return null;
  return { tok: f.tk, tkU: f.tkU, exp: f.tkExp ?? null };
}

async function gh(method, path, body, tk = token) {
  let r;
  try {
    r = await fetch(API + path, {
      method, cache: 'no-store', body: body ? JSON.stringify(body) : undefined,
      headers: { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
  } catch { const e = new Error('Нет связи с GitHub. Проверь интернет.'); e.net = true; throw e; }
  if (tk === token && cfg) {
    const exp = parseExp(r.headers.get('github-authentication-token-expiration'));
    if (exp && exp !== cfg.exp) { cfg.exp = st.exp = exp; cfg.tkExpAuto = true; }
  }
  if (r.status === 404) return null;
  if (!r.ok) {
    const e = new Error(r.status === 401 ? 'Ключ GitHub не подходит или истёк. Создай новый и нажми «Заменить ключ» в настройках синхронизации.'
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
  const out = { v: 1, app: 'podhod', salt: cfg.salt, iter: ITER, ...(await seal(key, await gz(JSON.stringify(state)))) };
  if (cfg.tkU) Object.assign(out, { tk: cfg.tok, tkU: cfg.tkU, tkExp: cfg.exp || null });
  return out;
}
// Если в файле лежит более новый ключ (заменён на другом устройстве), берём его.
async function adoptToken(f) {
  const n = newerToken(cfg, f);
  if (!n) return;
  try { token = td.decode(await unseal(key, n.tok)); } catch { return; }
  Object.assign(cfg, { tok: n.tok, tkU: n.tkU, exp: n.exp });
  st.exp = n.exp;
  await kvSet('sync', cfg);
}

export async function init() {
  setSyncHook(() => {
    // Тренировка только что завершилась или отменена — отправляем почти сразу.
    const a = hasActive(S), ms = hadActive && !a ? DELAY.finished : undefined;
    hadActive = a;
    schedule(ms);
  });
  hadActive = hasActive(S);
  try { cfg = await kvGet('sync'); key = await kvGet('synckey'); } catch { cfg = null; }
  if (cfg && key) {
    try {
      token = td.decode(await unseal(key, cfg.tok));
      st.on = true; st.last = cfg.last || null; st.repo = cfg.repo; st.exp = cfg.exp || null;
      set('idle'); syncNow();
    } catch { set('error', 'Не удалось прочитать настройки синхронизации. Подключись заново.'); }
  }
  addEventListener('online', () => st.on && syncNow());
  document.addEventListener('visibilitychange', () => st.on && syncNow());
}

const cleanRepo = r => r.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');

// Первое подключение. pass2 нужен, только если данных в репозитории ещё нет.
export async function connect(tk, repoIn, pass, pass2, exp = null) {
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
  // Ключ, введённый вручную, считается самым новым: его получат и другие устройства.
  await saveCfg(tk, repo, salt, k, { exp, tkU: Date.now() });
  await syncNow();
  return !!ex;
}
async function saveCfg(tk, repo, salt, k, extra = {}) {
  token = tk; key = k;
  cfg = { repo, salt, tok: await seal(k, te.encode(tk)), last: null, exp: null, tkU: 0, ...extra };
  await kvSet('synckey', k); await kvSet('sync', cfg);
  st.on = true; st.repo = repo; st.exp = cfg.exp; set('idle');
}

// Заменить ключ GitHub, не отключая синхронизацию (например, когда старый истекает).
export async function replaceToken(tk, exp = null) {
  tk = (tk || '').trim();
  if (!tk) throw new Error('Вставь новый ключ доступа GitHub.');
  const info = await gh('GET', `/repos/${cfg.repo}`, null, tk);
  if (!info) throw new Error(`Ключ не видит репозиторий ${cfg.repo}. При создании ключа выбери именно его.`);
  token = tk;
  Object.assign(cfg, { tok: await seal(key, te.encode(tk)), tkU: Date.now(), exp, tkExpAuto: false });
  st.exp = exp;
  await kvSet('sync', cfg);
  set('idle');
  await syncNow(true);
}
// Указать срок действия ключа вручную.
export async function setKeyExp(exp) {
  cfg.exp = st.exp = exp || null; cfg.tkExpAuto = false;
  await kvSet('sync', cfg);
  subs.forEach(f => f());
}

// force: отправить файл, даже если данные не менялись (чтобы другие устройства получили новый ключ).
export async function syncNow(force = false) {
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
        await adoptToken(ex.f);
        remote = await decryptFile(key, ex.f);
        const m = merge(S, remote);
        if (!same(m, S)) replace(m, false);
        const tokenSent = !cfg.tkU || ex.f.tkU === cfg.tkU;
        if (same(S, remote) && tokenSent && !force) break;
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
export function schedule(ms) {
  if (!st.on) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms ?? syncDelay(S));
}

// Код для второго устройства: репозиторий, соль и ключ GitHub, зашифрованный паролем.
export async function setupLink() {
  const code = b64url(JSON.stringify({ v: 1, r: cfg.repo, s: cfg.salt, t: await seal(key, te.encode(token)), e: cfg.exp || null, u: cfg.tkU || 0 }));
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
  await saveCfg(tk, o.r, o.s, k, { exp: o.e || null, tkU: o.u || 0 });
  if (ex) await adoptToken(ex.f);
  await syncNow();
}

/* ---------- история версий ---------- */
const PER_PAGE = 100;
// Страница истории: до 100 версий, от новых к старым. more — есть ли ещё.
export async function history(page = 1) {
  const list = await gh('GET', `/repos/${cfg.repo}/commits?path=${FILE}&per_page=${PER_PAGE}&page=${page}`);
  const items = (list || []).map(c => ({ sha: c.sha, date: c.commit.committer?.date || c.commit.author.date }));
  return { items, more: items.length === PER_PAGE };
}
// Версии по дням (местное время), новые сверху. Первая версия дня — состояние на его конец.
export function byDay(items) {
  const out = [];
  for (const it of items) {
    const d = new Date(it.date);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(it);
    else out.push({ day, items: [it] });
  }
  return out;
}

// Откат: старая версия становится новой (все её записи получают свежую метку времени).
export async function restore(sha) {
  const ex = await fetchFile(token, cfg.repo, sha);
  if (!ex) throw new Error('Версия не найдена.');
  const old = await decryptFile(key, ex.f), ts = Date.now();
  for (const k of OBJS) if (old[k]) old[k].u = ts;
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
  cfg = key = token = null; st.on = false; st.last = null; st.repo = ''; st.exp = null;
  set('off');
}
