import TestRenderer, { act } from 'react-test-renderer';
import { mockWindow } from './mocks/react-native';
import { AppButton } from '../src/reusable/app-button';
import { UnderlinedButton } from '../src/reusable/underlined-button';
import { ErrorView } from '../src/reusable/error-view';
import { WithViewState } from '../src/reusable/with-view-state';
import { FontKey, FontRegistry } from '../src/design/font-helper';
import { ViewState } from '../src/helpers/view-state';

jest.mock('expo-blur', () => ({ BlurView: (p: any) => require('react').createElement('BlurView', p) }), { virtual: true });

const render = (el: JSX.Element) => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => { r = TestRenderer.create(el); });
  return r;
};
const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType('Text' as any).map((t) => t.props.children);
const flat = (style: any): any => Object.assign({}, ...[style].flat(5).filter(Boolean));

afterEach(() => { FontRegistry.clear(); mockWindow.width = 440; });

describe('AppButton', () => {
  it('filled: scales, presses, and shows shadow', () => {
    mockWindow.width = 484; // scale 1.1
    const onPress = jest.fn();
    const r = render(<AppButton.filled title="Go" onPress={onPress} width={100} shadowBlurRadius={4} shadowColor="#ff0000" testID="b" />);
    const p = r.root.findByType('Pressable' as any);
    const s = flat(p.props.style);
    expect(s.width).toBeCloseTo(110);
    expect(s.height).toBeCloseTo(55);
    expect(s.backgroundColor).toBe('#FFFFFF');
    expect(s.shadowRadius).toBeCloseTo(4.4);
    p.props.onPress();
    expect(onPress).toHaveBeenCalled();
  });

  it('filled disabled greys out and has no shadow', () => {
    const r = render(<AppButton.filled title="Go" isDisabled shadowBlurRadius={4} titleStyle={{ color: 'red' }} testID="b" />);
    const p = r.root.findByType('Pressable' as any);
    expect(p.props.disabled).toBe(true);
    expect(flat(p.props.style)).toMatchObject({ backgroundColor: '#E0E0E0', opacity: 0.6, width: '100%' });
    expect(flat(p.props.style).shadowRadius).toBeUndefined();
    expect(flat(r.root.findByType('Text' as any).props.style).color).toBe('#9E9E9E');
  });

  it('outlined: border, tint and disabled', () => {
    const a = render(<AppButton.outlined title="x" borderColor="#00ff00" backgroundColor="#ff0000" backgroundOpacity={0.5} testID="b" />);
    expect(flat(a.root.findByType('Pressable' as any).props.style)).toMatchObject({ borderColor: '#00ff00', borderWidth: 1.5, backgroundColor: '#ff000080' });
    const d = render(<AppButton.outlined title="x" isDisabled testID="b" />);
    expect(flat(d.root.findByType('Pressable' as any).props.style)).toMatchObject({ borderColor: '#BDBDBD', opacity: 0.5 });
    const n = render(<AppButton.outlined title="x" backgroundColor="red" testID="b" />);
    expect(flat(n.root.findByType('Pressable' as any).props.style).backgroundColor).toBe('red');
    const none = render(<AppButton.outlined title="x" testID="b" />);
    expect(flat(none.root.findByType('Pressable' as any).props.style).backgroundColor).toBeUndefined();
  });

  it('places icons leading / trailing / center', () => {
    for (const iconPosition of ['leading', 'trailing', 'center'] as const) {
      const r = render(<AppButton.filled title="T" icon={<Text2 />} iconPosition={iconPosition} labelPosition="leading" />);
      expect(r.root.findAllByType(Text2 as any)).toHaveLength(1);
      expect(texts(r)).toContain('T');
    }
  });
});
const Text2 = () => null;

describe('UnderlinedButton', () => {
  it('uses the registered font, the given style, or a plain fallback', () => {
    const press = jest.fn();
    let r = render(<UnderlinedButton title="Forgot" onPress={press} />);
    expect(flat(r.root.findByType('Text' as any).props.style)).toMatchObject({ fontSize: 14, textDecorationLine: 'underline' });
    r = render(<UnderlinedButton title="Forgot" onPress={press} color="red" />);
    expect(flat(r.root.findByType('Text' as any).props.style).color).toBe('red');

    FontRegistry.registerFont(FontKey.primary, 'Cairo');
    r = render(<UnderlinedButton title="Forgot" onPress={press} color="blue" />);
    expect(flat(r.root.findByType('Text' as any).props.style)).toMatchObject({ fontFamily: 'Cairo', color: 'blue' });
    r = render(<UnderlinedButton title="Forgot" onPress={press} />);
    expect(flat(r.root.findByType('Text' as any).props.style).fontFamily).toBe('Cairo');

    r = render(<UnderlinedButton title="Forgot" onPress={press} style={{ color: 'green' }} />);
    expect(flat(r.root.findByType('Text' as any).props.style).color).toBe('green');
    const pressable = r.root.findByType('Pressable' as any);
    pressable.props.onPress();
    expect(press).toHaveBeenCalled();
    expect(pressable.props.style.opacity ?? flat(pressable.props.style).opacity).toBe(1);
  });
});

