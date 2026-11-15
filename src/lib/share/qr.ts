export interface QrMatrix {
  moduleCount: number;
  isDark: (row: number, col: number) => boolean;
}

export type QrErrorCorrectionLevel = "L" | "M" | "Q" | "H";

/**
 * Generates a QR code matrix for a given URL or text payload.
 * Uses Error Correction level 'M' (15% redundancy) or higher.
 * Loads qrcode-generator dynamically on demand per prompt guidelines.
 *
 * @param data The string to encode into the QR code
 * @param errorCorrectionLevel 'L' | 'M' | 'Q' | 'H' (defaults to 'M')
 */
export async function generateQrMatrix(
  data: string,
  errorCorrectionLevel: QrErrorCorrectionLevel = "M"
): Promise<QrMatrix> {
  const qrcodeMod = await import("qrcode-generator");
  // In ESM/CJS interop, qrcode-generator export = qrcode may be on .default or the module itself
  const qrcode = (
    typeof qrcodeMod === "function"
      ? qrcodeMod
      : (qrcodeMod as unknown as { default: typeof import("qrcode-generator") }).default || qrcodeMod
  ) as unknown as typeof import("qrcode-generator");

  const qr = qrcode(0, errorCorrectionLevel);
  qr.addData(data);
  qr.make();

  const moduleCount = qr.getModuleCount();

  return {
    moduleCount,
    isDark: (row: number, col: number): boolean => {
      if (row < 0 || row >= moduleCount || col < 0 || col >= moduleCount) {
        return false;
      }
      return qr.isDark(row, col);
    },
  };
}
