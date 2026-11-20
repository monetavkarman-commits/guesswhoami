# GuessWhoAmI: где остановились (20.11.2026)

- Живой сайт: https://guesswhoami.eu (GitHub Pages, запасной адрес https://monetavkarman-commits.github.io/guesswhoami/, деплой из `public/` по пушу в main) и https://claude.ai/artifact/XEQV83uqdWp7RRhgZFTYHa (Claude Artifact, там работает рейтинг).
- Код: эта папка и GitHub monetavkarman-commits/guesswhoami (публичный). Сайт целиком в `public/`, данные собираются скриптами в `scripts/`.
- Публикация: скопировать `public/.` в папку артефакта и опубликовать `artifact.html` по ссылке выше, поднять VERSION в `public/sw.js`.
- Тесты: `cd public && python3 -m http.server 8765`, затем Playwright-скрипты (фазз сеток и цепочек по всем играм, 60 сидов на фильтр).
- Внешние данные (Liquipedia, Wikidata) качаются через браузер на Mac Арта: контейнерный прокси их блокирует. Liquipedia: не чаще раза в 5–6 с, ≤50 страниц за запрос, без list=search.

## Сделано недавно
- Салиба: аренды больше не обрывают основной контракт.
- Дуэли выключены флагом `DUELS` в `public/js/app.js`.
- Формула-1 убрана полностью (лицензия данных была некоммерческая).
- Цепочка: у каждого шага клуб и годы совместной игры.
- Футбол: позиции «wing half»/ошибочные больше не выкидывают игроков (Левандовский, Неймар, Бейл и ещё ~100).

## Дальше
- Переезд на GitHub Pages: Арт создаёт пустой репозиторий и подключает GitHub, тогда залить `public/` и включить Pages. Решить: рейтинг выключить или подключить Supabase/Firebase.
- Правила Riot для фан-сайтов проверить перед рекламой.
- Не сделано: автообновление данных, фото игроков.

## Аккаунты (с 20.11.2026)
- Вход по желанию через Supabase: проект https://uspdbqzfrvfhgpeuguje.supabase.co (аккаунт Арта), ключ publishable в `public/js/config.js`.
- Схема и правила доступа: `supabase/schema.sql` (таблицы `docs` для рейтинга/дуэлей и `profiles` для ников, RLS: читать всем, писать только своё).
- Код: `public/js/account.js` (окно входа), `public/js/online.js` (бэкенд Supabase или база артефакта).
- Ограничения: встроенная почта Supabase шлёт лишь несколько писем в час, позже подключить SMTP (Resend). Очки пишет клиент, их можно подделать; при необходимости перенести подсчёт на сервер.
- Защита: CSP в `public/index.html`, запрет встраивания в чужие фреймы в `app.js`.

## Картинки (с 20.11.2026)
- Ничего не копируем, браузер грузит картинки с официальных серверов; в CSP (`public/index.html`) разрешены steamstatic, ddragon, upload.wikimedia.org.
- Dota 2 и LoL: у предметов поле `img`, у файла данных `imgBase` (собирает `scripts/build-items.mjs`; ключи Dota из `data/raw/dota-img-keys.json`, это константы OpenDota).
- Спорт: фото игроков (`ph`) и логотипы клубов (`logos`, индекс клуба -> путь) с Wikimedia Commons. Файлы берутся из Wikidata (P18, P154) по спискам из `data/raw/sport-qids.json`, результат лежит в `data/raw/sport-images.json`, `scripts/build-sports.mjs` превращает их в пути `a/ab/File.jpg`.
- Как обновить: запросить P18/P154 по qids через SPARQL в браузере Арта (с вкладки query.wikidata.org: с raw.githubusercontent.com и с самого сайта fetch блокирует CSP), сохранить в `data/raw/sport-images.json`, запустить `node scripts/build-sports.mjs`.
- Нет картинок: у игроков и клубов киберспорта (Liquipedia) и у оружия/карт CS.
