import { colors, fonts, spacing } from "@/constants/theme";
import Ingredient from "@/components/Ingredient";
import Instruction from "@/components/Instruction";
import Property from "@/components/Property";
import ImportRecipeModal, {
  ImportedFields,
} from "@/components/recipes/ImportRecipeModal";
import CookMode from "@/components/recipes/CookMode";
import LocalOnlyNotice from "@/components/team/LocalOnlyNotice";
import Button from "@/components/ui/Button";
import GlassButton from "@/components/ui/GlassButton";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { difficultyLabel, mealLabel } from "@/i18n/recipeLabels";
import { getCurrentUserId, useAccessToken } from "@/stores/authStore";
import { showAlert } from "@/stores/alertStore";
import { premium$ } from "@/stores/premiumStore";
import { displayName } from "@/stores/profileStore";
import { pendingShare$ } from "@/stores/shareStore";
import { discardPhotoFiles, SharedImport } from "@/utils/recipeImport";
import {
  getOwnRecipes,
  getTeamRecipes,
  isHiddenFromTeam,
  recipeStore$,
} from "@/stores/recipeStore";
import { settings$ } from "@/stores/settingsStore";
import {
  DIFFICULTY_KEYS,
  EMPTY_RECIPE,
  IngredientRowRefs,
  MEAL_KEYS,
  PREP_TIME_VALUES,
  Recipe,
  SERVINGS_VALUES,
} from "@/types/recipe";
import { imageSource, removeRecipeImage } from "@/utils/imageStorage";
import {
  INPUT_START_ALIGN,
  onScreenLeft,
  onScreenRight,
} from "@/utils/layoutDirection";
import { logger } from "@/utils/logger";
import { useRecipeEditor } from "@/utils/recipeEditor";
import {
  contentDirection,
  contentStartSelf,
  isMostlyRTL,
} from "@/utils/textDirection";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  Computed,
  observer,
  useObservable,
  useObserve,
  useSelector,
} from "@legendapp/state/react";
import { $Text } from "@legendapp/state/react-native";
import { BlurTargetView, BlurView } from "expo-blur";
import { Image } from "expo-image";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
  View,
  type ViewInstance,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedKeyboard,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default observer(function RecipeCard() {
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  // What the screen shows. Behind the route's id while a leave is asked about,
  // so the buttons stay those of the recipe being edited meanwhile.
  const [id, setId] = useState(routeId);
  const scrollY = useSharedValue(0);
  const scrollRef = useRef<Animated.ScrollView>(null);
  // The tab stays mounted, so a recipe opens where the last one was scrolled
  // to unless it's scrolled back too, not only the value the header follows
  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    scrollY.value = 0;
  };
  const keyboard = useAnimatedKeyboard();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  // What the floating buttons blur on Android: the photo and the content
  // under them. Set once laid out, BlurView reads it only when it changes
  const backdropRef = useRef<ViewInstance>(null);
  const [blurTarget, setBlurTarget] =
    useState<RefObject<ViewInstance | null>>();
  // Android (edge-to-edge) doesn't resize the window for the keyboard, so pad
  // the screen by the keyboard's height. This keeps the accessory bar on top of
  // the keyboard and shrinks the ScrollView, so the native scroll-to-focused
  // input lands above the bar. The tab bar floats over the screen, so the
  // screen ends at the bottom edge like the keyboard height.
  const isAndroid = Platform.OS === "android";
  const androidKeyboardPadding = useAnimatedStyle(() =>
    isAndroid ? { paddingBottom: keyboard.height.value } : {},
  );
  const titleRef = useRef<TextInputInstance>(null);
  const descriptionRef = useRef<TextInputInstance>(null);
  const ingredientsRef = useRef<IngredientRowRefs[]>([]);
  const instructionsRef = useRef<TextInputInstance[]>([]);

  useObserve(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () =>
      ui$.isKeyboardVisible.set(true),
    );
    const hideSub = Keyboard.addListener(hideEvent, () =>
      ui$.isKeyboardVisible.set(false),
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  });

  const { t } = useTranslation();
  const accessToken = useAccessToken();
  const ui$ = useObservable({
    // Copies, since the observable edits the object it's given in place
    recipe: structuredClone(EMPTY_RECIPE),
    isEditMode: false,
    isLoading: false,
    currentFocus: "",
    currentIngredientIndex: 0,
    isKeyboardVisible: false,
    isImportModalVisible: false,
    isCookModeVisible: false,
    // The list shown outside edit mode
    section: "ingredients" as "ingredients" | "steps",
    // Ingredients ticked off while cooking, by id
    checkedIngredients: {} as Record<string, boolean>,
    // What another app shared, and a new key for the modal with each share
    share: null as SharedImport | null,
    shareKey: 0,

    editButtonIcon() {
      return ui$.isEditMode.get() ? "eye" : "edit";
    },

    addIngredient() {
      const empty = {
        id: Math.random().toString(36).substring(7),
        sort_order: ui$.recipe.ingredients.length,
        amount: "",
        unit: "",
        item: "",
      };
      ui$.recipe.ingredients.push(empty);
    },

    addStep() {
      const empty = {
        id: Math.random().toString(36).substring(7),
        sort_order: ui$.recipe.instructions.length,
        text: "",
      };
      ui$.recipe.instructions.push(empty);
    },
  });

  // The same as `id`, for the effects and handlers that read it right away
  const shownId = useRef<string | null>(null);
  // The new recipe form while an existing recipe is open. Kept in memory only,
  // and taken back when the form opens again.
  const draft = useRef<{ recipe: Recipe; isEditMode: boolean } | null>(null);
  const isAskingToLeave = useRef(false);

  const openRecipe = (nextId: string) => {
    if (shownId.current === "new" && nextId !== "new") {
      draft.current = {
        recipe: structuredClone(ui$.recipe.peek()),
        isEditMode: ui$.isEditMode.peek(),
      };
    }
    shownId.current = nextId;
    setId(nextId);
    scrollToTop();
    setCurrentRecipe(nextId);
  };

  // Opening another recipe or the new one drops an edit that isn't saved, so
  // it asks first. This sees every way in, unlike the buttons leading here.
  useEffect(() => {
    if (routeId === shownId.current) return;
    const shown = shownId.current;
    const isEditingSaved =
      shown !== null &&
      shown !== "new" &&
      ui$.isEditMode.peek() &&
      // Not after it was deleted from its own screen
      !!recipeStore$[shown].peek();
    if (!isEditingSaved) {
      openRecipe(routeId);
      return;
    }
    isAskingToLeave.current = true;
    stopEditing(
      () => {
        isAskingToLeave.current = false;
        openRecipe(routeId);
      },
      () => {
        // A share that was meant for the new recipe is dropped with its photos
        const share = pendingShare$.peek();
        if (share?.kind === "photos") {
          discardPhotoFiles(share.photos.map((photo) => photo.uri));
        }
        pendingShare$.set(null);
        isAskingToLeave.current = false;
        router.setParams({ id: shown });
      },
    );
  }, [routeId]);

  useFocusEffect(
    useCallback(() => {
      const isAwake = settings$.isKeepScreenAwake.get();

      if (isAwake) {
        logger.info("SETTING_CHECK", { isScreenAwake: isAwake });
        activateKeepAwakeAsync();
      }

      return () => {
        deactivateKeepAwake();
      };
    }, [useSelector(() => settings$.isKeepScreenAwake.get())]),
  );

  const focusTarget = () => {
    const current = ui$.currentFocus.peek();

    // Navigate general recipe metadata
    if (current === "title") descriptionRef.current?.focus();

    // The properties are pickers, not text inputs, so the last metadata input
    // is the description and it moves on to the ingredients list
    if (current === "description") {
      if (ui$.recipe.ingredients.length == 0) {
        ui$.addIngredient();
        setTimeout(() => {
          ingredientsRef.current[0]?.amount?.focus();
        }, 50);
      } else {
        ingredientsRef.current[0]?.amount?.focus();
      }
      return;
    }

    // Navigate ingredients
    if (current.includes("ingredient")) {
      const [_, field, indexStr] = current.split("|");
      const index = Number(indexStr);
      const currentRef = ingredientsRef.current[index];

      if (!currentRef) return;
      if (field === "amount") currentRef.unit?.focus();
      if (field === "unit") currentRef.item?.focus();

      if (field === "item") {
        const nextIndex = index + 1;
        const isLast = ingredientsRef.current.length == nextIndex;

        if (isLast) {
          ui$.addIngredient();
          setTimeout(() => {
            ingredientsRef.current[nextIndex]?.amount?.focus();
          }, 50);
          return;
        } else {
          ingredientsRef.current[nextIndex]?.amount?.focus();
        }
      }
    }

    // Navigate instructions
    if (current.includes("instruction")) {
      const [_, indexStr] = current.split("|");
      const index = Number(indexStr);
      const currentRef = instructionsRef.current[index];

      if (!currentRef) return;

      const nextIndex = index + 1;
      const isLast = instructionsRef.current.length == nextIndex;

      if (isLast) {
        ui$.addStep();
        setTimeout(() => {
          instructionsRef.current[nextIndex]?.focus();
        }, 50);
      } else {
        instructionsRef.current[nextIndex]?.focus();
      }
    }
  };

  const setCurrentRecipe = (id: string) => {
    ui$.isLoading.set(true);
    ui$.section.set("ingredients");
    ui$.checkedIngredients.set({});
    const recipes: Recipe[] = [...getOwnRecipes(), ...getTeamRecipes()];

    if (id === "new") {
      ingredientsRef.current = [];
      instructionsRef.current = [];
      const kept = draft.current;
      draft.current = null;
      ui$.recipe.set(kept ? kept.recipe : structuredClone(EMPTY_RECIPE));
      ui$.isEditMode.set(kept ? kept.isEditMode : true);
    } else {
      const foundRecipe = recipes.find((r) => r.id === id);
      ui$.isEditMode.set(false);
      if (foundRecipe) {
        ui$.recipe.set(structuredClone(foundRecipe));
      }
    }
    ui$.isLoading.set(false);
  };

  // Replaces what was typed so far with the imported recipe, keeping the image
  const fillImportedRecipe = (imported: ImportedFields) => {
    ingredientsRef.current = [];
    instructionsRef.current = [];
    ui$.recipe.assign(imported);
  };

  // One direction for all the steps and ingredients, so they line up. While
  // editing, the inputs keep the app's.
  const isContentRTL = ui$.isEditMode.get()
    ? null
    : isMostlyRTL([
        ...ui$.recipe.ingredients.get().map((ingredient) => ingredient.item),
        ...ui$.recipe.instructions.get().map((step) => step.text),
      ]);

  // Premium imports freely, a free user while their free imports last.
  // Otherwise the button explains what's missing instead of doing nothing.
  const isPremium = premium$.isPremium.get();
  const userId = getCurrentUserId(true);
  const isGuest = userId === "guest";
  const freeImportsLeft = isPremium ? null : premium$.freeImportsLeft.get();
  const canImport = isPremium || (!isGuest && freeImportsLeft !== 0);
  const openImport = (share: SharedImport | null = null) => {
    if (canImport) {
      ui$.share.set(share);
      if (share) ui$.shareKey.set((key) => key + 1);
      ui$.isImportModalVisible.set(true);
      return;
    }
    // A share that can't be imported is dropped with its photos
    if (share?.kind === "photos") {
      discardPhotoFiles(share.photos.map((photo) => photo.uri));
    }
    if (isGuest) {
      showAlert(
        t("recipeImport.loginRequired.title"),
        t("recipeImport.loginRequired.message"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("premium.loginRequired.login"),
            onPress: () => router.navigate("/account"),
          },
        ],
      );
    } else {
      showAlert(
        t("recipeImport.usedUp.title"),
        t("recipeImport.usedUp.message"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("recipeImport.usedUp.upgrade"),
            onPress: () => router.navigate("/premium"),
          },
        ],
      );
    }
  };

  // A share opens the import on a new recipe. A logged-in user's Premium
  // status loads first, so a Premium user isn't shown the paywall.
  const pendingShare = pendingShare$.get();
  const isPremiumLoaded = premium$.isLoaded.get();
  useEffect(() => {
    if (!pendingShare || id !== "new" || isAskingToLeave.current) return;
    if (!isGuest && !isPremiumLoaded) return;
    pendingShare$.set(null);
    openImport(pendingShare);
  });

  const {
    saveRecipe,
    saveChanges,
    confirmDeletion,
    uploadImage,
    isUploadingImage,
  } = useRecipeEditor(ui$.recipe);

  // The recipe as it was when editing started, to tell whether it changed
  // and to put it back when the changes are discarded
  const beforeEdit = useRef<string | null>(null);

  const startEditing = () => {
    beforeEdit.current = JSON.stringify(ui$.recipe.peek());
    ui$.isEditMode.set(true);
  };

  const discardChanges = () => {
    if (beforeEdit.current) {
      const saved: Recipe = JSON.parse(beforeEdit.current);
      // A photo picked during the edit isn't used by any saved recipe
      const picked = ui$.recipe.image.peek();
      if (picked && picked !== saved.image) removeRecipeImage(picked);
      ingredientsRef.current = [];
      instructionsRef.current = [];
      ui$.recipe.set(saved);
    }
    ui$.isEditMode.set(false);
  };

  // The previous user's draft isn't kept for the next one, nor its photo
  const lastUserId = useRef(userId);
  useEffect(() => {
    if (userId === lastUserId.current) return;
    const previousId = lastUserId.current;
    lastUserId.current = userId;
    // The session is restored after the first render, so guest to user can be
    // a cold start with a form already being typed in. A guest's draft isn't
    // another user's either
    if (previousId === "guest") return;
    const isFormShown = shownId.current === "new";
    const image = isFormShown
      ? ui$.recipe.image.peek()
      : draft.current?.recipe.image;
    draft.current = null;
    const isSaved = [...getOwnRecipes(), ...getTeamRecipes()].some(
      (saved) => saved.image === image,
    );
    if (image && !isSaved) removeRecipeImage(image);
    if (isFormShown) setCurrentRecipe("new");
  }, [userId]);

  // Edits of an existing recipe are only kept by saving, so leaving with
  // changes asks first. Runs onLeave once edit mode is closed, and onKeep when
  // the edit is kept going.
  const stopEditing = (onLeave?: () => void, onKeep?: () => void) => {
    const isChanged = JSON.stringify(ui$.recipe.peek()) !== beforeEdit.current;
    if (!isChanged) {
      ui$.isEditMode.set(false);
      onLeave?.();
      return;
    }
    showAlert(
      t("recipe.discardChanges.title"),
      t("recipe.discardChanges.message"),
      [
        {
          text: t("recipe.discardChanges.keepEditing"),
          style: "cancel",
          onPress: onKeep,
        },
        {
          text: t("recipe.discardChanges.discard"),
          style: "destructive",
          onPress: () => {
            discardChanges();
            onLeave?.();
          },
        },
      ],
    );
  };

  const toggleEditMode = () => {
    // A new recipe has nothing saved to go back to, it only previews
    if (id === "new") return ui$.isEditMode.toggle();
    if (ui$.isEditMode.peek()) stopEditing();
    else startEditing();
  };

  const saveEdit = () => {
    const saved = saveChanges();
    if (!saved) return;
    // Without the rows that were dropped
    ingredientsRef.current = [];
    instructionsRef.current = [];
    ui$.recipe.set(saved);
    ui$.isEditMode.set(false);
  };

  const goBack = () => {
    scrollToTop();
    router.navigate(`/`);
  };

  // The tab stays mounted with the same id, so the form is cleared by hand
  const createRecipe = () => {
    if (!saveRecipe()) return;
    scrollToTop();
    setCurrentRecipe("new");
  };

  // Teammates' recipes are read-only, the server rejects their edits
  const recipeOwnerId = ui$.recipe.user_id.get();
  const isOwner =
    id === "new" ||
    !recipeOwnerId ||
    recipeOwnerId === "guest" ||
    recipeOwnerId === getCurrentUserId(true);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  // The photo moves up slower than the content, and stretches from its top
  // when pulled past the top (iOS bounces, Android doesn't overscroll)
  const animatedImageStyle = useAnimatedStyle(() => {
    return {
      transformOrigin: "top",
      transform: [
        {
          translateY: interpolate(
            scrollY.value,
            [0, IMG_HEIGHT],
            [0, -IMG_HEIGHT / 2],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(scrollY.value, [-IMG_HEIGHT, 0], [2, 1], {
            extrapolateLeft: Extrapolation.EXTEND,
            extrapolateRight: Extrapolation.CLAMP,
          }),
        },
      ],
      opacity: interpolate(
        scrollY.value,
        [0, IMG_HEIGHT * 0.8],
        [1, 0.5], // Fade out slightly as it goes up
        Extrapolation.CLAMP,
      ),
    };
  });

  // The header fades in as the content covers the photo
  const headerHeight = insets.top + HEADER_BAR_HEIGHT;
  const animatedHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [IMG_HEIGHT - headerHeight - 60, IMG_HEIGHT - headerHeight],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  if (ui$.isLoading.get()) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  // Shallow, so editing a field doesn't re-render the whole screen
  if (!ui$.recipe.get(true) || ui$.recipe === undefined) {
    return <Text>Recipe not found</Text>;
  }

  const isEditMode = ui$.isEditMode.get();
  const steps = ui$.recipe.instructions.get();
  const showIngredients = isEditMode || ui$.section.get() === "ingredients";
  const showSteps = isEditMode || ui$.section.get() === "steps";

  const ingredientsList = (
    <View style={styles.ingredientsContainer}>
      {ui$.recipe.ingredients.map((item$, index) => (
        <Ingredient
          key={item$.id.get() || index}
          currentIndex={index}
          ingredientRefs={ingredientsRef}
          isEditMode$={ui$.isEditMode}
          ingredient$={item$}
          currentFocus$={ui$.currentFocus}
          isContentRTL={isContentRTL}
          checked$={ui$.checkedIngredients[item$.id.peek()]}
        />
      ))}
    </View>
  );

  const stepsList = (
    <View style={[styles.stepsContainer, contentStartSelf(isContentRTL)]}>
      {ui$.recipe.instructions.map((item$, index) => (
        <Instruction
          key={item$.id.get()}
          instructionsRef={instructionsRef}
          currentIndex={index}
          currentFocus$={ui$.currentFocus}
          step$={item$}
          isEditMode$={ui$.isEditMode}
          isContentRTL={isContentRTL}
        />
      ))}
    </View>
  );

  return (
    <Animated.View style={[styles.container, androidKeyboardPadding]}>
      {/* The floating header and buttons blur this, so they stay outside it */}
      <BlurTargetView
        ref={backdropRef}
        onLayout={() => setBlurTarget(backdropRef)}
        style={styles.backdrop}
      >
        <Animated.View
          style={[styles.imageContainer, animatedImageStyle]}
          hitSlop={{ top: 20, bottom: 20, left: 40, right: 40 }}
        >
          <Pressable
            style={styles.noImage}
            onPress={() => (ui$.isEditMode.get() ? uploadImage() : null)}
          >
            {isUploadingImage ? (
              <View style={styles.uploadButtonContainer}>
                <ActivityIndicator size="large" color={colors.textDisabled} />
              </View>
            ) : ui$.recipe.image.get() ? (
              <Image
                cachePolicy="memory-disk" // Keeps it ready in RAM
                priority="high"
                source={imageSource(ui$.recipe.image.get(), accessToken)}
                style={styles.image}
              />
            ) : (
              <View style={styles.uploadButtonContainer}>
                <MaterialIcons
                  name={ui$.isEditMode.get() ? "image-search" : "image"}
                  size={32}
                  color={colors.textDisabled}
                />
              </View>
            )}
          </Pressable>
        </Animated.View>
        <Animated.ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scroll,
            // Clears the floating tab bar
            { paddingBottom: 30 + tabBarHeight },
            ui$.isEditMode.get() && { paddingBottom: 250 },
          ]}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={20}
        >
          <Pressable
            testID="recipe-image"
            style={styles.uploadImageButton}
            onPress={() => (ui$.isEditMode.get() ? uploadImage() : null)}
          />
          <View
            pointerEvents="auto"
            style={{
              width: "100%",
              backgroundColor: colors.background,
              borderTopLeftRadius: 40,
              borderTopRightRadius: 40,
              paddingBottom: Platform.select({
                ios: 30,
                android: 350,
              }),
              flexGrow: 1,
            }}
          >
            {ui$.isEditMode.get() ? (
              // Computed, so typing re-renders only the input
              <Computed>
                {() => (
                  <TextInput
                    ref={titleRef}
                    testID="recipe-title"
                    onFocus={() => ui$.currentFocus.set("title")}
                    style={[styles.name, styles.editName]}
                    placeholder={t("recipe.titlePlaceholder")}
                    placeholderTextColor="#8b8b8b"
                    underlineColorAndroid={"transparent"}
                    value={ui$.recipe.name.get()}
                    onChangeText={ui$.recipe.name.set}
                  />
                )}
              </Computed>
            ) : (
              <$Text
                style={[
                  styles.name,
                  { paddingBottom: 7 },
                  contentDirection(ui$.recipe.name.get()),
                ]}
              >
                {ui$.recipe.name}
              </$Text>
            )}
            {ui$.isEditMode.get() ? (
              <Computed>
                {() => (
                  <TextInput
                    ref={descriptionRef}
                    testID="recipe-description"
                    onFocus={() => ui$.currentFocus.set("description")}
                    style={[styles.description, styles.editDescription]}
                    placeholder={t("recipe.descriptionPlaceholder")}
                    underlineColorAndroid={"transparent"}
                    placeholderTextColor="#8b8b8b"
                    value={ui$.recipe.description.get()}
                    onChangeText={ui$.recipe.description.set}
                    multiline={true}
                  />
                )}
              </Computed>
            ) : (
              <$Text
                style={[
                  styles.description,
                  contentDirection(ui$.recipe.description.get()),
                ]}
              >
                {ui$.recipe.description}
              </$Text>
            )}
            {!isOwner && (
              <Text style={styles.ownerName}>
                {t("recipe.ownedBy", {
                  // Empty when the owner has no name
                  name: displayName(ui$.recipe.owner_name.get()),
                })}
              </Text>
            )}

            <View style={styles.properties}>
              <Property
                name={t("recipe.properties.prepTime")}
                testID="property-prepTime"
                value={ui$.recipe.prep_time}
                icon={"clock"}
                isEditMode={ui$.isEditMode}
                editModePlaceholder="30"
                picker={{
                  type: "wheel",
                  values: PREP_TIME_VALUES,
                  defaultValue: 30,
                }}
              />
              <Property
                name={t("recipe.properties.servings")}
                testID="property-servings"
                value={ui$.recipe.servings}
                icon={"bell-concierge"}
                isEditMode={ui$.isEditMode}
                editModePlaceholder="5"
                picker={{
                  type: "wheel",
                  values: SERVINGS_VALUES,
                  defaultValue: 4,
                }}
              />
              <Property
                name={t("recipe.properties.meal")}
                testID="property-meal"
                value={ui$.recipe.category}
                icon={"spoon"}
                isEditMode={ui$.isEditMode}
                editModePlaceholder={t("meals.lunch")}
                picker={{
                  type: "options",
                  options: MEAL_KEYS.map((key) => ({
                    value: key,
                    label: t(`meals.${key}`),
                  })),
                }}
                formatValue={mealLabel}
              />
              <Property
                name={t("recipe.properties.difficulty")}
                testID="property-difficulty"
                value={ui$.recipe.difficulty}
                icon={"layer-group"}
                isEditMode={ui$.isEditMode}
                editModePlaceholder={t("difficulties.easy")}
                picker={{
                  type: "options",
                  options: DIFFICULTY_KEYS.map((key) => ({
                    value: key,
                    label: t(`difficulties.${key}`),
                  })),
                }}
                formatValue={difficultyLabel}
              />
            </View>
            {!isEditMode && (
              <>
                {steps.length > 0 && (
                  <Button
                    title={t("recipe.cookMode.start")}
                    onPress={() => ui$.isCookModeVisible.set(true)}
                    style={styles.cookButton}
                  />
                )}
                <View style={styles.sections}>
                  <SegmentedControl
                    options={[
                      {
                        value: "ingredients",
                        label: t("recipe.ingredients.title"),
                      },
                      { value: "steps", label: t("recipe.instructions.title") },
                    ]}
                    value={ui$.section.get()}
                    onChange={ui$.section.set}
                  />
                </View>
              </>
            )}
            {/* Both lists stay mounted and are only hidden, remounting every
                row made switching modes and sections slow. Not collapsable:
                a hidden View is always a native view and a plain one is
                flattened away, and switching between the two while the rows
                change left Android's views out of sync (a blank screen) */}
            <View collapsable={false} style={!showIngredients && styles.hidden}>
              {isEditMode && (
                <Text style={styles.ingredientsTitle}>
                  {t("recipe.ingredients.title")}
                </Text>
              )}
              {ingredientsList}
              {isEditMode && (
                <View style={styles.addNewButton}>
                  <Pressable
                    testID="add-ingredient"
                    onPress={ui$.addIngredient}
                    hitSlop={{ top: 20, bottom: 20, left: 40, right: 40 }}
                  >
                    <FontAwesome6 name="plus" size={12} color="white" />
                  </Pressable>
                </View>
              )}
            </View>
            <View collapsable={false} style={!showSteps && styles.hidden}>
              {isEditMode && (
                <Text style={styles.ingredientsTitle}>
                  {t("recipe.instructions.title")}
                </Text>
              )}
              {stepsList}
              {isEditMode && (
                <View style={styles.addNewButton}>
                  <Pressable
                    testID="add-step"
                    onPress={ui$.addStep}
                    hitSlop={{ top: 20, bottom: 20, left: 40, right: 40 }}
                  >
                    <FontAwesome6 name="plus" size={12} color="white" />
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </Animated.ScrollView>
      </BlurTargetView>

      <Animated.View
        pointerEvents="none"
        style={[styles.header, { height: headerHeight }, animatedHeaderStyle]}
      >
        <BlurView
          blurTarget={blurTarget}
          blurMethod={blurTarget ? "dimezisBlurViewSdk31Plus" : "none"}
          tint="dark"
          intensity={60}
          style={styles.headerBlur}
        />
        <Text
          style={[styles.headerTitle, { marginTop: insets.top }]}
          numberOfLines={1}
        >
          {ui$.recipe.name.get()}
        </Text>
      </Animated.View>
      <View
        style={[
          styles.headerButtons,
          onScreenLeft(20),
          { top: insets.top + HEADER_BUTTON_TOP },
        ]}
      >
        {isOwner && (
          <GlassButton
            onPress={toggleEditMode}
            accessibilityLabel={
              isEditMode
                ? t("recipe.actions.preview")
                : t("recipe.actions.edit")
            }
            blurTarget={blurTarget}
          >
            <FontAwesome6
              name={ui$.editButtonIcon.get()}
              size={16}
              color="white"
            />
          </GlassButton>
        )}
        {id !== "new" && isOwner && (
          <GlassButton
            onPress={confirmDeletion}
            accessibilityLabel={t("recipe.actions.delete")}
            blurTarget={blurTarget}
            tint="danger"
          >
            <MaterialIcons name="delete-outline" size={22} color="white" />
          </GlassButton>
        )}
      </View>
      <GlassButton
        onPress={() =>
          id !== "new" && ui$.isEditMode.peek() ? stopEditing(goBack) : goBack()
        }
        accessibilityLabel={t("recipe.actions.back")}
        blurTarget={blurTarget}
        style={[
          styles.backButton,
          onScreenRight(20),
          { top: insets.top + HEADER_BUTTON_TOP },
        ]}
      >
        <FontAwesome6 name="angle-right" size={18} color="white" />
      </GlassButton>
      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView behavior="padding">
          {ui$.isKeyboardVisible.get() && (
            <View style={styles.accessoryBar}>
              <Pressable style={styles.nextButton} onPress={focusTarget}>
                <Text style={styles.nextButtonText}>
                  {t("recipe.keyboard.next")}
                </Text>
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      ) : (
        ui$.isKeyboardVisible.get() && (
          <View style={styles.accessoryBar}>
            <Pressable style={styles.nextButton} onPress={focusTarget}>
              <Text style={styles.nextButtonText}>
                {t("recipe.keyboard.next")}
              </Text>
            </Pressable>
          </View>
        )
      )}

      {id == "new" && !ui$.isKeyboardVisible.get() && (
        <>
          {isHiddenFromTeam() && (
            <View style={styles.localOnlyNotice}>
              <LocalOnlyNotice message={t("recipe.new.localOnlyNotice")} />
            </View>
          )}
          <View
            style={[
              styles.newRecipeActions,
              { marginBottom: tabBarHeight + spacing.sm },
            ]}
          >
            <Button
              title={t("recipe.new.create")}
              testID="create-recipe"
              onPress={createRecipe}
              style={styles.saveRecipe}
            />
            <View style={styles.importRecipe}>
              {/* Not disabled, a press explains why it can't import */}
              <Button
                title={t("recipe.new.aiImport")}
                testID="ai-import"
                variant="secondary"
                onPress={() => openImport()}
                style={!canImport && styles.importRecipeDisabled}
              />
              <View style={styles.badges} pointerEvents="none">
                <Text style={[styles.badge, styles.aiBadge]}>AI </Text>
                <Text style={[styles.badge, styles.premiumBadge]}>
                  {canImport && freeImportsLeft
                    ? t("recipe.new.freeImports", { count: freeImportsLeft })
                    : t("recipe.new.premiumOnly")}
                </Text>
              </View>
            </View>
          </View>
        </>
      )}
      {id !== "new" && isEditMode && !ui$.isKeyboardVisible.get() && (
        <View
          style={[
            styles.newRecipeActions,
            { marginBottom: tabBarHeight + spacing.sm },
          ]}
        >
          <Button
            title={t("common.save")}
            testID="save-recipe"
            onPress={saveEdit}
            style={styles.saveRecipe}
          />
        </View>
      )}
      {/* Outside the block above, which unmounts while the keyboard is open */}
      <ImportRecipeModal
        visible={ui$.isImportModalVisible.get()}
        onClose={() => ui$.isImportModalVisible.set(false)}
        onImported={fillImportedRecipe}
        freeImportsLeft={freeImportsLeft}
        key={ui$.shareKey.get()}
        share={ui$.share.get()}
      />
      <CookMode
        visible={ui$.isCookModeVisible.get()}
        onClose={() => ui$.isCookModeVisible.set(false)}
        steps={steps.map((step) => step.text)}
        isContentRTL={isContentRTL}
      />
    </Animated.View>
  );
});

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");
const IMG_HEIGHT = SCREEN_HEIGHT * 0.4;
const HEADER_BAR_HEIGHT = 56;
const BUTTON_SIZE = 40;
const HEADER_BUTTON_TOP = (HEADER_BAR_HEIGHT - BUTTON_SIZE) / 2;

