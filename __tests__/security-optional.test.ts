import { NativeModules, Platform } from 'react-native';
import { DeviceSecurityHelper } from '../src/helpers/device-security/device-security';

// jail-monkey and react-native-fs are NOT installed here: the checks must degrade gracefully.
it('works without optional peers', async () => {
  (Platform as any).OS = 'ios';
  NativeModules.BMRootJailbreakSniffer = {
    amICompromised: async () => false,
    amIEmulator: async () => false,
    amIDebugged: async () => false,
  };
  expect((await DeviceSecurityHelper.checkDeviceSecurity()).isSecure).toBe(true);
  expect((await DeviceSecurityHelper.checkDeviceSecurity({ expectedHash: 'x' })).reason).toContain('check skipped');
});
