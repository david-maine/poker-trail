import { Image, type ImageProps } from "react-native";

export default function CardImage(props: ImageProps) {
  return <Image {...props} />;
}

export function preloadCardImages() {}
