import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";

export function PageHeader(props: { title: string; onBack?: () => void }) {
  return (
    <View style={styles.pageHeader}>
      {props.onBack ? (
        <Pressable
          onPress={props.onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={({ pressed }) => [
            styles.headerBackButton,
            pressed && styles.pressedFade,
          ]}
        >
          <Text style={styles.headerBackText}>{"‹"}</Text>
        </Pressable>
      ) : (
        <View style={styles.headerBackButtonPlaceholder} />
      )}
      <Text style={styles.pageHeaderTitle}>{props.title}</Text>
      <View style={styles.headerBackButtonPlaceholder} />
    </View>
  );
}
