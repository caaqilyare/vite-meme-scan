import { AppRegistry } from "react-native";
import App from "./App";

const rootTag = document.getElementById("root");

AppRegistry.registerComponent("Main", () => App);
AppRegistry.runApplication("Main", { rootTag });
