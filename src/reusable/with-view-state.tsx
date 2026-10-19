import { ComponentType, ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { ViewState } from '../helpers/view-state';
import { ErrorView } from './error-view';

/** `replace` swaps the content for the error; `bottomSheet` keeps it visible behind a sheet. */
export type ErrorDisplayMode = 'replace' | 'bottomSheet';

export interface WithViewStateProps {
  viewState: ViewState;
  children: ReactNode;
  /** Wraps the content in a pull-to-refresh `ScrollView` that calls `retryAction`. */
  isRefreshable?: boolean;
  retryAction?: () => void;
  errorDisplayMode?: ErrorDisplayMode;
  /**
   * Renders the error screen for a state. Supply this to localise texts,
   * pick images and wire per-state actions; the default is a plain English
   * `ErrorView`.
   */
  renderError?: (viewState: Extract<ViewState, { isError: true }>, retry: () => void) => ReactNode;
  /** Custom loader; defaults to an `ActivityIndicator`. */
  renderLoader?: () => ReactNode;
  /** Background of the bottom sheet. */
  sheetBackgroundColor?: string;
  /** Top corner radius of the bottom sheet. Default 38 on iOS and 28 on Android, like native sheets. */
  sheetBorderRadius?: number;
  /**
   * Controls the bottom sheet from outside: `true` shows it, `false` hides it.
   * Leave undefined to let it show on error and close on backdrop tap / back.
   */
  sheetVisible?: boolean;
  /** Called when the user dismisses the sheet (backdrop tap or Android back). */
  onSheetDismiss?: () => void;
  /** Show the drag handle at the top of the sheet. Default true. */
  showGrabber?: boolean;
  /** Dim colour behind the bottom sheet. Default `rgba(0,0,0,0.4)`. */
  backdropColor?: string;
  /**
   * Blur intensity (0-100) behind the bottom sheet, default 20; 0 disables.
   * Needs the optional `expo-blur` peer, otherwise only the dim colour shows.
   */
  backdropBlur?: number;
}

function loadBlurView(): ComponentType<any> | undefined {
  try {
    return require('expo-blur').BlurView;
  } catch {
    return undefined;
  }
}

const noop = () => {};

const DEFAULT_MESSAGES: Record<string, { title: string; message: string }> = {
  noNetwork: { title: 'No Network', message: 'Please check your connection and try again.' },
  noData: { title: 'No Data', message: 'There is nothing to show yet.' },
  serverError: { title: 'Server Error', message: 'Something went wrong on our side. Please try again.' },
  unexpectedError: { title: 'Unexpected Error', message: 'Something went wrong. Please try again.' },
  unauthorized: { title: 'Unauthorized', message: 'Your session has expired. Please log in again.' },
  forceUpdate: { title: 'Update Required', message: 'Please update the app to continue.' },
  jailBroken: { title: 'Unsafe Device', message: 'This app cannot run on a rooted or jailbroken device.' },
  searchError: { title: 'Search Error', message: 'We could not complete your search.' },
};

function defaultError(state: Extract<ViewState, { isError: true }>): ReactNode {
  const custom = state.type === 'customError' ? state : undefined;
  const fallback = DEFAULT_MESSAGES[state.type] ?? DEFAULT_MESSAGES.unexpectedError;
  return <ErrorView image={null} title={custom?.title ?? fallback.title} message={custom?.message ?? fallback.message} />;
}

/**
 * Shows loaders, overlays and error screens for a [ViewState]; `children`
 * render in the normal `loaded` state (and stay mounted underneath loaders).
 */
export function WithViewState({
  viewState,
  children,
  isRefreshable = false,
  retryAction = noop,
  errorDisplayMode = 'replace',
  renderError,
  renderLoader,
  sheetBackgroundColor = '#FFFFFF',
  sheetBorderRadius = Platform.OS === 'ios' ? 38 : 28,
  sheetVisible,
  onSheetDismiss,
  showGrabber = true,
  backdropColor = 'rgba(0,0,0,0.4)',
  backdropBlur = 20,
}: WithViewStateProps) {
  const [dismissedType, setDismissedType] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Leaving the error state re-arms the sheet for the next error.
  useEffect(() => {
    if (!viewState.isError) setDismissedType(null);
  }, [viewState]);

  const errorState = viewState.isError ? viewState : undefined;
  const errorNode = errorState ? (renderError ? renderError(errorState, retryAction) : defaultError(errorState)) : null;
  const Blur = errorState && errorDisplayMode === 'bottomSheet' ? loadBlurView() : undefined;
  const loader = renderLoader ? renderLoader() : <ActivityIndicator />;

  const dismissSheet = () => {
    if (errorState) setDismissedType(errorState.type);
    onSheetDismiss?.();
  };

  const hideContent = errorDisplayMode === 'replace' && !!errorState;
  const content = isRefreshable ? (
    <ScrollView
      contentContainerStyle={styles.grow}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            try {
              await retryAction();
            } finally {
              setRefreshing(false);
            }
          }}
        />
      }
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <View style={styles.fill}>
      <View style={[styles.fill, hideContent && styles.hidden]}>{content}</View>

      {viewState.type === 'loading' ? <View style={styles.overlay}>{loader}</View> : null}
      {viewState.type === 'overlayLoading' ? (
        <View style={[styles.overlay, { backgroundColor: viewState.color }]}>{loader}</View>
      ) : null}

      {errorState && errorDisplayMode === 'replace' ? <View style={StyleSheet.absoluteFill}>{errorNode}</View> : null}

      {errorState && errorDisplayMode === 'bottomSheet' ? (
        <Modal
          transparent
          animationType="slide"
          visible={sheetVisible ?? dismissedType !== errorState.type}
          onRequestClose={dismissSheet}
        >
          <View style={styles.sheetRoot}>
            {/* Full-screen so the dim / blur also covers the area beside the rounded corners. */}
            <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: backdropColor }]} onPress={dismissSheet}>
              {Blur && backdropBlur > 0 ? (
                <Blur intensity={backdropBlur} tint="default" style={StyleSheet.absoluteFill} pointerEvents="none" />
              ) : null}
            </Pressable>
            <View
              style={[
                styles.sheet,
                { backgroundColor: sheetBackgroundColor, borderTopLeftRadius: sheetBorderRadius, borderTopRightRadius: sheetBorderRadius },
              ]}
            >
              {/* The shadow lives on the outer view; clipping to the radius happens here. */}
              <View style={{ flexGrow: 1, overflow: 'hidden', borderTopLeftRadius: sheetBorderRadius, borderTopRightRadius: sheetBorderRadius }}>
                {showGrabber ? <View style={styles.grabber} /> : null}
                {errorNode}
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
  hidden: { display: 'none' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    minHeight: 240,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 24,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, backgroundColor: 'rgba(128,128,128,0.45)' },
});
