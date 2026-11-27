# WhoAmIGuess: где остановились

- С 24.11.2026 сайт называется WhoAmIGuess, основной домен https://whoamiguess.com (куплен и DNS в Cloudflare). Старый guesswhoami.eu оставлен как редирект. Репозиторий и почта поддержки пока со старым именем.
- Живой сайт: https://whoamiguess.com (GitHub Pages, запасной адрес https://monetavkarman-commits.github.io/guesswhoami/, деплой из `public/` по пушу в main) и https://claude.ai/artifact/XEQV83uqdWp7RRhgZFTYHa (Claude Artifact, там работает рейтинг).
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

## Deadlock, 12 попыток, «последняя команда» (20.11.2026)
- Игра Deadlock (только режимы «Герои» и «Предметы», без сетки/цепочки: у игры нет базы про-игроков): данные с Liquipedia Deadlock в `data/raw/deadlock-raw.json`, сборка `scripts/build-deadlock.mjs`. Картинок нет: у deadlock-api хосты недоступны из браузера Арта, картинки Liquipedia не берём. 30 предметов из панели не нашлись как страницы.
- Сетка: 12 попыток (`GUESSES` в `public/js/grid.js`).
- Игрок без команды: показываем последнюю («Arsenal · на пенсии» или «последняя команда») через `teamText` в `core.js`, поле `last` кладут сборщики CS и спорта.
- У киберкоманд и клубов без свободного логотипа круглый значок с инициалами (`badge` в `core.js`).

## Esports photos and logos (added)
- `data/raw/esports-wd.json` = Wikidata: professional gamers with a photo (P18) and esports teams with a logo (P154), fetched in the owner's browser from query.wikidata.org (see `scripts/apply-esports-img.mjs` for the shape). `node scripts/build-dataset.mjs` applies it (nickname must match exactly one person; birth year must agree). Coverage is partial: Commons has few free esports photos.
- Also added: legal pages (privacy.html, terms.html), cookie consent, anonymous analytics (`js/analytics.js`, table `events`), dashboard `admin.html`, social sign-in (providers shown automatically when enabled in Supabase), server-checked scores (`supabase/scores.sql`), and a 4-hourly Liquipedia refresh (`.github/workflows/refresh-data.yml`, CS and Dota only).

