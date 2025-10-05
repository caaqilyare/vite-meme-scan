import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { TabBar } from "../components/TabBar";
import type { Route } from "../components/TabBar";
import { DashboardScreen } from "../screens/DashboardScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { colors } from "../theme/colors";

export default function RootNavigator() {
  const [route, setRoute] = useState<Route>("dashboard");

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {route === "dashboard" ? (
          <DashboardScreen />
        ) : (
          <ProfileScreen />
        )}
      </View>
      <TabBar route={route} onChange={setRoute} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, position: "relative" },
  content: { flex: 1 },
});
