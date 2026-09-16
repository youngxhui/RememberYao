import { Button, Column, Host, Text } from "@expo/ui";
import { buttonStyle } from "@expo/ui/swift-ui/modifiers";
import { Stack } from "expo-router";
import { ScrollView as RNScrollView } from "react-native";

// 添加药物
export default function MedicaScreen() {
  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />

      <RNScrollView style={{ flex: 1 }}>
        <Stack.Title large>药箱</Stack.Title>
        <Host matchContents seedColor="#40621a">
          <Column style={{ padding: 16 }}>
            <Text>Hello, Expo!</Text>
            <Button
              label="跳转详情页"
              modifiers={[buttonStyle("glassProminent")]}
              onPress={() => {
                console.log("跳转详情页");
              }}
            />
          </Column>
        </Host>
      </RNScrollView>
    </>
  );
}
