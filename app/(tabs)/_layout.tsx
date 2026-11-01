import { colors } from "@/constants/theme";
import { getCurrentUserId } from "@/stores/authStore";
import { team$ } from "@/stores/teamStore";
import { showToast } from "@/stores/toastStore";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { observer } from "@legendapp/state/react";
import { Tabs } from "expo-router";
import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { type ColorValue, StyleSheet, View } from "react-native";
import { BlurTargetView } from "expo-blur";
import FloatingTabBar from "@/components/FloatingTabBar";

type IoniconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
type TabIconProps = {
  color: ColorValue;
  focused: boolean;
};

function createTabIcon(focusedName: IoniconName, unfocusedName: IoniconName) {
  function TabIcon({ color, focused }: TabIconProps) {
    return (
      <MaterialCommunityIcons
        name={focused ? focusedName : unfocusedName}
        color={color}
        size={24}
      />
    );
  }
  return TabIcon;
}

// Follows the actual membership, the setting can drift from it
const hasTeam = () =>
  team$.id.get() !== null && getCurrentUserId(true) !== "guest";

export default observer(function TabLayout() {
  const { t } = useTranslation();
  // Each screen's blur target, for the tab bar to blur the focused one. Set
  // once laid out, since BlurView reads its target's ref only when it changes
  const [blurTargets, setBlurTargets] = useState<
    Record<string, RefObject<View | null>>
  >({});

  return (
    <Tabs
      tabBar={(props) => (
        <FloatingTabBar
          {...props}
          blurTarget={blurTargets[props.state.routes[props.state.index].key]}
        />
      )}
      // On Android the blur can't sit inside what it blurs, so each screen
      // is a target and the bar stays outside them
      screenLayout={({ route, children }) => (
        <ScreenBlurTarget
          onReady={(ref) =>
            setBlurTargets((targets) =>
              targets[route.key] ? targets : { ...targets, [route.key]: ref },
            )
          }
        >
          {children}
        </ScreenBlurTarget>
      )}
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: "#484848",
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerShadowVisible: false,
        headerTintColor: "#fff",
        tabBarStyle: {
          backgroundColor: colors.background,
        },
        tabBarLabelStyle: {
          fontFamily: "Default",
        },
        // Background behind the tab screens; visible during the fade transition
        sceneStyle: {
          backgroundColor: colors.background,
        },
      }}
      detachInactiveScreens={false}
      initialRouteName="index"
      // Android back returns to the recipes tab. The default goes to the first
      // declared tab (account)
      backBehavior="initialRoute"
    >
      <Tabs.Screen
        name="account"
        options={{
          title: t("tabs.account"),
          tabBarIcon: createTabIcon("account-circle", "account-circle-outline"),
          headerShown: false,
          animation: "fade",
        }}
      />

      <Tabs.Screen
        name="team"
        options={{
          title: t("tabs.team"),
          tabBarIcon: createTabIcon("account-group", "account-group-outline"),
          headerShown: false,
          animation: "fade",
          // Always shown so the create button stays centered, dimmed for
          // users without a team
          tabBarItemStyle: { opacity: hasTeam() ? 1 : 0.4 },
        }}
        listeners={{
          tabPress: (e) => {
            if (hasTeam()) return;
            e.preventDefault();
            showToast(t("tabs.teamLocked"), "info");
          },
        }}
      />
      <Tabs.Screen
        name="[id]"
        options={{
          title: t("tabs.create"),
          tabBarIcon: createTabIcon("plus", "plus"),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.recipes"),
          tabBarIcon: createTabIcon("food-drumstick", "food-drumstick-outline"),
          headerShown: false,
          animation: "fade",
        }}
      />
      <Tabs.Screen
        name="premium"
        options={{
          title: t("tabs.premium"),
          tabBarIcon: createTabIcon("crown", "crown-outline"),
          headerShown: false,
          animation: "fade",
        }}
      />
    </Tabs>
  );
});

function ScreenBlurTarget({
  onReady,
  children,
}: {
  onReady: (ref: RefObject<View | null>) => void;
  children: ReactNode;
}) {
  const ref = useRef<View>(null);
  return (
    <BlurTargetView
      ref={ref}
      onLayout={() => onReady(ref)}
      style={styles.blurTarget}
    >
      {children}
    </BlurTargetView>
  );
}

const styles = StyleSheet.create({
  blurTarget: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
