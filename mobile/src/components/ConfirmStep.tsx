import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { getCompanyFieldValue } from '../company';
import { REVIEW_FIELDS } from '../reviewFields';
import { styles } from '../styles';
import type { CompanyData, NormalizedEnrichInput } from '../types';

function resolveValue(value: string | undefined): { text: string; empty: boolean } {
  const trimmed = value?.trim();
  return trimmed ? { text: trimmed, empty: false } : { text: 'Not provided', empty: true };
}

export function ConfirmStep(props: {
  company: CompanyData;
  input: NormalizedEnrichInput;
  saving: boolean;
  saved: boolean;
  onSubmit: () => void;
  onStartOver: () => void;
}) {
  if (props.saved) {
    return (
      <View>
        <View style={styles.successPanel}>
          <View style={styles.successIconHalo}>
            <View style={styles.successIcon}>
              <Text style={styles.successCheck}>{'\u2713'}</Text>
            </View>
          </View>
          <Text style={styles.successTitle}>Company details saved</Text>
          <Text style={styles.successText}>
            {resolveValue(props.company.name).text} is ready to continue onboarding.
          </Text>
        </View>

        <Pressable
          onPress={props.onStartOver}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.pressedFade,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Start over</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.subtitle}>
        This is the company profile we'll save. Give it one last check before
        submitting.
      </Text>

      <View style={styles.confirmSection}>
        <Text style={styles.confirmSectionTitle}>Submitted by</Text>
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>Email</Text>
          <Text style={styles.confirmValue}>{props.input.email}</Text>
        </View>
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>Website</Text>
          <Text style={styles.confirmValue}>{props.input.website}</Text>
        </View>
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>Domain</Text>
          <Text style={styles.confirmValue}>{props.input.domain}</Text>
        </View>
      </View>

      <View style={styles.confirmSection}>
        <Text style={styles.confirmSectionTitle}>Company details</Text>
        {REVIEW_FIELDS.map((field) => {
          const { text, empty } = resolveValue(
            getCompanyFieldValue(props.company, field.key),
          );
          return (
            <View key={field.key} style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>{field.label}</Text>
              <Text
                style={empty ? styles.confirmValueEmpty : styles.confirmValue}
              >
                {text}
              </Text>
            </View>
          );
        })}
      </View>

      <Pressable
        onPress={props.onSubmit}
        disabled={props.saving}
        accessibilityRole="button"
        accessibilityState={{ disabled: props.saving, busy: props.saving }}
        style={({ pressed }) => [
          styles.button,
          props.saving && styles.buttonDisabled,
          pressed && !props.saving && styles.buttonPressed,
        ]}
      >
        {props.saving ? (
          <View style={styles.loadingContent}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.buttonText}>Saving details...</Text>
          </View>
        ) : (
          <Text style={styles.buttonText}>Submit company details</Text>
        )}
      </Pressable>
    </View>
  );
}
