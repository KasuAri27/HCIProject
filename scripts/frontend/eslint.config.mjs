import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 本地工具可安装在 D:\Dev；CI 使用 npm ci 创建项目依赖。
const require = createRequire(path.join(
  process.env.HCI_ESLINT_DIR || path.dirname(fileURLToPath(import.meta.url)),
  "package.json",
));
const globals = require("globals");

export default [{
  files: ["app/static/**/*.js"],
  ignores: ["app/static/vendor/**"],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "script",
    globals: {
      ...globals.browser,
      renderMathInElement: "readonly",
      pageFetch: "readonly", pageJson: "readonly",
      pageEscape: "readonly", pageToast: "readonly",
    },
  },
  rules: {
    "no-undef": "error",
    "no-unreachable": "error",
    "no-dupe-args": "error",
    "no-dupe-keys": "error",
    "no-dupe-else-if": "error",
    "constructor-super": "error",
    "valid-typeof": "error",
  },
}];
