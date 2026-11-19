"use strict";

(() => {
  const localized = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
  const number = value => localized.format(value);
  const escapes = { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" };
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => escapes[char]);
  const actionKey = action => action.type + "/" + action.id;
  const engineLoads = new Map();

  function time(seconds) {
    if (!Number.isFinite(seconds)) return "—";
    if (seconds >= 3600) return number(seconds / 3600) + " ч";
    if (seconds >= 60) return number(seconds / 60) + " мин";
    return number(seconds) + " с";
  }

  function table(headers, rows) {
    const heading = headers.map(cell => '<th scope="col">' + cell + '</th>').join("");
    const contents = rows.map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join("") + '</tr>').join("");
    return '<div class="table-frame"><table><thead><tr>' + heading + '</tr></thead><tbody>' + contents + '</tbody></table></div>';
  }

  function readProfile(form) {
    const fields = new FormData(form);
    const value = name => Number(fields.get(name));
    return {
      from: value("from"),
      to: value("to"),
      support: value("support"),
      mode: fields.get("mode"),
      switchTime: value("minutes") * 60,
      xpBonus: value("xpBonus"),
      speed: value("speed"),
      unlocked: fields.has("unlocked"),
      stealth: value("stealth"),
      stunAvoidance: value("stunAvoidance"),
      tools: fields.getAll("tool")
    };
  }

  function bindComparison(root) {
    const form = root.querySelector("#training-compare");
    const result = root.querySelector("#training-compare-result");
    if (!form || !result) return;
    form.addEventListener("submit", event => {
      event.preventDefault();
      const fields = new FormData(form);
      const xp = Number(fields.get("xp"));
      const base = Number(fields.get("base"));
      const next = Number(fields.get("next"));
      const prep = Number(fields.get("prep")) * 60;
      if (!(xp > 0 && base > 0 && next > 0 && prep >= 0)) return;
      const current = 3600 * xp / base;
      const upgraded = prep + 3600 * xp / next;
      const savings = current - upgraded;
      const comparison = savings > 0 ? "Новая экипировка сэкономит " + time(savings) + "." :
        savings < 0 ? "Текущая экипировка сэкономит " + time(-savings) + "." :
          "Оба варианта займут одинаковое время.";
      const breakEven = next > base ? " Новая экипировка окупится после " +
        number(Math.ceil(prep / (3600 / base - 3600 / next))) + " опыта." : "";
      result.innerHTML = table(["Вариант","Общее время"], [
        ["Текущая экипировка",time(current)],["Новая экипировка",time(upgraded)]
      ]) + "<p>" + comparison + breakEven + "</p>";
    });
  }

  function thievingTable(rows, level, link) {
    if (!rows.length) return "";
    return "<h3>Сравнение целей на " + number(level) + "-м уровне</h3>" +
      table(["Цель","Инструмент","Успех за попытку","Опыт за завершение","Время с учётом припасов","Опыт в час"], rows.map(row => [
        link(actionKey(row.action),row.action.name),
        row.tool ? link(row.tool.key,row.tool.name) : "—",
        number(100 * row.timing.chance) + " %",
        number(row.xp),
        time(row.active + row.prep),
        number(3600 * row.rate)
      ])) + "<p>Шанс успеха рассчитан на одну попытку. Опыт начисляется за завершённую цель. Маршрут учитывает время переключения.</p>";
  }

  function routeTable(plan, profile, skill, link) {
    if (!plan.ranges.length) return "<p>Для этих уровней не найден маршрут с доступными источниками. Попробуйте вариант с запасами в банке или повысьте уровни вспомогательных навыков.</p>";
    const thieving = skill === "Thieving";
    const partial = plan.reached < profile.to ? "<p>Дальше для расчёта не хватает сведений о припасах или требованиях.</p>" : "";
    return "<p><strong>Прокачка с " + number(profile.from) + "-го по " + number(plan.reached) + "-й уровень займёт около " + time(plan.seconds) + ".</strong></p>" + partial +
      table(["Уровни","Действие",...(thieving ? ["Инструмент"] : []),
        "Опыт в секунду с учётом подготовки","Добыча припасов и переключение","Общее время","Источники припасов"], plan.ranges.map(range => [
        number(range.from) + "–" + number(range.to),
        link(actionKey(range.action),range.action.name),
        ...(thieving ? [range.tool ? link(range.tool.key,range.tool.name) : "—"] : []),
        number(range.xp / (range.seconds + range.switches)),
        time(range.prep + range.switches),
        time(range.seconds + range.switches),
        [...range.sources.values()].map(node => link(node.key,node.name)).join("<br>") || "—"
      ]));
  }

  function loadEngine(url) {
    if (globalThis.MelvorWikiTraining) return Promise.resolve(globalThis.MelvorWikiTraining);
    if (!engineLoads.has(url)) {
      engineLoads.set(url, import(url).then(() => {
        if (!globalThis.MelvorWikiTraining) throw new Error("Training engine unavailable");
        return globalThis.MelvorWikiTraining;
      }).catch(error => {
        engineLoads.delete(url);
        throw error;
      }));
    }
    return engineLoads.get(url);
  }

  globalThis.bindWikiTraining = function bindWikiTraining(root, skill, {
    titleFor, hrefFor, engineUrl = "/wiki-training-engine.js"
  } = {}) {
    bindComparison(root);
    const form = root.querySelector("#training-plan");
    const result = root.querySelector("#training-plan-result");
    if (!form || !result) return;
    const link = (key, original) => {
      const title = escape(titleFor?.(key) || original || key);
      const href = hrefFor?.(key);
      return href ? '<a href="' + escape(href) + '">' + title + '</a>' : title;
    };
    let calculation = 0;
    async function render() {
      const current = ++calculation;
      const profile = readProfile(form);
      if (profile.to <= profile.from) {
        result.innerHTML = "<p>Целевой уровень должен быть выше текущего.</p>";
        return;
      }
      result.textContent = "Рассчитываем маршрут…";
      try {
        const engine = await loadEngine(engineUrl);
        if (current !== calculation) return;
        const {plan,comparison} = engine.calculate(skill,profile);
        result.innerHTML = routeTable(plan,profile,skill,link) + thievingTable(comparison,profile.from,link);
      } catch (error) {
        if (current !== calculation) return;
        result.textContent = "Не удалось рассчитать маршрут. Попробуйте ещё раз.";
        console.error(error);
      }
    }
    form.addEventListener("submit", event => {
      event.preventDefault();
      render();
    });
    render();
  };
})();
