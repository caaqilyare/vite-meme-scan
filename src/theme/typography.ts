import { Dimensions } from "react-native";

const { width } = Dimensions.get("window");
// Responsive tiers
const isTiny = width <= 360; // very narrow phones
const isSmall = !isTiny && width <= 412; // small phones

export const type = {
  h1: isTiny ? 20 : isSmall ? 22 : 26,
  h2: isTiny ? 16 : isSmall ? 18 : 20,
  valueLg: isTiny ? 18 : isSmall ? 20 : 22,
  valueMd: isTiny ? 15 : isSmall ? 16 : 18,
  label: isTiny ? 10 : isSmall ? 11 : 12,
  body: isTiny ? 12 : isSmall ? 13 : 14,
};
