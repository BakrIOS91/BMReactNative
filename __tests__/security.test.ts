import { NativeModules, Platform } from 'react-native';
import { DeviceSecurityHelper } from '../src/helpers/device-security/device-security';
import { Rjsniffer } from '../src/helpers/device-security/rjsniffer';

const monkey: any = {};
const rnfs: any = {};
jest.mock('jail-monkey', () => ({ default: monkey }), { virtual: true });
jest.mock('react-native-fs', () => rnfs, { virtual: true });

const sniffer = { amICompromised: jest.fn(), amIEmulator: jest.fn(), amIDebugged: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as any).OS = 'android';
  NativeModules.BMRootJailbreakSniffer = sniffer;
  sniffer.amICompromised.mockResolvedValue(false);
  sniffer.amIEmulator.mockResolvedValue(false);
  sniffer.amIDebugged.mockResolvedValue(false);
  Object.assign(monkey, {
    isJailBroken: () => false,
    isDebuggedMode: async () => false,
    hookDetected: () => false,
    isOnExternalStorage: () => false,
  });
  rnfs.exists = async () => false;
  rnfs.hash = async () => 'ABC';
});

describe('Rjsniffer', () => {
  it('delegates to the native module', async () => {
    sniffer.amICompromised.mockResolvedValue(true);
    expect(await Rjsniffer.amICompromised()).toBe(true);
    expect(await Rjsniffer.amIEmulator()).toBe(false);
    expect(await Rjsniffer.amIDebugged()).toBe(false);
  });
  it('explains a missing native module', () => {
    delete NativeModules.BMRootJailbreakSniffer;
    expect(() => Rjsniffer.amIEmulator()).toThrow('not linked');
  });
});

describe('DeviceSecurityHelper', () => {
  it('passes on unsupported platforms', async () => {
    (Platform as any).OS = 'web';
    expect(await DeviceSecurityHelper.checkDeviceSecurity()).toEqual({
      isSecure: true,
      reason: 'Device security checks are not applicable on this platform.',
    });
  });

  it('passes a clean device', async () => {
    expect(await DeviceSecurityHelper.checkDeviceSecurity()).toEqual({ isSecure: true, reason: 'Device passed all security checks' });
  });

  it('collects every issue', async () => {
    sniffer.amICompromised.mockResolvedValue(true);
    sniffer.amIEmulator.mockResolvedValue(true);
    sniffer.amIDebugged.mockResolvedValue(true);
    Object.assign(monkey, { isJailBroken: () => true, isDebuggedMode: async () => true, hookDetected: () => true, isOnExternalStorage: () => true });
    rnfs.exists = async (p: string) => p === '/sbin/su' || p === '/sbin/magisk' || p === '/usr/bin/frida-server';
    process.env.MY_SECRET = 'x';
    const r = await DeviceSecurityHelper.checkDeviceSecurity({ exposedSecrets: ['MY_SECRET', 'NOT_SET'] });
    delete process.env.MY_SECRET;
    expect(r.isSecure).toBe(false);
    for (const s of ['Root/Jailbreak detected (root_jailbreak_sniffer)', 'Emulator detected', 'Debugger attached (root_jailbreak_sniffer)', 'jail-monkey', 'Hooking', 'external storage', 'SU binary found at /sbin/su', 'Magisk detected', 'Frida server detected at /usr/bin/frida-server', 'Sensitive constant exposed: MY_SECRET']) {
      expect(r.reason).toContain(s);
    }
    expect(r.reason).not.toContain('NOT_SET');
  });

  it('skips emulator / debugger checks when disabled', async () => {
    sniffer.amIEmulator.mockResolvedValue(true);
    sniffer.amIDebugged.mockResolvedValue(true);
    monkey.isDebuggedMode = async () => true;
    const r = await DeviceSecurityHelper.checkDeviceSecurity({ checkEmulator: false, checkDebugging: false });
    expect(r.isSecure).toBe(true);
    expect(sniffer.amICompromised).not.toHaveBeenCalled();
  });

  it('verifies binary integrity', async () => {
    const opts = { expectedHash: 'abc', apkPath: '/a.apk', ipaPath: '/a.ipa' };
    rnfs.exists = async (p: string) => p === '/a.apk' || p === '/a.ipa';
    expect((await DeviceSecurityHelper.checkDeviceSecurity(opts)).isSecure).toBe(true);
    rnfs.hash = async () => 'zzz';
    expect((await DeviceSecurityHelper.checkDeviceSecurity(opts)).reason).toContain('SHA256 mismatch');
    (Platform as any).OS = 'ios';
    expect((await DeviceSecurityHelper.checkDeviceSecurity(opts)).reason).toContain('SHA256 mismatch');
    expect((await DeviceSecurityHelper.checkDeviceSecurity({ expectedHash: 'abc' })).reason).toContain('check skipped');
  });

  it('accepts a custom file adapter and reports thrown errors', async () => {
    const fileAdapter = { exists: async (p: string) => p === '/system/su', sha256: async () => '' };
    expect((await DeviceSecurityHelper.checkDeviceSecurity({ fileAdapter })).reason).toContain('/system/su');
    sniffer.amICompromised.mockRejectedValue(new Error('native down'));
    expect((await DeviceSecurityHelper.checkDeviceSecurity()).reason).toContain('Security check failed: Error: native down');
  });

  it('tolerates monkey without optional methods', async () => {
    for (const k of Object.keys(monkey)) delete monkey[k];
    monkey.isJailBroken = () => false;
    expect((await DeviceSecurityHelper.checkDeviceSecurity()).isSecure).toBe(true);
  });
});
