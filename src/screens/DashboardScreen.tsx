import { ScrollView, Text, View, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { MemeScanner } from "../features/MemeScanner";
import useSWR from "swr";
import { api } from "../api/client";
import { type } from "../theme/typography";

export function DashboardScreen() {
  const { data } = useSWR("/state", api.getState, { refreshInterval: 5000, revalidateOnFocus: true, keepPreviousData: true });
  const name = data?.user?.name || "Alex";
  

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Good afternoon, {name}</Text>
       
      </View>

      <MemeScanner />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 120,
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: {
    color: colors.textPrimary,
    fontSize: type.h1,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  searchBoxWrap: { marginTop: 8 },
  searchBox: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    minWidth: 180,
    fontSize: type.body,
  },
  bodyText: { color: colors.textMuted, lineHeight: 20 },
});
