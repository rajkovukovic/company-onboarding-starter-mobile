import { Pressable, Text, View } from 'react-native';

import { getCompanyFieldValue, updateCompanyField } from '../company';
import { REVIEW_FIELDS } from '../reviewFields';
import { styles } from '../styles';
import type { CompanyData, EnrichResponse } from '../types';
import { ReviewField } from './ReviewField';

export function ReviewStep(props: {
  company: CompanyData;
  enrichment: EnrichResponse['enrichment']['fields'];
  warnings?: string[];
  onChangeCompany: (company: CompanyData) => void;
  onConfirm: () => void;
}) {
  const warnings = props.warnings?.filter(Boolean) ?? [];

  return (
    <View>
      <Text style={styles.subtitle}>
        We've pulled this in for you. Check it over before continuing.
      </Text>

      {warnings.length > 0 ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>Needs a quick check</Text>
          {warnings.map((warning) => (
            <Text key={warning} style={styles.warningText}>
              {warning}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.reviewList}>
        {REVIEW_FIELDS.map((field) => {
          const metadata = props.enrichment[field.metadataKey];

          return (
            <ReviewField
              key={field.key}
              config={field}
              metadata={metadata}
              value={getCompanyFieldValue(props.company, field.key)}
              onChange={(value) =>
                props.onChangeCompany(
                  updateCompanyField(props.company, field.key, value),
                )
              }
            />
          );
        })}
      </View>

      <Pressable
        onPress={props.onConfirm}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>Looks good</Text>
      </Pressable>
    </View>
  );
}
