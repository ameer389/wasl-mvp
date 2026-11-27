const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

/** Converts Western digits (0-9) in a number or string to Arabic-Indic digits (٠-٩). */
export function toArabicDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)] ?? d);
}
