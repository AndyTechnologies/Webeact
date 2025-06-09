import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";

export default defineConfig([globalIgnores(["**/coverage", "**/node_modules"]), {
	languageOptions: {
		globals: {
			...globals.node,
		},
	},

	rules: {
		"eol-last": "error",
		eqeqeq: ["error", "allow-null"],
		indent: ["error", "tab", {
			MemberExpression: "off",
			SwitchCase: 1,
		}],

		"no-trailing-spaces": "error",

		"no-unused-vars": ["error", {
			vars: "all",
			args: "none",
			ignoreRestSiblings: true,
		}],
	},
}]);
