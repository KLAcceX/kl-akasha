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
    }
  ]
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
