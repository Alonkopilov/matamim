import { Link, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#25292e",
  },
  text: {
    color: "#fff",
  },
  button: {
    fontSize: 20,
    fontFamily: "Default",
    textDecorationLine: "underline",
    color: "#fff",
  },
});

export default function Index() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops! Not Found" }} />
      <View style={styles.container}>
        <Link href="/" style={styles.button}>
          Go back to the home screen!
        </Link>
      </View>
    </>
  );
}
