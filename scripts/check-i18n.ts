import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { en } from "../src/i18n/dictionaries/en";
import { zh } from "../src/i18n/dictionaries/zh";

/**
 * i18n 体检：一次查三类问题
 *   1. 死键 —— 字典里定义了、但代码里从未 `t("...")` 引用；
 *   2. 漏翻 —— zh 有、en 没有；
 *   3. 多翻 —— en 有、zh 没有。
 *
 * 用法：`bun run i18n:check`。有问题时 exit 1，便于接 CI / pre-commit。
 *
 * 说明：`t()` 是字面量路径，「用了不存在的键」已由 `tsc`（Path 类型）兜住，
 * 这里补上它兜不住的另一半 —— 死键与双语不一致。
 */

const root = fileURLToPath(new URL("..", import.meta.url));

type Nested = Record<string, unknown>;

/** 递归收集叶子键的点分路径（如 settings.title），中间分组不计为键 */
function collectKeys(obj: Nested, prefix: string, out: string[]): string[] {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") collectKeys(v as Nested, path, out);
    else out.push(path);
  }
  return out;
}

const zhKeys = collectKeys(zh as Nested, "", []);
const enKeys = collectKeys(en as Nested, "", []);
const enSet = new Set(enKeys);
const zhSet = new Set(zhKeys);

// 扫 src 下所有源码（跳过词典自身），拼成一大块用来判引用
const codeFiles: string[] = [];
(function walk(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!p.includes("i18n/dictionaries")) walk(p);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      codeFiles.push(p);
    }
  }
})(join(root, "src"));
const code = codeFiles.map((f) => readFileSync(f, "utf8")).join("\n");

const isUsed = (key: string) =>
  new RegExp(`["']${key.replace(/\./g, "\\.")}["']`).test(code);

const unused = zhKeys.filter((k) => !isUsed(k));
const missingInEn = zhKeys.filter((k) => !enSet.has(k));
const missingInZh = enKeys.filter((k) => !zhSet.has(k));

function report(title: string, items: string[]) {
  if (items.length === 0) return;
  console.log(`\n${title}（${items.length}）:`);
  for (const k of items) console.log(`  - ${k}`);
}

console.log(
  `i18n: ${zhKeys.length} 键（zh）/ ${enKeys.length} 键（en），扫描 ${codeFiles.length} 个源文件`,
);
report("死键（定义但未使用）", unused);
report("漏翻（zh 有、en 无）", missingInEn);
report("多翻（en 有、zh 无）", missingInZh);

const problems = unused.length + missingInEn.length + missingInZh.length;
if (problems === 0) {
  console.log("\n✅ 无死键、无漏翻，双语一致。");
} else {
  console.log(`\n❌ 共 ${problems} 处问题。`);
}
process.exit(problems === 0 ? 0 : 1);
