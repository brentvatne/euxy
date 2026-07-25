/**
 * The pure QR encoder inside node-qrcode — imported directly because the
 * package's main entry drags in node-only renderers (fs/stream) that Metro
 * can't bundle. Same import react-native-qrcode-svg relies on.
 */
declare module 'qrcode/lib/core/qrcode' {
  export interface QRBitMatrix {
    size: number;
    get(row: number, col: number): number;
  }
  export interface QRCodeModel {
    version: number;
    modules: QRBitMatrix;
  }
  export interface QRByteSegment {
    data: Uint8Array;
    mode: 'byte';
  }
  export function create(
    data: string | QRByteSegment[],
    options: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' },
  ): QRCodeModel;
}
