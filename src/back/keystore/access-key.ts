import crypto from 'crypto';


const KEY_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
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
  let key = '';

  while (true) {
    // Сбрасываем строку перед генерацией нового ключа
    key = '';

    for (let i = 0; i < KEY_LENGTH; i++) {
      const randomValue = crypto.randomInt(KEY_ALPHABET.length);
      key += KEY_ALPHABET[randomValue];
    }

    if (!exists(key)) {
      return key;
    }
  }
};


/**
 * Нормализует ключ, убирая заглавные буквы.
 * Проверяет длину и наличие допустимых символов.
 * Возвращает null при отсутствии корректного ключа.
 */
export const normalizeKey = (input: string): string | null => {
  if (!input || input.length === 0) {
    return null;
  }

  const upperStr = input.toUpperCase();

  // Проверяем все символы из KEY_ALPHABET
  for (let i = 0; i < upperStr.length; i++) {
    const character = upperStr.charAt(i);
    if (KEY_ALPHABET.indexOf(character) === -1) {
      return null;
    }
  }

  // Длина не должна отличаться от KEY_LENGTH
  if (upperStr.length !== KEY_LENGTH) {
    return null;
  }

  return upperStr;
};
