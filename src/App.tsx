
import { View, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import RootNavigator from "./navigation/RootNavigator";
import { colors } from "./theme/colors";

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <RootNavigator />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: "100%", backgroundColor: colors.background },
});
