import { BasePreferences } from 'bm-react-native';

class AppPreferences extends BasePreferences {
  themeMode = this.userDefault<'light' | 'dark'>('theme_mode', 'light');
  launchCount = this.userDefault('launch_count', 0);
  token = this.secure<string | null>('user_auth_token', null);
  scratch = this.inApp('');
}

export const prefs = new AppPreferences({ onPersistError: (e, key) => console.warn('persist failed', key, e) });
