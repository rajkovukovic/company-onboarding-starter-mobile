import { Text, View } from 'react-native';

import { styles } from '../styles';

export function ConfirmStep() {
  // TODO (candidate): make this feel like a real success screen.
  return (
    <View style={styles.confirmBox}>
      <Text style={styles.subtitle}>Company details saved.</Text>
    </View>
  );
}
