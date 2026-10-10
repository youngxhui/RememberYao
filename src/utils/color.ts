/** #rrggbb → rgba()，用于设计稿 color-mix(x 55%, transparent) 这类半透明叠色 */
export function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith("#")) return hex;
  const value =
    hex.length === 4
      ? hex
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")
      : hex.slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * #rrggbb 与目标色按比例混合（amount 0 = 原色，1 = 完全是目标色）。
 *
 * 平色画不出体积：泡罩的受光面、药饼的球面 shading、胶囊的接缝暗线，
 * 都要同一个色相的亮/暗变体。这里就是那个变体机器 —— 比在调色板里
 * 手写每一档颜色可靠，换药片配色时不用重新推六套明暗。
 */
export function mixColor(hex: string, target: string, amount: number): string {
  if (!hex.startsWith("#") || !target.startsWith("#")) return hex;
  const ratio = Math.min(Math.max(amount, 0), 1);
  const from = hex.length === 4 ? expand(hex) : hex;
  const to = target.length === 4 ? expand(target) : target;
  const channel = (index: number) => {
    const a = parseInt(from.slice(1 + index * 2, 3 + index * 2), 16);
    const b = parseInt(to.slice(1 + index * 2, 3 + index * 2), 16);
    if (Number.isNaN(a) || Number.isNaN(b)) return "00";
    const mixed = Math.round(a + (b - a) * ratio);
    return mixed.toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function expand(short: string): string {
  return `#${short
    .slice(1)
    .split("")
    .map((c) => c + c)
    .join("")}`;
}
