import next from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

/**
 * The `no-restricted-syntax` rule below is what makes the event taxonomy in
 * `lib/analytics/events.ts` the single source of truth. Nothing outside
 * `lib/analytics/` may call `posthog.capture()` with a raw string — every call
 * site must go through the typed `track()` / `trackServer()` wrappers, which
 * only accept event names from the closed union.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },

  ...next,

  {
    // In flat config a rule can only be configured in an object that also
    // registers its plugin. eslint-config-next scopes its own typescript-eslint
    // registration to its internal objects, so the rules below need their own.
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='capture']",
          message:
            "Do not call posthog.capture() directly. Use track() (client) or trackServer() (server) from lib/analytics/events.ts so the event name is checked against the taxonomy.",
        },
        {
          selector: "CallExpression[callee.property.name='captureException']",
          message:
            "Do not call posthog.captureException() directly. Route errors through lib/analytics so they carry launch_slug.",
        },
      ],

      // The brief mandates: no `any`, no `@ts-ignore`.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-expect-error": "allow-with-description",
          "ts-nocheck": true,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  {
    // The wrappers themselves are the one place allowed to reach the SDK.
    files: ["lib/analytics/**/*.ts", "lib/analytics/**/*.tsx"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },

  {
    // Scripts and tests are Node-side tooling: console output is the point.
    files: ["scripts/**/*.ts", "tests/**/*.ts", "*.config.ts", "*.config.mjs"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
];

export default config;
