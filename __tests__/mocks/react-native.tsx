/** Lightweight stand-in for react-native so components render with react-test-renderer in Node. */
import React from 'react';

const host = (name: string) => {
  const C = ({ children, ...props }: any) => React.createElement(name, props, children);
  C.displayName = name;
  return C;
};

export const View = host('View');
export const Text = host('Text');
export const ScrollView = ({ children, refreshControl, ...props }: any) =>
  React.createElement('ScrollView', props, refreshControl, children);
export const ActivityIndicator = host('ActivityIndicator');
export const RefreshControl = host('RefreshControl');
export const Modal = ({ visible, children, ...props }: any) =>
  visible ? React.createElement('Modal', props, children) : null;
export const Pressable = ({ style, children, ...props }: any) =>
  React.createElement('Pressable', { ...props, style: typeof style === 'function' ? style({ pressed: false }) : style }, children);

export const Platform: { OS: string } = { OS: 'ios' };
export const NativeModules: Record<string, unknown> = {};
export const mockWindow = { width: 440, height: 900 };
export const useWindowDimensions = () => mockWindow;

export const StyleSheet = {
  create: <T,>(s: T) => s,
  hairlineWidth: 1,
  absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
};
