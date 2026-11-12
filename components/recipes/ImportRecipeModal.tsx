import { MAX_FONT_SCALE, Text } from "@/components/ui/Text";
import { colors } from "@/constants/theme";
import { showAlert } from "@/stores/alertStore";
import { logger } from "@/utils/logger";
import {
  discardPhotoFiles,
  importRecipeFromPhotos,
  importRecipeFromText,
  importRecipeFromUrl,
  ImportedFields,
  MAX_IMPORT_PHOTOS,
  PickedPhoto,
  SharedImport,
} from "@/utils/recipeImport";
import { ServerError } from "@/utils/serverErrors";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@/components/ui/Button";
import PressableScale from "@/components/ui/PressableScale";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Sheet, { type SheetHandle, sheetStyles } from "@/components/ui/Sheet";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { ScrollView, StyleSheet, View } from "react-native";

export type { ImportedFields };

// "text" only comes from a share, so it isn't one of the switch's options
type Mode = "link" | "photo" | "text";

const MODE_OF_SHARE = { link: "link", photos: "photo", text: "text" } as const;

const DESCRIPTION_KEYS = {
  link: "recipeImport.description",
  photo: "recipeImport.photo.description",
  text: "recipeImport.text.description",
} as const;

const LOADING_KEYS = {
  link: "recipeImport.loading",
  photo: "recipeImport.photo.loading",
  text: "recipeImport.text.loading",
} as const;

interface ImportRecipeModalProps {
  visible: boolean;
  onClose: () => void;
  onImported: (recipe: ImportedFields) => void;
  // Shown to a free user still trying the feature
  freeImportsLeft: number | null;
  // What another app shared, to start from. The screen gives the modal a new
  // key for each share, so the form starts over with it.
  share?: SharedImport | null;
}

