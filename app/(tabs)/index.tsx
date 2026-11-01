import { colors, fonts, spacing } from "@/constants/theme";
import Category from "@/components/Category";
import LanguageButton from "@/components/LanguageButton";
import RecipeList, {
  CARD_GUTTER,
  RecipeListSkeleton,
} from "@/components/recipes/RecipeList";
import SearchBar from "@/components/SearchBar";
import { auth$ } from "@/stores/authStore";
import { currentUserName } from "@/stores/profileStore";
import {
  getOwnRecipes,
  getTeamRecipes,
  isHiddenFromTeam,
  recipeStore$,
  refreshRecipes,
} from "@/stores/recipeStore";
import { showToast } from "@/stores/toastStore";
import { categories } from "@/types/category";
import { Recipe } from "@/types/recipe";
import { logger } from "@/utils/logger";
import { Observable, syncState, when } from "@legendapp/state";
import {
  Computed,
  Show,
  useObservable,
  useObserve,
} from "@legendapp/state/react";
import { $Text } from "@legendapp/state/react-native";
import { FlashListRef } from "@shopify/flash-list";
import { useEffect, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

const SEARCH_DELAY_MS = 250;
// The bar over the list, and the scroll range the large title collapses over
const BAR_TOP = 40;
const BAR_HEIGHT = 96;
const COLLAPSE_START = 40;
const COLLAPSE_END = 80;

export default function Index() {
  const { t } = useTranslation();
  const listRef = useRef<FlashListRef<Recipe>>(null);
  // FlashList keeps the card on screen in place when the data changes, so
  // clearing a filter, which adds recipes above it, scrolled the list down.
  // Its own escape hatch skips that for the next render.
  const beforeFilterChange = () =>
    listRef.current?.prepareForLayoutAnimationRender();
  const ui$ = useObservable({
    // What's typed, and what the list is filtered by once typing pauses
    query: "",
    searchQuery: "",
    category: -1,
    isLocalRecipesLoaded: false,
    isRemoteRecipesLoaded: false,
    isRefreshing: false,
    async refresh() {
      ui$.isRefreshing.set(true);
      await refreshRecipes();
      ui$.isRefreshing.set(false);
    },
    selectCategory(index: number) {
      beforeFilterChange();
      if (index == ui$.category.get()) {
        logger.info("FILTER_RECIPES_CATEGORY", { category: "ALL" });
        ui$.category.set(-1);
      } else {
        logger.info("FILTER_RECIPES_CATEGORY", {
          category: categories[index].key,
        });
        ui$.category.set(index);
      }
    },
    filterRecipes() {
      const category = ui$.category.get();
      const key = category === -1 ? null : categories[category].key;
      const query = ui$.searchQuery.get().trim().toLowerCase();
      const recipes: Recipe[] = [...getOwnRecipes(), ...getTeamRecipes()];

      return recipes.filter((item) => {
        const matchesMeal = key === null || item.category === key;
        const matchesSearch =
          query === "" || item.name.toLowerCase().includes(query);

        return matchesMeal && matchesSearch;
      });
    },
  });

  // Filtering on every keystroke rebuilds the list, which is slow on cheap
  // phones, so wait for typing to pause
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useObserve(ui$.query, ({ value }) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      beforeFilterChange();
      ui$.searchQuery.set(value ?? "");
    }, SEARCH_DELAY_MS);
  });
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  useEffect(() => {
    when(syncState(recipeStore$).isPersistLoaded).then(() => {
      ui$.isLocalRecipesLoaded.set(true);
    });
  }, [ui$.isLocalRecipesLoaded]);

  // Greets once per user. The session is replaced on every token refresh,
  // which isn't a new visit.
  const greetedUserId = useRef<string | null>(null);
  useObserve(() => {
    if (auth$.isLoading.get()) return;

    const userId = auth$.session.get()?.user.id ?? "guest";
    if (greetedUserId.current === userId) return;
    greetedUserId.current = userId;

    logger.info("APP_LOADED");
    const name = currentUserName();
    showToast(t("home.greetingToast", { name }), "success");
  });

  const scrollY = useSharedValue(0);
  // The compact bar fades in as the large title scrolls under it
  const compactStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [COLLAPSE_START, COLLAPSE_END],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  // Built once, so the list doesn't rebuild its header on every update
  const header = (
    <HomeListHeader
      scrollY={scrollY}
      query$={ui$.query}
      category$={ui$.category}
      onSelect={(index) => ui$.selectCategory(index)}
    />
  );

  return (
    <View style={styles.container}>
      <Computed>
        {() => (
          <Show
            if={ui$.isLocalRecipesLoaded}
            else={
              <View style={styles.skeletonContainer}>
                {header}
                <RecipeListSkeleton />
              </View>
            }
          >
            <RecipeList
              recipes={ui$.filterRecipes()}
              showLocalBadge={isHiddenFromTeam()}
              isFiltered={
                ui$.category.get() !== -1 || ui$.searchQuery.get().trim() !== ""
              }
              refreshing={ui$.isRefreshing.get()}
              onRefresh={ui$.refresh}
              listRef={listRef}
              onScroll={(y) => scrollY.set(y)}
              topInset={BAR_HEIGHT}
              header={header}
            />
          </Show>
        )}
      </Computed>
      <View style={styles.bar} pointerEvents="box-none">
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.barBackground, compactStyle]}
        />
        <Animated.View style={[styles.barTitleWrap, compactStyle]}>
          <$Text style={styles.barTitle} numberOfLines={1}>
            {() =>
              t("home.welcome", {
                name: currentUserName(),
              })
            }
          </$Text>
        </Animated.View>
        <LanguageButton />
      </View>
    </View>
  );
}

