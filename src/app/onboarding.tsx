import { useRouter } from "expo-router";
import { useRef, useState } from "react";
// ScrollView 是原生滚动控件（迁移规范第 7 条保留原包）；RNView / RNPressable 是因为
// onLayout 与 hitSlop 是 RN 专属 prop，Tamagui 的 View 类型不收（规范第 8 条），
// 这两处按最小改动保留 RN 原族，里面仍放 Tamagui 内容
import {
  Pressable as RNPressable,
  ScrollView,
  View as RNView,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, View } from "tamagui";

import { GlassHostButton } from "@/components/glass-host-button";
import { SYMBOL_ICONS } from "@/components/icons";
import { SymbolIcon } from "@/components/symbol-icon";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation, type Path } from "@/i18n";
import { markOnboardingSeen } from "@/lib/onboarding";

// 标题/副标题存翻译键而不是文案本身：PAGES 在模块级，拿不到 hook 里的 t()
// （规范 28：屏幕/组件不直接 import 词典），所以推迟到组件内再 t()
const PAGES = [
  {
    value: "brand",
    icon: SYMBOL_ICONS.onboardingBrand,
    titleKey: "onboarding.page1Title",
    subtitleKey: "onboarding.page1Subtitle",
  },
  {
    value: "intro",
    icon: SYMBOL_ICONS.onboardingIntro,
    titleKey: "onboarding.page2Title",
    subtitleKey: "onboarding.page2Subtitle",
  },
] as const satisfies ReadonlyArray<{
  value: string;
  icon: (typeof SYMBOL_ICONS)[keyof typeof SYMBOL_ICONS];
  titleKey: Path;
  subtitleKey: Path;
}>;

/** 图标底块边长与圆角（原 Expo UI 版写死的 128 / 32） */
const HERO_SIZE = 128;
const HERO_RADIUS = 32;

/**
 * 首次启动引导页：两页横滑（品牌 → 能做什么），末页按钮变「开始使用」。
 *
 * 早先整屏是 `@expo/ui`（`Host` + SwiftUI `ScrollView` / `Column` / `Row` +
 * `TabView(.pageStyle)` pager + `.buttonStyle(.glassProminent)` 按钮）。2026-10-16
 * 迁 RN 树（2026-10-19 起 UI 原语改走 Tamagui，滚动容器仍是 RN）：
 *
 * - **pager** 用 RN `ScrollView` + `pagingEnabled`：容器实测宽度后每页等宽，
 *   跟手滑动用 `onMomentumScrollEnd` 回读页码，「下一步」用 `scrollTo` 程序化翻页。
 *   iOS 的 SwiftUI `TabView(.pageStyle)` 与 Android 的 `HorizontalPager` 行为略有
 *   差异，RN 这套两端同构 —— 代价是回弹 / 边缘手势的细节不如原生 pager 精致。
 * - **玻璃主按钮** 用 `GlassHostButton`（iOS `UIGlassEffect`，Android 实心主按钮），
   与详情页补货、孪生加板同一颗。
 * - **「跳过」** 现在能落 `testID` 了 —— `@expo/ui` 的 `Text` 在 iOS 上不转发
 *   accessibilityIdentifier（`TextView.swift` 漏调 `applyAccessibilityIdentifier`），
 *   Maestro 只能按中文文案定位；（Tamagui 的）`Text` 底层就是 RN `Text`，没这个问题。
 *   yaml 里既有的 `tapOn: "跳过"` 仍然有效（文案没动），此处只是多给一个稳定入口。
 */
export default function OnboardingScreen() {
  // SymbolIcon 的 color 喂给原生的 SymbolView，只收真实色值
  const theme = useTheme();
  const t = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<string>(PAGES[0].value);
  // pager 宽度：pagingEnabled 要求每页宽 == 容器宽，用 onLayout 实测
  const [pagerWidth, setPagerWidth] = useState(0);
  const pagerRef = useRef<ScrollViewInstance>(null);
  const isFirst = page === PAGES[0].value;
  const isLast = page === PAGES[PAGES.length - 1].value;

  const finish = async () => {
    await markOnboardingSeen();
    router.replace("/(tabs)/home");
  };

  const next = () => {
    if (isLast) {
      void finish();
      return;
    }
    const index = PAGES.findIndex((item) => item.value === PAGES[1].value);
    setPage(PAGES[index].value);
    pagerRef.current?.scrollTo({ x: index * pagerWidth, animated: true });
  };

  /** 跟手滑动结束：按偏移量反算页码，回头同步按钮文案 */
  const onSwipeEnd = (offsetX: number) => {
    if (pagerWidth <= 0) return;
    const index = Math.round(offsetX / pagerWidth);
    const target = PAGES[Math.min(Math.max(index, 0), PAGES.length - 1)];
    if (target) setPage(target.value);
  };

  return (
    <View flex={1} backgroundColor="$canvas">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.three,
          flexGrow: 1,
        }}
      >
        <View flexDirection="row" padding="three">
          <View flex={1} />
          {!isFirst ? (
            // hitSlop 是 RN Pressable 专属 prop（Tamagui 的 View 类型不收，见
            // 文件头注释），为保住这块 16px 热区外扩，跳过按钮保留 RN 外壳，
            // 文字仍是 Tamagui Text
            <RNPressable
              testID="onboarding-skip-button"
              accessibilityRole="button"
              onPress={() => {
                void finish();
              }}
              hitSlop={Spacing.three}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text fontSize={14} color="$textSecondary">
                {t("onboarding.skip")}
              </Text>
            </RNPressable>
          ) : null}
        </View>

        {/* onLayout 同样是 RN 专属 prop：这一层量 pager 宽度，用 RN View 外壳，
            Tamagui 的 View 类型不收它（见文件头注释） */}
        <RNView
          style={{ flex: 1, justifyContent: "center" }}
          onLayout={(event) => {
            setPagerWidth(event.nativeEvent.layout.width);
          }}
        >
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={pagerWidth > 0}
            onMomentumScrollEnd={(event) => {
              onSwipeEnd(event.nativeEvent.contentOffset.x);
            }}
          >
            {PAGES.map((item) => (
              <View
                key={item.value}
                width={pagerWidth > 0 ? pagerWidth : undefined}
                flex={pagerWidth > 0 ? undefined : 1}
                alignItems="center"
                gap="five"
                paddingBlock={Spacing.six}
                paddingInline="five"
              >
                <View
                  width={HERO_SIZE}
                  height={HERO_SIZE}
                  borderRadius={HERO_RADIUS}
                  borderCurve="continuous"
                  backgroundColor="$primarySoft"
                  alignItems="center"
                  justifyContent="center"
                >
                  <SymbolIcon
                    name={item.icon}
                    size={60}
                    color={theme.primary}
                  />
                </View>
                <Text
                  fontSize={26}
                  fontWeight="700"
                  color="$text"
                  textAlign="center"
                >
                  {t(item.titleKey)}
                </Text>
                <Text fontSize={14} color="$textSecondary" textAlign="center">
                  {t(item.subtitleKey)}
                </Text>
              </View>
            ))}
          </ScrollView>
        </RNView>

        <View padding="four">
          <GlassHostButton
            testID="onboarding-next-button"
            label={isLast ? t("onboarding.start") : t("onboarding.next")}
            onPress={next}
            fullWidth
          />
        </View>
      </ScrollView>
    </View>
  );
}
