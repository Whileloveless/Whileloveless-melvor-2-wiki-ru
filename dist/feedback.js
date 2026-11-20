"use strict";

const suggestButton = document.querySelector("#suggest-edit");
const suggestionDialog = document.querySelector("#suggestion");
const closeSuggestion = document.querySelector("#close-suggestion");
const suggestionForm = document.querySelector("#suggestion-form");
const suggestionMessage = document.querySelector("#suggestion-message");
const suggestionPage = document.querySelector("#suggestion-page");
const suggestionStatus = document.querySelector("#suggestion-status");
const suggestionSignin = document.querySelector("#suggestion-signin");
const sendSuggestion = suggestionForm.querySelector('button[type="submit"]');
const suggestionDraftKey = "melvor-suggestion-draft";
const suggestionRepository = pagesHosting?.repository;

if (suggestionRepository) {
  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = "После публикации правка будет видна всем. Проверьте текст перед отправкой на GitHub.";
  suggestionForm.insertBefore(note,sendSuggestion);
  sendSuggestion.textContent = "Открыть черновик на GitHub";
}

let suggestionRoute = "#/";
let sendingSuggestion = false;

function showSuggestionStatus(message, state) {
  suggestionStatus.textContent = message;
  suggestionStatus.dataset.state = state;
  suggestionStatus.hidden = !message;
}

function openSuggestion() {
  const route = wikiRoute();
  suggestionRoute = route.length <= 300 && /^#\/[^\s<>]*$/.test(route) ? route : "#/";
  const title = document.querySelector("main h1")?.textContent || "Главная";
  suggestionPage.textContent = "Страница · " + title;
  showSuggestionStatus("", "");
  if (suggestionSignin) suggestionSignin.hidden = true;
  suggestionForm.hidden = false;
  suggestionDialog.showModal();
}

suggestButton.addEventListener("click",openSuggestion);
suggestionSignin?.addEventListener("click", () => {
  try {
    sessionStorage.setItem(suggestionDraftKey,JSON.stringify({page:suggestionRoute,message:suggestionMessage.value}));
  } catch {
    // The current message remains visible when local browser storage is unavailable.
  }
});

closeSuggestion.addEventListener("click", () => suggestionDialog.close());
suggestionDialog.addEventListener("cancel", event => {
  if (sendingSuggestion) event.preventDefault();
});
suggestionDialog.addEventListener("close", () => suggestButton.focus());

suggestionForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (sendingSuggestion) return;
  const message = suggestionMessage.value.trim();
  if (!message) {
    showSuggestionStatus("Напишите, что нужно исправить.", "error");
    suggestionMessage.focus();
    return;
  }
  if (suggestionRepository) {
    const title = document.querySelector("main h1")?.textContent || "Главная";
    const draft = new URL("https://github.com/" + suggestionRepository + "/issues/new");
    draft.search = new URLSearchParams({
      title:"Правка в вики · " + title,
      body:message + "\n\nСтраница вики\n" + location.href
    });
    window.open(draft.href,"_blank","noopener,noreferrer");
    return;
  }

  sendingSuggestion = true;
  sendSuggestion.disabled = true;
  closeSuggestion.disabled = true;
  suggestionMessage.readOnly = true;
  suggestionSignin.hidden = true;
  showSuggestionStatus("Отправляем предложение…", "");

  try {
    const response = await fetch("/api/suggestions",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({page:suggestionRoute,message})
    });
    if (response.status === 401) {
      const destination = location.pathname + location.search;
      suggestionSignin.href = "/signin-with-chatgpt?" + new URLSearchParams({return_to:destination});
      suggestionSignin.hidden = false;
      showSuggestionStatus("Войдите через ChatGPT, чтобы отправить правку.", "");
      return;
    }
    if (response.status !== 201 || (await response.json()).saved !== true) {
      throw new Error("Suggestion not saved");
    }
    suggestionForm.reset();
    suggestionForm.hidden = true;
    showSuggestionStatus("Предложение отправлено. Спасибо!", "success");
  } catch {
    showSuggestionStatus("Не удалось отправить предложение. Попробуйте ещё раз.", "error");
  } finally {
    sendingSuggestion = false;
    sendSuggestion.disabled = false;
    closeSuggestion.disabled = false;
    suggestionMessage.readOnly = false;
    (suggestionForm.hidden ? closeSuggestion : suggestionMessage).focus();
  }
});

if (!suggestionRepository) {
  try {
    const draft = JSON.parse(sessionStorage.getItem(suggestionDraftKey));
    if (draft?.page === wikiRoute() && typeof draft.message === "string") {
      sessionStorage.removeItem(suggestionDraftKey);
      suggestionMessage.value = draft.message;
      openSuggestion();
    }
  } catch {
    // The form works without local browser storage.
  }
}