type HeaderProps = {
  scrollY: SharedValue<number>;
  query$: Observable<string>;
  category$: Observable<number>;
  onSelect: (index: number) => void;
};

function HomeListHeader({ scrollY, query$, category$, onSelect }: HeaderProps) {
  const { t } = useTranslation();
  const largeTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [0, COLLAPSE_END],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View style={styles.flashListHeader}>
      <Animated.View style={largeTitleStyle}>
        <$Text style={styles.welcomeMsg}>
          {() =>
            t("home.welcome", {
              name: currentUserName(),
            })
          }
        </$Text>
        <Text style={styles.openingMsg}>
          <Trans
            i18nKey="home.tagline"
            components={{
              highlight: <Text style={{ color: colors.accent }} />,
            }}
          />
        </Text>
      </Animated.View>
      <View style={styles.search}>
        <SearchBar query$={query$} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesScroll}
        contentContainerStyle={styles.categories}
      >
        {categories.map((item, index) => (
          <Computed key={index}>
            {() => (
              <Category
                name={t(`categories.${item.key}`)}
                materialIcon={item.icon}
                isSelected={category$.get() == index}
                onSelect={() => onSelect(index)}
              />
            )}
          </Computed>
        ))}
      </ScrollView>
      <Text style={styles.recipesTitle}>{t("home.recentRecipes")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: colors.background,
  },
  skeletonContainer: {
    flex: 1,
    paddingTop: BAR_HEIGHT,
  },
  // Floats over the list, the language button stays reachable while scrolled
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: BAR_HEIGHT,
    paddingTop: BAR_TOP,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  barBackground: {
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  barTitleWrap: {
    flex: 1,
  },
  barTitle: {
    fontSize: 17,
    color: colors.text,
    fontFamily: fonts.bold,
    textAlign: "left",
  },
  search: {
    marginTop: 20,
  },
  flashListHeader: {
    paddingHorizontal: CARD_GUTTER,
  },
  welcomeMsg: {
    fontSize: 14,
    textAlign: "left",
    color: colors.textMuted,
    fontFamily: "DefaultBold",
  },
  openingMsg: {
    paddingTop: 10,
    fontSize: 25,
    color: colors.text,
    textAlign: "left",
    fontFamily: "DefaultBold",
  },
  categoriesScroll: {
    marginTop: 20,
  },
  categories: {
    gap: 8,
  },
  recipesTitle: {
    marginTop: 28,
    fontSize: 25,
    color: colors.text,
    fontFamily: "DefaultBold",
    textAlign: "left",
  },
});
