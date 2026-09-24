/** 说明书正文的一行 */
export type ArchiveRowExpoUI = { label: string; value: string };

/** 一张说明书卡片的数据（水平列表与文件夹内的飞行卡共用） */
export type ArchiveEntryExpoUI = {
  id: string;
  name: string;
  /** 正文条目，设计稿为「成份 / 适应症 / …」四~五条 */
  rows: ArchiveRowExpoUI[];
  /** 标题下小字 */
  subtitle?: string;
  /** 底部小字，设计稿为「批准文号 · 企业」位置 */
  footer?: string;
};

/** MiniArchiveExpoUI 的入参。与 RN 版 MiniArchiveProps 同构，方便调用方共用数据 */
export type MiniArchiveExpoUIProps = {
  entries: ArchiveEntryExpoUI[];
  /** 封面大标题 */
  title?: string;
  /** 封面副标题（等宽小字） */
  subtitle?: string;
  /** 收起时的提示文案 */
  closedHint?: string;
  /** 展开后的提示文案 */
  openHint?: string;
  /** 无条目时的提示文案 */
  emptyHint?: string;
  /** 点按某张说明书 */
  onSelectEntry?: (entry: ArchiveEntryExpoUI) => void;
  /** 布局覆盖，最后合并。iOS 版直通 Host 的 RN style */
  style?: Record<string, unknown>;
};
