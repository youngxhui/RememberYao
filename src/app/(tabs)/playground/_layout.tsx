import { Stack } from "expo-router";

export default function PlaygroundLayout() {
  // 与 home / profile 同构：开导航栏 + 无阴影 + 透明底，大标题由屏内
  // <Stack.Title large> 给出。早期 playground 挂在根 Stack 下跟全局
  // headerShown: false，安全区与底色自己算；归入 (tabs) 后统一走 ScreenScaffold
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: "transparent",
        },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
