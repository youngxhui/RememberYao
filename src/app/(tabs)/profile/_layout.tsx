import { Stack } from "expo-router";

export default function ProfileLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: true,
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: "transparent",
          },
        }}
      >
        {/* index 用大标题：就是 design/profile.html 的 hero-title，滚动时由系统收起 */}
        <Stack.Screen name="index" options={{ headerLargeTitle: true }} />
        <Stack.Screen name="persons" />
        <Stack.Screen name="person-detail" />
        <Stack.Screen name="plan-form" />
        {/* 设置的四个屏是**平级路由**，不是嵌套导航器 —— settings/ 目录下不能再放
            _layout.tsx：Stack 里嵌 Stack 会渲染两层导航栏（父给 settings 这条路由一层、
            子导航器自己再一层）。2026-10-17 踩过，见 AGENTS.md 待办。
            返回按钮的 minimal 由各屏自己的 <Stack.Screen.BackButton /> 声明 */}
        <Stack.Screen name="settings" />
        <Stack.Screen name="settings/general" />
        <Stack.Screen name="settings/notifications" />
        <Stack.Screen name="settings/about" />
      </Stack>
    </>
  );
}
