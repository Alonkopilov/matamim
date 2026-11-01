import { Image } from "expo-image";
import { ImageSourcePropType, StyleSheet } from "react-native";

type Props = {
  placeholder: ImageSourcePropType;
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
