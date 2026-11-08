# Changelog

What each public release of KL · Akasha brings. The public repository gets one commit per release, with its entry below as the message and a `v<version>` tag; the work behind it is not published.

## [Unreleased]

## [0.1.0] - 2026-11-08

The first public release: the marketplace and three plugins.

### Added

- **Marketplace.** `claude plugin marketplace add KLAcceX/kl-akasha`, then install only the plugins you want. One domain per plugin, one skill per plugin, a catalog in the README. MIT license.
- **Argos 0.9.0, pull requests.** One `argos` skill with seven jobs: Triage, Fix, Lessons, Review, Validate, Impact and Vigil.
  - A pane in Claude Code: one list of every open PR, By repo and By author views, a dashboard, repo pages, history and Settings, first-run setup, in English and Brazilian Portuguese.
  - Validate gives each PR in a batch a verdict, in layers behind a gate that always runs; runs say how they ended; auto-validate on what changed; opt-in auto-merge that checks who opened the PR and leaves coding agents and bots out.
  - Fix my PRs runs in the background, in the repo's local clone.
  - Findings on other people's PRs, bug and cleanup types, posted as a brief and comments on the lines, by hand or per repo, after their summaries, proof and lines are checked.
  - Lessons learns what reviewers keep asking; Impact measures review waits before and since comments.
  - Agent configs are gated and validating agents stay read only.
- **Lethe 0.2.0, redaction.**
  - Clean: text, files, folders, transcripts and logs lose secrets, tokens, e-mails, phones, IDs, local paths and names behind stable tags, and stay readable.
  - Publish: a private repo reaches its public mirror as releases, one sanitized commit per CHANGELOG entry with a `v<version>` tag, never the private history. Every file and the message are scanned for leaks, the mirror's protections are checked, and nothing is pushed without a yes. `push --reset` replaces a public history once.
- **Ma'at 0.1.0, compliance.** One `maat` skill that checks a web app against the rules it must follow, with evidence for every verdict and a dated source for every rule.
  - Core: Audit the whole app, Diff only what a PR or branch touches, re-check its Sources, and a Profile of what applies to the product and which law asks for it.
  - Accessibility, measured against WCAG 2.2 AA and labelled by the law behind each item (LBI and NBR 17225, the European Accessibility Act, ADA, Section 508): contrast of design tokens in light and dark, fixed at the token (ACS-01); alt text, form labels, button and link names, page language (ACS-02, 04 to 06); keyboard focus (ACS-03); overlays and "fully compliant" claims (ACS-07).
  - Reports in English and Brazilian Portuguese, checked against the evidence protocol before they are shown.
