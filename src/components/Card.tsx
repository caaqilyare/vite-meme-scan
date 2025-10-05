import { View, Platform, StyleSheet } from "react-native";
import type { ViewProps } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type CardVariant = "default" | "glass";

type Props = ViewProps & {
  variant?: CardVariant;
  noPadding?: boolean;
};

export default function Card({ style, variant = "default", noPadding, ...rest }: Props) {
  const base = [styles.cardBase];
  if (variant === "glass") base.push(styles.cardGlass);
  else base.push(styles.cardDefault);
  if (!noPadding) base.push(styles.cardPadding);
  return <View {...rest} style={[...base, style]} />;
}

const styles = StyleSheet.create({
  cardBase: {
    borderRadius: 18,
    borderWidth: 1,
    ...(Platform.OS !== "web"
      ? {
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
        }
      : { boxShadow: "0 8px 24px rgba(0,0,0,0.35)" } as any),
  },
  cardPadding: {
    padding: spacing.md,
  },
  cardDefault: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
  },
  cardGlass: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
    ...(Platform.OS === "web"
      ? ({
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)",
        } as any)
      : {}),
  },
});
