import { Platform } from 'react-native';
import { Rjsniffer } from './rjsniffer';

export interface SecurityCheckResult {
  isSecure: boolean;
  reason: string;
}

/** File access for the Frida, SU binary and integrity checks. */
export interface SecurityFileAdapter {
  exists(path: string): Promise<boolean>;
  /** Hex SHA-256 of the file at [path]. */
  sha256(path: string): Promise<string>;
}

export interface DeviceSecurityOptions {
  checkDebugging?: boolean;
  checkEmulator?: boolean;
  /** Expected SHA-256 of the binary at `apkPath` (Android) / `ipaPath` (iOS). */
  expectedHash?: string;
  apkPath?: string;
  ipaPath?: string;
  /**
   * Names of environment variables that must not be present in the bundle
   * (checked on `process.env`; bundlers inline `EXPO_PUBLIC_*`-style values).
   */
  exposedSecrets?: string[];
  /** Defaults to `react-native-fs` when installed. */
  fileAdapter?: SecurityFileAdapter;
}

const SU_PATHS = [
  '/system/bin/su',
  '/system/xbin/su',
  '/sbin/su',
  '/system/su',
  '/system/bin/.ext/su',
  '/system/usr/we-need-root/su',
  '/system/app/Superuser.apk',
];
const MAGISK_PATH = '/sbin/magisk';
const FRIDA_FILES = ['/usr/bin/frida-server', '/usr/sbin/frida-server'];

function loadJailMonkey(): any | undefined {
  try {
    const mod = require('jail-monkey');
    return mod.default ?? mod;
  } catch {
    return undefined;
  }
}

function defaultFileAdapter(): SecurityFileAdapter | undefined {
  try {
    const RNFS = require('react-native-fs');
    return {
      exists: (path) => RNFS.exists(path),
      sha256: (path) => RNFS.hash(path, 'sha256'),
    };
  } catch {
    return undefined;
  }
}

export class DeviceSecurityHelper {
  /**
   * Runs the sniffer checks (root / jailbreak, emulator, debugger), the
   * optional `jail-monkey` deep checks, Android SU / Magisk paths, Frida,
   * binary integrity and exposed-secret checks. Never throws; unexpected
   * failures are reported as issues. Web and other platforms always pass.
   */
  static async checkDeviceSecurity(options: DeviceSecurityOptions = {}): Promise<SecurityCheckResult> {
    const { checkDebugging = true, checkEmulator = true, expectedHash, exposedSecrets } = options;
    const isAndroid = Platform.OS === 'android';
    const isIOS = Platform.OS === 'ios';

    if (!isAndroid && !isIOS) {
      return { isSecure: true, reason: 'Device security checks are not applicable on this platform.' };
    }

    const issues: string[] = [];
    try {
      if (checkDebugging || checkEmulator) {
        if (await Rjsniffer.amICompromised()) issues.push('Root/Jailbreak detected (root_jailbreak_sniffer)');
        if (checkEmulator && (await Rjsniffer.amIEmulator())) issues.push('Emulator detected (root_jailbreak_sniffer)');
        if (checkDebugging && (await Rjsniffer.amIDebugged())) issues.push('Debugger attached (root_jailbreak_sniffer)');
      }

      const jailMonkey = loadJailMonkey();
      if (jailMonkey) {
        if (jailMonkey.isJailBroken()) issues.push('Root/Jailbreak detected (jail-monkey)');
        if (checkDebugging && (await jailMonkey.isDebuggedMode?.())) issues.push('Debugger attached (jail-monkey)');
        if (jailMonkey.hookDetected?.()) issues.push('Hooking framework detected (jail-monkey)');
        if (isAndroid && jailMonkey.isOnExternalStorage?.()) issues.push('App installed on external storage (Android)');
      }

      const files = options.fileAdapter ?? defaultFileAdapter();

      if (isAndroid && files) {
        for (const path of SU_PATHS) {
          if (await files.exists(path)) issues.push(`SU binary found at ${path} (multiple-layer root detection)`);
        }
        if (await files.exists(MAGISK_PATH)) issues.push('Magisk detected (multiple-layer root detection)');
      }

      if (files) {
        for (const path of FRIDA_FILES) {
          if (await files.exists(path)) issues.push(`Frida server detected at ${path}`);
        }
      }

      if (expectedHash !== undefined) {
        const filePath = isAndroid ? options.apkPath : options.ipaPath;
        if (files && filePath && (await files.exists(filePath))) {
          const hash = await files.sha256(filePath);
          if (hash.toLowerCase() !== expectedHash.toLowerCase()) issues.push('Binary integrity failed: SHA256 mismatch');
        } else {
          issues.push('Binary integrity check skipped: file path invalid or missing');
        }
      }

      for (const secret of exposedSecrets ?? []) {
        const value = (globalThis as any).process?.env?.[secret];
        if (typeof value === 'string' && value.length > 0) issues.push(`Sensitive constant exposed: ${secret}`);
      }
    } catch (e) {
      issues.push(`Security check failed: ${e}`);
    }

    return issues.length === 0
      ? { isSecure: true, reason: 'Device passed all security checks' }
      : { isSecure: false, reason: issues.join('; ') };
  }
}
