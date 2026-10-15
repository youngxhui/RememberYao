/**
 * Android 侧同名图标：Material Symbols 矢量图（`@expo/material-symbols`，Metro
 * 把 `.xml` 当资源处理，值是资源 id）。命名与 `toolbar-icons.ts` 的 SF Symbol
 * 语义对齐：person.2 ↔ group、plus ↔ add、gearshape ↔ settings、
 * square.and.pencil ↔ edit_square。
 */
import addIconAsset from "@expo/material-symbols/add.xml";
import editSquareIconAsset from "@expo/material-symbols/edit_square.xml";
import groupIconAsset from "@expo/material-symbols/group.xml";
import settingsIconAsset from "@expo/material-symbols/settings.xml";

export const memberFilterIcon = groupIconAsset;
export const addIcon = addIconAsset;
export const settingsIcon = settingsIconAsset;
export const editIcon = editSquareIconAsset;