export default function ImportRecipeModal({
  visible,
  onClose,
  onImported,
  freeImportsLeft,
  share,
}: ImportRecipeModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>(
    share ? MODE_OF_SHARE[share.kind] : "link",
  );
  const [url, setUrl] = useState(share?.kind === "link" ? share.url : "");
  const [text, setText] = useState(share?.kind === "text" ? share.text : "");
  const [photos, setPhotos] = useState<PickedPhoto[]>(
    share?.kind === "photos" ? share.photos : [],
  );
  const [notice, setNotice] = useState<string | null>(
    share?.kind === "photos" && share.skipped > 0
      ? t("recipeImport.share.photosSkipped", { count: MAX_IMPORT_PHOTOS })
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The post's caption has no recipe, which screenshots of the video may have
  const [suggestPhotos, setSuggestPhotos] = useState(false);

  // Starts the next import from an empty form
  const sheet = useRef<SheetHandle>(null);

  // Runs once the sheet has slid away
  const close = () => {
    discardPhotoFiles(photos.map((photo) => photo.uri));
    setMode("link");
    setUrl("");
    setText("");
    setPhotos([]);
    setNotice(null);
    setError(null);
    setSuggestPhotos(false);
    onClose();
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setSuggestPhotos(false);
  };

  const addPhotos = async (source: "camera" | "gallery") => {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert(
        t(`recipeImport.photo.${source}Permission.title`),
        t(`recipeImport.photo.${source}Permission.message`),
      );
      return;
    }

    try {
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"] })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              allowsMultipleSelection: true,
              selectionLimit: MAX_IMPORT_PHOTOS - photos.length,
              orderedSelection: true,
            });
      if (result.canceled) return;

      const picked = result.assets.map(({ uri, width, height }) => ({
        uri,
        width,
        height,
      }));
      // Android may ignore the selection limit
      const room = MAX_IMPORT_PHOTOS - photos.length;
      discardPhotoFiles(picked.slice(room).map((photo) => photo.uri));
      setPhotos([...photos, ...picked.slice(0, room)]);
      setError(null);
    } catch (err) {
      logger.error("IMPORT_PHOTO_PICK_FAILED", err, { source });
      setError(t("errors.UNKNOWN"));
    }
  };

  const removePhoto = (uri: string) => {
    discardPhotoFiles([uri]);
    setPhotos(photos.filter((photo) => photo.uri !== uri));
  };

  // Marks the photo buttons like an empty link field
  const isMissingPhotos = !!error && mode === "photo" && photos.length === 0;

  const handleStart = async () => {
    if (mode === "link" && !url.trim()) {
      setError(t("errors.MISSING_URL"));
      return;
    }
    if (mode === "photo" && photos.length === 0) {
      setError(t("errors.MISSING_IMAGES"));
      return;
    }

    setLoading(true);
    setError(null);
    setSuggestPhotos(false);
    try {
      const recipe =
        mode === "link"
          ? await importRecipeFromUrl(url.trim())
          : mode === "text"
            ? await importRecipeFromText(text)
            : await importRecipeFromPhotos(photos);
      onImported(recipe);
      sheet.current?.dismiss();
    } catch (err: any) {
      setError(err.message || t("errors.UNKNOWN"));
      setSuggestPhotos(
        err instanceof ServerError && err.code === "SOCIAL_NO_RECIPE",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      ref={sheet}
      visible={visible}
      onClose={close}
      // Closing mid-import would drop the result the user waited for
      dismissible={!loading}
    >
      <Text style={[sheetStyles.title, styles.title]}>
        {t("recipeImport.title")}
      </Text>

      {mode !== "text" && (
        <View style={styles.modeSwitch}>
          <SegmentedControl
            options={(["link", "photo"] as const).map((option) => ({
              value: option,
              label: t(`recipeImport.mode.${option}`),
            }))}
            value={mode}
            onChange={(option) => !loading && switchMode(option)}
          />
        </View>
      )}

      <Text style={styles.description}>{t(DESCRIPTION_KEYS[mode])}</Text>
      {freeImportsLeft !== null && (
        <Text style={styles.freeImportsLeft}>
          {t("recipeImport.freeImportsLeft", { count: freeImportsLeft })}
        </Text>
      )}

      {mode === "text" ? (
        <ScrollView style={styles.sharedText}>
          <Text style={styles.sharedTextContent}>{text}</Text>
        </ScrollView>
      ) : mode === "link" ? (
        <BottomSheetTextInput
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[
            sheetStyles.input,
            styles.input,
            error ? sheetStyles.inputError : null,
          ]}
          placeholder={t("recipeImport.urlPlaceholder")}
          placeholderTextColor={colors.textDisabled}
          value={url}
          onChangeText={setUrl}
          editable={!loading}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={handleStart}
        />
      ) : (
        <>
          {photos.length > 0 && (
            <View style={styles.thumbnails}>
              {photos.map((photo) => (
                <View key={photo.uri}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={styles.thumbnail}
                    contentFit="cover"
                  />
                  {!loading && (
                    <PressableScale
                      style={styles.removePhoto}
                      onPress={() => removePhoto(photo.uri)}
                      hitSlop={8}
                      accessibilityLabel={t("recipeImport.photo.remove")}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </PressableScale>
                  )}
                </View>
              ))}
            </View>
          )}
          {photos.length < MAX_IMPORT_PHOTOS && (
            <View style={styles.photoButtons}>
              <PressableScale
                style={[
                  styles.photoButton,
                  isMissingPhotos && sheetStyles.inputError,
                ]}
                onPress={() => addPhotos("camera")}
                disabled={loading}
              >
                <Ionicons
                  name="camera-outline"
                  size={18}
                  color={colors.accent}
                />
                <Text style={styles.photoButtonText}>
                  {t("recipeImport.photo.takePhoto")}
                </Text>
              </PressableScale>
              <PressableScale
                style={[
                  styles.photoButton,
                  isMissingPhotos && sheetStyles.inputError,
                ]}
                onPress={() => addPhotos("gallery")}
                disabled={loading}
              >
                <Ionicons
                  name="images-outline"
                  size={18}
                  color={colors.accent}
                />
                <Text style={styles.photoButtonText}>
                  {t("recipeImport.photo.chooseFromGallery")}
                </Text>
              </PressableScale>
            </View>
          )}
          <Text style={styles.tip}>
            {t("recipeImport.photo.tip", { count: MAX_IMPORT_PHOTOS })}
          </Text>
        </>
      )}

      {notice && mode === "photo" && <Text style={styles.tip}>{notice}</Text>}
      {error && <Text style={sheetStyles.error}>{error}</Text>}
      {suggestPhotos && (
        <PressableScale
          style={[styles.photoButton, styles.suggestPhotosButton]}
          onPress={() => switchMode("photo")}
        >
          <Ionicons name="images-outline" size={18} color={colors.accent} />
          <Text style={styles.photoButtonText}>
            {t("recipeImport.share.usePhotos")}
          </Text>
        </PressableScale>
      )}
      {loading && (
        <Text style={styles.loadingText}>{t(LOADING_KEYS[mode])}</Text>
      )}

      <View style={sheetStyles.buttons}>
        <Button
          title={t("common.cancel")}
          variant="secondary"
          onPress={() => sheet.current?.dismiss()}
          disabled={loading}
          style={styles.button}
        />
        <Button
          title={t("recipeImport.start")}
          onPress={handleStart}
          loading={loading}
          style={styles.button}
        />
      </View>
    </Sheet>
  );
}

const PHOTO_BUTTON_HEIGHT = 48;

const styles = StyleSheet.create({
  title: {
    marginBottom: 16,
  },
  description: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: "Default",
    color: colors.textSecondary,
    textAlign: "left",
    marginBottom: 16,
  },
  modeSwitch: {
    marginBottom: 16,
  },
  thumbnails: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  thumbnail: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  removePhoto: {
    position: "absolute",
    top: 4,
    end: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoButtons: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  photoButton: {
    flex: 1,
    height: PHOTO_BUTTON_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: PHOTO_BUTTON_HEIGHT / 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  photoButtonText: {
    color: colors.text,
    fontSize: 14,
    fontFamily: "Default",
  },
  // Outside the row of photo buttons, so it doesn't stretch
  suggestPhotosButton: {
    flex: 0,
    marginTop: 12,
  },
  sharedText: {
    maxHeight: 180,
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sharedTextContent: {
    fontSize: 14,
    fontFamily: "Default",
    color: "#c7c8ca",
  },
  tip: {
    fontSize: 13,
    fontFamily: "Default",
    color: colors.textSecondary,
    textAlign: "left",
    marginBottom: 4,
  },
  freeImportsLeft: {
    fontSize: 13,
    fontFamily: "DefaultBold",
    color: colors.accent,
    textAlign: "left",
    marginTop: -8,
    marginBottom: 16,
  },
  input: {
    marginTop: 0,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: "Default",
    marginTop: 12,
    textAlign: "left",
  },
  button: {
    flex: 1,
  },
});
