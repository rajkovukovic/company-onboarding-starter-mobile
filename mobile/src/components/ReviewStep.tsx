import { Pressable, Text, View } from 'react-native';

import { getCompanyFieldValue, updateCompanyField } from '../company';
import { REVIEW_FIELDS } from '../reviewFields';
import { styles } from '../styles';
import type { CompanyData, EnrichResponse } from '../types';
import { ReviewField } from './ReviewField';

export function ReviewStep(props: {
  company: CompanyData;
  enrichment: EnrichResponse['enrichment']['fields'];
  onChangeCompany: (company: CompanyData) => void;
  onConfirm: () => void;
}) {
  return (
    <View>
      <Text style={styles.h1}>Review your details</Text>
      <Text style={styles.subtitle}>
        We've pulled this in for you. Check it over before continuing.
      </Text>

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
