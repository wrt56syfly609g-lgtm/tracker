// Настройки: профиль и расход, цели КБЖУ, тренировки, тема, синхронизация, резервная копия.
import { S, setObj, merge, replace } from '../store.js';
import { h, icon, btn, chips, stepper, sw, field, input, toast, card, stat, sheet, confirmSheet } from '../ui.js';
import { num, today, bmr, passiveFor, targetsAuto, targets, currentWeight, currentBf, GOALS, fmtDate, fiberFor } from '../calc.js';
import * as sync from '../sync.js';

export const VERSION = '1.3.0';
const F = { tk: '', repo: '', pass: '', pass2: '', exp: '', needConfirm: false, code: '', jpass: '', busy: false, err: '' };
export function setJoinCode(c) { F.code = c; }

const row = (label, control, hint) => h('div', { class: 'row between', style: 'gap:12px' },
  h('div', { class: 'grow' }, h('div', null, label), hint && h('div', { class: 'hint' }, hint)), control);

export function render(ctx) {
  const p = S.profile, s = S.settings, out = [];
  const wNow = currentWeight(), bfNow = currentBf();
  const useW = p.autoWeight ? wNow : p.weight, useBf = p.autoWeight ? bfNow : p.bodyFat;
  const auto = targetsAuto(), tg = targets();

  out.push(card('Профиль и расход', 'scale',
    h('div', { class: 'grid3' },
      field('Рост, см', stepper({ value: p.height, step: 1, min: 100, max: 230, onChange: v => setObj('profile', { height: v ?? p.height }) })),
      field('Вес, кг', stepper({ value: Math.round(wNow * 10) / 10, step: 0.1, min: 30, max: 250, dec: 1, onChange: v => v && setObj('profile', { weight: v, bodyFat: Math.round(bfNow * 10) / 10, weightDate: today() }) })),
      field('Жир, %', stepper({ value: Math.round(bfNow * 10) / 10, step: 0.5, min: 3, max: 60, dec: 1, onChange: v => v && setObj('profile', { bodyFat: v, weight: Math.round(wNow * 10) / 10, weightDate: today() }) }))),
    h('div', { class: 'hint' }, `Вес и % жира показаны по модели. Последний замер: ${num(p.weight, 1)} кг и ${num(p.bodyFat, 1)} % на ${fmtDate(p.weightDate)}. Впиши новые цифры, когда взвесишься.`),
    row('Менять вес и % жира по балансу калорий', sw(p.autoWeight, v => setObj('profile', { autoWeight: v }), 'Модель веса'),
      'При дефиците ~3/4 потерянного веса считается жиром, при профиците половина.'),
    field('Бытовая активность', chips({ allowNone: false, value: p.activity, opts: [{ v: 1.2, l: 'Сидячая' }, { v: 1.375, l: 'Лёгкая' }, { v: 1.55, l: 'Средняя' }], onChange: v => setObj('profile', { activity: v }) }),
      'Без тренировок и прогулок. Для большинства подходит «Сидячая».'),
    h('div', { class: 'grid2' },
      stat('Базовый обмен (покой)', num(bmr(useW, useBf)) + ' ккал'),
      stat('Пассивный расход', num(passiveFor(useW, useBf)) + ' ккал')),
    field('Своё число пассивного расхода', stepper({ value: p.passiveOverride, step: 10, min: 800, max: 6000, placeholder: 'авто', onChange: v => setObj('profile', { passiveOverride: v }) }),
      p.passiveOverride != null ? h('button', { type: 'button', class: 'btn ghost sm', onclick: () => setObj('profile', { passiveOverride: null }) }, 'Считать автоматически') : 'Пусто — считается по формуле Кэтча–МакАрдла.'),
    field('Расход на тренировке (MET)', stepper({ value: p.met, step: 0.5, min: 1, max: 12, dec: 1, onChange: v => setObj('profile', { met: v || 5 }) }),
      'Ккал = MET × вес × часы. Силовая тренировка обычно 3,5–6.')));

  const macro = (label, k, ov) => field(label, stepper({ value: p[ov], step: k === 'kcal' ? 50 : 5, min: 0, max: 9000, placeholder: num(auto[k]), sm: true, onChange: v => setObj('profile', { [ov]: v }) }));
  out.push(card('Цель и КБЖУ', 'target',
    field('Цель', chips({ allowNone: false, value: p.goal, opts: Object.entries(GOALS).map(([v, g]) => ({ v, l: g.l })), onChange: v => setObj('profile', { goal: v }) })),
    h('div', { class: 'grid4' }, macro('Ккал', 'kcal', 'kcalOverride'), macro('Белки, г', 'p', 'pOverride'), macro('Жиры, г', 'f', 'fOverride'), macro('Углев., г', 'c', 'cOverride')),
    field('Клетчатка, г', stepper({ value: p.fbOverride, step: 1, min: 0, max: 150, placeholder: num(fiberFor(tg.kcal)), sm: true, onChange: v => setObj('profile', { fbOverride: v }) })),
    h('div', { class: 'hint' }, `Сейчас цель: ${num(tg.kcal)} ккал, Б ${num(tg.p)} · Ж ${num(tg.f)} · У ${num(tg.c)} · клетчатка ${num(tg.fb)} г. Пустые поля считаются сами: белок 1,8 г/кг, жиры 0,9 г/кг, остальное углеводы, клетчатка 14 г на 1000 ккал (не меньше 25 г).`),
    (p.kcalOverride ?? p.pOverride ?? p.fOverride ?? p.cOverride ?? p.fbOverride) != null
      ? btn('Сбросить на авто', () => setObj('profile', { kcalOverride: null, pOverride: null, fOverride: null, cOverride: null, fbOverride: null }), 'ghost sm') : null));

  out.push(card('Тренировки', 'barbell',
    h('div', { class: 'grid2' },
      field('Отдых по умолчанию, сек', stepper({ value: s.rest, step: 15, min: 15, max: 900, onChange: v => setObj('settings', { rest: v || 120 }) })),
      field('Шаг веса, кг', stepper({ value: s.step, step: 0.5, min: 0.5, max: 20, dec: 2, onChange: v => setObj('settings', { step: v || 2.5 }) }))),
    h('div', { class: 'hint' }, 'Для отдельного упражнения отдых и шаг можно задать в библиотеке упражнений.'),
    row('Звук в конце отдыха', sw(s.sound, v => setObj('settings', { sound: v }), 'Звук')),
    row('Вибрация в конце отдыха', sw(s.vibrate, v => setObj('settings', { vibrate: v }), 'Вибрация')),
    row('Не гасить экран во время тренировки', sw(s.wakeLock, v => setObj('settings', { wakeLock: v }), 'Экран'))));

  out.push(card('Оформление', 'sun',
    chips({ cls: 'seg', allowNone: false, value: s.theme, opts: [{ v: 'auto', l: 'Авто' }, { v: 'light', l: 'Светлая' }, { v: 'dark', l: 'Тёмная' }], onChange: v => setObj('settings', { theme: v }) })));

  out.push(syncCard());
  out.push(backupCard());
  out.push(h('div', { class: 'hint', style: 'text-align:center;padding:8px 0 4px' }, `Подход ${VERSION} · иконки Tabler Icons (MIT) · шрифты Onest и Unbounded (OFL)`));
  return h('div', { class: 'stack', style: 'gap:14px' }, out);
}

