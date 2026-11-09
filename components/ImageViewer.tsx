import { Image, type ImageProps } from "expo-image";
import { StyleSheet } from "react-native";

type Props = {
  placeholder: ImageProps["source"];
  selectedImage?: string;
};

export default function ImageViewer({ placeholder, selectedImage }: Props) {
  const image = selectedImage ? { uri: selectedImage } : placeholder;
  return <Image source={image} style={styles.image} />;
}

const styles = StyleSheet.create({
  image: {
    width: 320,
    height: 440,
    borderRadius: 18,
  },
});
