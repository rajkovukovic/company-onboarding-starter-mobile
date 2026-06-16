import { Text, TextInput, View } from 'react-native';

import { formatConfidence, formatSources } from '../company';
import { styles } from '../styles';
import type { ReviewFieldConfig } from '../reviewFields';
import type { FieldEnrichment } from '../types';

export function ReviewField(props: {
  config: ReviewFieldConfig;
  metadata?: FieldEnrichment;
  value: string;
  onChange: (value: string) => void;
  grouped?: boolean;
  showMetadata?: boolean;
}) {
  const isLowConfidence = props.metadata?.confidence === 'low';
  const showMetadata = props.showMetadata ?? true;

  return (
    <View
      style={[
        props.grouped ? styles.groupedReviewField : styles.reviewField,
        !props.grouped && isLowConfidence && styles.lowConfidence,
      ]}
    >
      <View style={styles.reviewFieldHeader}>
        <Text style={styles.label}>{props.config.label}</Text>
        {showMetadata ? (
          <Text
            style={[
              styles.confidenceBadge,
              isLowConfidence && styles.lowConfidenceBadge,
            ]}
          >
            {formatConfidence(props.metadata)}
          </Text>
        ) : null}
      </View>

      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.config.placeholder}
        autoCapitalize="words"
        autoCorrect={false}
        keyboardType={props.config.keyboardType ?? 'default'}
        returnKeyType="next"
        style={styles.input}
      />

      {showMetadata ? (
        <View style={styles.metadataRow}>
          <Text style={styles.metadataText}>
            Source: {formatSources(props.metadata)}
          </Text>
          {props.metadata?.reason ? (
            <Text style={styles.reasonText}>{props.metadata.reason}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