/* ---------- синхронизация ---------- */
function guessRepo() {
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
  return m ? `${m[1]}/tracker-data` : '';
}
async function run(fn) {
  F.busy = true; F.err = ''; refresh();
  try { await fn(); } catch (e) {
    if (e.code === 'new') { F.needConfirm = true; F.err = 'Данных в репозитории ещё нет. Это первое подключение: повтори пароль и запиши его. Без пароля данные не восстановить.'; }
    else F.err = e.message || String(e);
  } finally { F.busy = false; refresh(); }
}
let box = null;
const refresh = () => { if (box) box.replaceChildren(...syncBody()); };
sync.onStatus(() => { if (box?.isConnected && !F.busy) refresh(); });

function syncCard() {
  box = h('section', { class: 'card' });
  refresh();
  return box;
}

function pwd(key, ph, id) {
  const i = input({ type: 'password', value: F[key], placeholder: ph, autocomplete: 'off', id });
  i.addEventListener('input', () => { F[key] = i.value; });
  return i;
}
function txt(key, ph, id) {
  const i = input({ value: F[key], placeholder: ph, autocomplete: 'off', spellcheck: 'false', id });
  i.addEventListener('input', () => { F[key] = i.value; });
  return i;
}

function dateInp(key, id) {
  const i = input({ type: 'date', value: F[key], id, min: today() });
  i.addEventListener('input', () => { F[key] = i.value; });
  return i;
}
const fmtExp = d => `${fmtDate(d)} ${d.slice(0, 4)}`;

