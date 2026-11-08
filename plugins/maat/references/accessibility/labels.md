# Labels

What a screen reader announces. Four controls, all cheap to fix and all among the six most common failures of 2026 (WebAIM Million).

| ID | Control | WCAG 2.2 | How common (2026) |
|---|---|---|---|
| ACS-02 | Text alternatives for images | 1.1.1 (A); 1.4.5 for images of text | 53.1% of home pages have an image with no alt |
| ACS-04 | Form fields have labels | 1.3.1, 3.3.2, 4.1.2 (A) | 51.0% |
| ACS-05 | Links and buttons have names | 2.4.4, 4.1.2 (A) | empty links 46.3%, empty buttons 30.6% |
| ACS-06 | Page language and title | 3.1.1, 2.4.2 (A) | no `lang` on 13.5% |

## How to check

1. `node scripts/scan.mjs <app dir> --json` finds, with file and line:
   - `img-no-alt` (ACS-02, high): `<img>`/`<Image>` with no `alt`. `alt=""` is right for decoration and is not flagged.
   - `img-placeholder-alt` (ACS-02, check): alt that is a file name or "image", "photo", "logo".
   - `field-placeholder-only` / `field-no-label` (ACS-04, high): an input, select or textarea with no `<label for>`, no wrapping `<label>`, no `aria-label`/`aria-labelledby`. A placeholder is not a label: it disappears on typing and has weak contrast.
   - `button-no-name` / `a-no-name` (ACS-05, high): only an icon inside and no `aria-label` or `sr-only` text; `*-name-unknown` (check) when the text comes from an expression.
   - `html-no-lang`, `no-title` (ACS-06, high).
2. With a URL, `browse.mjs axe` confirms on the rendered page (`image-alt`, `label`, `button-name`, `link-name`, `html-has-lang`, `document-title`), which catches names built at runtime.
3. **Quality is judgment.** Neither script knows whether an alt says what the image is for. Read each alt with its context and mark `human` when it is redundant with the caption, starts with "image of", describes a decorative image, leaves a linked image without its destination, or misses text that is inside the image. A complex image (chart, diagram) needs a longer description next to it (a data table or `aria-describedby`).

## Fix

- `<img alt="">` for decoration; a short alt that serves the same purpose for content; the destination for a linked image.
- Make the components carry it: an `Image` component whose `alt` is required in its type (`alt: string`, with `""` allowed on purpose) and an `IconButton` that requires `label` and renders `aria-label` or `<span class="sr-only">`.
- Labels: `<label for>` + `id`, or wrap the field. Keep the placeholder as a hint, not as the label.
- Language: `<html lang="pt-BR">` (Next.js: in `app/layout.tsx`); a `<title>` per route in single-page apps.
- AI-suggested alt text is a draft for a person to approve, never published as is.

## Sources

- WCAG 2.2 SC 1.1.1, 1.3.1, 2.4.2, 2.4.4, 3.1.1, 3.3.2, 4.1.2. https://www.w3.org/TR/WCAG22/, checked 2026-11-04 [primary]
- W3C images tutorial (decorative, functional, complex images). https://www.w3.org/WAI/tutorials/images/, checked 2026-11-04 [primary, page not re-opened this round]
- WebAIM Million 2026, top six failures. https://webaim.org/projects/million/, checked 2026-11-04 [secondary]
- axe-core rule list. https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md, checked 2026-11-04 [primary]
