/**
 * Normalize an Indian phone number.
 *
 * Steps (in order):
 *   1. Strip whitespace, hyphens, and backticks
 *   2. If it already begins with '+', keep it as-is
 *   3. Otherwise, strip any leading '0' digits
 *   4. Prefix with '+91'
 *
 * Returns { phone, fixed }:
 *   - phone: the cleaned string (or original if input was empty/non-string)
 *   - fixed: true if the value went through the normalization pipeline,
 *            false if there was no phone to fix
 */
function fixPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    return { phone, fixed: false };
  }

  const cleanedChars = phone.replace(/[\s\-`]/g, '');
  if (!cleanedChars) {
    return { phone, fixed: false };
  }

  if (cleanedChars.startsWith('+')) {
    return { phone: cleanedChars, fixed: true };
  }

  const withoutLeadingZeros = cleanedChars.replace(/^0+/, '');
  if (!withoutLeadingZeros) {
    return { phone, fixed: false };
  }

  return { phone: `+91${withoutLeadingZeros}`, fixed: true };
}

module.exports = { fixPhoneNumber };
