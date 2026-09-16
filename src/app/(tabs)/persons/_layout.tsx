import { Stack } from "expo-router";

export default function PersonsLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="detail" />
        <Stack.Screen name="plan-form" />
      </Stack>
    </>
  );
}