## Hockey, MMA, boxing (added)
- All three are item-style games like tennis (`itemsOnly`): `scripts/build-fighters.mjs` builds `public/data/{hockey,mma,boxing}-items.json` from `data/raw/{hockey-wd,hockey-extra,fighters-wd}.json` (Wikidata, fetched in the owner's browser; Wikidata is rate-limited, so queries run in chunks of 60-150 ids with a pause and retry on 429).
- Hockey has no grid/who/chain because Wikidata gives club careers without dates (only about 9% of the stints have a start).
- MMA weight class is derived from weight (the Wikidata class labels for MMA are unusable); boxing uses the division label, else the weight.
- `supabase/scores.sql` accepts any game id (regex), so new games need no SQL change; re-run it once after updating.

## Актёры (24.11.2026)
- Новый раздел «🎬 Кино» (третий после киберспорта и спорта, `section: 'movie'` в `GAMES`, `sectionOf()` в `core.js`), игра `actors`, режим «Угадай кто я?» (это item-режим `items`, как MMA/бокс, поэтому scores.sql не менялся).
- Данные: `data/raw/actors-wd.json` + `data/raw/actors-mul.json` (Wikidata, скачаны в браузере Арта с query.wikidata.org), сборка `node scripts/build-actors.mjs` → `public/data/actors-items.json`.
- Правила: 300 самых известных (по числу статей Википедии), загадываются топ-150; родившиеся на территории РФ исключены (по просьбе Арта); не-актёры (режиссёры, музыканты, политики) — список `NOT_ACTORS`; документальные и концертные фильмы не считаются; фильмы позже смерти+2 года (архивные кадры) не считаются.
- Колонки: пол, страна рождения (флаг), год рождения, число фильмов, дебют, последний фильм, главный жанр (по известным фильмам, «драма» с весом 0.5), «Оскар» за актёрскую работу (есть/номинация/нет), общие фильмы с загаданным (новый тип колонки `shared` в `items.js`).
- Сетка и цепочка для актёров (24.11.2026): тот же сборщик пишет `public/data/actors.json` в формате игроков, где «команды» это фильмы минимум с двумя актёрами из списка, «позиция» это главный жанр, а `oscar`/`sex` дают свои критерии сетки (`cfg.movie` в `grid.js`). Связь в цепочке: самый известный общий фильм. Режим «Кто я?» для игроков у актёров скрыт (`modes` в `GAMES.actors`).

## Смена ника раз в 7 дней (24.11.2026)
- Ник рейтинга хранится в `profiles.name` (Supabase), меняется через RPC `set_my_nick`; статус для окна профиля даёт `my_nick()` (`supabase/nick.sql`, уже применён).
- Триггер `profiles_nick_guard` не даёт сменить ник чаще раза в 7 дней (`name_changed_at`), админы (`is_admin()`) без ограничений. Ник при регистрации и первая смена у старых аккаунтов (поле пустое) не ограничены.
- При входе `account.js` только создаёт строку профиля, если её нет, и больше не перезаписывает ник.

## Актёры: фото и картинки фильмов (24.11.2026)
- Фото всех 300 актёров (Wikidata P18 самого актёра, поэтому человек тот самый) и картинки 457 фильмов (постер P3383, иначе логотип-название P154; P18 у фильмов не берём, там случайные фото) лежат на сайте: `public/img/actors/<QID>.webp` (96×96), `public/img/films/p<QID>.webp` (постер 64×96) и `l<QID>.webp` (логотип 128×64 на подложке). Всего ~1,5 МБ, грузятся лениво, sw.js кэширует `/img/` по принципу cache-first.
- Где видно: поиск, строки догадок, ответ, клетки сетки, цепочка (фото); заголовки сетки и звенья цепочки (картинка фильма вместо значка с буквами); колонка «Общих фильмов» (картинка самого известного общего фильма, `filmImg` в `actors-items.json`).
- Авторы и лицензии: страница `public/credits-actors.html` (её пишет `build-actors.mjs`), ссылка в подвале.
- Как обновить: в браузере Арта на commons.wikimedia.org (оттуда разрешены fetch к query.wikidata.org, upload.wikimedia.org и raw.githubusercontent.com) взять `data/raw/actors-film-qids.json` и `public/data/actors-items.json`, запросить P3383/P154, метаданные через Commons API (`iiurlwidth`, `extmetadata`), уменьшить в canvas до webp и скачать JSON; затем `node scripts/apply-actors-img.mjs <файл> && node scripts/build-actors.mjs`. Скачивание из встроенного браузера кладёт файл в ~/Downloads под скрытым именем `.Q6L2SF6YDW.com.anthropic.claudefordesktop.*`.
- Отсеяны вручную (список `DROP` в `apply-actors-img.mjs`): не картинка фильма или нечитаемо маленьким.

## CS: больше игроков, Dota: одна роль героя (27.11.2026)
- CS: в `scripts/fetch-liquipedia.mjs` 12 мэйджоров (добавлены Будапешт 2025, Кёльн 2026, Сингапур 2026) и `CS_EVENTS` — S-tier турниры 2026 года, их игроки попадают в базу с 0 мэйджоров (так появился Jorko и другие текущие про). Новые страницы Liquipedia пишут составы как `{{Opponent|..|players={{Persons|{{Person|..}}}}}}`, парсер `eventPlayers` понимает оба формата. Клетка сетки теперь «Не больше 1 мэйджора». Новые турниры добавлять в эти списки.
- Dota «Герои»: одна основная роль (Керри/Мидер/Оффлейнер/Саппорт) из ручной таблицы `MAIN_ROLE` в `scripts/build-items.mjs`; новый герой без записи останавливает сборку.
