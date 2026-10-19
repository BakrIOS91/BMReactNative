/** Async string key-value store backing preferences. */
export interface PreferencesStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class MemoryStorage implements PreferencesStorage {
  private map = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.map.delete(key);
  }
}

function missing(pkg: string): never {
  throw new Error(`${pkg} is not installed. Install it or pass your own PreferencesStorage to BasePreferences.`);
}

/** `@react-native-async-storage/async-storage` (plain, non-sensitive settings). */
export function asyncStorageAdapter(): PreferencesStorage {
  let mod: any;
  try {
    mod = require('@react-native-async-storage/async-storage');
  } catch {
    missing('@react-native-async-storage/async-storage');
  }
  const store = mod.default ?? mod;
  return {
    getItem: (key) => store.getItem(key),
    setItem: (key, value) => store.setItem(key, value),
    removeItem: (key) => store.removeItem(key),
  };
}

/** `expo-secure-store` (Keychain on iOS, Keystore on Android). */
export function secureStoreAdapter(): PreferencesStorage {
  let store: any;
  try {
    store = require('expo-secure-store');
  } catch {
    missing('expo-secure-store');
  }
  return {
    getItem: (key) => store.getItemAsync(key),
    setItem: (key, value) => store.setItemAsync(key, value),
    removeItem: (key) => store.deleteItemAsync(key),
  };
}