describe('ErrorView', () => {
  it('renders title, message, image and retry', () => {
    const r = render(<ErrorView title="T" message="M" image={<Text2 />} retryButton={<Text2 />} backgroundColor="#eee" />);
    expect(texts(r)).toEqual(['T', 'M']);
    expect(r.root.findAllByType(Text2 as any)).toHaveLength(2);
    const bare = render(<ErrorView title="T" message="M" image={null} />);
    expect(bare.root.findAllByType(Text2 as any)).toHaveLength(0);
  });
});

describe('WithViewState', () => {
  const Child = () => <Text2 />;

  it('shows loaders', () => {
    const loading = render(<WithViewState viewState={ViewState.loading}><Child /></WithViewState>);
    expect(loading.root.findAllByType('ActivityIndicator' as any)).toHaveLength(1);
    const overlay = render(<WithViewState viewState={ViewState.overlayLoading('#00000040')} renderLoader={() => <Text2 />}><Child /></WithViewState>);
    expect(overlay.root.findAllByType(Child)).toHaveLength(1);
    expect(overlay.root.findAllByType('ActivityIndicator' as any)).toHaveLength(0);
    const loaded = render(<WithViewState viewState={ViewState.loaded}><Child /></WithViewState>);
    expect(loaded.root.findAllByType('ActivityIndicator' as any)).toHaveLength(0);
  });

  it('replace mode hides content and renders default or custom errors', () => {
    const r = render(<WithViewState viewState={ViewState.noNetwork()}><Child /></WithViewState>);
    expect(texts(r)).toContain('No Network');
    expect(flat(r.root.findAllByType('View' as any)[1].props.style).display).toBe('none');

    const custom = render(<WithViewState viewState={ViewState.customError({ title: 'Hey', message: 'There' })}><Child /></WithViewState>);
    expect(texts(custom)).toEqual(['Hey', 'There']);

    const retry = jest.fn();
    const rendered = jest.fn((_state: any, _retry: () => void) => <Text2 />);
    render(<WithViewState viewState={ViewState.serverError()} retryAction={retry} renderError={rendered}><Child /></WithViewState>);
    expect(rendered.mock.calls[0][0].type).toBe('serverError');
    rendered.mock.calls[0][1]();
    expect(retry).toHaveBeenCalled();
  });

  it('falls back to the unexpected-error texts for unknown types', () => {
    const r = render(<WithViewState viewState={{ type: 'mystery', isError: true } as any}><Child /></WithViewState>);
    expect(texts(r)).toContain('Unexpected Error');
  });

  it('bottom sheet keeps content visible and can be dismissed until the error changes', () => {
    const r = render(<WithViewState viewState={ViewState.noData()} errorDisplayMode="bottomSheet"><Child /></WithViewState>);
    expect(r.root.findAllByType('Modal' as any)).toHaveLength(1);
    expect(r.root.findAllByType(Child)).toHaveLength(1);
    const backdrop = flat(r.root.findByType('Pressable' as any).props.style);
    expect(backdrop.backgroundColor).toBe('rgba(0,0,0,0.4)');
    expect(r.root.findByType('BlurView' as any).props.intensity).toBe(20);
    const sheet = flat(r.root.findByType('Modal' as any).findAllByType('View' as any).find((v) => flat(v.props.style).minHeight)!.props.style);
    expect(sheet.borderTopLeftRadius).toBe(28);
    act(() => { r.root.findByType('Pressable' as any).props.onPress(); });
    expect(r.root.findAllByType('Modal' as any)).toHaveLength(0);
    act(() => { r.update(<WithViewState viewState={ViewState.loaded} errorDisplayMode="bottomSheet"><Child /></WithViewState>); });
    act(() => { r.update(<WithViewState viewState={ViewState.noData()} errorDisplayMode="bottomSheet"><Child /></WithViewState>); });
    expect(r.root.findAllByType('Modal' as any)).toHaveLength(1);
    act(() => { r.root.findByType('Modal' as any).props.onRequestClose(); });
    expect(r.root.findAllByType('Modal' as any)).toHaveLength(0);
  });

  it('backdrop blur can be disabled and colour changed', () => {
    const r = render(<WithViewState viewState={ViewState.noData()} errorDisplayMode="bottomSheet" backdropBlur={0} backdropColor="red"><Child /></WithViewState>);
    expect(r.root.findAllByType('BlurView' as any)).toHaveLength(0);
    expect(flat(r.root.findByType('Pressable' as any).props.style).backgroundColor).toBe('red');
  });

  it('pull to refresh calls retryAction and toggles refreshing', async () => {
    let resolve!: () => void;
    const retry = jest.fn(() => new Promise<void>((res) => { resolve = res; }));
    const r = render(<WithViewState viewState={ViewState.loaded} isRefreshable retryAction={retry}><Child /></WithViewState>);
    let p!: Promise<void>;
    act(() => { p = r.root.findByType('RefreshControl' as any).props.onRefresh(); });
    expect(r.root.findByType('RefreshControl' as any).props.refreshing).toBe(true);
    await act(async () => { resolve(); await p; });
    expect(r.root.findByType('RefreshControl' as any).props.refreshing).toBe(false);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
