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

const STROKE_WIDTH = 1.5;

// ---- 图标几何（Hugeicons 风格，viewBox 24×24，源描边 1.5px）----

/** 房子外形 */
const HOUSE_PATH =
  "M12.8924 2.80982L21.4876 9.59547C21.8112 9.85095 22 10.2405 22 10.6528C22 11.3969 21.3969 12 20.6528 12H20V15.5C20 18.3284 20 19.2426 19.1213 20.6213C18.2426 21.5 16.8284 21.5 14 21.5H10C7.17157 21.5 5.75736 21.5 4.87868 20.6213C4 19.7426 4 18.3284 4 15.5V12H3.34716C2.60315 12 2 11.3969 2 10.6528C2 10.2405 2.1888 9.85095 2.5124 9.59547L11.1076 2.80982C11.3617 2.60915 11.6761 2.5 12 2.5C12.3239 2.5 12.6383 2.60915 12.8924 2.80982Z";
/** 门 */
const DOOR_PATH =
  "M14.5 21.5V17C14.5 16.0654 14.5 15.5981 14.299 15.25C14.1674 15.022 13.978 14.8326 13.75 14.701C13.4019 14.5 12.9346 14.5 12 14.5C11.0654 14.5 10.5981 14.5 10.25 14.701C10.022 14.8326 9.83261 15.022 9.70096 15.25C9.5 15.5981 9.5 16.0654 9.5 17V21.5";

/** 急救箱提手（开放路径） */
const KIT_HANDLE_PATH =
  "M8.5 7V6.5C8.5 5.09554 8.5 4.39331 8.83706 3.88886C8.98298 3.67048 9.17048 3.48298 9.38886 3.33706C9.89331 3 10.5955 3 12 3C13.4045 3 14.1067 3 14.6111 3.33706C14.8295 3.48298 15.017 3.67048 15.1629 3.88886C15.5 4.39331 15.5 5.09554 15.5 6.5V7";
/** 箱体 */
const KIT_BOX_PATH =
  "M2 13V15C2 17.8284 2 19.2426 2.87868 20.1213C3.75736 21 5.17157 21 8 21H16C18.8284 21 20.2426 21 21.1213 20.1213C22 19.2426 22 17.8284 22 15V13C22 10.1716 22 8.75734 21.1213 7.87866C20.2426 6.99998 18.8284 6.99999 16 7L7.99997 7.00004C5.17155 7.00006 3.75735 7.00007 2.87867 7.87874C2 8.75742 2 10.1716 2 13Z";
/** 箱面的十字 */
const KIT_CROSS_PATH = "M11.9925 11V17M15 13.9925L9 13.9925";
/** 箱内两侧的竖线 */
const KIT_EDGE_LEFT_PATH = "M6 7V21";
const KIT_EDGE_RIGHT_PATH = "M18 7V21";

/** 我的：头（圆） */
const HEAD_CIRCLE = { cx: 12, cy: 8.83984, r: 2.5 };
/** 我的：肩（开放路径） */
const SHOULDERS_PATH =
  "M16.7715 20.5C17.7295 17.3599 15.5598 14.1298 12.4156 14.0153L11.996 14L11.5844 14.015C8.44018 14.1297 6.27053 17.3598 7.22847 20.5";
/** 我的：外圆环 */
const RING_CIRCLE = { cx: 12, cy: 12, r: 10 };

/** playground：等轴立方体的六边形轮廓 */
const CUBE_PATH =
  "M10.8453 2.47782C11.4088 2.15927 11.6906 2 12 2C12.3094 2 12.5912 2.15927 13.1547 2.47782L19.8453 6.25983C20.4088 6.57838 20.6906 6.73766 20.8453 7C21 7.26234 21 7.58089 21 8.21799V15.782C21 16.4191 21 16.7377 20.8453 17C20.6906 17.2623 20.4088 17.4216 19.8453 17.7402L13.1547 21.5222C12.5912 21.8407 12.3094 22 12 22C11.6906 22 11.4088 21.8407 10.8453 21.5222L4.1547 17.7402C3.59117 17.4216 3.3094 17.2623 3.1547 17C3 16.7377 3 16.4191 3 15.782V8.21799C3 7.58089 3 7.26234 3.1547 7C3.3094 6.73766 3.59117 6.57838 4.1547 6.25983L10.8453 2.47782Z";
/** playground：顶面后沿 */
const CUBE_TOP_EDGE_PATH =
  "M15.5 4.27051L13.134 5.55062C12.5803 5.85019 12.3035 5.99998 12 5.99998C11.6965 5.99998 11.4197 5.85019 10.866 5.55062L8.5 4.27051";