// Срок ключа GitHub: когда истекает и сколько осталось.
function keyStatus() {
  const exp = sync.st.exp, dl = sync.keyDaysLeft();
  if (!exp) return h('div', { class: 'row between', style: 'gap:12px' },
    h('div', { class: 'hint grow' }, 'Срок ключа GitHub не указан. Укажи его, и приложение напомнит заранее.'),
    btn('Указать', setExpSheet, 'sm', 'calendar'));
  const text = dl < 0 ? `Ключ GitHub истёк ${fmtExp(exp)}. Создай новый и нажми «Заменить ключ».`
    : dl <= 14 ? `Ключ GitHub истекает ${fmtExp(exp)}, осталось ${dl} дн. Создай новый и нажми «Заменить ключ».`
    : `Ключ GitHub действует до ${fmtExp(exp)}.`;
  return dl <= 14 ? h('div', { class: 'banner' }, icon('alert-triangle'), h('div', null, text))
    : h('div', { class: 'row between', style: 'gap:12px' }, h('div', { class: 'hint grow' }, text), btn('Изменить', setExpSheet, 'sm ghost', 'calendar'));
}

function setExpSheet() {
  let v = sync.st.exp || '';
  sheet('Срок ключа', close => {
    const i = input({ type: 'date', value: v, id: 'key-exp' });
    i.addEventListener('input', () => { v = i.value; });
    return h('div', { class: 'stack' },
      h('div', { class: 'hint' }, 'Дата из поля Expiration при создании ключа. Её видно на github.com → Settings → Developer settings → Fine-grained tokens.'),
      field('Ключ действует до', i),
      h('div', { class: 'grid2' }, btn('Отмена', close),
        btn('Сохранить', async () => { await sync.setKeyExp(v || null); close(); refresh(); }, 'primary', 'check')));
  });
}

function replaceKey() {
  const D = { tk: '', exp: '', busy: false, err: '' };
  sheet('Заменить ключ', close => {
    const body = h('div', { class: 'stack' });
    const draw = () => {
      const tk = input({ type: 'password', value: D.tk, placeholder: 'github_pat_…', autocomplete: 'off', id: 'new-token' });
      tk.addEventListener('input', () => { D.tk = tk.value; });
      const ex = input({ type: 'date', value: D.exp, id: 'new-token-exp', min: today() });
      ex.addEventListener('input', () => { D.exp = ex.value; });
      body.replaceChildren(
        h('div', { class: 'hint' }, 'Создай новый ключ так же, как первый (инструкция в README): доступ только к репозиторию с данными, Contents: Read and write. Пароль шифрования остаётся прежним.'),
        D.err && h('div', { class: 'banner' }, icon('alert-triangle'), h('div', null, D.err)),
        field('Новый ключ доступа GitHub', tk),
        field('Ключ действует до', ex, 'Необязательно, но тогда приложение напомнит заранее.'),
        h('div', { class: 'hint' }, 'Другие устройства получат новый ключ сами при следующей синхронизации, если их старый ключ ещё работает. Если уже истёк — подключи их заново по QR-коду.'),
        h('div', { class: 'grid2' }, btn('Отмена', close),
          h('button', { type: 'button', class: 'btn primary', disabled: D.busy, onclick: async () => {
            D.busy = true; D.err = ''; draw();
            try { await sync.replaceToken(D.tk, D.exp || null); close(); toast('Ключ заменён.'); refresh(); }
            catch (e) { D.err = e.message || String(e); D.busy = false; draw(); }
          } }, icon('check'), D.busy ? 'Проверяю…' : 'Заменить')));
    };
    draw();
    return body;
  });
}

