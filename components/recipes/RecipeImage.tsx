import { useAccessToken } from "@/stores/authStore";
import { imageSource } from "@/utils/imageStorage";
import { Image, type ImageProps } from "expo-image";
import { type ReactNode, useState } from "react";

type Props = Omit<ImageProps, "source" | "recyclingKey" | "onError"> & {
  image: string;
  // Shown when the recipe has no image, or its image can't be loaded
  fallback: ReactNode;
};

// A recipe's image, or the fallback in its place. An image that fails to load
// shows the fallback too, so a recipe whose image was lost looks like one
// without an image instead of blank.
export default function RecipeImage({ image, fallback, ...props }: Props) {
  const accessToken = useAccessToken();
  // A new image gets its own try, and so does a new token: an image that
  // failed with an expired token loads with the refreshed one
  const attempt = `${image}|${accessToken}`;
  const [shownAttempt, setShownAttempt] = useState(attempt);
  const [isFailed, setIsFailed] = useState(false);
  if (shownAttempt !== attempt) {
    setShownAttempt(attempt);
    setIsFailed(false);
  }

  const source = image ? imageSource(image, accessToken) : null;
  if (!source || isFailed) return fallback;
  return (
    <Image
      {...props}
      source={source}
      // Blanks the view when the image changes. Without it, the previous
      // image stays until the new one loads, and for good if it fails.
      recyclingKey={image}
      onError={() => setIsFailed(true)}
    />
  );
}
