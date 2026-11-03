// A sample round with several repos and every section, signal and mark, for /argos demo
// and the preview. at and okAt are set when it is shown.
import type { Round, Verdicts } from '../types'

export const DEMO_ROUND: Omit<Round, 'at'> = {
  "me": "you",
  "repos": [
    "acme/checkout",
    "acme/web",
    "acme/billing",
    "acme/mobile-app",
    "acme/infra-tf",
    "acme/docs"
  ],
  "pending": [
    {
      "kind": "mine",
      "repo": "acme/checkout",
      "number": 219,
      "title": "Move shipping rules to the new pricing service",
      "url": "https://github.com/acme/checkout/pull/219",
      "author": "you",
      "createdAt": "2026-10-20T10:00:00Z",
      "size": 1240,
      "signals": [
        "conflict",
        "threads:2"
      ],
      "labels": [
        {
          "name": "bug",
          "color": "d73a4a"
        },
        {
          "name": "pricing",
          "color": "0e8a16"
        }
      ],
      "ci": "fail",
      "sha": "0219a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "mine",
      "repo": "acme/checkout",
      "number": 224,
      "title": "Coupon field keeps focus after an error",
      "url": "https://github.com/acme/checkout/pull/224",
      "author": "you",
      "createdAt": "2026-10-28T09:00:00Z",
      "size": 48,
      "signals": [
        "unanswered"
      ],
      "labels": [
        {
          "name": "ui",
          "color": "a2eeef"
        }
      ],
      "ci": "pass",
      "sha": "0224a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "review",
      "repo": "acme/web",
      "number": 7,
      "title": "Paginate search by cursor",
      "url": "https://github.com/acme/web/pull/7",
      "author": "bia",
      "createdAt": "2026-10-27T14:00:00Z",
      "since": "2026-10-29T09:00:00Z",
      "size": 310,
      "signals": [
        "late"
      ],
      "labels": [
        {
          "name": "feature",
          "color": "a2eeef"
        }
      ],
      "ci": "pass",
      "sha": "0007a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "mine",
      "repo": "acme/mobile-app",
      "number": 41,
      "title": "Login with passkeys",
      "url": "https://github.com/acme/mobile-app/pull/41",
      "author": "you",
      "createdAt": "2026-10-25T08:00:00Z",
      "size": 520,
      "signals": [
        "ci_failed",
        "changes_requested"
      ],
      "labels": [
        {
          "name": "security",
          "color": "b60205"
        }
      ],
      "ci": "fail",
      "sha": "0041a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "review",
      "repo": "acme/infra-tf",
      "number": 12,
      "title": "Rotate the staging database credentials",
      "url": "https://github.com/acme/infra-tf/pull/12",
      "author": "caio",
      "createdAt": "2026-10-29T16:00:00Z",
      "since": "2026-10-30T18:00:00Z",
      "size": 36,
      "signals": [
        "changed"
      ],
      "labels": [
        {
          "name": "breaking",
          "color": "b60205"
        },
        {
          "name": "infra",
          "color": "5319e7"
        }
      ],
      "ci": "pass",
      "sha": "0012a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "review",
      "repo": "acme/web",
      "number": 31,
      "title": "Add retries to the upload client",
      "url": "https://github.com/acme/web/pull/31",
      "author": "Copilot",
      "createdAt": "2026-10-30T20:00:00Z",
      "since": "2026-10-30T20:00:00Z",
      "size": 1890,
      "isAI": true,
      "signals": [],
      "sha": "0031a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "mine",
      "repo": "acme/billing",
      "number": 90,
      "title": "Monthly invoice export",
      "url": "https://github.com/acme/billing/pull/90",
      "author": "you",
      "createdAt": "2026-10-30T07:00:00Z",
      "size": 140,
      "signals": [
        "ready"
      ],
      "labels": [
        {
          "name": "feature",
          "color": "a2eeef"
        }
      ],
      "ci": "pass",
      "sha": "0090a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "mine",
      "repo": "acme/docs",
      "number": 5,
      "title": "Document the release checklist",
      "url": "https://github.com/acme/docs/pull/5",
      "author": "you",
      "createdAt": "2026-10-30T15:00:00Z",
      "size": 60,
      "signals": [
        "no_owner"
      ],
      "labels": [
        {
          "name": "docs",
          "color": "0075ca"
        }
      ],
      "sha": "0005a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    }
  ],
  "mine": [
    {
      "kind": "mine",
      "repo": "acme/checkout",
      "number": 219,
      "title": "Move shipping rules to the new pricing service",
      "url": "https://github.com/acme/checkout/pull/219",
      "author": "you",
      "createdAt": "2026-10-20T10:00:00Z",
      "size": 1240,
      "signals": [
        "conflict",
        "threads:2"
      ],
      "labels": [
        {
          "name": "bug",
          "color": "d73a4a"
        },
        {
          "name": "pricing",
          "color": "0e8a16"
        }
      ],
      "ci": "fail",
      "sha": "0219a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "mine",
      "repo": "acme/checkout",
      "number": 224,
      "title": "Coupon field keeps focus after an error",
      "url": "https://github.com/acme/checkout/pull/224",
      "author": "you",
      "createdAt": "2026-10-28T09:00:00Z",
      "size": 48,
      "signals": [
        "unanswered"
      ],
      "labels": [
        {
          "name": "ui",
          "color": "a2eeef"
        }
      ],
      "ci": "pass",
      "sha": "0224a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "mine",
      "repo": "acme/mobile-app",
      "number": 41,
      "title": "Login with passkeys",
      "url": "https://github.com/acme/mobile-app/pull/41",
      "author": "you",
      "createdAt": "2026-10-25T08:00:00Z",
      "size": 520,
      "signals": [
        "ci_failed",
        "changes_requested"
      ],
      "labels": [
        {
          "name": "security",
          "color": "b60205"
        }
      ],
      "ci": "fail",
      "sha": "0041a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "mine",
      "repo": "acme/billing",
      "number": 90,
      "title": "Monthly invoice export",
      "url": "https://github.com/acme/billing/pull/90",
      "author": "you",
      "createdAt": "2026-10-30T07:00:00Z",
      "size": 140,
      "signals": [
        "ready"
      ],
      "labels": [
        {
          "name": "feature",
          "color": "a2eeef"
        }
      ],
      "ci": "pass",
      "sha": "0090a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "mine",
      "repo": "acme/docs",
      "number": 5,
      "title": "Document the release checklist",
      "url": "https://github.com/acme/docs/pull/5",
      "author": "you",
      "createdAt": "2026-10-30T15:00:00Z",
      "size": 60,
      "signals": [
        "no_owner"
      ],
      "labels": [
        {
          "name": "docs",
          "color": "0075ca"
        }
      ],
      "sha": "0005a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "mine",
      "repo": "acme/web",
      "number": 29,
      "title": "Dark mode for the settings page",
      "url": "https://github.com/acme/web/pull/29",
      "author": "you",
      "createdAt": "2026-10-26T11:00:00Z",
      "size": 230,
      "signals": [
        "no_review"
      ],
      "ci": "pending",
      "sha": "0029a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "mine",
      "repo": "acme/billing",
      "number": 93,
      "title": "Tax rounding per line",
      "url": "https://github.com/acme/billing/pull/93",
      "author": "you",
      "createdAt": "2026-10-30T12:00:00Z",
      "size": 90,
      "signals": [],
      "ci": "pending",
      "sha": "0093a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "mine",
      "repo": "acme/infra-tf",
      "number": 14,
      "title": "Split the staging network module",
      "url": "https://github.com/acme/infra-tf/pull/14",
      "author": "you",
      "createdAt": "2026-10-29T10:00:00Z",
      "size": 410,
      "isDraft": true,
      "signals": [],
      "sha": "0014a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    }
  ],
  "others": [
    {
      "kind": "other",
      "repo": "acme/web",
      "number": 8,
      "title": "Retry flaky upload",
      "url": "https://github.com/acme/web/pull/8",
      "author": "caio",
      "createdAt": "2026-10-24T11:00:00Z",
      "size": 75,
      "signals": [
        "changed"
      ],
      "reviewed": true,
      "sha": "0008a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/billing",
      "number": 88,
      "title": "Round tax per invoice line",
      "url": "https://github.com/acme/billing/pull/88",
      "author": "bia",
      "createdAt": "2026-10-28T13:00:00Z",
      "size": 120,
      "signals": [
        "no_owner"
      ],
      "sha": "0088a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/docs",
      "number": 3,
      "title": "Typo in the setup guide",
      "url": "https://github.com/acme/docs/pull/3",
      "author": "dani",
      "createdAt": "2026-10-30T09:00:00Z",
      "size": 2,
      "signals": [],
      "sha": "0003a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/mobile-app",
      "number": 44,
      "title": "Bump the React Native version",
      "url": "https://github.com/acme/mobile-app/pull/44",
      "author": "devin-ai-integration[bot]",
      "createdAt": "2026-10-29T03:00:00Z",
      "size": 3400,
      "isAI": true,
      "signals": [
        "no_owner"
      ],
      "sha": "0044a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/web",
      "number": 52,
      "title": "Fix focus trap in modals",
      "url": "https://github.com/acme/web/pull/52",
      "author": "lia",
      "createdAt": "2026-10-29T10:00:00Z",
      "size": 120,
      "signals": [],
      "sha": "0052a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/billing",
      "number": 95,
      "title": "Add audit log export",
      "url": "https://github.com/acme/billing/pull/95",
      "author": "caio",
      "createdAt": "2026-10-29T10:00:00Z",
      "size": 480,
      "signals": [],
      "sha": "0095a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/infra-tf",
      "number": 33,
      "title": "Bump terraform providers",
      "url": "https://github.com/acme/infra-tf/pull/33",
      "author": "rafa",
      "createdAt": "2026-10-29T10:00:00Z",
      "size": 30,
      "signals": [],
      "sha": "0033a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/checkout",
      "number": 71,
      "title": "Retry policy for queue workers",
      "url": "https://github.com/acme/checkout/pull/71",
      "author": "bia",
      "createdAt": "2026-10-29T10:00:00Z",
      "size": 260,
      "signals": [],
      "sha": "0071a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/web",
      "number": 60,
      "title": "Table virtualization",
      "url": "https://github.com/acme/web/pull/60",
      "author": "lia",
      "createdAt": "2026-10-29T10:00:00Z",
      "size": 900,
      "signals": [],
      "sha": "0060a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/docs",
      "number": 9,
      "title": "Plugin manifest schema",
      "url": "https://github.com/acme/docs/pull/9",
      "author": "rafa",
      "createdAt": "2026-10-29T10:00:00Z",
      "size": 140,
      "signals": [],
      "sha": "0009a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/mobile-app",
      "number": 50,
      "title": "Lazy-load chart bundles",
      "url": "https://github.com/acme/mobile-app/pull/50",
      "author": "caio",
      "createdAt": "2026-10-29T10:00:00Z",
      "size": 210,
      "signals": [],
      "sha": "0050a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/web",
      "number": 61,
      "title": "Onboarding checklist v2",
      "url": "https://github.com/acme/web/pull/61",
      "author": "bia",
      "createdAt": "2026-10-29T10:00:00Z",
      "size": 330,
      "signals": [],
      "sha": "0061a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/billing",
      "number": 96,
      "title": "Cache invalidation for org settings",
      "url": "https://github.com/acme/billing/pull/96",
      "author": "rafa",
      "createdAt": "2026-10-29T10:00:00Z",
      "size": 150,
      "signals": [],
      "sha": "0096a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/web",
      "number": 101,
      "title": "Bump vite from 5.4.2 to 5.4.8",
      "url": "https://github.com/acme/web/pull/101",
      "author": "dependabot[bot]",
      "createdAt": "2026-10-30T08:00:00Z",
      "size": 24,
      "isBot": true,
      "signals": [],
      "sha": "0101a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/web",
      "number": 102,
      "title": "Bump eslint from 9.9.0 to 9.12.0",
      "url": "https://github.com/acme/web/pull/102",
      "author": "dependabot[bot]",
      "createdAt": "2026-10-30T08:00:00Z",
      "size": 24,
      "isBot": true,
      "signals": [],
      "sha": "0102a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/web",
      "number": 103,
      "title": "Bump @types/node from 22.5.0 to 22.7.4",
      "url": "https://github.com/acme/web/pull/103",
      "author": "dependabot[bot]",
      "createdAt": "2026-10-30T08:00:00Z",
      "size": 24,
      "isBot": true,
      "signals": [],
      "sha": "0103a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/web",
      "number": 104,
      "title": "Bump react-router from 6.26.1 to 6.26.2",
      "url": "https://github.com/acme/web/pull/104",
      "author": "dependabot[bot]",
      "createdAt": "2026-10-30T08:00:00Z",
      "size": 24,
      "isBot": true,
      "signals": [],
      "sha": "0104a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/web",
      "number": 105,
      "title": "Bump zod from 3.23.6 to 3.23.8",
      "url": "https://github.com/acme/web/pull/105",
      "author": "dependabot[bot]",
      "createdAt": "2026-10-30T08:00:00Z",
      "size": 24,
      "isBot": true,
      "signals": [],
      "sha": "0105a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/checkout",
      "number": 106,
      "title": "Bump stripe from 16.2.0 to 16.12.0",
      "url": "https://github.com/acme/checkout/pull/106",
      "author": "dependabot[bot]",
      "createdAt": "2026-10-30T08:00:00Z",
      "size": 24,
      "isBot": true,
      "signals": [],
      "sha": "0106a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/checkout",
      "number": 107,
      "title": "Bump axios from 1.7.2 to 1.7.7",
      "url": "https://github.com/acme/checkout/pull/107",
      "author": "dependabot[bot]",
      "createdAt": "2026-10-30T08:00:00Z",
      "size": 24,
      "isBot": true,
      "signals": [],
      "sha": "0107a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/billing",
      "number": 108,
      "title": "[Snyk] Security upgrade express from 4.19.2 to 4.21.0",
      "url": "https://github.com/acme/billing/pull/108",
      "author": "snyk-bot",
      "createdAt": "2026-10-30T08:00:00Z",
      "size": 24,
      "isBot": true,
      "signals": [],
      "sha": "0108a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/billing",
      "number": 109,
      "title": "[Snyk] Security upgrade jsonwebtoken from 8.5.1 to 9.0.0",
      "url": "https://github.com/acme/billing/pull/109",
      "author": "snyk-bot",
      "createdAt": "2026-10-30T08:00:00Z",
      "size": 24,
      "isBot": true,
      "signals": [],
      "sha": "0109a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    },
    {
      "kind": "other",
      "repo": "acme/checkout",
      "number": 110,
      "title": "[Snyk] Fix for 2 vulnerabilities",
      "url": "https://github.com/acme/checkout/pull/110",
      "author": "snyk-bot",
      "createdAt": "2026-10-30T08:00:00Z",
      "size": 24,
      "isBot": true,
      "signals": [],
      "sha": "0110a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c"
    }
  ],
  // the real pictures of the public bot accounts, as the round draws them (avatars.mjs)
  "avatars": {
      "devin-ai-integration[bot]": "<path fill=\"#fff\" d=\"M3 0h10v1H3zM1 1h14v1H1zM1 2h4v1H1zM7 2h8v1H7zM0 3h3v1H0zM8 3h8v1H8zM0 4h3v1H0zM8 4h8v1H8zM0 5h3v1H0zM9 5h1v1H9zM12 5h4v1H12zM0 6h3v1H0zM13 6h3v1H13zM0 7h4v1H0zM7 7h1v1H7zM13 7h3v1H13zM0 8h4v1H0zM7 8h1v1H7zM13 8h3v1H13zM0 9h3v1H0zM13 9h3v1H13zM0 10h3v1H0zM9 10h1v1H9zM12 10h4v1H12zM0 11h3v1H0zM8 11h8v1H8zM0 12h3v1H0zM8 12h8v1H8zM1 13h4v1H1zM7 13h8v1H7zM1 14h14v1H1zM3 15h10v1H3z\"/><path fill=\"#ccc\" d=\"M5 2h1v1H5zM3 6h1v1H3zM6 7h1v1H6zM5 13h1v1H5z\"/><path fill=\"#eee\" d=\"M6 2h1v1H6zM8 5h1v1H8zM4 7h1v1H4zM4 8h1v1H4zM8 10h1v1H8zM11 10h1v1H11zM3 12h1v1H3zM6 13h1v1H6z\"/><path fill=\"#ddd\" d=\"M3 3h1v1H3zM11 5h1v1H11z\"/><path fill=\"#555\" d=\"M4 3h1v1H4zM8 7h1v1H8zM8 8h1v1H8z\"/><path fill=\"#000\" d=\"M5 3h1v1H5zM4 4h3v1H4zM4 5h4v1H4zM5 6h2v1H5zM10 6h2v1H10zM9 7h3v1H9zM9 8h3v1H9zM5 9h2v1H5zM10 9h1v1H10zM4 10h4v1H4zM4 11h3v1H4zM5 12h1v1H5z\"/><path fill=\"#111\" d=\"M6 3h1v1H6zM7 4h1v1H7zM8 6h1v1H8zM4 9h1v1H4zM7 9h1v1H7zM11 9h1v1H11zM7 11h1v1H7z\"/><path fill=\"#999\" d=\"M7 3h1v1H7zM3 4h1v1H3zM3 5h1v1H3zM10 5h1v1H10zM3 10h1v1H3zM3 11h1v1H3z\"/><path fill=\"#222\" d=\"M4 6h1v1H4zM7 6h1v1H7zM9 6h1v1H9zM12 7h1v1H12zM12 8h1v1H12zM8 9h2v1H8zM6 12h1v1H6z\"/><path fill=\"#888\" d=\"M12 6h1v1H12zM5 7h1v1H5zM12 9h1v1H12z\"/><path fill=\"#777\" d=\"M5 8h1v1H5z\"/><path fill=\"#bbb\" d=\"M6 8h1v1H6zM3 9h1v1H3z\"/><path fill=\"#aaa\" d=\"M10 10h1v1H10zM7 12h1v1H7z\"/><path fill=\"#666\" d=\"M4 12h1v1H4z\"/>",
      "dependabot[bot]": "<path fill=\"#06d\" d=\"M3 0h10v1H3zM1 1h14v1H1zM1 2h6v1H1zM10 2h5v1H10zM0 3h7v1H0zM10 3h6v1H10zM0 4h7v1H0zM10 4h6v1H10zM0 5h3v1H0zM13 5h3v1H13zM0 6h2v1H0zM14 6h2v1H14zM0 7h2v1H0zM14 7h2v1H14zM0 8h2v1H0zM14 8h2v1H14zM0 9h2v1H0zM14 9h2v1H14zM0 10h2v1H0zM14 10h2v1H14zM0 11h2v1H0zM14 11h2v1H14zM0 12h2v1H0zM14 12h2v1H14zM1 13h2v1H1zM13 13h2v1H13zM1 14h14v1H1zM3 15h10v1H3z\"/><path fill=\"#17d\" d=\"M7 2h1v1H7zM2 12h1v1H2zM13 12h1v1H13zM3 13h1v1H3zM12 13h1v1H12z\"/><path fill=\"#27d\" d=\"M8 2h1v1H8zM2 6h1v1H2zM13 6h1v1H13zM2 7h1v1H2zM13 7h1v1H13zM5 9h1v1H5zM10 9h1v1H10zM4 13h8v1H4z\"/><path fill=\"#16d\" d=\"M9 2h1v1H9z\"/><path fill=\"#bde\" d=\"M7 3h1v1H7zM9 5h1v1H9zM10 8h1v1H10zM9 10h1v1H9z\"/><path fill=\"#fff\" d=\"M8 3h1v1H8zM3 6h10v1H3zM3 7h10v1H3zM3 8h3v1H3zM8 8h2v1H8zM12 8h1v1H12zM3 9h1v1H3zM12 9h1v1H12zM3 10h2v1H3zM7 10h2v1H7zM11 10h2v1H11zM3 11h10v1H3zM3 12h10v1H3z\"/><path fill=\"#7ae\" d=\"M9 3h1v1H9zM9 4h1v1H9z\"/><path fill=\"#8be\" d=\"M7 4h1v1H7zM4 5h4v1H4zM10 5h2v1H10z\"/><path fill=\"#cdf\" d=\"M8 4h1v1H8zM11 8h1v1H11zM2 9h1v1H2zM13 9h1v1H13zM2 10h1v1H2zM13 10h1v1H13z\"/><path fill=\"#8ae\" d=\"M3 5h1v1H3zM12 5h1v1H12z\"/><path fill=\"#ace\" d=\"M8 5h1v1H8zM6 8h1v1H6zM5 10h1v1H5z\"/><path fill=\"#49d\" d=\"M2 8h1v1H2zM13 8h1v1H13zM2 11h1v1H2zM13 11h1v1H13z\"/><path fill=\"#eef\" d=\"M7 8h1v1H7z\"/><path fill=\"#cde\" d=\"M4 9h1v1H4z\"/><path fill=\"#48d\" d=\"M6 9h1v1H6z\"/><path fill=\"#eff\" d=\"M7 9h2v1H7zM6 10h1v1H6z\"/><path fill=\"#37d\" d=\"M9 9h1v1H9z\"/><path fill=\"#def\" d=\"M11 9h1v1H11zM10 10h1v1H10z\"/>",
      "snyk-bot": "<path fill=\"#639\" d=\"M3 0h10v1H3zM1 1h5v1H1zM7 1h2v1H7zM10 1h5v1H10zM1 2h4v1H1zM7 2h2v1H7zM11 2h4v1H11zM0 3h5v1H0zM7 3h2v1H7zM11 3h5v1H11zM0 4h3v1H0zM13 4h3v1H13zM0 5h3v1H0zM13 5h3v1H13zM0 6h3v1H0zM13 6h3v1H13zM0 7h3v1H0zM13 7h3v1H13zM0 8h3v1H0zM13 8h3v1H13zM0 9h3v1H0zM13 9h3v1H13zM0 10h3v1H0zM13 10h3v1H13zM0 11h3v1H0zM13 11h3v1H13zM0 12h4v1H0zM12 12h4v1H12zM1 13h4v1H1zM11 13h4v1H11zM1 14h6v1H1zM9 14h6v1H9zM3 15h10v1H3z\"/><path fill=\"#85a\" d=\"M6 1h1v1H6zM9 1h1v1H9zM12 5h1v1H12zM12 6h1v1H12zM12 7h1v1H12zM12 8h1v1H12zM12 9h1v1H12zM12 10h1v1H12zM3 11h1v1H3z\"/><path fill=\"#74a\" d=\"M5 2h1v1H5zM3 4h1v1H3zM5 13h1v1H5zM10 13h1v1H10z\"/><path fill=\"#98b\" d=\"M6 2h1v1H6zM11 4h1v1H11zM6 13h1v1H6z\"/><path fill=\"#99b\" d=\"M9 2h1v1H9z\"/><path fill=\"#75a\" d=\"M10 2h1v1H10zM12 11h1v1H12z\"/><path fill=\"#86a\" d=\"M5 3h1v1H5z\"/><path fill=\"#778\" d=\"M6 3h1v1H6zM6 4h1v1H6zM8 5h1v1H8zM5 6h1v1H5zM5 7h1v1H5zM10 7h1v1H10zM5 8h1v1H5z\"/><path fill=\"#768\" d=\"M9 3h1v1H9z\"/><path fill=\"#87a\" d=\"M10 3h1v1H10z\"/><path fill=\"#a8b\" d=\"M4 4h1v1H4z\"/><path fill=\"#878\" d=\"M5 4h1v1H5zM10 4h1v1H10zM7 9h1v1H7z\"/><path fill=\"#ccd\" d=\"M7 4h1v1H7z\"/><path fill=\"#cbc\" d=\"M8 4h1v1H8z\"/><path fill=\"#767\" d=\"M9 4h1v1H9zM5 5h1v1H5zM6 9h1v1H6z\"/><path fill=\"#649\" d=\"M12 4h1v1H12z\"/><path fill=\"#86b\" d=\"M3 5h1v1H3zM3 6h1v1H3zM3 7h1v1H3zM3 8h1v1H3zM3 9h1v1H3zM3 10h1v1H3zM4 12h1v1H4zM11 12h1v1H11z\"/><path fill=\"#ddd\" d=\"M4 5h1v1H4zM4 6h1v1H4zM4 7h1v1H4zM4 8h1v1H4zM4 9h1v1H4zM4 10h1v1H4zM4 11h1v1H4z\"/><path fill=\"#446\" d=\"M6 5h1v1H6zM8 7h1v1H8zM8 8h2v1H8zM7 12h1v1H7zM8 13h1v1H8z\"/><path fill=\"#889\" d=\"M7 5h1v1H7z\"/><path fill=\"#335\" d=\"M9 5h1v1H9z\"/><path fill=\"#766\" d=\"M10 5h1v1H10zM8 9h1v1H8zM8 10h1v1H8z\"/><path fill=\"#ccc\" d=\"M11 5h1v1H11zM11 6h1v1H11zM11 7h1v1H11zM11 8h1v1H11zM11 9h1v1H11zM11 10h1v1H11zM11 11h1v1H11z\"/><path fill=\"#557\" d=\"M6 6h2v1H6zM6 8h2v1H6zM6 12h1v1H6z\"/><path fill=\"#336\" d=\"M8 6h2v1H8zM9 12h1v1H9z\"/><path fill=\"#668\" d=\"M10 6h1v1H10zM7 13h1v1H7z\"/><path fill=\"#667\" d=\"M6 7h1v1H6zM10 8h1v1H10z\"/><path fill=\"#657\" d=\"M7 7h1v1H7z\"/><path fill=\"#546\" d=\"M9 7h1v1H9zM6 11h1v1H6z\"/><path fill=\"#99a\" d=\"M5 9h1v1H5zM10 11h1v1H10z\"/><path fill=\"#656\" d=\"M9 9h1v1H9zM9 10h1v1H9z\"/><path fill=\"#999\" d=\"M10 9h1v1H10z\"/><path fill=\"#bbc\" d=\"M5 10h1v1H5z\"/><path fill=\"#666\" d=\"M6 10h1v1H6z\"/><path fill=\"#777\" d=\"M7 10h1v1H7z\"/><path fill=\"#aab\" d=\"M10 10h1v1H10zM5 11h1v1H5zM5 12h1v1H5z\"/><path fill=\"#877\" d=\"M7 11h1v1H7z\"/><path fill=\"#866\" d=\"M8 11h1v1H8z\"/><path fill=\"#445\" d=\"M9 11h1v1H9zM8 12h1v1H8z\"/><path fill=\"#a9b\" d=\"M10 12h1v1H10z\"/><path fill=\"#98a\" d=\"M9 13h1v1H9z\"/><path fill=\"#97b\" d=\"M7 14h1v1H7z\"/><path fill=\"#87b\" d=\"M8 14h1v1H8z\"/>",
      "Copilot": "<path fill=\"#eff\" d=\"M3 0h10v1H3zM1 1h14v1H1zM1 2h14v1H1zM0 3h4v1H0zM12 3h4v1H12zM0 4h3v1H0zM13 4h3v1H13zM0 5h3v1H0zM5 5h2v1H5zM9 5h2v1H9zM13 5h3v1H13zM0 6h3v1H0zM10 6h1v1H10zM13 6h3v1H13zM0 7h3v1H0zM13 7h3v1H13zM0 8h2v1H0zM14 8h2v1H14zM0 9h2v1H0zM5 9h1v1H5zM10 9h1v1H10zM14 9h2v1H14zM0 10h2v1H0zM5 10h1v1H5zM10 10h1v1H10zM14 10h2v1H14zM0 11h3v1H0zM13 11h3v1H13zM0 12h4v1H0zM12 12h4v1H12zM1 13h14v1H1zM1 14h14v1H1zM3 15h10v1H3z\"/><path fill=\"#ccc\" d=\"M4 3h1v1H4zM11 3h1v1H11zM9 4h1v1H9zM2 8h1v1H2zM13 8h1v1H13zM8 9h1v1H8zM2 10h1v1H2zM13 10h1v1H13z\"/><path fill=\"#899\" d=\"M5 3h1v1H5zM10 3h1v1H10zM7 5h1v1H7zM11 6h1v1H11zM6 12h1v1H6zM9 12h1v1H9z\"/><path fill=\"#788\" d=\"M6 3h1v1H6zM7 12h2v1H7z\"/><path fill=\"#aab\" d=\"M7 3h2v1H7zM13 9h1v1H13zM6 10h1v1H6zM9 10h1v1H9z\"/><path fill=\"#888\" d=\"M9 3h1v1H9z\"/><path fill=\"#ddd\" d=\"M3 4h1v1H3zM12 4h1v1H12zM9 8h1v1H9zM7 10h2v1H7zM7 11h2v1H7z\"/><path fill=\"#677\" d=\"M4 4h1v1H4zM11 4h1v1H11zM7 6h1v1H7zM4 11h1v1H4zM11 11h1v1H11z\"/><path fill=\"#bbc\" d=\"M5 4h1v1H5zM10 4h1v1H10zM3 6h1v1H3zM6 11h1v1H6zM9 11h1v1H9zM12 11h1v1H12z\"/><path fill=\"#ccd\" d=\"M6 4h1v1H6z\"/><path fill=\"#778\" d=\"M7 4h2v1H7z\"/><path fill=\"#bbb\" d=\"M3 5h1v1H3zM12 6h1v1H12zM5 12h1v1H5zM10 12h1v1H10z\"/><path fill=\"#99a\" d=\"M4 5h1v1H4zM4 8h1v1H4zM4 9h1v1H4zM4 10h1v1H4z\"/><path fill=\"#889\" d=\"M8 5h1v1H8zM4 6h1v1H4zM6 9h1v1H6zM9 9h1v1H9zM5 11h1v1H5zM10 11h1v1H10z\"/><path fill=\"#9aa\" d=\"M11 5h1v1H11zM12 7h1v1H12zM11 8h1v1H11zM11 9h1v1H11zM11 10h1v1H11z\"/><path fill=\"#abb\" d=\"M12 5h1v1H12zM7 7h2v1H7zM2 9h1v1H2z\"/><path fill=\"#eef\" d=\"M5 6h1v1H5zM5 8h1v1H5zM10 8h1v1H10z\"/><path fill=\"#dde\" d=\"M6 6h1v1H6zM9 6h1v1H9zM6 8h1v1H6z\"/><path fill=\"#667\" d=\"M8 6h1v1H8zM4 7h1v1H4zM6 7h1v1H6zM9 7h1v1H9zM11 7h1v1H11z\"/><path fill=\"#aaa\" d=\"M3 7h1v1H3z\"/><path fill=\"#567\" d=\"M5 7h1v1H5zM10 7h1v1H10z\"/><path fill=\"#566\" d=\"M3 8h1v1H3zM12 8h1v1H12zM3 9h1v1H3zM12 9h1v1H12zM3 10h1v1H3zM12 10h1v1H12z\"/><path fill=\"#eee\" d=\"M7 8h2v1H7zM4 12h1v1H4zM11 12h1v1H11z\"/><path fill=\"#bcc\" d=\"M7 9h1v1H7zM3 11h1v1H3z\"/>"
  }
}
// Sample verdicts for the demo: issues, passed, old, running and never validated.
export const DEMO_VERDICTS: Verdicts = {
  "auto": "mine",
  "batch": {
    "urls": [],
    "at": null
  },
  "prs": {
    "https://github.com/acme/checkout/pull/219": {
      "state": "done",
      "sha": "0219a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c",
      "issues": 1,
      "finding": "Retry loop has no backoff cap (rules.ts:42)",
      "report": "- Blocker `rules.ts:42`: the retry loop has no backoff cap, so a pricing outage retries forever. Cap it at 30 s.\n- Look at `rules.test.ts:12`: asserts only on a mock.",
      "at": "2026-10-31T10:00:00Z"
    },
    "https://github.com/acme/web/pull/7": {
      "state": "done",
      "sha": "0007a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c",
      "issues": 3,
      "finding": "Cursor is lost when the filter changes",
      "at": "2026-10-31T10:00:00Z"
    },
    "https://github.com/acme/checkout/pull/224": {
      "state": "done",
      "sha": "0224a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c",
      "issues": 0,
      "finding": "",
      "at": "2026-10-31T10:00:00Z"
    },
    "https://github.com/acme/infra-tf/pull/12": {
      "state": "done",
      "sha": "ffff000000000000000000000000000000000000",
      "issues": 1,
      "finding": "",
      "at": "2026-10-28T10:00:00Z"
    },
    "https://github.com/acme/web/pull/8": {
      "state": "done",
      "sha": "0008a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c",
      "issues": 2,
      "finding": "Migration drops the index before copying",
      "at": "2026-10-31T10:00:00Z"
    },
    "https://github.com/acme/billing/pull/88": {
      "state": "done",
      "sha": "0088a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c",
      "issues": 1,
      "finding": "Rounding differs from the invoice total",
      "at": "2026-10-31T10:00:00Z"
    },
    "https://github.com/acme/mobile-app/pull/50": {
      "state": "done",
      "sha": "0050a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c",
      "issues": 1,
      "finding": "Chart bundle still loads on the first screen",
      "at": "2026-10-31T10:00:00Z"
    },
    "https://github.com/acme/mobile-app/pull/44": {
      "state": "done",
      "sha": "ffff000000000000000000000000000000000000",
      "issues": 0,
      "finding": "",
      "at": "2026-10-28T10:00:00Z"
    },
    "https://github.com/acme/checkout/pull/71": {
      "state": "done",
      "sha": "ffff000000000000000000000000000000000000",
      "issues": 2,
      "finding": "",
      "at": "2026-10-28T10:00:00Z"
    },
    "https://github.com/acme/docs/pull/9": {
      "state": "running",
      "at": "2026-10-31T11:50:00Z"
    },
    "https://github.com/acme/web/pull/60": {
      "state": "done",
      "sha": "0060a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c",
      "issues": 0,
      "finding": "",
      "at": "2026-10-31T10:00:00Z"
    },
    "https://github.com/acme/web/pull/61": {
      "state": "done",
      "sha": "0061a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c",
      "issues": 0,
      "finding": "",
      "at": "2026-10-31T10:00:00Z"
    },
    "https://github.com/acme/billing/pull/96": {
      "state": "done",
      "sha": "0096a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c",
      "issues": 0,
      "finding": "",
      "at": "2026-10-31T10:00:00Z"
    }
  }
}