function syncBody() {
  const st = sync.st;
  const head = h('div', { class: 'card-h' }, icon(st.on ? 'cloud' : 'cloud-off'), h('h2', null, 'Синхронизация'));
  if (st.on) {
    const label = { idle: 'Всё синхронизировано', syncing: 'Синхронизирую…', offline: st.msg, error: st.msg }[st.state] || '';
    return [head,
      h('div', { class: st.state === 'error' ? 'banner' : 'banner info' }, icon(st.state === 'error' ? 'alert-triangle' : 'lock'),
        h('div', null, h('b', null, label), h('br'), h('span', { class: 'small' }, `Репозиторий ${st.repo}. ${st.last ? 'Последняя синхронизация ' + new Date(st.last).toLocaleString('ru-RU') + '.' : ''}`))),
      keyStatus(),
      h('div', { class: 'grid2' },
        btn('Синхронизировать', () => sync.syncNow(), '', 'refresh'),
        btn('Подключить телефон / ПК', showSetup, 'soft', 'qrcode')),
      h('div', { class: 'grid2' },
        btn('История версий', showHistory, '', 'history'),
        btn('Заменить ключ', replaceKey, '', 'lock')),
      h('div', { class: 'hint' }, 'Отправка в GitHub идёт через минуту после правок, сразу при сворачивании и после тренировки. Во время тренировки — только при сворачивании, чтобы не плодить версии.'),
      btn('Отключить', () => confirmSheet('Отключить синхронизацию?', 'Данные останутся на этом устройстве и в репозитории. Подключиться снова можно в любой момент.', 'Отключить', () => sync.disconnect()), 'ghost sm danger', 'logout')];
  }
  if (!F.repo) F.repo = guessRepo();
  return [head,
    h('div', { class: 'hint' }, 'Данные шифруются твоим паролем прямо на устройстве и хранятся в твоём приватном репозитории GitHub. Пароль никуда не отправляется. Пошаговая инструкция — в README репозитория с приложением.'),
    F.err && h('div', { class: 'banner' }, icon('alert-triangle'), h('div', null, F.err)),
    h('div', { class: 'sec-label' }, 'Первое устройство'),
    field('Ключ доступа GitHub', pwd('tk', 'github_pat_…', 'sync-token'), 'Fine-grained token с правом Contents: Read and write только на репозиторий с данными.'),
    field('Ключ действует до', dateInp('exp', 'sync-exp'), 'Необязательно. Дата из поля Expiration при создании ключа: приложение напомнит за две недели.'),
    field('Репозиторий с данными', txt('repo', 'владелец/tracker-data', 'sync-repo')),
    field('Пароль шифрования', pwd('pass', 'не меньше 8 символов', 'sync-pass')),
    F.needConfirm && field('Повтори пароль', pwd('pass2', 'ещё раз', 'sync-pass2')),
    h('button', { type: 'button', class: 'btn primary block', disabled: F.busy, onclick: () => run(async () => {
      const had = await sync.connect(F.tk, F.repo, F.pass, F.needConfirm ? F.pass2 : undefined, F.exp || null);
      Object.assign(F, { tk: '', pass: '', pass2: '', exp: '', needConfirm: false });
      toast(had ? 'Подключено, данные объединены.' : 'Подключено. Данные зашифрованы и отправлены.');
    }) }, icon('lock'), F.busy ? 'Подключаю…' : 'Подключить'),
    h('div', { class: 'hr' }),
    h('div', { class: 'sec-label' }, 'Второе устройство'),
    h('div', { class: 'hint' }, 'На первом устройстве нажми «Подключить телефон / ПК» и отсканируй QR-код камерой или скопируй код.'),
    field('Код подключения', txt('code', 'вставь код или ссылку', 'sync-code')),
    btn('Сканировать QR-код', scanQR, '', 'scan'),
    field('Пароль шифрования', pwd('jpass', 'тот же, что на первом устройстве', 'sync-jpass')),
    h('button', { type: 'button', class: 'btn primary block', disabled: F.busy, onclick: () => run(async () => {
      await sync.join(F.code, F.jpass);
      Object.assign(F, { code: '', jpass: '' });
      toast('Устройство подключено.');
    }) }, icon('lock'), F.busy ? 'Подключаю…' : 'Подключить по коду')];
}

function loadScript(src, global) {
  return window[global] ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Не удалось загрузить ' + src)); document.head.append(s);
  });
}

async function showSetup() {
  let link;
  try { link = await sync.setupLink(); await loadScript('vendor/qrcode.js', 'qrcode'); }
  catch (e) { toast(e.message); return; }
  const qr = window.qrcode(0, 'L'); qr.addData(link); qr.make();
  const box = h('div', { class: 'qr', html: qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) });
  const codeBox = h('div', { class: 'code-box' }, link);
  sheet('Подключить устройство', h('div', { class: 'stack' },
    h('div', { class: 'hint' }, 'На втором устройстве открой приложение → Настройки → «Сканировать QR-код», или скопируй ссылку и открой её там. Потом введи тот же пароль.'),
    box, codeBox,
    btn('Скопировать код', async () => {
      try { await navigator.clipboard.writeText(link); toast('Скопировано'); }
      catch { const r = document.createRange(); r.selectNodeContents(codeBox); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Выделено — скопируй вручную'); }
    }, '', 'copy'),
    h('div', { class: 'hint' }, 'Код без пароля бесполезен: ключ GitHub внутри него зашифрован.')));
}

