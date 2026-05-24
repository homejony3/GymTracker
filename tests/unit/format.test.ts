import { describe, it, expect } from 'vitest';
import {
  formatWeight,
  formatDate,
  formatTime,
  parseWeightInput,
  validateWeightInput,
} from '@/services/format.service';

describe('FormatService', () => {
  describe('formatWeight', () => {
    it('formats integer weight with comma decimal and kg suffix', () => {
      expect(formatWeight(72)).toBe('72,0 kg');
    });

    it('formats decimal weight with comma separator', () => {
      expect(formatWeight(72.5)).toBe('72,5 kg');
    });

    it('formats zero weight', () => {
      expect(formatWeight(0)).toBe('0,0 kg');
    });

    it('formats max weight', () => {
      expect(formatWeight(500)).toBe('500,0 kg');
    });

    it('formats weight with trailing zero', () => {
      expect(formatWeight(100.0)).toBe('100,0 kg');
    });
  });

  describe('formatDate', () => {
    it('formats date in DD.MM.YYYY with zero-padding', () => {
      expect(formatDate(new Date(2024, 0, 5))).toBe('05.01.2024');
    });

    it('formats date with double-digit day and month', () => {
      expect(formatDate(new Date(2024, 11, 25))).toBe('25.12.2024');
    });

    it('formats first day of year', () => {
      expect(formatDate(new Date(2024, 0, 1))).toBe('01.01.2024');
    });

    it('formats last day of year', () => {
      expect(formatDate(new Date(2024, 11, 31))).toBe('31.12.2024');
    });
  });

  describe('formatTime', () => {
    it('formats midnight as 00:00', () => {
      expect(formatTime(new Date(2024, 0, 1, 0, 0))).toBe('00:00');
    });

    it('formats noon as 12:00', () => {
      expect(formatTime(new Date(2024, 0, 1, 12, 0))).toBe('12:00');
    });

    it('formats time with zero-padded hours and minutes', () => {
      expect(formatTime(new Date(2024, 0, 1, 9, 5))).toBe('09:05');
    });

    it('formats end of day as 23:59', () => {
      expect(formatTime(new Date(2024, 0, 1, 23, 59))).toBe('23:59');
    });
  });

  describe('parseWeightInput', () => {
    it('parses integer input', () => {
      expect(parseWeightInput('72')).toBe(72);
    });

    it('parses dot decimal input', () => {
      expect(parseWeightInput('72.5')).toBe(72.5);
    });

    it('parses comma decimal input', () => {
      expect(parseWeightInput('72,5')).toBe(72.5);
    });

    it('returns same value for comma and dot', () => {
      expect(parseWeightInput('72,5')).toBe(parseWeightInput('72.5'));
    });

    it('returns null for empty string', () => {
      expect(parseWeightInput('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(parseWeightInput('   ')).toBeNull();
    });

    it('returns null for multiple dots', () => {
      expect(parseWeightInput('72.5.3')).toBeNull();
    });

    it('returns null for multiple commas', () => {
      expect(parseWeightInput('72,5,3')).toBeNull();
    });

    it('returns null for mixed separators', () => {
      expect(parseWeightInput('72.5,3')).toBeNull();
    });

    it('returns null for non-numeric characters', () => {
      expect(parseWeightInput('72kg')).toBeNull();
    });

    it('returns null for letters', () => {
      expect(parseWeightInput('abc')).toBeNull();
    });

    it('returns null for negative sign', () => {
      expect(parseWeightInput('-5')).toBeNull();
    });

    it('trims whitespace before parsing', () => {
      expect(parseWeightInput(' 72,5 ')).toBe(72.5);
    });
  });

  describe('validateWeightInput', () => {
    it('validates a correct integer weight', () => {
      expect(validateWeightInput('72')).toEqual({ valid: true });
    });

    it('validates a correct decimal weight with dot', () => {
      expect(validateWeightInput('72.5')).toEqual({ valid: true });
    });

    it('validates a correct decimal weight with comma', () => {
      expect(validateWeightInput('72,5')).toEqual({ valid: true });
    });

    it('rejects empty input', () => {
      const result = validateWeightInput('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects multiple separators', () => {
      const result = validateWeightInput('72.5.3');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects non-numeric characters', () => {
      const result = validateWeightInput('72kg');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects weight below minimum (negative)', () => {
      const result = validateWeightInput('-1');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects weight above maximum', () => {
      const result = validateWeightInput('501');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('accepts zero weight', () => {
      expect(validateWeightInput('0')).toEqual({ valid: true });
    });

    it('accepts max weight', () => {
      expect(validateWeightInput('500')).toEqual({ valid: true });
    });
  });
});
