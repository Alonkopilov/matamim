import { showAlert } from "@/stores/alertStore";
import { getCurrentUserId } from "@/stores/authStore";
import {
  addRecipe,
  deleteRecipe,
  isCloudSyncActive,
  recipeStore$,
  updateRecipe,
} from "@/stores/recipeStore";
import { showToast } from "@/stores/toastStore";
import { Recipe } from "@/types/recipe";
import {
  removeRecipeImage,
  saveLocalImage,
  uploadRecipeImage,
} from "@/utils/imageStorage";
import { logger } from "@/utils/logger";
import { Observable } from "@legendapp/state";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const hasText = (text: string) => text.trim() !== "";

export function useRecipeEditor(recipe: Observable<Recipe | null>) {
  const { t } = useTranslation();
  const [isEditMode, setEditMode] = useState<boolean>(false);
  const [isUploadingImage, setUploadingImage] = useState<boolean>(false);

  // The recipe as it's saved: the title trimmed and the blank rows dropped.
  // Keeps the rest as it is, so it's given a copy.
  const cleanRecipe = (recipe: Recipe): Recipe => ({
    ...recipe,
    name: recipe.name.trim(),
    ingredients: recipe.ingredients
      .filter((row) => [row.amount, row.unit, row.item].some(hasText))
      .map((row, index) => ({ ...row, sort_order: index })),
    instructions: recipe.instructions
      .filter((row) => hasText(row.text))
      .map((row, index) => ({ ...row, sort_order: index })),
  });

  // Checks the recipe as cleanRecipe returns it
  const checkInput = (recipe: Recipe) => {
    const problems: string[] = [];

    if (recipe.name === "") {
      problems.push(t("recipe.validation.missingTitle"));
    }
    if (recipe.prep_time === "") {
      problems.push(t("recipe.validation.missingPrepTime"));
    }
    if (recipe.servings === "") {
      problems.push(t("recipe.validation.missingServings"));
    }
    if (recipe.category === "") {
      problems.push(t("recipe.validation.missingMeal"));
    }
    if (recipe.difficulty === "") {
      problems.push(t("recipe.validation.missingDifficulty"));
    }
    if (recipe.ingredients.length == 0) {
      problems.push(t("recipe.validation.missingIngredients"));
    } else if (recipe.ingredients.some((row) => !hasText(row.item))) {
      problems.push(t("recipe.validation.ingredientMissingName"));
    }
    if (recipe.instructions.length == 0) {
      problems.push(t("recipe.validation.missingInstructions"));
    }

    return problems;
  };

  // Shows what's missing, so creating and saving an edit refuse the same input
  const isValid = (recipe: Recipe) => {
    const problems = checkInput(recipe);
    if (problems.length > 0) {
      showAlert(t("recipe.validation.title"), problems.join("\n"));
      return false;
    }
    return true;
  };

  // Returns whether the recipe was created
  const saveRecipe = () => {
    if (!recipe) {
      return false;
    }

    // A copy, so clearing the form doesn't touch the saved recipe's lists
    const cleaned = cleanRecipe(structuredClone(recipe.get() as Recipe));
    if (!isValid(cleaned)) {
      return false;
    }

    const userId = getCurrentUserId();
    addRecipe(userId, cleaned);
    showToast(t("recipe.toasts.created"), "success");
    router.replace(`/`);
    return true;
  };

  // The image of the recipe as saved, none for a new recipe
  const savedImage = () => {
    const id = recipe.id.peek();
    return id ? recipeStore$[id].image.peek() : undefined;
  };

  // Saves an edit of an existing recipe. Returns the recipe as saved, or null
  // when it was refused
  const saveChanges = () => {
    const current = recipe.get() as Recipe | null;
    if (!current) {
      return null;
    }
    const edited = cleanRecipe(structuredClone(current));
    if (!isValid(edited)) {
      return null;
    }

    const replacedImage = savedImage();
    if (replacedImage && replacedImage !== edited.image) {
      removeRecipeImage(replacedImage);
    }

    // A copy, so later edits on the screen don't change the saved recipe
    updateRecipe(edited.id, structuredClone(edited));
    showToast(t("recipe.toasts.saved"), "success");
    return edited;
  };

  const removeRecipe = () => {
    if (!recipe.get()) {
      return;
    }

    deleteRecipe(recipe.id.get() as string);
    showToast(t("recipe.toasts.deleted"), "success");
    router.replace("/");
  };

  const confirmDeletion = () => {
    showAlert(
      t("recipe.deleteConfirm.title"),
      t("recipe.deleteConfirm.message"),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
        },
        {
          text: t("common.delete"),
          onPress: removeRecipe,
          style: "destructive",
        },
      ],
    );
  };

  const uploadImage = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      showAlert(
        t("recipe.imagePermission.title"),
        t("recipe.imagePermission.message"),
      );
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    const previousImage = recipe.image.peek();

    setUploadingImage(true);
    try {
      let localImage: string;
      try {
        localImage = await saveLocalImage(asset.uri, asset.width, asset.height);
      } catch (error) {
        logger.error("IMAGE_SAVE_FAILED", error);
        showToast(t("recipe.toasts.imageSaveFailed"), "error");
        return;
      }

      // Without cloud sync the image stays local; uploadPendingImages moves
      // it to Storage once sync is turned on.
      if (!isCloudSyncActive()) {
        recipe.image.set(localImage);
      } else {
        try {
          const path = await uploadRecipeImage(getCurrentUserId(), localImage);
          recipe.image.set(path);
          removeRecipeImage(localImage);
        } catch {
          showToast(t("recipe.toasts.imageUploadFailed"), "error");
          recipe.image.set(localImage);
        }
      }
      // The saved recipe's image is kept until the edit is saved, so
      // discarding the edit can put it back
      if (previousImage && previousImage !== savedImage()) {
        removeRecipeImage(previousImage);
      }
    } finally {
      setUploadingImage(false);
    }
  };

  return {
    recipe,
    isEditMode,
    setEditMode,
    isUploadingImage,
    checkInput,
    saveRecipe,
    saveChanges,
    deleteRecipe,
    confirmDeletion,
    uploadImage,
  };
}
