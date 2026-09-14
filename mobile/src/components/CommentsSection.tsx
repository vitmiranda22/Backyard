// Comments — list + post, for a route's detail screen.

import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { getComments, postComment, reportComment, Comment, ReportReason } from "../services/api";
import { showToast } from "../services/toast";
import { tap } from "../services/haptics";
import { colors, font, radius, type, spacing } from "../theme";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface CommentsSectionProps {
  tourId: string;
}

export default function CommentsSection({ tourId }: CommentsSectionProps) {
  const { t } = useTranslation();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    getComments(tourId)
      .then(setComments)
      .catch((e) => {
        console.warn("Failed to load comments:", e.message);
        setComments([]);
      });
  }, [tourId]);

  async function handlePost() {
    const trimmed = body.trim();
    if (!trimmed) return;
    tap();
    setPosting(true);
    try {
      const created = await postComment(tourId, trimmed);
      setComments((prev) => [...(prev ?? []), created]);
      setBody("");
    } catch (e: any) {
      console.warn("Failed to post comment:", e.message);
      showToast(t("comments.couldntPost"));
    }
    setPosting(false);
  }

  async function submitReport(commentId: string, reason: ReportReason) {
    try {
      await reportComment(tourId, commentId, reason);
      showToast(t("report.submitted"));
    } catch (e: any) {
      console.warn("Failed to submit comment report:", e.message);
      showToast(t("report.couldntSubmit"));
    }
  }

  function handleReport(commentId: string) {
    Alert.alert(t("report.title"), t("report.body"), [
      { text: t("report.reasonInaccurate"), onPress: () => submitReport(commentId, "inaccurate") },
      { text: t("report.reasonOffensive"), onPress: () => submitReport(commentId, "offensive") },
      { text: t("report.reasonSpam"), onPress: () => submitReport(commentId, "spam") },
      { text: t("report.reasonOther"), onPress: () => submitReport(commentId, "other") },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{t("comments.header")}</Text>

      {comments === null ? (
        <ActivityIndicator color={colors.ink} />
      ) : comments.length === 0 ? (
        <Text style={styles.emptyText}>{t("comments.noneYet")}</Text>
      ) : (
        comments.map((c) => (
          <View key={c.comment_id} style={styles.commentCard}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentAuthor}>{c.display_name || t("routeDetail.anonymousExplorer")}</Text>
              <View style={styles.commentHeaderRight}>
                <Text style={styles.commentDate}>{formatDate(c.created_at)}</Text>
                <TouchableOpacity
                  onPress={() => handleReport(c.comment_id)}
                  accessibilityRole="button"
                  accessibilityLabel={t("comments.reportA11y")}
                >
                  <Text style={styles.reportLink}>{t("comments.reportLink")}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.commentBody}>{c.body}</Text>
          </View>
        ))
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={body}
          onChangeText={setBody}
          placeholder={t("comments.addPlaceholder")}
          placeholderTextColor={colors.fieldMuted}
          maxLength={500}
          multiline
          accessibilityLabel={t("comments.inputA11y")}
        />
        <TouchableOpacity
          style={[styles.postBtn, !body.trim() && styles.postBtnDisabled]}
          onPress={handlePost}
          disabled={!body.trim() || posting}
          accessibilityRole="button"
          accessibilityLabel={t("comments.postA11y")}
        >
          <Text style={styles.postBtnText}>{posting ? "..." : t("comments.post")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginTop: spacing.lg,
  },
  header: {
    fontFamily: font.cursiveBold,
    fontSize: 26,
    lineHeight: 34,
    color: colors.ink,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  emptyText: {
    fontFamily: font.serifItalic,
    fontSize: 14,
    color: colors.fieldMuted,
    marginBottom: 12,
  },
  commentCard: {
    width: "100%",
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1,
    borderColor: colors.fieldBorderSoft,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: spacing.sm,
  },
  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  commentAuthor: {
    fontFamily: font.cursiveBold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.ink,
  },
  commentHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  commentDate: {
    fontFamily: font.cursive,
    fontSize: 12,
    lineHeight: 16,
    color: colors.fieldMuted,
  },
  reportLink: {
    fontFamily: font.cursive,
    fontSize: 12,
    lineHeight: 16,
    color: colors.fieldMuted,
    textDecorationLine: "underline",
  },
  commentBody: {
    fontFamily: font.serifItalic,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignItems: "flex-end",
  },
  // Deliberately NOT cursive -- live user-typed text, not UI chrome.
  input: {
    flex: 1,
    backgroundColor: colors.parchmentSurface,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radius.md,
    padding: 10,
    fontFamily: font.sans,
    fontSize: 14,
    color: colors.ink,
    maxHeight: 90,
  },
  postBtn: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  postBtnDisabled: {
    backgroundColor: colors.fieldBorder,
  },
  postBtnText: {
    fontFamily: font.cursiveBold,
    color: colors.parchmentSurface,
    fontSize: 17,
    lineHeight: 23,
  },
});
