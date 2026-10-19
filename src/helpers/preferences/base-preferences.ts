import { Listenable, Unsubscribe, ValueNotifier } from '../observable';
import { asyncStorageAdapter, PreferencesStorage, secureStoreAdapter } from './storage';

export interface Codec<T> {
  encode(value: T): string;
  decode(raw: string): T;
}

const jsonCodec: Codec<any> = { encode: JSON.stringify, decode: JSON.parse };

type Where = 'userDefault' | 'secure' | 'inApp';

/**
 * A single reactive preference. Reading `value` is synchronous; assigning it
 * notifies subscribers immediately and persists in the background (use
 * `BasePreferences.flush()` to await pending writes).
 */
export class Preference<T> implements Listenable<T> {
  /** @internal */
  readonly notifier: ValueNotifier<T>;

  constructor(
    private readonly owner: BasePreferences,
    readonly where: Where,
    readonly key: string | undefined,
    private readonly defaultValue: T,
    private readonly codec: Codec<T>,
  ) {
    this.notifier = new ValueNotifier(defaultValue);
  }

  get value(): T {
    return this.notifier.value;
  }

  set value(next: T) {
    this.notifier.value = next;
    if (this.key !== undefined) this.owner.persist(this, next);
  }

  subscribe(listener: (value: T) => void): Unsubscribe {
    return this.notifier.subscribe(listener);
  }

  /** @internal */
  encode(value: T): string {
    return this.codec.encode(value);
  }

  /** @internal */
  async load(storage: PreferencesStorage): Promise<void> {
    const raw = await storage.getItem(this.key!);
    if (raw === null || raw === '') return;
    try {
      this.notifier.value = this.codec.decode(raw);
    } catch {
      // Corrupted or incompatible stored value: keep the default.
      this.notifier.value = this.defaultValue;
    }
  }
}

export interface PreferencesOptions {
  /** Backs `userDefault` fields. Defaults to AsyncStorage. */
  storage?: PreferencesStorage;
  /** Backs `secure` fields. Defaults to expo-secure-store. */
  secureStorage?: PreferencesStorage;
  /** Called when a background write fails. */
  onPersistError?: (error: unknown, key: string) => void;
}

/**
 * Base class for a typed, reactive, persisted preference set.
 *
 * ```ts
 * class UserPreferences extends BasePreferences {
 *   themeMode = this.userDefault('theme_mode', 'light');
 *   token = this.secure<string | null>('user_auth_token', null);
 *   tempFlag = this.inApp(false);
 * }
 *
 * const prefs = new UserPreferences();
 * await prefs.init();
 * prefs.themeMode.value = 'dark';
 * ```
 *
 * Values are JSON encoded by default; pass a `Codec` for models that need
 * custom (de)serialization.
 */
export abstract class BasePreferences {
  private readonly all: Preference<any>[] = [];
  private pending = new Set<Promise<void>>();
  private _storage?: PreferencesStorage;
  private _secureStorage?: PreferencesStorage;

  constructor(private readonly options: PreferencesOptions = {}) {}

  /** Plain persistent setting (the `@UserDefault` equivalent). */
  protected userDefault<T>(key: string, defaultValue: T, codec: Codec<T> = jsonCodec): Preference<T> {
    return this.register(new Preference(this, 'userDefault', key, defaultValue, codec));
  }

  /** Secure persistent setting (the `@Secure` equivalent). Assigning `null` deletes the entry. */
  protected secure<T>(key: string, defaultValue: T, codec: Codec<T> = jsonCodec): Preference<T> {
    return this.register(new Preference(this, 'secure', key, defaultValue, codec));
  }

  /** Memory only setting (the `@InApp` equivalent); reset on app restart. */
  protected inApp<T>(defaultValue: T): Preference<T> {
    return this.register(new Preference(this, 'inApp', undefined, defaultValue, jsonCodec));
  }

  private register<T>(preference: Preference<T>): Preference<T> {
    this.all.push(preference);
    return preference;
  }

  /** Loads every persisted value. Await before first use (secure reads are asynchronous). */
  async init(): Promise<void> {
    await Promise.all(this.all.filter((p) => p.key !== undefined).map((p) => p.load(this.storageFor(p))));
  }

  /** Resolves once all background writes issued so far have finished. */
  async flush(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  dispose(): void {
    for (const p of this.all) p.notifier.dispose();
  }

  /** @internal */
  persist<T>(preference: Preference<T>, value: T): void {
    const key = preference.key!;
    const storage = this.storageFor(preference);
    const write =
      preference.where === 'secure' && (value === null || value === undefined)
        ? storage.removeItem(key)
        : storage.setItem(key, preference.encode(value));
    const tracked: Promise<void> = Promise.resolve(write)
      .catch((error) => this.options.onPersistError?.(error, key))
      .finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
  }

  private storageFor(preference: Preference<any>): PreferencesStorage {
    if (preference.where === 'secure') {
      return (this._secureStorage ??= this.options.secureStorage ?? secureStoreAdapter());
    }
    return (this._storage ??= this.options.storage ?? asyncStorageAdapter());
  }
}
