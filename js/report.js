// Отчёт для Claude: тренировки с подходами, питание, сон и вес за несколько недель одним текстом.
// В конце — текущая программа в формате импорта, чтобы ответ можно было сразу загрузить обратно.
import { S, all, MUSCLES } from './store.js';
import {
  num, today, addDays, range, fmtShort, fmtDate, parse, WD_SHORT, GOALS, totals, targets, model, dayRec, avg,
  workoutsOn, woMinutes, workSets, sessions, exName, kindOf, isUni, KINDS, setText, byLoad, unitOf, currentWeight, currentBf,
} from './calc.js';
import { toText } from './exchange.js';

const n1 = v => num(v, 1);
const mean = (list, f) => avg(list.map(f).filter(v => v != null));

function itemLine(it) {
  const k = kindOf(it.ex), uni = isUni(it.ex), ws = workSets(it);
  const tags = [k !== 'w' && KINDS[k].l.toLowerCase(), uni && 'Л/П', it.goal && 'цель ' + it.goal].filter(Boolean);
  const head = `- ${exName(it.ex)}${tags.length ? ` (${tags.join('; ')})` : ''}: `;
  if (!ws.length) return head + 'не сделано';
  const skipped = it.sets.filter(s => !s.warm && !s.done).length;
  const rir = ws.map(s => s.rir);
  return head + ws.map(s => setText(s, k, uni)).join(', ')
    + (rir.some(v => v != null) ? ` · запас ${rir.map(v => (v == null ? '—' : v)).join(', ')}` : '')
    + (skipped ? ` · не отмечено подходов: ${skipped}` : '')
    + (it.tech ? ` · техника ${it.tech}/5` : '')
    + (it.note ? ` · «${it.note.trim()}»` : '')
    + (it.link ? ' · сразу следующее' : '');
}

export function report({ weeks = 4, end = today(), program = true } = {}) {
  const a = addDays(end, -7 * weeks + 1), days = range(a, end), p = S.profile;
  const out = [
    `Отчёт «Подхода» за ${weeks} нед.: ${fmtShort(a)}–${fmtShort(end)}.${end.slice(0, 4)}`,
    'Разбери, как идут тренировки, питание и восстановление, и предложи правки к программе. Новую программу пришли в формате импорта «Подхода», как в конце отчёта.',
    'Обозначения: 16×10 — вес × повторы; 10/11 — левая/правая сторона; «Л» — подход только левой; «с» — секунды; +8 — добавочный вес; запас — повторов в запасе (RIR); усталость — общая за тренировку (sRPE 1–10).',
    '',
  ];

  // Профиль и вес
  const M = model(), wd = days.filter(d => M.days[d]);
  out.push(`Профиль: рост ${num(p.height)} см, вес по модели ${n1(currentWeight())} кг (последний замер ${n1(p.weight)} кг, ${fmtDate(p.weightDate)}), жир ~${num(currentBf())} %, цель — ${(GOALS[p.goal]?.l || '').toLowerCase()}.`);
  if (wd.length > 1) out.push(`Вес по модели за период: ${n1(M.days[wd[0]].w)} → ${n1(M.days[wd[wd.length - 1]].w)} кг.`);

  // Питание
  const logged = days.filter(d => totals(d).n > 0), tg = targets(end);
  if (logged.length) {
    const m = f => num(mean(logged, d => totals(d)[f]));
    out.push(`Питание: записи за ${logged.length} из ${days.length} дн. В среднем ${m('kcal')} ккал (цель ${num(tg.kcal)}), белок ${m('p')} г (цель ${num(tg.p)}), жиры ${m('f')} г, углеводы ${m('c')} г, клетчатка ${m('fb')} г (цель ${num(tg.fb)}).`);
  } else out.push('Питание: записей нет.');

  // Сон и самочувствие
  const recs = days.map(dayRec).filter(Boolean), pick = k => recs.filter(r => r[k] != null);
  if (pick('sleep').length || pick('well').length) {
    out.push(`Сон: в среднем ${pick('sleep').length ? n1(mean(pick('sleep'), r => r.sleep)) + ' ч' : '—'} (записан ${pick('sleep').length} дн.), качество ${pick('sq').length ? n1(mean(pick('sq'), r => r.sq)) : '—'} из 5, самочувствие ${pick('well').length ? n1(mean(pick('well'), r => r.well)) : '—'} из 5.`);
  } else out.push('Сон: записей нет.');

  // Тренировки: сводка
  const wos = days.flatMap(workoutsOn).sort((x, y) => x.start - y.start);
  const sr = wos.filter(w => w.srpe != null);
  out.push(`Тренировки: ${wos.length} (${n1(wos.length / weeks)} в неделю)${wos.length ? `, в среднем ${num(mean(wos, woMinutes))} мин` : ''}${sr.length ? `, усталость в среднем ${n1(mean(sr, w => w.srpe))}` : ''}.`);
  const mus = Object.fromEntries(MUSCLES.map(m => [m, 0]));
  for (const w of wos) for (const it of w.items) { const m = S.ex[it.ex]?.muscle; if (m in mus) mus[m] += workSets(it).length; }
  const musTxt = MUSCLES.filter(m => mus[m]).map(m => `${m} ${n1(mus[m] / weeks)}`).join(' · ');
  if (musTxt) out.push(`Рабочих подходов в неделю по группам: ${musTxt}.`);

  // Тренировки по дням
  if (wos.length) {
    out.push('', 'Тренировки по дням (только рабочие подходы):');
    for (const w of wos) {
      out.push('', `${WD_SHORT[parse(w.date).getDay()]} ${fmtShort(w.date)} · ${w.name || 'Тренировка'} · ${woMinutes(w)} мин${w.srpe != null ? ` · усталость ${w.srpe}` : ''}`);
      for (const it of w.items) out.push(itemLine(it));
      if (w.note?.trim()) out.push(`Заметка: ${w.note.trim()}`);
    }
  }

  // Прогресс: первый и последний раз за период
  const ids = [...new Set(wos.flatMap(w => w.items.map(i => i.ex)))];
  const prog = ids.map(id => {
    const ss = sessions(id).filter(s => s.date >= a && s.date <= end);
    if (ss.length < 2) return null;
    const k = kindOf(id), f = ss[0], l = ss[ss.length - 1], load = byLoad(k);
    const u = load ? ' кг' : ' ' + unitOf(k), d = load ? 1 : 0;
    const lr = isUni(id) && f.lr != null && l.lr != null ? `; левая ${Math.round(f.lr * 100)} → ${Math.round(l.lr * 100)} % от правой` : '';
    return `- ${exName(id)}: ${load ? 'расчётный максимум' : k === 'time' ? 'лучшее время' : 'лучший подход'} ${num(f.best, d)} → ${num(l.best, d)}${u} (тренировок: ${ss.length})${lr}`;
  }).filter(Boolean);
  if (prog.length) out.push('', 'Прогресс за период (первый → последний раз):', ...prog);

  if (program) {
    const tpls = all('tpl').sort((x, y) => x.name.localeCompare(y.name, 'ru'));
    if (tpls.length) out.push('', 'Текущая программа (формат импорта «Подхода»):', toText({ tplIds: tpls.map(t => t.id) }).replace(/^\/\/.*\n/, '').trim());
  }
  return out.join('\n') + '\n';
}
