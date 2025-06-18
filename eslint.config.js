import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import css from "@eslint/css";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{ files: ["**/*.{js,mjs,cjs}"], plugins: { js }, extends: ["js/recommended"] },
	{ files: ["**/*.{js,mjs,cjs}"], languageOptions: { globals: {...globals.browser, ...globals.node} } },
	{ files: ["**/*.{js,mjs,cjs}"], rules: {
		"eol-last": "error",
		eqeqeq: ["error", "allow-null"],
		indent: ["error", "tab", {
			MemberExpression: "off",
			SwitchCase: 1,
		}],

		"no-trailing-spaces": "error",

		"no-unused-vars": ["warn", {
			vars: "all",
			args: "none",
			ignoreRestSiblings: true,
		}],
	} },
	{ files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
	{ files: ["**/*.css"], plugins: { css }, language: "css/css", extends: ["css/recommended"] },
]);
