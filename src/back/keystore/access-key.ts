import crypto from 'crypto';


// Printable ASCII characters from 33 to 126 inclusive (no space). dtype: string
const KEY_ALPHABET = Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i)).join('');
// Fixed key length
const KEY_LENGTH = 8;

export { KEY_ALPHABET, KEY_LENGTH };


/**
 * Генерирует уникальный доступный ключ доступа.
 * Проверяет существующие ключи через функцию exists,
 * пока не сгенерирует свободный ключ.
 */
export const generateKey = (
  exists: (key: string) => boolean
): string => {
  while (true) {
    let key = '';
    for (let i = 0; i < KEY_LENGTH; i++) {
      const idx = crypto.randomInt(KEY_ALPHABET.length);
      key += KEY_ALPHABET[idx];
    }
    if (!exists(key)) {
      return key;
    }
  }
};

/**
 * Нормализует ключ: удаляет ведущие/завершающие пробелы,
 * проверяет наличие только допустимых символов из KEY_ALPHABET
 * и ровную длину. Пробел внутри считается недопустимым.
 * При входном значении преобразует к строке.
 */
export const normalizeKey = (input: unknown): string | null => {
  const str = String(input).trim();
  if (str.length !== KEY_LENGTH) {
    return null;
  }
  // Переводим строку в массив символов
  for (const ch of str) {
    if (ch === ' ') return null; // внутренняя пробел
    if (KEY_ALPHABET.indexOf(ch) === -1) return null;
  }
  return str;
};