# Melvor Idle 2 Вики на русском

Независимая фанатская вики. Репозиторий содержит русскоязычные статьи, исходники интерфейса, калькуляторы, таблицы и изображения. Игровые материалы принадлежат соответствующим правообладателям.

## Публикация на GitHub Pages

1. Создайте отдельный репозиторий для вики и загрузите этот проект в ветку `main`. На GitHub Free Pages доступен для публичного репозитория. Существующий личный сайт можно сохранить в его собственном репозитории.
2. В репозитории вики откройте **Settings → Pages** и в поле **Source** выберите **GitHub Actions**.
3. Откройте **Actions → Публикация вики на GitHub Pages → Run workflow**. Обновления ветки `main` затем запускают ту же сборку. GitHub Actions берёт адрес сайта из настроек Pages, поэтому ссылки и карта сайта автоматически учитывают подкаталог проекта или собственный домен.
4. Проверьте адрес в разделе **Settings → Pages**. Для кнопки **«Предложить правку»** включите **Issues** в настройках репозитория. Посетитель сможет открыть черновик обращения и опубликовать его через GitHub.

[Документация GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Для переноса с историей скачайте Git bundle и выполните команды в каталоге загрузок.

```sh
git clone melvor-2-wiki-ru-pages.bundle melvor-2-wiki-ru
cd melvor-2-wiki-ru
git remote set-url origin https://github.com/ВАШ_ЛОГИН/ВАШ_РЕПОЗИТОРИЙ.git
git push -u origin HEAD:main
```

Укажите адрес созданного репозитория. Команда подходит для пустого репозитория.

## Индексация

1. В **Google Search Console** добавьте ресурс **«С префиксом URL»**. Укажите точный HTTPS-адрес опубликованной вики, включая подкаталог репозитория, если он есть. В **Яндекс Вебмастере** добавьте адрес сайта.
2. Выберите подтверждение метатегом. В GitHub откройте **Settings → Secrets and variables → Actions → Variables** и создайте `GOOGLE_SITE_VERIFICATION` и `YANDEX_VERIFICATION` со значениями атрибутов `content` из соответствующих метатегов. Снова запустите публикацию, после чего подтвердите права.
3. В обоих сервисах добавьте адрес карты, например `https://username.github.io/repository/sitemap.xml`. Используйте адрес, с которого открывается ваша вики.
4. Для Яндекса и файла `robots.txt` адрес в корне отдельного домена удобнее. Если Яндекс предложит подтвердить основной адрес `username.github.io`, код подтверждения должен быть на главной странице этого адреса. У GitHub Pages также можно подключить собственный домен в **Settings → Pages**.

[Проверка прав в Google](https://support.google.com/webmasters/answer/9008080?hl=ru) · [Проверка прав в Яндексе](https://yandex.ru/support/webmaster/ru/service/rights) · [Контроль карты сайта в Google](https://support.google.com/webmasters/answer/7451001?hl=ru) · [Карта сайта в Яндексе](https://yandex.ru/support/webmaster/ru/indexing-options/sitemap)

Каждая карточка доступна по собственному адресу. Русский текст и иллюстрации доступны в готовом HTML. Поиск по названиям, калькуляторы и фильтры работают в браузере. Сроки индексации и позиции определяют поисковые системы.

## Локальная сборка

Нужны Node.js 24 и Python 3. Выходной каталог должен быть пустым.

```sh
node scripts/build-pages.mjs \
  --url https://username.github.io/repository/ \
  --repository username/repository \
  --output _site
node tests/github-pages.test.mjs _site https://username.github.io/repository/
```

В `_site` будут HTML, стили, скрипты, иллюстрации, `404.html`, `sitemap.xml` и `robots.txt`. Чтобы сменить адрес сайта, соберите тот же проект с новым `--url` или запустите GitHub Actions после обновления настроек Pages.

[Источник игровых данных и изображений](https://melvor2wiki.github.io/) · [Страница игры в Steam](https://store.steampowered.com/app/3218350/Melvor_Idle_2_A_RuneScape_Adventure/)
