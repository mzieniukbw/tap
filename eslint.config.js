import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.{js,ts}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          modules: true,
        },
      },
    },
    rules: {
      "no-unused-vars": "off", // TypeScript handles this
      "no-console": "off",
      "no-undef": "off", // TypeScript handles this
    },
  },
];
