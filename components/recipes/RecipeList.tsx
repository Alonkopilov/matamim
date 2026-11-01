import PressableScale from "@/components/ui/PressableScale";
import { colors, fonts, radius, spacing } from "@/constants/theme";
import { difficultyLabel } from "@/i18n/recipeLabels";
import { getCurrentUserId, useAccessToken } from "@/stores/authStore";
import { useIsInCloud } from "@/stores/recipeStore";
import { Recipe } from "@/types/recipe";
import { imageSource } from "@/utils/imageStorage";
import { contentDirection } from "@/utils/textDirection";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { type ComponentProps, type RefObject, useEffect } from "react";
import { Trans, useTranslation } from "react-i18next";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import NoRecipes from "./NoRecipes";

// The card shows the start of a long title, the recipe screen shows it whole
const MAX_TITLE_LENGTH = 60;
const shortTitle = (name: string) => {
  // By code points, so an emoji isn't cut in half
  const chars = Array.from(name);
  return chars.length > MAX_TITLE_LENGTH
    ? chars.slice(0, MAX_TITLE_LENGTH).join("").trimEnd() + "..."
    : name;
};

// Half the gap between the two columns, the list's own edge cancels it out
export const CARD_GUTTER = 6;
const CARD_ASPECT_RATIO = 160 / 210;
const CHIP_HEIGHT = 20;

// The first screenful of cards rises in one after another. Recycled cells
// don't mount again, so this only plays when the list first appears
const STAGGERED_CARDS = 8;
const cardEntering = (index: number) =>
  FadeInDown.duration(320)
    .delay(index * 40)
    .easing(Easing.out(Easing.cubic))
    .withInitialValues({ transform: [{ translateY: 16 }] });

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
const DIFFICULTY_ICONS: Record<string, IconName> = {
  easy: "signal-cellular-1",
  medium: "signal-cellular-2",
  hard: "signal-cellular-3",
};

type Props = {
  recipes: Recipe[];
  listRef?: RefObject<FlashListRef<Recipe> | null>;
  header: any;
  // Mark the user's own recipes as device-only, for a team member who
  // doesn't upload
  showLocalBadge: boolean;
  // A search or category is applied, so an empty list means no matches
  isFiltered?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onScroll?: (offsetY: number) => void;
  // Space kept above the content for a header that floats over the list
  topInset?: number;
};

export default function RecipeList({
  recipes,
  listRef,
  header,
  showLocalBadge,
  isFiltered = false,
  refreshing = false,
  onRefresh,
  onScroll,
  topInset = 0,
}: Props) {
  const currentUserId = getCurrentUserId();
  const accessToken = useAccessToken();
  const { t } = useTranslation();
  const tabBarHeight = useBottomTabBarHeight();
  const isInCloud = useIsInCloud();

  return (
    <FlashList
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      masonry
      numColumns={2}
      data={recipes}
      extraData={[showLocalBadge, accessToken, isInCloud]}
      keyExtractor={(item: Recipe) => item.id}
      ListHeaderComponent={header}
      ref={listRef}
      style={styles.list}
      contentContainerStyle={{
        paddingTop: topInset,
        paddingBottom: tabBarHeight,
      }}
      onScroll={
        onScroll ? (e) => onScroll(e.nativeEvent.contentOffset.y) : undefined
      }
      scrollEventThrottle={16}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.background}
            progressViewOffset={topInset}
          />
        ) : undefined
      }
      ListEmptyComponent={
        isFiltered ? (
          <View style={styles.noMatches}>
            <MaterialCommunityIcons
              name="text-search"
              size={40}
              color={colors.textMuted}
            />
            <Text style={styles.noMatchesText}>{t("recipes.noMatches")}</Text>
          </View>
        ) : (
          <NoRecipes />
        )
      }
      ListFooterComponent={
        recipes.length > 0 ? (
          <Text style={styles.footer}>
            <Trans
              i18nKey="recipes.listFooter"
              components={{
                highlight: <Text style={{ color: colors.accent }} />,
              }}
            />
          </Text>
        ) : null
      }
      renderItem={({ index }) => {
        const item = recipes[index];
        const difficulty = difficultyLabel(item.difficulty);
        return (
          <Animated.View
            style={styles.cell}
            entering={index < STAGGERED_CARDS ? cardEntering(index) : undefined}
          >
            <PressableScale
              testID="recipe-card"
              onPress={() => router.navigate(`/${item.id}`)}
              style={styles.card}
            >
              {item.image !== "" ? (
                <Image
                  source={imageSource(item.image, accessToken)}
                  style={StyleSheet.absoluteFill}
                  transition={200}
                  cachePolicy="memory-disk"
                  recyclingKey={item.image}
                />
              ) : (
                <View style={styles.noImage}>
                  <FontAwesome6
                    name="drumstick-bite"
                    size={32}
                    color={colors.textMuted}
                  />
                </View>
              )}

              <LinearGradient
                colors={["transparent", "rgba(0, 0, 0, 0.85)"]}
                style={styles.scrim}
              />

              {showLocalBadge && item.user_id === currentUserId && (
                <View style={styles.localBadge}>
                  <MaterialCommunityIcons
                    name="cellphone-lock"
                    size={12}
                    color={colors.background}
                  />
                  <Text style={styles.localBadgeText}>
                    {t("recipes.localBadge")}
                  </Text>
                </View>
              )}

              <View style={styles.info}>
                <Text
                  style={[styles.recipeTitle, contentDirection(item.name)]}
                  numberOfLines={2}
                >
                  {shortTitle(item.name)}
                </Text>
                <View style={styles.chips}>
                  {item.prep_time !== "" && (
                    <InfoChip
                      icon="clock-outline"
                      label={t("recipes.prepTimeShort", {
                        minutes: item.prep_time,
                      })}
                    />
                  )}
                  {difficulty !== "" && (
                    <InfoChip
                      icon={DIFFICULTY_ICONS[item.difficulty] ?? "chef-hat"}
                      label={difficulty}
                    />
                  )}
                  <CloudChip isInCloud={isInCloud(item)} />
                </View>
              </View>
            </PressableScale>
          </Animated.View>
        );
      }}
    />
  );
}

