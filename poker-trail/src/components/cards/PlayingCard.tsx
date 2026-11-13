import { FONT_SIZE, FONT_WEIGHT, textMetrics } from "../../lib/typography";
import { CARD_IMAGES } from "../../lib/cardImages";
import CardImage from "./CardImage";
import React, { useState } from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

type Props = {
  card: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

const RANK_NAMES: Record<string, string> = {
  A: "ace",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  "10": "ten",
  J: "jack",
  Q: "queen",
  K: "king",
};

const SUIT_NAMES: Record<string, string> = {
  H: "hearts",
  S: "spades",
  D: "diamonds",
  C: "clubs",
};


export default function PlayingCard({ card, compact = false, style }: Props) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const details = getCardDetails(card);
  const cardImage = details?.image;
  const label = details?.label ?? card;

  if (!cardImage || failedImage === card) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={label} style={[styles.card, compact ? styles.compactCard : null, style]}>
        <Text style={styles.fallbackText}>{label}</Text>
      </View>
    );
  }

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={[styles.card, compact ? styles.compactCard : null, style]}>
      <CardImage key={card} accessible={false} source={cardImage} style={styles.cardImage} resizeMode="contain" onError={() => setFailedImage(card)} />
    </View>
  );
}

function getCardDetails(card: string) {
  const match = card.match(/^(10|[2-9JQKA])([SHDC])$/);
  if (!match) {
    return null;
  }

  const rank = RANK_NAMES[match[1]];
  const suit = SUIT_NAMES[match[2]];

  return {
    image: CARD_IMAGES[`${rank}-of-${suit}`],
    label: `${rank.charAt(0).toUpperCase()}${rank.slice(1)} of ${suit}`,
  };
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    borderRadius: 8,
    elevation: 3,
    height: "100%",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    width: "100%",
  },
  compactCard: {
    height: 60,
    width: 42,
  },
  cardImage: {
    height: "100%",
    width: "100%",
  },
  fallbackText: {
    color: "#1d223e",
    ...textMetrics(FONT_SIZE.caption),
    ...FONT_WEIGHT.bold,
  },
});