const styles = StyleSheet.create({
  ownerName: {
    fontSize: 14,
    color: colors.textMuted,
    fontFamily: "Default",
    textAlign: "left",
    paddingBottom: 10,
  },
  accessoryBar: {
    height: 45,
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    paddingHorizontal: 15,
  },
  nextButton: {
    width: "100%",
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: colors.accent,
    borderRadius: 100,
  },
  nextButtonText: {
    color: "black",
    fontSize: 16,
    fontFamily: "Default",
    alignSelf: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  noImage: {
    backgroundColor: colors.surfaceHigh,
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadButtonContainer: {
    height: 100,
    width: 100,
    borderRadius: 100,
    marginBottom: 150,
    backgroundColor: "#313131",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  imageContainer: {
    width: "100%",
    height: IMG_HEIGHT * 1.5,
    position: "absolute",
    top: 0,
  },
  backdrop: {
    flex: 1,
  },
  header: {
    position: "absolute",
    top: 0,
    start: 0,
    end: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20 + BUTTON_SIZE * 2 + spacing.md * 2,
  },
  headerBlur: {
    position: "absolute",
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: "rgba(20, 21, 23, 0.8)",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  headerButtons: {
    position: "absolute",
    flexDirection: "row",
    gap: spacing.md,
  },
  backButton: {
    position: "absolute",
  },
  cookButton: {
    marginTop: spacing.xl,
  },
  hidden: {
    display: "none",
  },
  sections: {
    marginTop: spacing.xl,
  },
  scroll: {
    flexGrow: 1,
    marginTop: IMG_HEIGHT,
    width: "100%",
    backgroundColor: colors.background,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 30,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  editDescription: {
    marginTop: 10,
    borderWidth: 1,
    padding: 10,
    paddingStart: 15,
    paddingEnd: 10,
    borderRadius: 20,
    borderColor: "#333",
    textAlign: INPUT_START_ALIGN,
  },
  editName: {
    borderColor: "#333",
    borderWidth: 1,
    padding: 5,
    paddingStart: 15,
    borderRadius: 100,
    textAlign: INPUT_START_ALIGN,
  },
  addNewButton: {
    width: "40%",
    marginTop: 10,
    alignSelf: "center",
    height: 25,
    backgroundColor: "#7e6616",
    display: "flex",
    color: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 100,
  },
  name: {
    fontSize: 25,
    color: "#fff",
    textAlign: "left",
    fontFamily: "DefaultBold",
  },
  description: {
    fontSize: 15,
    color: "#919191",
    textAlign: "left",
    fontFamily: "DefaultBold",
  },
  properties: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 15,
    paddingTop: 20,
  },
  ingredientsTitle: {
    marginTop: 30,
    fontSize: 20,
    fontFamily: "DefaultBold",
    color: "#fff",
    textAlign: "left",
  },
  ingredient: {
    fontSize: 16,
    fontFamily: "DefaultBold",
    color: "#fff",
    textAlign: "left",
  },
  ingredientsContainer: {
    marginTop: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
  },
  stepsContainer: {
    marginTop: 10,
    width: "85%",
    gap: 10,
  },
  newRecipeActions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
    marginHorizontal: spacing.xl,
  },
  saveRecipe: {
    flex: 2,
  },
  importRecipe: {
    flex: 3,
  },
  importRecipeDisabled: {
    opacity: 0.5,
  },
  badges: {
    position: "absolute",
    top: -9,
    // RTL swaps left and right, so this is the button's visual top-left
    right: -4,
    flexDirection: "row",
    gap: 3,
  },
  badge: {
    fontSize: 9,
    fontFamily: "DefaultBold",
    borderRadius: 100,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: "hidden",
  },
  aiBadge: {
    backgroundColor: "#7c5cff",
    color: "white",
  },
  premiumBadge: {
    backgroundColor: colors.accent,
    color: colors.background,
  },
  localOnlyNotice: {
    width: "90%",
    alignSelf: "center",
    marginTop: 10,
  },
  uploadImageButton: {
    position: "absolute",
    height: IMG_HEIGHT,
    width: SCREEN_WIDTH,
    marginTop: -IMG_HEIGHT,
  },
});
