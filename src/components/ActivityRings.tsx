import { View, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

export function ActivityRings() {
  return (
    <View style={styles.wrap}>
      <View style={[styles.ring, { borderColor: colors.ringRed }]} />
      <View style={[styles.ringSmall, { borderColor: colors.ringAmber }]} />
      <View style={[styles.ringTiny, { borderColor: colors.ringMint }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    height: 110,
  },
  ring: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 10,
    opacity: 0.9,
  },
  ringSmall: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 10,
    opacity: 0.7,
  },
  ringTiny: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 10,
    opacity: 0.6,
  },
});
