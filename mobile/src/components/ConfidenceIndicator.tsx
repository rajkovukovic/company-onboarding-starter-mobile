import { Text, View } from 'react-native';

import { styles } from '../styles';
import type { Confidence } from '../types';

const TOTAL_DOTS = 3;

const LEVEL_CONFIG: Record<
  NonNullable<Confidence>,
  { activeDots: number; label: string }
> = {
  high: { activeDots: 3, label: 'Confidence: High' },
  medium: { activeDots: 2, label: 'Confidence: Medium' },
  low: { activeDots: 1, label: 'Confidence: Low' },
};

export function ConfidenceIndicator({
  confidence,
  isEdited,
}: {
  confidence?: Confidence;
  isEdited?: boolean;
}) {
  if (isEdited) {
    return (
      <View
        style={styles.confidencePillEdited}
        accessible
        accessibilityLabel="Edited by you"
      >
        <Text style={styles.confidenceLabelEdited}>Edited by you</Text>
      </View>
    );
  }

  if (!confidence) return null;

  const effectiveConfidence: NonNullable<Confidence> = confidence;
  const { activeDots, label } = LEVEL_CONFIG[effectiveConfidence];
  const isHigh = effectiveConfidence === 'high';
  const isMedium = effectiveConfidence === 'medium';

  const wrapperStyle = isHigh
    ? styles.confidencePillHigh
    : isMedium
      ? styles.confidencePillMedium
      : styles.confidencePillLow;

  const activeDotStyle = isHigh
    ? styles.confidenceDotHighActive
    : isMedium
      ? styles.confidenceDotMediumActive
      : styles.confidenceDotLowActive;

  const labelStyle = isHigh
    ? styles.confidenceLabelHigh
    : isMedium
      ? styles.confidenceLabelMedium
      : styles.confidenceLabelLow;

  return (
    <View
      style={wrapperStyle}
      accessible
      accessibilityLabel={`${label} confidence`}
    >
      <View style={styles.confidenceMeter}>
        {Array.from({ length: TOTAL_DOTS }, (_, i) => (
          <View
            key={i}
            style={[
              styles.confidenceDot,
              i < activeDots ? activeDotStyle : styles.confidenceDotInactive,
            ]}
          />
        ))}
      </View>
      <Text style={labelStyle} importantForAccessibility="no">
        {label}
      </Text>
    </View>
  );
}
