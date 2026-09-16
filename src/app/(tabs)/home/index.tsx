import { Button, Column, Host, Text } from "@expo/ui";
import { buttonStyle } from "@expo/ui/swift-ui/modifiers";
import { Stack, useRouter } from "expo-router";
import { ScrollView as RNScrollView } from "react-native";

export default function Index() {
  const router = useRouter();

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button>
          <Stack.Toolbar.Icon sf="star.fill" />
          <Stack.Toolbar.Label>As components</Stack.Toolbar.Label>
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <RNScrollView style={{ flex: 1 }}>
        <Stack.Title large>今日</Stack.Title>
        <Host matchContents seedColor="#40621a">
          <Column style={{ padding: 16 }}>
            <Text>Hello, Expo!</Text>
            <Button
              label="详情页"
              modifiers={[buttonStyle("glassProminent")]}
              onPress={() => {
                router.push("/home/detail");
              }}
            />
          </Column>
        </Host>
      </RNScrollView>
    </>
  );
}