async function scanQR() {
  if (!navigator.mediaDevices?.getUserMedia) { toast('Камера недоступна. Вставь код вручную.'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
  catch { toast('Нет доступа к камере. Разреши его или вставь код вручную.'); return; }
  const video = h('video', { class: 'scan', playsinline: true, muted: true, autoplay: true });
  video.srcObject = stream;
  let stop = false;
  const close = sheet('Сканирование', h('div', { class: 'stack' }, video, h('div', { class: 'hint' }, 'Наведи камеру на QR-код на экране другого устройства.')),
    { onClose: () => { stop = true; stream.getTracks().forEach(t => t.stop()); } });
  let detector = null;
  try { if ('BarcodeDetector' in window) detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { detector = null; }
  if (!detector) { try { await loadScript('vendor/jsQR.js', 'jsQR'); } catch (e) { toast(e.message); } }
  const canvas = document.createElement('canvas'), c2 = canvas.getContext('2d', { willReadFrequently: true });
  const loop = async () => {
    if (stop) return;
    try {
      if (video.readyState >= 2) {
        let val = null;
        if (detector) { const r = await detector.detect(video); val = r[0]?.rawValue; }
        else if (window.jsQR) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight; c2.drawImage(video, 0, 0);
          val = window.jsQR(c2.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data;
        }
        if (val && val.includes('#join=')) { F.code = val; close(); refresh(); toast('Код считан. Введи пароль.'); document.getElementById('sync-jpass')?.focus(); return; }
      }
    } catch { /* следующий кадр */ }
    setTimeout(loop, 250);
  };
  loop();
}

async function showHistory() {
  let page = 1, items = [], more = false;
  try { ({ items, more } = await sync.history(page)); } catch (e) { toast(e.message); return; }
  const fmtT = d => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const ask = (c, close) => confirmSheet('Вернуть эту версию?', `Данные станут такими, как были ${new Date(c.date).toLocaleString('ru-RU')}.`, 'Вернуть', async () => {
    close();
    try { await sync.restore(c.sha); toast('Версия восстановлена.'); } catch (e) { toast(e.message); }
  });
  sheet('История версий', close => {
    const body = h('div', { class: 'stack' });
    const draw = () => {
      const days = sync.byDay(items), cur = items[0]?.sha;
      body.replaceChildren(
        h('div', { class: 'hint' }, 'GitHub хранит каждую синхронизацию. «Конец дня» возвращает данные такими, какими они были вечером того дня. Текущие данные заменятся выбранными на всех устройствах.'),
        days.length ? h('div', { class: 'list' }, days.map(g => {
          const endOfDay = g.items[0], isCur = endOfDay.sha === cur;
          return h('div', { class: 'item', style: 'display:block' },
            h('div', { class: 'row between', style: 'gap:10px' },
              h('div', { class: 't' }, h('b', null, `${fmtDate(g.day)} ${g.day.slice(0, 4)}`), h('span', null, `${g.items.length} ${plural(g.items.length)} · последняя в ${fmtT(endOfDay.date)}`)),
              isCur ? h('span', { class: 'tag' }, 'текущая') : btn('Конец дня', () => ask(endOfDay, close), 'sm')),
            g.items.length > 1 ? h('details', { class: 'more', style: 'margin-top:6px' },
              h('summary', { class: 'small muted' }, 'Все версии дня'),
              h('div', { class: 'list' }, g.items.map(c => h('div', { class: 'item' },
                h('div', { class: 't' }, h('b', { class: 'num' }, fmtT(c.date)), h('span', null, c.sha.slice(0, 7))),
                c.sha === cur ? h('span', { class: 'tag' }, 'текущая') : btn('Вернуть', () => ask(c, close), 'sm ghost'))))) : null);
        })) : h('div', { class: 'empty' }, 'Версий пока нет.'),
        more ? btn('Показать раньше', async () => {
          try { const r = await sync.history(++page); items = items.concat(r.items); more = r.more; draw(); } catch (e) { page--; toast(e.message); }
        }, 'ghost', 'history') : null);
    };
    draw();
    return body;
  });
}
const plural = n => (n % 10 === 1 && n % 100 !== 11 ? 'версия' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'версии' : 'версий');

/* ---------- резервная копия ---------- */
function backupCard() {
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.profile || !data.habits) throw new Error('Это не файл резервной копии «Подхода».');
      replace(merge(S, data), true);
      toast('Резервная копия загружена и объединена с текущими данными.');
    } catch (e) { toast(e.message || 'Не удалось прочитать файл.'); }
    file.value = '';
  });
  return card('Резервная копия', 'download',
    h('div', { class: 'hint' }, 'Файл не зашифрован: храни его в надёжном месте. При загрузке данные объединяются, ничего не затирается.'),
    h('div', { class: 'grid2' },
      btn('Скачать файл', () => {
        const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `podhod-${today()}.json` });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, '', 'download'),
      btn('Загрузить файл', () => file.click(), '', 'upload')),
    file);
}
