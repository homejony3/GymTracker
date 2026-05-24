import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  formatWeight,
  formatDate,
  formatTime,
  parseWeightInput,
} from '@/services/format.service';

describe('FormatService - Property Tests', () => {
  /**
   * Property 16: Weight formatting (EU locale)
   * For any number in [0.0, 500.0], formatWeight should produce a string
   * matching /^\d+,\d kg$/ — comma separator, 1 decimal place, "kg" suffix.
   *
   * **Validates: Requirements 4.6, 8.1**
   */
  describe('Property 16: Weight formatting (EU locale)', () => {
    it('should format any weight in [0.0, 500.0] with comma separator, 1 decimal, and "kg" suffix', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.0, max: 500.0, noNaN: true, noDefaultInfinity: true }),
          (weight) => {
            const result = formatWeight(weight);
            // Must match: digits, comma, single digit, space, "kg"
            expect(result).toMatch(/^\d+,\d kg$/);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 17: Date formatting (EU locale)
   * For any valid Date, formatDate should produce a string matching
   * /^\d{2}\.\d{2}\.\d{4}$/ — DD.MM.YYYY pattern.
   *
   * **Validates: Requirements 5.6, 8.2**
   */
  describe('Property 17: Date formatting (EU locale)', () => {
    it('should format any valid date as DD.MM.YYYY', () => {
      fc.assert(
        fc.property(
          fc.date({
            min: new Date(1970, 0, 1),
            max: new Date(2099, 11, 31),
          }),
          (date) => {
            const result = formatDate(date);
            // Must match DD.MM.YYYY pattern
            expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);

            // Verify day is valid (01-31)
            const day = parseInt(result.substring(0, 2), 10);
            expect(day).toBeGreaterThanOrEqual(1);
            expect(day).toBeLessThanOrEqual(31);

            // Verify month is valid (01-12)
            const month = parseInt(result.substring(3, 5), 10);
            expect(month).toBeGreaterThanOrEqual(1);
            expect(month).toBeLessThanOrEqual(12);

            // Verify year is 4 digits
            const year = parseInt(result.substring(6, 10), 10);
            expect(year).toBeGreaterThanOrEqual(1970);
            expect(year).toBeLessThanOrEqual(2099);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 18: Weight input parsing equivalence
   * For any valid weight number, parseWeightInput with comma and dot
   * separators should return the same value.
   *
   * **Validates: Requirements 8.3**
   */
  describe('Property 18: Weight input parsing equivalence', () => {
    it('should parse comma and dot decimal inputs to the same numeric value', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 500 }),
          fc.integer({ min: 0, max: 9 }),
          (whole, decimal) => {
            const dotInput = `${whole}.${decimal}`;
            const commaInput = `${whole},${decimal}`;

            const dotResult = parseWeightInput(dotInput);
            const commaResult = parseWeightInput(commaInput);

            // Both should parse successfully
            expect(dotResult).not.toBeNull();
            expect(commaResult).not.toBeNull();

            // Both should produce the same value
            expect(dotResult).toBe(commaResult);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 19: Time formatting (24-hour)
   * For any valid Date, formatTime should produce a string matching
   * /^\d{2}:\d{2}$/ with hours 00-23 and minutes 00-59.
   *
   * **Validates: Requirements 8.4**
   */
  describe('Property 19: Time formatting (24-hour)', () => {
    it('should format any valid time as HH:MM with hours 00-23 and minutes 00-59', () => {
      fc.assert(
        fc.property(
          fc.date({
            min: new Date(1970, 0, 1),
            max: new Date(2099, 11, 31),
          }),
          (date) => {
            const result = formatTime(date);
            // Must match HH:MM pattern
            expect(result).toMatch(/^\d{2}:\d{2}$/);

            // Verify hours are valid (00-23)
            const hours = parseInt(result.substring(0, 2), 10);
            expect(hours).toBeGreaterThanOrEqual(0);
            expect(hours).toBeLessThanOrEqual(23);

            // Verify minutes are valid (00-59)
            const minutes = parseInt(result.substring(3, 5), 10);
            expect(minutes).toBeGreaterThanOrEqual(0);
            expect(minutes).toBeLessThanOrEqual(59);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 20: Malformed weight input rejection
   * For any string with multiple separators or non-numeric chars,
   * parseWeightInput should return null.
   *
   * **Validates: Requirements 8.5**
   */
  describe('Property 20: Malformed weight input rejection', () => {
    it('should reject inputs with multiple decimal separators', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 999 }),
          fc.integer({ min: 0, max: 9 }),
          fc.integer({ min: 0, max: 9 }),
          fc.constantFrom('.', ','),
          fc.constantFrom('.', ','),
          (whole, dec1, dec2, sep1, sep2) => {
            // Create input with multiple separators
            const input = `${whole}${sep1}${dec1}${sep2}${dec2}`;
            const result = parseWeightInput(input);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject inputs with non-numeric characters', () => {
      fc.assert(
        fc.property(
          fc.stringOf(
            fc.oneof(
              fc.constant('a'), fc.constant('b'), fc.constant('k'),
              fc.constant('g'), fc.constant('!'), fc.constant('@'),
              fc.constant('#'), fc.constant('-'), fc.constant('+'),
              fc.constant(' '), fc.constant('e'), fc.constant('x')
            ),
            { minLength: 1, maxLength: 5 }
          ),
          fc.integer({ min: 0, max: 99 }),
          (nonNumeric, num) => {
            // Mix non-numeric chars with a number
            const input = `${num}${nonNumeric}`;
            const trimmed = input.trim();
            // Only test if the trimmed result is non-empty and contains non-numeric chars
            if (trimmed.length > 0 && !/^[\d.,]+$/.test(trimmed)) {
              const result = parseWeightInput(input);
              expect(result).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
