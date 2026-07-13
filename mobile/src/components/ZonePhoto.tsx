// Zone photo — a thumbnail that opens as a closeable full-screen popup on
// tap, instead of permanently taking up space inline.

import React, { useState } from "react";
import {
  Image,
  ImageStyle,
  Modal,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { colors } from "../theme";

interface ZonePhotoProps {
  uri: string;
  thumbnailStyle?: StyleProp<ImageStyle>;
}

export default function ZonePhoto({ uri, thumbnailStyle }: ZonePhotoProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity activeOpacity={0.85} onPress={() => setOpen(true)}>
        <Image source={{ uri }} style={[styles.thumbnail, thumbnailStyle]} resizeMode="cover" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.scrim}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setOpen(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t("zonePhoto.closeA11y")}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
            <Image source={{ uri }} style={styles.fullImage} resizeMode="contain" />
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumbnail: {
    width: "100%",
    height: 140,
    backgroundColor: colors.surfaceAlt,
  },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(10, 12, 18, 0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullImage: {
    width: "94%",
    height: "70%",
  },
  closeBtn: {
    position: "absolute",
    top: 56,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  closeText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
});
