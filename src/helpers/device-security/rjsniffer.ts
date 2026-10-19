import { NativeModules } from 'react-native';

interface SnifferNative {
  amICompromised(): Promise<boolean | null>;
  amIEmulator(): Promise<boolean | null>;
  amIDebugged(): Promise<boolean | null>;
}

function native(): SnifferNative {
  const module = NativeModules.BMRootJailbreakSniffer as SnifferNative | undefined;
  if (!module) {
    throw new Error(
      'BMRootJailbreakSniffer native module is not linked. Rebuild the app (pod install / gradle sync) and avoid Expo Go.',
    );
  }
  return module;
}

/**
 * Detects compromised devices (rooted Android with Magisk Hide awareness,
 * jailbroken iOS), emulators and attached debuggers. Port of
 * BMRootJailbreakSniffer; resolves `null` if the platform cannot tell.
 */
export const Rjsniffer = {
  amICompromised: (): Promise<boolean | null> => native().amICompromised(),
  amIEmulator: (): Promise<boolean | null> => native().amIEmulator(),
  amIDebugged: (): Promise<boolean | null> => native().amIDebugged(),
};
