/**
 * 生成 tab 栏位图图标：SVG path → PNG（默认 / 选中 × 亮暗）。
 *
 * 为什么需要栅格化：tab 栏图标由原生渲染（iOS UITabBarItem / Android
 * BottomNavigationView），只收图片源，不吃 SVG、也不吃 React 元素。
 *
 * 为什么颜色是烘进去的：iOS 的 UIImage 只有 template（单色掩码，tab 栏统一
 * 染色）和 original（保留图自身颜色）两种模式，而 react-native-screens 要求
 * `icon` 与 `selectedIcon` 必须解析成同一种类型 —— 想让选中态「描边主题色 +
 * 封闭区淡色」这种双色，只能整颗图标走 original，未选中态的颜色因此也一起烘死
 * （不再跟随系统 tint）。改 src/constants/theme.ts 的 primary / canvas 时，
 * 同步改下面的 TOKENS 再跑一次本脚本即可。
 *
 * 用法：bun scripts/generate-tab-icons.js
 * 依赖：rsvg-convert（librsvg，brew install librsvg）
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const OUT_DIR = path.join(__dirname, "..", "assets", "images", "tab-icons");

/** Hugeicons Home，viewBox 24×24，源描边 1.5px。两个子路径：房子外形 + 门。 */
const HOUSE_PATH =
  "M12.8924 2.80982L21.4876 9.59547C21.8112 9.85095 22 10.2405 22 10.6528C22 11.3969 21.3969 12 20.6528 12H20V15.5C20 18.3284 20 19.7426 19.1213 20.6213C18.2426 21.5 16.8284 21.5 14 21.5H10C7.17157 21.5 5.75736 21.5 4.87868 20.6213C4 19.7426 4 18.3284 4 15.5V12H3.34716C2.60315 12 2 11.3969 2 10.6528C2 10.2405 2.1888 9.85095 2.5124 9.59547L11.1076 2.80982C11.3617 2.60915 11.6761 2.5 12 2.5C12.3239 2.5 12.6383 2.60915 12.8924 2.80982Z";
const DOOR_PATH =
  "M14.5 21.5V17C14.5 16.0654 14.5 15.5981 14.299 15.25C14.1674 15.022 13.978 14.8326 13.75 14.701C13.4019 14.5 12.9346 14.5 12 14.5C11.0654 14.5 10.5981 14.5 10.25 14.701C10.022 14.8326 9.83261 15.022 9.70096 15.25C9.5 15.5981 9.5 16.0654 9.5 17V21.5";

const STROKE_WIDTH = 1.5;

/** 与 src/constants/theme.ts 对齐的取值，改主题时同步 */
const TOKENS = {
  light: { primary: "#0F766E", canvas: "#F0F4F2" },
  dark: { primary: "#2DD4BF", canvas: "#0A0A0C" },
  /** 未选中描边：iOS systemGray，两端共用（保色模式下不跟随 tint） */
  unselectedStroke: "#8E8E93",
};

/** 选中态封闭区的填充浓度：primary 混进 canvas 的比例（截图里「主题色淡一档」） */
const FILL_RATIO = 0.3;

/** @see src/utils/color.ts 的 mixColor */
function mixColor(from, to, amount) {
  const channel = (index) => {
    const a = parseInt(from.slice(1 + index * 2, 3 + index * 2), 16);
    const b = parseInt(to.slice(1 + index * 2, 3 + index * 2), 16);
    return Math.round(a + (b - a) * amount)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/**
 * 拼 SVG。未选中态只描边；选中态把两个子路径并进一个 <path> 并开 evenodd，
 * 门就成了「洞」，露出后面的 tab 栏底色（与参考截图一致）。
 */
function buildSvg({ stroke, fill }) {
  const fillAttr = fill ? `fill="${fill}" fill-rule="evenodd"` : 'fill="none"';
  const d = fill ? `${HOUSE_PATH} ${DOOR_PATH}` : HOUSE_PATH;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path d="${d}" ${fillAttr} stroke="${stroke}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
}

/** 位图倍率：1x/2x/3x → 24/48/72px */
const SCALES = [
  { suffix: "", px: 24 },
  { suffix: "@2x", px: 48 },
  { suffix: "@3x", px: 72 },
];

function writeIcon(name, svg) {
  const svgPath = path.join(OUT_DIR, `${name}.svg`);
  fs.writeFileSync(svgPath, svg);
  for (const { suffix, px } of SCALES) {
    execFileSync(
      "rsvg-convert",
      [
        "-w",
        String(px),
        "-h",
        String(px),
        svgPath,
        "-o",
        path.join(OUT_DIR, `${name}${suffix}.png`),
      ],
      { stdio: "inherit" },
    );
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });

writeIcon("home", buildSvg({ stroke: TOKENS.unselectedStroke }));

for (const mode of ["light", "dark"]) {
  const { primary, canvas } = TOKENS[mode];
  const suffix = mode === "dark" ? "-dark" : "";
  writeIcon(
    `home-selected${suffix}`,
    buildSvg({ stroke: primary, fill: mixColor(canvas, primary, FILL_RATIO) }),
  );
}

console.log("tab icons generated in", path.relative(process.cwd(), OUT_DIR));
