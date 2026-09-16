import { Host, Icon, List, ListItem } from "@expo/ui";

const CHEVRON = Icon.select({
  ios: "chevron.right",
  android: require("@expo/material-symbols/chevron_right.xml"),
});

export default function DeveloperLayout() {
  return (
    <Host style={{ flex: 1 }}>
      <List>
        <ListItem
          onPress={() => {}}
          //   trailing={<Icon name={CHEVRON} size={14} color="gray" />}
          supportingText="Secondary line below the headline"
        >
          Profile
        </ListItem>
        <ListItem
          onPress={() => {}}
          //   trailing={<Icon name={CHEVRON} size={14} color="gray" />}
        >
          Settings
        </ListItem>
      </List>
    </Host>
  );
}