function InfoChip({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.chip}>
      <MaterialCommunityIcons name={icon} size={11} color={colors.text} />
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// Whether the recipe would survive losing this device
function CloudChip({ isInCloud }: { isInCloud: boolean }) {
  const { t } = useTranslation();
  return (
    <View
      style={[styles.chip, styles.cloudChip]}
      accessible
      accessibilityLabel={
        isInCloud ? t("recipes.cloud.saved") : t("recipes.cloud.deviceOnly")
      }
    >
      <MaterialCommunityIcons
        name={isInCloud ? "cloud" : "cloud-off-outline"}
        size={12}
        color={isInCloud ? colors.cloud : colors.textSecondary}
      />
    </View>
  );
}

// Shown while the saved recipes load
export function RecipeListSkeleton() {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.set(withRepeat(withTiming(1, { duration: 700 }), -1, true));
  }, [opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={[styles.list, styles.skeleton]}>
      {[0, 1, 2, 3].map((key) => (
        <View key={key} style={[styles.cell, styles.skeletonCell]}>
          <Animated.View style={[styles.card, styles.skeletonCard, pulse]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginHorizontal: -CARD_GUTTER,
  },
  cell: {
    paddingHorizontal: CARD_GUTTER,
    paddingTop: spacing.md,
  },
  card: {
    width: "100%",
    aspectRatio: CARD_ASPECT_RATIO,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceRaised,
  },
  noImage: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
  },
  // Keeps the title readable over any photo
  scrim: {
    position: "absolute",
    start: 0,
    end: 0,
    bottom: 0,
    height: "60%",
  },
  info: {
    position: "absolute",
    start: 0,
    end: 0,
    bottom: 0,
    padding: spacing.md,
    gap: 6,
  },
  recipeTitle: {
    fontSize: 17,
    lineHeight: 22,
    textAlign: "left",
    color: colors.text,
    fontFamily: fonts.bold,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  chip: {
    height: CHIP_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    borderRadius: CHIP_HEIGHT / 2,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  // Round, the same height as the other chips
  cloudChip: {
    width: CHIP_HEIGHT,
    paddingHorizontal: 0,
    justifyContent: "center",
  },
  chipText: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  localBadge: {
    position: "absolute",
    top: spacing.md,
    start: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  localBadgeText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.background,
  },
  footer: {
    marginTop: spacing.xl,
    alignSelf: "center",
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    textAlign: "left",
  },
  noMatches: {
    alignItems: "center",
    gap: spacing.md,
    marginTop: 60,
  },
  noMatchesText: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    textAlign: "center",
  },
  skeleton: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing.lg,
  },
  skeletonCell: {
    width: "50%",
  },
  skeletonCard: {
    backgroundColor: colors.surface,
  },
});
