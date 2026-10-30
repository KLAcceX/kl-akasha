// Argos words. Signals travel as stable codes ("conflict", "threads:2") so a
// language switch never looks like news; only what people read changes here.
const WORDS = {
  "pt-BR": {
    changes_requested: "mudanças pedidas",
    threads: (n) => `${n} thread(s) sem resposta`,
    new_reviews: (n) => `${n} review(s) novo(s)`,
    unanswered: "comentário sem resposta",
    ci_failed: "CI falhou",
    conflict: "conflito",
    ready: "aprovado: pronto pra merge",
    no_review: "sem review > 1 dia",
    late: "atrasada > 1 dia",
    asks_review: "pede sua revisão",
    idle_mine: "aguardando review",
    idle_review: "no prazo",
    idle_other: "em andamento",
    h_mine: (n, k) => `Meus PRs abertos: ${n} (${k} pedem ação)`,
    h_review: (n) => `Esperando minha revisão: ${n}`,
    h_others: (n) => `Dos outros: ${n}`,
    col_age: "Idade",
    col_signals: "Sinais",
    none: "Nenhum.",
    news: (n) => `${n} novidade(s)`,
    nothing_new: "nada novo",
    error: "erro",
    no_repos: "nenhum repositório conectado. Use /argos repos add <pasta>.",
    connected: (repo, n) => `${repo} conectado (${n} repositório(s)).`,
    not_github: (path) => `${path} não tem um remote origin do GitHub.`,
    removed: (x) => `${x} desconectado.`,
    not_connected: (x) => `${x} não estava conectado.`,
    list_title: "repositórios conectados",
    ui_title: "Argos · vigília dos PRs",
    ui_command: "Argos: painel dos PRs · /argos repos [add <pasta> | remove <repo>]",
    ui_opened: "Argos: painel aberto, vigília rodando.",
    ui_watching: "vigiando…",
    ui_failed: "a vigília falhou",
    ui_needs: (n) => `${n} pede(m) ação`,
    ui_others: (n) => `${n} dos outros esperando olhar`,
    ui_see: "Ver",
    ui_hide: "Ocultar",
    ui_last: (time) => `última vigília ${time}`,
    ui_never: "nenhuma vigília ainda",
    ui_fix: "Pra corrigir",
    ui_team: "Dos outros",
    ui_all: "Tudo",
    ui_author: (who) => `Autor: ${who || "todos"}`,
    ui_empty: "nada aqui",
  },
  en: {
    changes_requested: "changes requested",
    threads: (n) => `${n} unanswered thread(s)`,
    new_reviews: (n) => `${n} new review(s)`,
    unanswered: "unanswered comment",
    ci_failed: "CI failed",
    conflict: "conflict",
    ready: "approved: ready to merge",
    no_review: "no review > 1 day",
    late: "late > 1 day",
    asks_review: "asks for your review",
    idle_mine: "awaiting review",
    idle_review: "on time",
    idle_other: "in progress",
    h_mine: (n, k) => `My open PRs: ${n} (${k} need action)`,
    h_review: (n) => `Waiting for my review: ${n}`,
    h_others: (n) => `Teammates: ${n}`,
    col_age: "Age",
    col_signals: "Signals",
    none: "None.",
    news: (n) => `${n} new`,
    nothing_new: "nothing new",
    error: "error",
    no_repos: "no repository connected. Use /argos repos add <folder>.",
    connected: (repo, n) => `${repo} connected (${n} repo(s)).`,
    not_github: (path) => `${path} has no GitHub origin remote.`,
    removed: (x) => `${x} disconnected.`,
    not_connected: (x) => `${x} was not connected.`,
    list_title: "connected repositories",
    ui_title: "Argos · PR vigil",
    ui_command: "Argos: PR pane · /argos repos [add <folder> | remove <repo>]",
    ui_opened: "Argos: pane open, vigil running.",
    ui_watching: "watching…",
    ui_failed: "the vigil failed",
    ui_needs: (n) => `${n} need(s) action`,
    ui_others: (n) => `${n} from teammates waiting for a look`,
    ui_see: "Open",
    ui_hide: "Hide",
    ui_last: (time) => `last vigil ${time}`,
    ui_never: "no vigil yet",
    ui_fix: "To fix",
    ui_team: "Teammates",
    ui_all: "All",
    ui_author: (who) => `Author: ${who || "everyone"}`,
    ui_empty: "nothing here",
  },
};

export const LANGS = Object.keys(WORDS);

// Unknown languages fall back to en, the default.
export function t(lang, key, ...args) {
  const w = (WORDS[lang] ?? WORDS.en)[key];
  return typeof w === "function" ? w(...args) : (w ?? key);
}

// "threads:2" → "2 thread(s) sem resposta"
export function label(lang, code) {
  const [key, n] = code.split(":");
  return n === undefined ? t(lang, key) : t(lang, key, Number(n));
}

// --lang <code> from a CLI argument list, defaulting to en.
export function langArg(args) {
  const i = args.indexOf("--lang");
  return i >= 0 ? args[i + 1] : "en";
}
