import next from "eslint-config-next";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".next-responsive/**",
      "node_modules/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  ...next,
  {
    rules: {
      // Staged rollout (same approach as the typography audit baseline): 36
      // pre-existing occurrences across core pages (wizard, meta-factory,
      // modernize, ...). Refactoring them wholesale risks regressions, so new
      // code sees the warning while existing pages are migrated page-by-page.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
