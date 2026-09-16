import { Button, Column, Host, Text } from "@expo/ui";
import { buttonStyle } from "@expo/ui/swift-ui/modifiers";
import { Stack } from "expo-router";
import { ScrollView as RNScrollView } from "react-native";

export default function Detail() {
  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <RNScrollView style={{ flex: 1 }}>
        <Stack.Title large>详情页</Stack.Title>
        <Host matchContents seedColor="#40621a">
          <Column style={{ padding: 16 }}>
            <Text>详情</Text>
            <Button
              label="Hello Expo"
              modifiers={[buttonStyle("glassProminent")]}
            />
          </Column>
        </Host>
      </RNScrollView>
    </>
  );
}
