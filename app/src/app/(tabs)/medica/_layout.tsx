import { Stack } from "expo-router";

export default function MedicaLayout() {
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
        <Stack.Screen name="index" />
        <Stack.Screen name="detail" />
        <Stack.Screen name="form" />
        <Stack.Screen name="quick-add" />
        <Stack.Screen name="twin" />
      </Stack>
    </>
  );
}
