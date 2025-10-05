import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { type } from "../theme/typography";

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statWrap}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statWrap: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: type.valueLg,
    fontWeight: "900",
  },
  statLabel: {
    color: colors.textSecondary,
    marginTop: 4,
    fontSize: type.label,
  },
});
