import type { ImageSourcePropType } from 'react-native';

export class CustomError {
  constructor(
    readonly errorImage: ImageSourcePropType,
    readonly errorTitle: string,
    readonly errorMessage: string,
    readonly buttonTitle?: string,
    readonly retryAction?: () => void,
  ) {}

  /** Two errors are equal when their button titles match (same as BMFlutter). */
  equals(other: unknown): boolean {
    return other instanceof CustomError && other.buttonTitle === this.buttonTitle;
  }
}
