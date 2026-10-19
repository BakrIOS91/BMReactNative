/**
 * Presentation state for a screen. Keep one `ViewState` in your screen state
 * and drive the UI from it instead of separate loading / error flags.
 */
export type ViewState =
  | { type: 'loading'; isError: false }
  | { type: 'overlayLoading'; isError: false; color: string }
  | { type: 'loaded'; isError: false }
  | { type: 'noNetwork'; isError: true; errorModel?: unknown }
  | { type: 'noData'; isError: true; errorModel?: unknown }
  | { type: 'serverError'; isError: true; errorModel?: unknown }
  | { type: 'unexpectedError'; isError: true; errorModel?: unknown }
  | { type: 'unauthorized'; isError: true; errorModel?: unknown }
  | { type: 'forceUpdate'; isError: true; errorModel?: unknown }
  | { type: 'jailBroken'; isError: true; errorModel?: unknown }
  | { type: 'searchError'; isError: true; errorModel?: unknown }
  | ({ type: 'customError'; isError: true } & CustomErrorStateOptions);

export interface CustomErrorStateOptions {
  title?: string;
  message?: string;
  /** Opaque image reference interpreted by the error renderer. */
  image?: string;
  buttonText?: string;
  onPress?: () => void;
  secondaryButtonText?: string;
  onSecondaryPress?: () => void;
  errorModel?: unknown;
}

export type ErrorViewStateType = Extract<ViewState, { isError: true }>['type'];

type ErrorOptions = { errorModel?: unknown };

export const ViewState = {
  loading: { type: 'loading', isError: false } as ViewState,
  loaded: { type: 'loaded', isError: false } as ViewState,
  overlayLoading: (color = 'transparent'): ViewState => ({ type: 'overlayLoading', isError: false, color }),
  noNetwork: (o: ErrorOptions = {}): ViewState => ({ type: 'noNetwork', isError: true, ...o }),
  noData: (o: ErrorOptions = {}): ViewState => ({ type: 'noData', isError: true, ...o }),
  serverError: (o: ErrorOptions = {}): ViewState => ({ type: 'serverError', isError: true, ...o }),
  unexpectedError: (o: ErrorOptions = {}): ViewState => ({ type: 'unexpectedError', isError: true, ...o }),
  unauthorized: (o: ErrorOptions = {}): ViewState => ({ type: 'unauthorized', isError: true, ...o }),
  forceUpdate: (o: ErrorOptions = {}): ViewState => ({ type: 'forceUpdate', isError: true, ...o }),
  jailBroken: (o: ErrorOptions = {}): ViewState => ({ type: 'jailBroken', isError: true, ...o }),
  searchError: (o: ErrorOptions = {}): ViewState => ({ type: 'searchError', isError: true, ...o }),
  customError: (o: CustomErrorStateOptions = {}): ViewState => ({
    type: 'customError',
    isError: true,
    title: '',
    message: '',
    image: '',
    buttonText: '',
    secondaryButtonText: '',
    ...o,
  }),
};
