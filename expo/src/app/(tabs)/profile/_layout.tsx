import { Stack } from "expo-router";

export default function ProfileLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: true }}>
        {/* index 用大标题：就是 design/profile.html 的 hero-title，滚动时由系统收起 */}
        <Stack.Screen name="index" options={{ headerLargeTitle: true }} />
        <Stack.Screen name="persons" />
        <Stack.Screen name="person-detail" />
        <Stack.Screen name="plan-form" />
        <Stack.Screen name="settings" />
      </Stack>
    </>
  );
}
