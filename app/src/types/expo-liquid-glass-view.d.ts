declare module "expo-liquid-glass-view" {
  export {
    LiquidGlassView,
    LiquidGlassContainer,
  } from "expo-liquid-glass-view/src/components";
  export { supportsNativeGlass } from "expo-liquid-glass-view/src/utils";
  export { GlassRenderer, GlassVariant } from "expo-liquid-glass-view/src/enum";
  export type {
    ILiquidGlassViewProps as LiquidGlassViewProps,
    ILiquidGlassContainerProps as LiquidGlassContainerProps,
    IGlassMetalOptions as GlassMetalOptions,
    IGlassRefraction as GlassRefraction,
    IGlassRefractionCurve as GlassRefractionCurve,
    IGlassDispersion as GlassDispersion,
    IGlassHighlight as GlassHighlight,
    IGlassBorder as GlassBorder,
    IGlassCornerRadii as GlassCornerRadii,
    TGlassCornerRadius as GlassCornerRadius,
    TGlassVariant,
    TGlassRenderer,
    TGlassActiveRenderer as GlassActiveRenderer,
    TGlassCornerStyle as GlassCornerStyle,
  } from "expo-liquid-glass-view/src/interfaces";
}
