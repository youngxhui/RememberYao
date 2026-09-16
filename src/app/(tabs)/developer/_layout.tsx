import { Stack } from "expo-router";

export default function DeveloperLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen name="index" />
      </Stack>
    </>
  );
}
