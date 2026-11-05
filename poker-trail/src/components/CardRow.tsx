import React, { useState } from "react";
import { Image, View, Text, StyleSheet, ScrollView, useWindowDimensions } from "react-native";

import PlayingCard from "./PlayingCard";
import { getCardRowLayout } from "../lib/responsiveLayout";

type Props = {
  visitOrder: string[];
  waypointCards: Record<string, string | null>;
  pendingWaypointIds?: Record<string, boolean>;
  total: number;
  maxCardHeight?: number;
  gap?: number;
};

export default function CardRow({ visitOrder, waypointCards, pendingWaypointIds = {}, total, maxCardHeight = 120, gap = 8 }: Props) {
  const window = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const count = Math.max(total, visitOrder.length);
  const cards = getCardRowLayout(width || window.width - 48, count, maxCardHeight, gap);
  return (
    <View style={{ width: "100%", height: cards.height }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <ScrollView horizontal scrollEnabled={cards.scrollable} showsHorizontalScrollIndicator={cards.scrollable}
      contentContainerStyle={[styles.cardsRow, { gap: cards.gap }]}>
      {visitOrder.map((wpId) => {
        const card = waypointCards[wpId];
        const isPending = pendingWaypointIds[wpId];
        return (
          <View key={wpId} style={[styles.cardSlot, { width: cards.width, height: cards.height }]}>
            {card ? (
              <PlayingCard card={card} />
            ) : isPending ? (
              <View style={styles.pendingCard}>
                <Text style={styles.pendingText}>Sync</Text>
              </View>
            ) : (
              <Image accessibilityLabel="Empty card slot" source={require("../../assets/images/cards/card-back.png")} resizeMode="contain" style={styles.cardBack} />
            )}
          </View>
        );
      })}
      {Array.from({ length: Math.max(0, total - visitOrder.length) }).map((_, i) => (
        <View key={`empty-${i}`} style={[styles.cardSlot, { width: cards.width, height: cards.height }]}>
          <Image accessibilityLabel="Empty card slot" source={require("../../assets/images/cards/card-back.png")} resizeMode="contain" style={styles.cardBack} />
        </View>
      ))}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  cardsRow: {
    flexDirection: "row",
    justifyContent: "center",
    minWidth: "100%",
    paddingHorizontal: 0,
  },
  cardSlot: {
    borderRadius: 8,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  cardBack: {
    width: "100%",
    height: "100%",
  },
  pendingCard: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    backgroundColor: "#35515e",
    borderColor: "#8ecae6",
    borderStyle: "dashed",
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  pendingText: {
    color: "#e7f7ff",
    fontSize: 13,
    fontWeight: "700",
  },
});
