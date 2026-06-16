import { Text, TextInput, View } from 'react-native';

import { formatSources } from '../company';
import { styles } from '../styles';
import type { ReviewFieldConfig } from '../reviewFields';
import type { FieldEnrichment } from '../types';
import { ConfidenceIndicator } from './ConfidenceIndicator';

export function ReviewField(props: {
  config: ReviewFieldConfig;
  metadata?: FieldEnrichment;
  value: string;
  onChange: (value: string) => void;
  grouped?: boolean;
  showMetadata?: boolean;
  hasError?: boolean;
}) {
  const showMetadata = props.showMetadata ?? true;

  return (
    <View
      style={[
        props.grouped ? styles.groupedReviewField : styles.reviewField,
        !props.grouped && props.hasError && styles.reviewFieldError,
      ]}
    >
      <View style={styles.reviewFieldHeader}>
        <Text style={styles.label}>
          {props.config.label}
          {props.config.required ? (
            <Text style={styles.fieldErrorText}>{' *'}</Text>
          ) : null}
        </Text>
        {showMetadata ? (
          <ConfidenceIndicator confidence={props.metadata?.confidence} />
        ) : null}
      </View>

      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.config.placeholder}
        autoCapitalize="words"
        autoCorrect={false}
        keyboardType={props.config.keyboardType ?? 'default'}
        returnKeyType={props.config.multiline ? 'default' : 'next'}
        multiline={props.config.multiline}
        scrollEnabled={false}
        style={[styles.input, props.config.multiline && styles.inputMultiline]}
      />

      {props.hasError ? (
        <Text style={styles.fieldErrorText}>This field is required.</Text>
      ) : null}

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
