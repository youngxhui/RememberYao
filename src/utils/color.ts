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
