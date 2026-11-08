// Ma'at words. Verdicts travel as stable codes (pass, fail, human, na, unverified) so a language
// switch changes only what people read.
const WORDS = {
  en: {
    title: (p) => `Ma'at report: ${p}`,
    meta: (date, scope) => `${date} · scope: ${scope}`,
    status_pass: "Passes",
    status_fail: "Fails",
    status_human: "Needs a person",
    status_na: "Not applicable",
    status_unverified: "Not verified",
    summary: "Summary",
    summary_note: "Counts per verdict, not a score: one failing control can be enough for a complaint.",
    controls: "Controls",
    col_id: "ID",
    col_control: "Control",
    col_verdict: "Verdict",
    col_evidence: "Evidence",
    details: "What to do",
    fix: "Fix",
    why: "Why",
    sources: "Sources",
    checked: (d) => `checked ${d}`,
    stale: "older than 6 months: re-check before relying on it",
    coverage: "What this report covers",
    automated: "Checked automatically",
    manual: "Still needs a person",
    disclaimer: "Ma'at checks code and rendered pages against public rules and cites its sources. It is not legal advice, and a passing control is not a certification.",
  },
  "pt-BR": {
    title: (p) => `Relatório Ma'at: ${p}`,
    meta: (date, scope) => `${date} · escopo: ${scope}`,
    status_pass: "Conforme",
    status_fail: "Não conforme",
    status_human: "Precisa de humano",
    status_na: "Não se aplica",
    status_unverified: "Não verificado",
    summary: "Resumo",
    summary_note: "Contagem por veredito, não uma nota: um controle não conforme pode bastar para uma reclamação.",
    controls: "Controles",
    col_id: "ID",
    col_control: "Controle",
    col_verdict: "Veredito",
    col_evidence: "Evidência",
    details: "O que fazer",
    fix: "Correção",
    why: "Por quê",
    sources: "Fontes",
    checked: (d) => `conferida em ${d}`,
    stale: "mais de 6 meses: confira de novo antes de usar",
    coverage: "O que este relatório cobre",
    automated: "Verificado automaticamente",
    manual: "Ainda precisa de uma pessoa",
    disclaimer: "A Ma'at confere código e páginas renderizadas contra regras públicas e cita as fontes. Não é parecer jurídico, e um controle conforme não é certificação.",
  },
};

export const LANGS = Object.keys(WORDS);

// Unknown languages fall back to en.
export function t(lang, key, ...args) {
  const w = (WORDS[lang] ?? WORDS.en)[key];
  return typeof w === "function" ? w(...args) : (w ?? key);
}

// pt, pt-br, pt_BR -> pt-BR; anything else not known -> en.
export function pickLang(code) {
  const c = String(code || "").toLowerCase().replace("_", "-");
  return c.startsWith("pt") ? "pt-BR" : "en";
}