/** playground：从中心顶点出发的三条棱 */
const CUBE_Y_PATH = "M12 11.6154V22M12 11.6154L20.5 7M12 11.6154L3.5 7";
/** playground：左下细节 */
const CUBE_LEFT_PATH =
  "M3 12L5.89443 13.5585C6.43234 13.8482 6.7013 13.993 6.85065 14.2532C7 14.5135 7 14.8373 7 15.485V19";
/** playground：右下细节 */
const CUBE_RIGHT_PATH =
  "M21 12L18.1056 13.5585C17.5677 13.8482 17.2987 13.993 17.1493 14.2532C17 14.5135 17 14.8373 17 15.485V19";

/** <circle> 转 path：两段半圆弧，省得脚本要同时认两种元素 */
function circle({ cx, cy, r }) {
  return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
}

/**
 * 每个图标：`strokes` 是两个状态都要描的子路径；`fill` 只有选中态才填。
 * `fill.rule: "evenodd"` 用来把内部子路径挖成洞（首页的门 —— 露出后面的
 * tab 栏底色，和参考截图一致）。
 */
const ICONS = {
  home: {
    strokes: [HOUSE_PATH, DOOR_PATH],
    fill: { d: `${HOUSE_PATH} ${DOOR_PATH}`, rule: "evenodd" },
  },
  medica: {
    // 只填箱体：提手是开放路径，填了会多一条贴着箱顶的色带；十字与两侧竖线
    // 是箱内细节线，画在填充之上
    strokes: [
      KIT_HANDLE_PATH,
      KIT_BOX_PATH,
      KIT_CROSS_PATH,
      KIT_EDGE_LEFT_PATH,
      KIT_EDGE_RIGHT_PATH,
    ],
    fill: { d: KIT_BOX_PATH },
  },
  // 我的：外圆环 + 头 + 肩。选中态填外圆环，头用 evenodd 挖成洞（同首页的门）；
  // 肩是开放路径，不填
  profile: {
    strokes: [circle(HEAD_CIRCLE), SHOULDERS_PATH, circle(RING_CIRCLE)],
    fill: {
      d: `${circle(RING_CIRCLE)} ${circle(HEAD_CIRCLE)}`,
      rule: "evenodd",
    },
  },
  // playground：等轴立方体。选中态填六边形轮廓，内部三条棱与顶/底细节画在填充之上
  playground: {
    strokes: [
      CUBE_PATH,
      CUBE_TOP_EDGE_PATH,
      CUBE_Y_PATH,
      CUBE_LEFT_PATH,
      CUBE_RIGHT_PATH,
    ],
    fill: { d: CUBE_PATH },
  },
};

// ---- 配色（与 src/constants/theme.ts 对齐，改主题时同步）----

const TOKENS = {
  light: { primary: "#0F766E", canvas: "#F0F4F2" },
  dark: { primary: "#2DD4BF", canvas: "#0A0A0C" },
};

/**
 * 未选中描边按模式分开：它本该由 tab 栏 tint 着色，但双色图标必须整颗保色，
 * 所以只能照着「UIKit 给 SF Symbol 的颜色」烘 —— 亮色档是中灰，暗色档是白。
 * 两端共用一个值会和旁边没换的 SF Symbol tab 明显不齐（暗色下发灰）。
 */
const UNSELECTED_STROKE = {
  light: "#8E8E93",
  dark: "#FFFFFF",
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

function buildSvg(icon, { stroke, fillColor }) {
  const common = `stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"`;
  const layers = [];
  // 填充层在下、描边层在上，所以描边永远压在填充边缘上
  if (fillColor && icon.fill) {
    const rule = icon.fill.rule === "evenodd" ? ' fill-rule="evenodd"' : "";
    layers.push(
      `<path d="${icon.fill.d}" fill="${fillColor}"${rule} stroke="${stroke}" ${common}/>`,
    );
  }
  for (const d of icon.strokes) {
    layers.push(`<path d="${d}" fill="none" stroke="${stroke}" ${common}/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">\n${layers.join("\n")}\n</svg>\n`;
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

for (const [name, icon] of Object.entries(ICONS)) {
  for (const mode of ["light", "dark"]) {
    const { primary, canvas } = TOKENS[mode];
    const suffix = mode === "dark" ? "-dark" : "";
    writeIcon(
      `${name}${suffix}`,
      buildSvg(icon, { stroke: UNSELECTED_STROKE[mode] }),
    );
    writeIcon(
      `${name}-selected${suffix}`,
      buildSvg(icon, {
        stroke: primary,
        fillColor: mixColor(canvas, primary, FILL_RATIO),
      }),
    );
  }
}

console.log("tab icons generated in", path.relative(process.cwd(), OUT_DIR));
