import { Text } from "@/components/ui/Text";
import { colors, fonts, spacing } from "@/constants/theme";
import { logger } from "@/utils/logger";
import { teamActions } from "@/utils/teamManagement";
import { observer, Show, useObservable } from "@legendapp/state/react";
import React, { useEffect, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import Button from "@/components/ui/Button";
import Sheet, { type SheetHandle, sheetStyles } from "@/components/ui/Sheet";
import { ActivityIndicator, Share, StyleSheet, View } from "react-native";

interface UpdateModalProps {
  visible: boolean;
  onClose: () => void;
}

export default observer(function InviteModal({
  visible,
  onClose,
}: UpdateModalProps) {
  const { t } = useTranslation();
  const sheet = useRef<SheetHandle>(null);
  const ui$ = useObservable({
    inviteCode: null,
  });

  useEffect(() => {
    teamActions.generateInvite().then((res) => {
      ui$.inviteCode.set(res.invite.code);
    });
  }, []);

  const shareCode = async () => {
    try {
      const result = await Share.share({
        message: shareMessage,
        title: shareTitle,
      });

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          logger.info("CODE_SHARED_SUCCESSFULLY", {
            activity: result.activityType,
          });
        } else {
          logger.info("CODE_SHARED_SUCCESSFULLY");
        }
      } else if (result.action === Share.dismissedAction) {
        logger.info("SHARE_CODE_DISMISSED");
      }
    } catch (error: any) {}
  };

  // Shown and shared as two groups, like 1234 5678
  const code = String(ui$.inviteCode.get() ?? "");
  const codeGroups = [code.slice(0, 4), code.slice(4)];
  const shareMessage = t("team.invite.shareMessage", {
    code: codeGroups.join(" "),
  });
  const shareTitle = t("team.invite.shareTitle");

  return (
    <Sheet ref={sheet} visible={visible} onClose={onClose}>
      <Text style={sheetStyles.title}>{t("team.invite.title")}</Text>
      <Text style={sheetStyles.description}>
        {t("team.invite.description")}
      </Text>
      <Show
        if={ui$.inviteCode}
        else={
          <ActivityIndicator
            size="small"
            color={colors.text}
            style={{ marginTop: 20 }}
          />
        }
      >
        {/* Separate digits instead of letterSpacing, which leaves trailing space and breaks centering */}
        <View
          testID="invite-code"
          accessible
          accessibilityLabel={code}
          style={styles.codeContainer}
        >
          {codeGroups.map((group, groupIndex) => (
            <View key={groupIndex} style={styles.codeGroup}>
              {group.split("").map((digit, i) => (
                <Text key={i} style={styles.code}>
                  {digit}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </Show>
      <Button
        title={t("team.invite.share")}
        onPress={shareCode}
        style={styles.share}
      />
      <Text style={styles.expiry}>{t("team.invite.expiry")}</Text>
      <Text style={styles.explanation}>
        <Trans
          i18nKey="team.invite.whereToJoin"
          components={{ bold: <Text style={styles.bold} /> }}
        />
      </Text>

      <Button
        title={t("common.gotIt")}
        variant="secondary"
        onPress={() => sheet.current?.dismiss()}
        style={styles.close}
      />
    </Sheet>
  );
});

const styles = StyleSheet.create({
  close: {
    marginTop: spacing.xl,
  },
  codeContainer: {
    marginTop: spacing.xl,
    flexDirection: "row",
    direction: "ltr",
    justifyContent: "center",
    gap: 22,
  },
  codeGroup: {
    flexDirection: "row",
    gap: 8,
  },
  code: {
    fontSize: 32,
    color: colors.text,
    fontFamily: "CodeBold",
  },
  share: {
    marginTop: spacing.xl,
  },
  expiry: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    textAlign: "center",
  },
  explanation: {
    marginTop: spacing.xl,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    textAlign: "left",
  },
  bold: {
    color: colors.text,
    fontFamily: fonts.bold,
  },
});
