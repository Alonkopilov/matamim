import { colors } from "@/constants/theme";
import { settings$ } from "@/stores/settingsStore";
import { logger } from "@/utils/logger";
import { teamActions } from "@/utils/teamManagement";
import { RIGHT_TO_LEFT_ROW } from "@/utils/layoutDirection";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Show, useObservable } from "@legendapp/state/react";
import { $Text } from "@legendapp/state/react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface KeypadButton {
  id: string;
  value: string;
  display: string;
}

const KEYPAD_DATA: KeypadButton[] = [
  { id: "9", value: "9", display: "9" },
  { id: "8", value: "8", display: "8" },
  { id: "7", value: "7", display: "7" },
  { id: "6", value: "6", display: "6" },
  { id: "5", value: "5", display: "5" },
  { id: "4", value: "4", display: "4" },
  { id: "3", value: "3", display: "3" },
  { id: "2", value: "2", display: "2" },
  { id: "1", value: "1", display: "1" },
  { id: "back", value: "BACK", display: "⌫" },
  { id: "0", value: "0", display: "0" },
  { id: "empty", value: "", display: "" },
];

const CODE_LENGTH = 8;
// The code is shown as two groups of 4, like 1234 5678. Indexes are listed
// last to first because the rows are laid out right to left.
const CODE_GROUPS = [
  [7, 6, 5, 4],
  [3, 2, 1, 0],
];

export default function TeamScreen() {
  const { t } = useTranslation();
  const ui$ = useObservable({
    code: Array<string>(CODE_LENGTH).fill(""),
    currentDigit: 0,
    isJoining: false,
  });

  const handleKeyPress = ({ id, value }: KeypadButton) => {
    // The code is locked while it's checked
    if (ui$.isJoining.peek()) return;
    const current = ui$.currentDigit.peek();

    if (id === "back") {
      const next = Math.max(current - 1, 0);
      ui$.code[next].set("");
      ui$.currentDigit.set(next);
      return;
    }

    if (current >= CODE_LENGTH) {
      return;
    }

    ui$.code[current].set(value);
    ui$.currentDigit.set(current + 1);

    if (current == CODE_LENGTH - 1) {
      logger.info("SEND_TEAM_JOIN_CODE");
      ui$.isJoining.set(true);
      teamActions.joinTeam(ui$.code.peek().join("")).then((res) => {
        ui$.isJoining.set(false);
        if (res?.success) {
          settings$.isCollaborativeTeam.set(true);
          // Pop the join screen off the stack and land on the team tab
          router.dismissTo("/team");
        }
      });
    }
  };

  const renderKey = (item: KeypadButton) => {
    if (item.id === "empty") {
      return <View key={item.id} style={styles.key}></View>;
    }
    return (
      <Pressable
        key={item.id}
        testID={`join-key-${item.id}`}
        onTouchStart={() => handleKeyPress(item)}
        style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
      >
        {item.id === "back" ? (
          <Ionicons name="backspace-outline" size={28} color={colors.text} />
        ) : (
          <Text style={styles.keyText}>{item.display}</Text>
        )}
      </Pressable>
    );
  };

  return (
    <LinearGradient
      style={styles.gradient}
      colors={["#997F25", colors.accent]}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
    >
      {/* Scrolls only when the content is taller than the screen */}
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t("team.join.title")}</Text>
        <MaterialIcons
          name="password"
          size={109}
          color="white"
          style={styles.icon}
        />
        <Text style={styles.description}>{t("team.join.codePrompt")}</Text>
        <View style={styles.codeContainer}>
          {CODE_GROUPS.map((group) => (
            <View key={group[0]} style={styles.codeGroup}>
              {group.map((i) => (
                <$Text
                  key={i}
                  $style={() =>
                    ui$.code[i].get() ? styles.digit : styles.emptyDigit
                  }
                >
                  {() => ui$.code[i].get()}
                </$Text>
              ))}
            </View>
          ))}
        </View>
        <Show
          if={ui$.isJoining}
          else={
            <Text style={styles.description}>{t("team.join.description")}</Text>
          }
        >
          <ActivityIndicator
            size="large"
            color={colors.text}
            style={styles.joining}
          />
        </Show>

        <View style={styles.gridContainer}>
          {[0, 3, 6, 9].map((start) => (
            <View key={start} style={styles.row}>
              {KEYPAD_DATA.slice(start, start + 3).map(renderKey)}
            </View>
          ))}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const { width } = Dimensions.get("window");
const BUTTON_SIZE = width / 5;
const DIGIT_GAP = 6;
const GROUP_GAP = 18;
// 8 boxes fit between the screen's 30px side padding
const DIGIT_WIDTH = Math.min(
  44,
  (width - 60 - DIGIT_GAP * 6 - GROUP_GAP) / CODE_LENGTH,
);

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    padding: 30,
    flexGrow: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
  },
  key: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  keyPressed: { backgroundColor: "#cfb45e", opacity: 0.9, borderRadius: 10 },
  keyText: { fontSize: 24, color: colors.text, fontFamily: "Code" },
  gridContainer: {
    marginTop: 30,
    width: "100%",
  },
  title: {
    marginTop: 40,
    fontSize: 18,
    color: colors.text,
    fontFamily: "Default",
  },
  description: {
    fontSize: 18,
    marginTop: 30,
    color: colors.text,
    fontFamily: "Default",
    textAlign: "center",
  },
  codeContainer: {
    marginTop: 30,
    display: "flex",
    flexDirection: RIGHT_TO_LEFT_ROW,
    gap: GROUP_GAP,
  },
  codeGroup: {
    display: "flex",
    flexDirection: RIGHT_TO_LEFT_ROW,
    gap: DIGIT_GAP,
  },
  digit: {
    width: DIGIT_WIDTH,
    fontSize: 22,
    color: colors.onAccent,
    fontFamily: "Code",
    textAlign: "center",
    textAlignVertical: "center",
    backgroundColor: colors.text,
    paddingVertical: 18,
    borderRadius: 8,
  },
  emptyDigit: {
    width: DIGIT_WIDTH,
    fontSize: 22,
    fontFamily: "Code",
    backgroundColor: "#ffffff4a",
    paddingVertical: 18,
    borderRadius: 8,
  },
  icon: {
    marginTop: 60,
  },
  joining: {
    marginTop: 30,
  },
  row: {
    width: "100%",
    display: "flex",
    flexDirection: RIGHT_TO_LEFT_ROW,
    justifyContent: "space-around",
  },
});
