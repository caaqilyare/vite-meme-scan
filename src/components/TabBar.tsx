import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

export type Route = "dashboard" | "profile";

export function TabBar({
  route,
  onChange,
}: {
  route: Route;
  onChange: (r: Route) => void;
}) {
  return (
    <View style={styles.tabBar}>
      <TabItem
        label="Dashboard"
        active={route === "dashboard"}
        onPress={() => onChange("dashboard")}
      />
      <TabItem
        label="Profile"
        active={route === "profile"}
        onPress={() => onChange("profile")}
      />
    </View>
  );
}

function TabItem({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tabItem, active && styles.tabItemActive]}>
      <Text style={[styles.tabItemText, active && styles.tabItemTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 22,
    flexDirection: "row",
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    zIndex: 1000,
    ...(Platform.OS !== "web"
      ? {
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
        }
      : { boxShadow: "0 8px 24px rgba(0,0,0,0.35)", position: "fixed", left: 0, right: 0 } as any),
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 16,
  },
  tabItemActive: {
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  tabItemText: {
    color: "#A7B0BE",
    fontWeight: "800",
  },
  tabItemTextActive: {
    color: colors.textPrimary,
  },
});
