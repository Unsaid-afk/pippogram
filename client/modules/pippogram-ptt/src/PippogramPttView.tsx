import { requireNativeView } from 'expo';
import * as React from 'react';

import { PippogramPttViewProps } from './PippogramPtt.types';

const NativeView: React.ComponentType<PippogramPttViewProps> =
  requireNativeView('PippogramPtt');

export default function PippogramPttView(props: PippogramPttViewProps) {
  return <NativeView {...props} />;
}
