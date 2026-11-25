# Работа с вики

- Следуйте принципу узких интерфейсов из [deslop-please](https://github.com/deterministic-machines/deslop-please). Гайды, их источники и разметку храните в dist/editorial.js. Браузер и сборка статических страниц используют этот модуль.
- Линтер deslop-please читает индекс Rust Analyzer. Для JavaScript и Python проверяйте сборку GitHub Pages и сценарии из tests/github-pages.test.mjs и worker/seo.test.mjs.
- В руководствах различайте сведения из патчноутов и значения из каталога. Сохраняйте постоянные URL опубликованных страниц.
