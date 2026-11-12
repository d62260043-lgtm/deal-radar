// Числа прописью по-русски — Silero не читает цифры.
const ONES_M = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_F = ['ноль', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function belowThousand(n, feminine) {
  const out = [];
  const h = Math.floor(n / 100), r = n % 100;
  if (h) out.push(HUNDREDS[h]);
  if (r >= 10 && r < 20) out.push(TEENS[r - 10]);
  else {
    const t = Math.floor(r / 10), o = r % 10;
    if (t) out.push(TENS[t]);
    if (o) out.push((feminine ? ONES_F : ONES_M)[o]);
  }
  return out.join(' ');
}

function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

function numWords(n) {
  n = Math.round(Number(n) || 0);
  if (n === 0) return 'ноль';
  if (n > 999999) return String(n);
  const parts = [];
  const thousands = Math.floor(n / 1000), rest = n % 1000;
  if (thousands) {
    parts.push(belowThousand(thousands, true));
    parts.push(plural(thousands, ['тысяча', 'тысячи', 'тысяч']));
  }
  if (rest) parts.push(belowThousand(rest, false));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

const rubles = n => numWords(n) + ' ' + plural(Math.round(Number(n) || 0), ['рубль', 'рубля', 'рублей']);
const percent = n => numWords(n) + ' ' + plural(Math.round(Number(n) || 0), ['процент', 'процента', 'процентов']);

module.exports = { numWords, rubles, percent, plural };
