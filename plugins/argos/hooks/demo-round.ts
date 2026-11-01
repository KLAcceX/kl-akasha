// A sample round with several repos and every section, signal and mark, for /argos demo
// and the preview. at and okAt are set when it is shown.
import type { Round } from '../types'

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
      "ci": "fail"
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
      "ci": "pass"
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
      "ci": "pass"
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
      "ci": "fail"
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
      "ci": "pass"
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
      "signals": []
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
      "ci": "pass"
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
      ]
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
      "ci": "fail"
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
      "ci": "pass"
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
      "ci": "fail"
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
      "ci": "pass"
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
      ]
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
      "ci": "pending"
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
      "ci": "pending"
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
      "signals": []
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
      "reviewed": true
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
      ]
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
      "signals": []
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
      ]
    }
  ]
}
