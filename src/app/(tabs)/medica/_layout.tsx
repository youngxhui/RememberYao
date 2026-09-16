import { Stack } from "expo-router";

export default function HomeLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="medica" />
      </Stack>
    </>
  );
}
