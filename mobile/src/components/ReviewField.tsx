import { type Ref, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

import { formatSources } from '../company';
import { styles } from '../styles';
import type { ReviewFieldConfig } from '../reviewFields';
import type { FieldEnrichment } from '../types';
import { ConfidenceIndicator } from './ConfidenceIndicator';

function parseDateString(value: string): Date {
  if (value) {
    const parts = value.split('-').map(Number);
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

function formatDateToISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function DatePickerInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  const pickerDate = parseDateString(props.value);

  const handleChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setOpen(false);
      if (selected) props.onChange(formatDateToISO(selected));
    } else {
      if (selected) setPendingDate(selected);
    }
  };

  const handleDone = () => {
    if (pendingDate) props.onChange(formatDateToISO(pendingDate));
    setPendingDate(null);
    setOpen(false);
  };

  const handleCancel = () => {
    setPendingDate(null);
    setOpen(false);
  };

  const displayValue = props.value
    ? parseDateString(props.value).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.input, styles.datePickerTrigger]}
        accessibilityRole="button"
        accessibilityLabel="Select incorporation date"
      >
        <Text
          style={
            displayValue ? styles.datePickerValue : styles.datePickerPlaceholder
          }
        >
          {displayValue ?? props.placeholder}
        </Text>
        <Text style={styles.datePickerChevron}>{'›'}</Text>
      </Pressable>

      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          maximumDate={new Date()}
          onChange={handleChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal
          visible={open}
          transparent
          animationType="fade"
          onRequestClose={handleCancel}
        >
          <Pressable style={styles.dateModalOverlay} onPress={handleCancel}>
            <Pressable style={styles.dateModalSheet}>
              <View style={styles.dateModalHeader}>
                <Pressable onPress={handleCancel} hitSlop={8}>
                  <Text style={styles.dateModalCancel}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleDone} hitSlop={8}>
                  <Text style={styles.dateModalDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={pendingDate ?? pickerDate}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={handleChange}
                style={styles.datePickerSpinner}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

export function ReviewField(props: {
  config: ReviewFieldConfig;
  metadata?: FieldEnrichment;
  value: string;
  onChange: (value: string) => void;
  grouped?: boolean;
  showMetadata?: boolean;
  hasError?: boolean;
  viewRef?: Ref<View>;
}) {
  const showMetadata = props.showMetadata ?? true;

  return (
    <View
      ref={props.viewRef}
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

      {props.config.datePicker ? (
        <DatePickerInput
          value={props.value}
          onChange={props.onChange}
          placeholder={props.config.placeholder}
          hasError={props.hasError}
        />
      ) : (
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
      )}

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
