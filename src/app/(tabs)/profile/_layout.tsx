import { Stack } from "expo-router";

export default function ProfileLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen
          name="index"
          options={{
            title: "Home",
            headerLargeTitle: true,
            headerTransparent: true,
          }}
        />
        <Stack.Screen name="persons" />
        <Stack.Screen name="person-detail" />
        <Stack.Screen name="plan-form" />
      </Stack>
    </>
  );
}
