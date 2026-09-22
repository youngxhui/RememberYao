import { Stack } from "expo-router";

export default function RecordsLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen name="index" />
      </Stack>
    </>
  );
}
