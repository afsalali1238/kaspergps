// Tracker identifier rules (spec 11.9).
// IMEI: 15 digits with a valid Luhn check digit. SIM ICCID: 19–20 digits starting `89`.
// Kept dependency-free so it can be unit tested and shared by the console, the
// import page and the booking/onboarding flows.

/** Standard Luhn: double every second digit from the right (the check digit is not doubled). */
export function luhnValid(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  if (digits.length < 2) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = parseInt(digits[i], 10);
    const fromRight = digits.length - i; // 1-based position from the right
    if (fromRight % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** 15 digits, digits only, valid Luhn check digit. */
export function isValidImei(imei: string): boolean {
  const digits = imei.replace(/\D/g, '');
  if (!/^\d{15}$/.test(imei.trim())) return false;
  return luhnValid(digits);
}

/** SIM ICCID: 19–20 digits, starting `89`. */
export function isValidIccid(iccid: string): boolean {
  const trimmed = iccid.trim();
  if (!/^\d{19,20}$/.test(trimmed)) return false;
  return trimmed.startsWith('89');
}

/** Last Luhn check digit for a 14-digit IMEI body (used to generate demo IMEIs). */
export function imeiCheckDigit(body14: string): number {
  const digits = body14.replace(/\D/g, '');
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = parseInt(digits[i], 10);
    // In the final 15-digit number this position sits one place further left,
    // so it is doubled when its position from the right is even.
    const fromRight = digits.length - i + 1;
    if (fromRight % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

/** Build a valid 15-digit demo IMEI from a 14-digit body. */
export function makeImei(body14: string): string {
  return body14 + String(imeiCheckDigit(body14));
}

export const IMEI_ERROR = "This IMEI isn't valid — check the last digit.";
export const IMEI_DUPLICATE_ERROR = 'This IMEI is already registered.';
export const ICCID_ERROR = 'Enter the SIM number printed on the card (19–20 digits).';
