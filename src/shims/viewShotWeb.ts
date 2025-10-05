// Web shim for react-native-view-shot to avoid bundling RN module in Vite web builds
// Provides minimal API surface for code paths that might import it.
export type CaptureOptions = { format?: 'png'|'jpg'; quality?: number };

export async function captureRef(_node: any, _opts?: CaptureOptions): Promise<string> {
  throw new Error('captureRef (react-native-view-shot) is not available on web. Use html2canvas-based capture instead.');
}

const ViewShot = () => null;
export default ViewShot;
