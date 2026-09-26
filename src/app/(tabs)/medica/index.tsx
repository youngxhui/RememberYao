import { Column, Host, Icon, Row, ScrollView, Spacer, Text } from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { nativeLayout } from "@/components/native-layout";
import { ProgressBar } from "@/components/progress-bar";
import { useTheme } from "@/hooks/use-theme";
import {
  medicationTypeLabel,
  medicationUnitLabel,
  stockSummary,
  useAppData,
  type Medication,
} from "@/lib/store";

export default function MedicaScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { medications, plans, loading, reload } = useAppData();
  const [onlyLow, setOnlyLow] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const withStock = medications.map((medication) => ({
    medication,
    summary: stockSummary(medication, plans),
  }));
  const lowCount = withStock.filter((item) => item.summary.low).length;
  const list = onlyLow
    ? withStock.filter((item) => item.summary.low)
    : withStock;

  return (
    <>
      <Stack.Title large>药品库存</Stack.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          onPress={() => {
            router.push("/(tabs)/medica/add-options");
          }}
        >
          <Stack.Toolbar.Icon sf="plus" />
          <Stack.Toolbar.Label>添加</Stack.Toolbar.Label>
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host seedColor="#0F766E" style={{ flex: 1 }}>
        <ScrollView
          style={{ padding: 16, paddingBottom: 32 }}
          showsIndicators={false}
        >
          <Column spacing={12}>
            <Row spacing={8}>
              <FilterChip
                label={`全部 ${medications.length}`}
                active={!onlyLow}
                onPress={() => setOnlyLow(false)}
              />
              <FilterChip
                label={`库存不足 ${lowCount}`}
                active={onlyLow}
                onPress={() => setOnlyLow(true)}
              />
              <Spacer />
            </Row>

            {list.length === 0 && !loading ? (
              <Column alignment="center" spacing={8} style={{ paddingTop: 96 }}>
                <Icon name="pills.fill" size={40} color="#8a8a8e" />
                <Text textStyle={{ color: theme.textSecondary }}>
                  {onlyLow
                    ? "没有库存不足的药品"
                    : "药箱还是空的，点右上角添加药品"}
                </Text>
              </Column>
            ) : (
              <Column spacing={10}>
                {list.map(({ medication, summary }) => (
                  <StockCard
                    key={medication.id}
                    medication={medication}
                    daysLeft={summary.daysLeft}
                    low={summary.low}
                    onPress={() => {
                      router.push({
                        pathname: "/(tabs)/medica/detail",
                        params: { id: medication.id },
                      });
                    }}
                  />
                ))}
              </Column>
            )}
          </Column>
        </ScrollView>
      </Host>
    </>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Row
      style={{
        backgroundColor: active ? theme.primarySoft : theme.backgroundElement,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
      onPress={onPress}
    >
      <Text
        textStyle={{
          fontSize: 13,
          fontWeight: "600",
          color: active ? theme.primary : theme.textSecondary,
        }}
      >
        {label}
      </Text>
    </Row>
  );
}

function StockCard({
  medication,
  daysLeft,
  low,
  onPress,
}: {
  medication: Medication;
  daysLeft: number | null;
  low: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const unit = medicationUnitLabel(medication.unit);
  const percent =
    medication.totalQuantity > 0
      ? medication.remainingQuantity / medication.totalQuantity
      : 0;
  const barColor = low
    ? theme.danger
    : percent <= 0.5
      ? theme.warning
      : theme.success;

  return (
    <Column
      spacing={8}
      onPress={onPress}
      style={{
        backgroundColor: theme.backgroundElement,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <Row alignment="center">
        <Column
          spacing={2}
          modifiers={[nativeLayout({ unconstrainedWidth: true })]}
        >
          <Text textStyle={{ fontSize: 15, fontWeight: "600" }}>
            {medication.name}
          </Text>
          <Text textStyle={{ fontSize: 12, color: theme.textSecondary }}>
            {`${medicationTypeLabel(medication.type)} · 剩余 ${
              medication.remainingQuantity
            }/${medication.totalQuantity} ${unit}`}
          </Text>
        </Column>
        <Spacer />
        {daysLeft !== null ? (
          <Text
            textStyle={{
              fontSize: 12,
              fontWeight: "600",
              color: low ? theme.danger : theme.textSecondary,
            }}
          >
            {`剩余 ${daysLeft} 天`}
          </Text>
        ) : null}
      </Row>
      <ProgressBar
        percent={percent}
        color={barColor}
        track={theme.backgroundSelected}
      />
      {low ? (
        <Row alignment="center" spacing={4}>
          <Icon
            name="exclamationmark.triangle.fill"
            size={12}
            color={theme.warning}
          />
          <Text textStyle={{ fontSize: 12, color: theme.warning }}>
            {daysLeft !== null
              ? `预计 ${daysLeft} 天后用完，建议补充`
              : "库存不足，建议补充"}
          </Text>
        </Row>
      ) : null}
      <Row alignment="center">
        <Spacer />
        <Text textStyle={{ fontSize: 13, color: theme.primary }}>查看详情</Text>
      </Row>
    </Column>
  );
}
