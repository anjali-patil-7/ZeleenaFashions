import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser, // for frontend
        ...globals.node, // for backend (Node/Express)
      },
    },
    plugins: {
      js,
    },
    rules: {
      ...js.configs.recommended.rules,

      // You can add your custom rules below:
      "no-unused-vars": "warn",
      "no-console": "off", // Allow console.log for development
      semi: ["error", "always"],
      quotes: ["error", "double"],
    },
  },
]);
