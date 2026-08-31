/* ---------------------------------------------------------------
   WRITING PRACTICE CHARACTER SET
   ---------------------------------------------------------------
   >>> PLACEHOLDER SET — REPLACE WITH THE REAL HSK 1 LIST <<<

   This is a small starter set so the writing tab has something to
   practise on. Swap the array below for the full HSK 1 characters
   and everything downstream picks it up automatically:

     1. Edit this file only.
     2. Run `npm run build:strokes` to regenerate the stroke data.

   Shape of each entry (matches src/lib/seed.js naming):
     character   — a SINGLE hanzi. Stroke data is per-character, so
                   multi-character words like 你好 must be split into
                   separate entries (你, 好).
     pronunciation      — pinyin with tone marks
     definition         — English
     burmese_definition — Burmese
   --------------------------------------------------------------- */

export const writingChars = [
  { character: '一', pronunciation: 'yī', definition: 'one', burmese_definition: 'တစ်' },
  { character: '二', pronunciation: 'èr', definition: 'two', burmese_definition: 'နှစ်' },
  { character: '三', pronunciation: 'sān', definition: 'three', burmese_definition: 'သုံး' },
  { character: '人', pronunciation: 'rén', definition: 'person', burmese_definition: 'လူ' },
  { character: '大', pronunciation: 'dà', definition: 'big', burmese_definition: 'ကြီး' },
  { character: '小', pronunciation: 'xiǎo', definition: 'small', burmese_definition: 'သေး' },
  { character: '中', pronunciation: 'zhōng', definition: 'middle; China', burmese_definition: 'အလယ်; တရုတ်' },
  { character: '你', pronunciation: 'nǐ', definition: 'you', burmese_definition: 'မင်း; သင်' },
  { character: '好', pronunciation: 'hǎo', definition: 'good', burmese_definition: 'ကောင်း' },
  { character: '我', pronunciation: 'wǒ', definition: 'I; me', burmese_definition: 'ကျွန်တော်; ကျွန်မ' },
  { character: '是', pronunciation: 'shì', definition: 'to be; is', burmese_definition: 'ဖြစ်သည်' },
  { character: '不', pronunciation: 'bù', definition: 'not; no', burmese_definition: 'မဟုတ်' },
  { character: '日', pronunciation: 'rì', definition: 'sun; day', burmese_definition: 'နေ; ရက်' },
  { character: '月', pronunciation: 'yuè', definition: 'moon; month', burmese_definition: 'လ' },
  { character: '水', pronunciation: 'shuǐ', definition: 'water', burmese_definition: 'ရေ' },
  { character: '火', pronunciation: 'huǒ', definition: 'fire', burmese_definition: 'မီး' },
  { character: '木', pronunciation: 'mù', definition: 'tree; wood', burmese_definition: 'သစ်ပင်; သစ်သား' },
  { character: '山', pronunciation: 'shān', definition: 'mountain', burmese_definition: 'တောင်' },
  { character: '口', pronunciation: 'kǒu', definition: 'mouth', burmese_definition: 'ပါးစပ်' },
  { character: '手', pronunciation: 'shǒu', definition: 'hand', burmese_definition: 'လက်' },
  { character: '心', pronunciation: 'xīn', definition: 'heart', burmese_definition: 'နှလုံး' },
  { character: '女', pronunciation: 'nǚ', definition: 'woman', burmese_definition: 'အမျိုးသမီး' },
  { character: '子', pronunciation: 'zǐ', definition: 'child', burmese_definition: 'ကလေး' },
  { character: '天', pronunciation: 'tiān', definition: 'sky; day', burmese_definition: 'ကောင်းကင်; နေ့' }
];

/** Just the hanzi, for the stroke-data build script. */
export const writingCharList = writingChars.map((w) => w.character);
