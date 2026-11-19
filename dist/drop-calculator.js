"use strict";

(() => {
  const ordinary = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
  const precise = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 10 });
  const number = value => ordinary.format(value);
  const basisLabels = new Map(Object.entries({
    "per kill":"за убийство", "per clear":"за прохождение", "per opening":"за открытие",
    "per hunt":"за вылазку", "per success":"за успешное действие",
    "per successful stage":"за успешный этап", "per completed target":"за полную кражу",
    "per completed rock":"за добытую породу", "per hit":"за удар",
    "per completed cut":"за срубленное дерево", "per cook":"за готовку",
    "per harvest":"за сбор урожая", "per action":"за действие",
    "per fish":"за рыбалку", "per fishing action":"за попытку ловли",
    "per use":"за использование", "per craft":"за изготовление",
    "per trip":"за вылазку", "per purchase":"за покупку",
    "per completion":"за завершение", "per survey":"за разведку",
    "per successful hunt":"за успешную охоту", "per cast":"за применение заклинания",
    "per production cycle":"за производственный цикл"
  }));

  function basisLabel(name) {
    return basisLabels.get(name) || (/[А-Яа-яЁё]/.test(name || "") ? name : "");
  }

  function attempts(probability, confidence) {
    if (probability === 1) return 1;
    if (!(probability > 0 && probability < 1)) return null;
    const target = Math.log1p(-confidence);
    const miss = Math.log1p(-probability);
    const estimate = Math.ceil(target / miss);
    if (!Number.isSafeInteger(estimate)) return null;
    if (estimate > 1 && (estimate - 1) * miss <= target) return estimate - 1;
    return estimate * miss <= target ? estimate : estimate + 1;
  }

  function time(seconds) {
    if (!Number.isFinite(seconds)) return "—";
    if (seconds >= 86_400) return number(seconds / 86_400) + " д";
    if (seconds >= 3_600) return number(seconds / 3_600) + " ч";
    if (seconds >= 60) return number(seconds / 60) + " мин";
    return number(seconds) + " с";
  }

  function percentage(probability) {
    const value = probability * 100;
    if (value > 0 && value < 1e-10) return value.toExponential(3).replace(".", ",") + " %";
    return (value < 1 ? precise : ordinary).format(value) + " %";
  }

  function makeTable(headers, rows) {
    const header = headers.map(title => '<th scope="col">' + title + '</th>').join("");
    const body = rows.map(row => "<tr>" + row.map(cell => "<td>" + cell + "</td>").join("") + "</tr>").join("");
    return '<div class="table-frame"><table><thead><tr>' + header + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  globalThis.bindWikiDropCalculator = function bindWikiDropCalculator(root, data) {
    if (!data) return;
    const section = root.querySelector("#drop-calculator");
    const form = section?.querySelector("form");
    const result = section?.querySelector(".drop-estimate-result");
    const basis = section?.querySelector(".drop-estimate-basis");
    if (!form || !result || !basis) return;
    const source = form.elements.namedItem("source");
    const { sources = [], xpFactor = 0 } = data;
    const chanceField = xpFactor ? "xp" : "chance";
    const names = ["min", "max", "success", chanceField, "stages", "delay"];
    const fields = Object.fromEntries(names.map(name => [name, form.elements.namedItem(name)]));
    if (Object.values(fields).some(field => !field)) return;
    fields.stages.step = "1";
    let maxFollowsMin = true;
    const labels = {
      source:"Источник", min:"Время действия или минимум (с)", max:"Максимальное время (с)",
      success:"Шанс успеха (%)", xp:"Опыт за успешное действие",
      chance:"Шанс добычи при успехе (%)", stages:"Успехов на один бросок добычи",
      delay:"Дополнительное время после неудачи (с)"
    };
    for (const field of [source, ...Object.values(fields)]) {
      const label = field?.closest?.("label");
      const text = Array.from(label?.childNodes ?? []).find(node => node.nodeType === 3);
      if (text) text.textContent = labels[field.name] + " ";
    }
    const detail = form.querySelector("details");
    const summary = detail?.querySelector?.("summary");
    if (summary) summary.textContent = "Этапы и задержка после неудачи";
    if (source?.options) {
      for (const option of source.options) {
        if (option.value === "custom") {
          option.textContent = "Свои параметры";
          continue;
        }
        const method = sources[Number(option.value)];
        if (!method) continue;
        const localizedTitle = method.ruTitle || option.textContent.split(" · ")[0] || method.title;
        const context = basisLabel(method.name);
        option.textContent = localizedTitle + (context ? " · " + context : "");
      }
    }

    function showError(message) {
      result.innerHTML = "<p>" + message + "</p>";
    }

    function render() {
      if (names.some(name => !fields[name].validity.valid)) {
        showError("Укажите проценты от 0 до 100, положительное время и целое число успехов на один бросок.");
        return;
      }
      const read = name => fields[name].value === "" ? null : Number(fields[name].value);
      const duration = read("min");
      const end = read("max");
      const success = read("success");
      const dropInput = read(chanceField);
      const conditional = dropInput == null ? null : Math.min(1, dropInput / (xpFactor || 100));
      const stages = read("stages") ?? 1;
      const delay = read("delay") ?? 0;
      if (success == null || conditional == null) {
        showError(xpFactor ? "Укажите опыт, получаемый за один бросок." : "Укажите шанс успеха действия и шанс добычи при успехе.");
        return;
      }
      if (success === 0 || conditional === 0) {
        showError("При этих значениях предмет не выпадет.");
        return;
      }
      if ((duration != null && duration <= 0) || (end != null && (duration == null || end < duration))) {
        showError("Укажите положительное время действия. Максимум должен быть не меньше минимума.");
        return;
      }
      const isSingleStage = stages === 1;
      const successRate = success / 100;
      const probability = isSingleStage ? successRate * conditional : conditional;
      const average = duration == null ? null :
        ((duration + (end ?? duration)) / 2 + (1 - successRate) * delay) * (isSingleStage ? 1 : stages / successRate);
      const variable = (end != null && end !== duration) || (successRate < 1 && (!isSingleStage || delay > 0));
      const rows = [0.50, 0.90, 0.95, 0.99].map(confidence => {
        const count = attempts(probability, confidence);
        return [
          Math.round(confidence * 100) + "%",
          count == null ? "За пределами расчёта" : number(count),
          count == null || average == null ? "—" : time(count * average)
        ];
      });
      const label = isSingleStage ? "Шанс за попытку" : "Шанс за завершённый бросок добычи";
      const mean = average == null ? "" : "<p>Среднее время до первого выпадения <strong>" + time(average / probability) + "</strong></p>";
      result.innerHTML = "<p>" + label + " · <strong>" + percentage(probability) + "</strong></p>" + mean +
        makeTable(["Шанс получить хотя бы один предмет", isSingleStage ? "Попытки" : "Броски добычи", "Примерное время"], rows) +
        '<p class="wiki-note">Указано минимальное число независимых попыток для заданного шанса.' +
        (variable ? " При оценке учтены среднее время действия и возможные неудачи." : "") +
        (average == null ? " Добавьте время действия, чтобы рассчитать продолжительность." : "") + "</p>";
    }

    function useSource() {
      const method = !source || source.value === "custom" ? null : sources[Number(source.value)];
      const average = method?.min == null ? null : (method.min + (method.max ?? method.min)) / 2;
      const values = method ? { ...method, min: average, max: average, chance: method.p * 100 } :
        { success: 100, stages: 1, delay: 0 };
      for (const name of names) fields[name].value = values[name] == null ? "" : String(values[name]);
      maxFollowsMin = true;
      if (detail) detail.open = Boolean(method && (method.stages > 1 || method.delay > 0));
      if (xpFactor) {
        basis.textContent = "Каждое подходящее начисление опыта даёт один бросок. Введите полученный опыт с учётом бонусов. Шанс равен опыту, делённому на " + number(xpFactor) + ".";
      } else if (method) {
        const label = basisLabel(method.name);
        const title = method.ruTitle || source.selectedOptions?.[0]?.textContent.split(" · ")[0] || method.title;
        const averageNote = method.max != null && method.max !== method.min ?
          " Для обеих границ указано среднее базовое время " + time(average) + "." : "";
        basis.textContent = "Базовый шанс добычи" + (label ? " " + label : "") + " · " + title + "." +
          averageNote + " Укажите время и шансы для вашего снаряжения.";
      } else {
        basis.textContent = "Укажите итоговый шанс с учётом активации таблицы добычи. Для действий, которые всегда дают бросок добычи, укажите шанс успеха 100 %.";
      }
      render();
    }

    source?.addEventListener("change", useSource);
    form.addEventListener("input", event => {
      if (event.target === source) return;
      if (event.target === fields.max) maxFollowsMin = fields.max.value === "" || fields.max.value === fields.min.value;
      if (event.target === fields.min && maxFollowsMin) fields.max.value = fields.min.value;
      render();
    });
    form.addEventListener("submit", event => event.preventDefault());
    useSource();
  };
})();
