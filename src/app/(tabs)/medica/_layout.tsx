import { Stack } from "expo-router";

export default function MedicaLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="detail" />
        <Stack.Screen name="form" />
        <Stack.Screen name="add-options" />
      </Stack>
    </>
  );
}
