// Cookie / storage notice. Necessary storage (language, theme, results, login) needs no consent;
// the anonymous visit statistics only run after "Принять".
import { tr } from './i18n.js';
import { h, store } from './core.js';

export const consent = () => store.get('consent', null); // 'yes' | 'no' | null

export function askConsent(force = false) {
  if (!force && consent()) return;
  document.querySelector('.consent')?.remove();
  const set = (v) => { store.set('consent', v); bar.remove(); document.dispatchEvent(new CustomEvent('gwai:consent')); };
  const bar = h('div', { class: 'consent', role: 'dialog', 'aria-label': 'Cookies' },
    h('p', {}, tr('Мы используем cookies и localStorage: они нужны для работы сайта (язык, тема, ваши результаты). С вашего согласия мы также считаем анонимную статистику посещений.'), ' ',
      h('a', { href: 'privacy.html' }, tr('Подробнее'))),
    h('div', { class: 'consent-btns' },
      h('button', { class: 'btn ghost small', type: 'button', onclick: () => set('no') }, tr('Только необходимые')),
      h('button', { class: 'btn small', type: 'button', onclick: () => set('yes') }, tr('Принять'))));
  document.body.append(bar);
}
