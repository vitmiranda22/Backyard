// Real photographed parchment texture, used as the one shared background
// behind every screen -- App.tsx mounts this once at the root so it's a
// single persistent image rather than each screen loading its own copy.
// Individual screens keep their own container transparent (not a flat
// colors.parchmentBg fill) so this shows through underneath.
//
// Photo: a real mottled aged-parchment texture (Unsplash License --
// free for commercial use, no attribution required), color-matched and
// softened in processing so it reads as a subtle page grain rather than
// a distracting photo, since real UI text sits on top of it everywhere.

import React from "react";
import { ImageBackground, StyleSheet } from "react-native";

const TEXTURE = require("../../assets/parchment-texture.jpg");

export default function ParchmentBackground({ children }: { children: React.ReactNode }) {
  return (
    <ImageBackground source={TEXTURE} style={styles.fill} resizeMode="cover">
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
