/* ---------------------------------------------------------------
   COMMON RADICALS (部首)
   ---------------------------------------------------------------
   The building blocks characters are assembled from. Knowing a
   radical often gives away the meaning family of a character it
   appears in — 氵 (water) shows up in 河 river, 海 sea, 洗 to wash.

   Each entry:
     radical   — the component as written when used inside a character
     standalone— the standalone form, when it differs (氵 -> 水). null if same.
     pinyin    — pronunciation of the radical's name
     meaning   — English
     burmese   — Burmese
     strokes   — stroke count
     examples  — characters that contain it, with pinyin + English
     category  — grouping used by the filter chips in the UI
   --------------------------------------------------------------- */

export const radicalCategories = ['Nature', 'People', 'Body', 'Objects', 'Actions'];

export const radicals = [
  {
    radical: '氵', standalone: '水', pinyin: 'shuǐ', meaning: 'water', burmese: 'ရေ',
    strokes: 3, category: 'Nature',
    examples: [
      { char: '河', pinyin: 'hé', english: 'river' },
      { char: '海', pinyin: 'hǎi', english: 'sea' },
      { char: '洗', pinyin: 'xǐ', english: 'to wash' }
    ]
  },
  {
    radical: '木', standalone: null, pinyin: 'mù', meaning: 'tree, wood', burmese: 'သစ်ပင်',
    strokes: 4, category: 'Nature',
    examples: [
      { char: '林', pinyin: 'lín', english: 'woods' },
      { char: '树', pinyin: 'shù', english: 'tree' },
      { char: '桌', pinyin: 'zhuō', english: 'table' }
    ]
  },
  {
    radical: '火', standalone: null, pinyin: 'huǒ', meaning: 'fire', burmese: 'မီး',
    strokes: 4, category: 'Nature',
    examples: [
      { char: '烧', pinyin: 'shāo', english: 'to burn' },
      { char: '灯', pinyin: 'dēng', english: 'lamp' },
      { char: '热', pinyin: 'rè', english: 'hot' }
    ]
  },
  {
    radical: '土', standalone: null, pinyin: 'tǔ', meaning: 'earth, soil', burmese: 'မြေ',
    strokes: 3, category: 'Nature',
    examples: [
      { char: '地', pinyin: 'dì', english: 'ground' },
      { char: '场', pinyin: 'chǎng', english: 'field' },
      { char: '城', pinyin: 'chéng', english: 'city' }
    ]
  },
  {
    radical: '日', standalone: null, pinyin: 'rì', meaning: 'sun, day', burmese: 'နေ',
    strokes: 4, category: 'Nature',
    examples: [
      { char: '明', pinyin: 'míng', english: 'bright' },
      { char: '时', pinyin: 'shí', english: 'time' },
      { char: '早', pinyin: 'zǎo', english: 'early' }
    ]
  },
  {
    radical: '月', standalone: null, pinyin: 'yuè', meaning: 'moon, month', burmese: 'လ',
    strokes: 4, category: 'Nature',
    examples: [
      { char: '朋', pinyin: 'péng', english: 'friend' },
      { char: '期', pinyin: 'qī', english: 'period' },
      { char: '朝', pinyin: 'zhāo', english: 'morning' }
    ]
  },
  {
    radical: '山', standalone: null, pinyin: 'shān', meaning: 'mountain', burmese: 'တောင်',
    strokes: 3, category: 'Nature',
    examples: [
      { char: '岛', pinyin: 'dǎo', english: 'island' },
      { char: '峰', pinyin: 'fēng', english: 'peak' },
      { char: '岁', pinyin: 'suì', english: 'years old' }
    ]
  },
  {
    radical: '雨', standalone: null, pinyin: 'yǔ', meaning: 'rain', burmese: 'မိုး',
    strokes: 8, category: 'Nature',
    examples: [
      { char: '雪', pinyin: 'xuě', english: 'snow' },
      { char: '雷', pinyin: 'léi', english: 'thunder' },
      { char: '零', pinyin: 'líng', english: 'zero' }
    ]
  },
  {
    radical: '艹', standalone: '草', pinyin: 'cǎo', meaning: 'grass, plant', burmese: 'မြက်',
    strokes: 3, category: 'Nature',
    examples: [
      { char: '花', pinyin: 'huā', english: 'flower' },
      { char: '茶', pinyin: 'chá', english: 'tea' },
      { char: '菜', pinyin: 'cài', english: 'vegetable' }
    ]
  },
  {
    radical: '亻', standalone: '人', pinyin: 'rén', meaning: 'person', burmese: 'လူ',
    strokes: 2, category: 'People',
    examples: [
      { char: '你', pinyin: 'nǐ', english: 'you' },
      { char: '他', pinyin: 'tā', english: 'he' },
      { char: '休', pinyin: 'xiū', english: 'to rest' }
    ]
  },
  {
    radical: '女', standalone: null, pinyin: 'nǚ', meaning: 'woman', burmese: 'အမျိုးသမီး',
    strokes: 3, category: 'People',
    examples: [
      { char: '妈', pinyin: 'mā', english: 'mother' },
      { char: '好', pinyin: 'hǎo', english: 'good' },
      { char: '姐', pinyin: 'jiě', english: 'older sister' }
    ]
  },
  {
    radical: '子', standalone: null, pinyin: 'zǐ', meaning: 'child', burmese: 'ကလေး',
    strokes: 3, category: 'People',
    examples: [
      { char: '学', pinyin: 'xué', english: 'to study' },
      { char: '孩', pinyin: 'hái', english: 'child' },
      { char: '字', pinyin: 'zì', english: 'character' }
    ]
  },
  {
    radical: '父', standalone: null, pinyin: 'fù', meaning: 'father', burmese: 'အဖေ',
    strokes: 4, category: 'People',
    examples: [
      { char: '爸', pinyin: 'bà', english: 'dad' },
      { char: '爷', pinyin: 'yé', english: 'grandfather' }
    ]
  },
  {
    radical: '口', standalone: null, pinyin: 'kǒu', meaning: 'mouth', burmese: 'ပါးစပ်',
    strokes: 3, category: 'Body',
    examples: [
      { char: '吃', pinyin: 'chī', english: 'to eat' },
      { char: '喝', pinyin: 'hē', english: 'to drink' },
      { char: '叫', pinyin: 'jiào', english: 'to call' }
    ]
  },
  {
    radical: '心', standalone: null, pinyin: 'xīn', meaning: 'heart, mind', burmese: 'နှလုံး',
    strokes: 4, category: 'Body',
    examples: [
      { char: '想', pinyin: 'xiǎng', english: 'to think' },
      { char: '忙', pinyin: 'máng', english: 'busy' },
      { char: '爱', pinyin: 'ài', english: 'love' }
    ]
  },
  {
    radical: '扌', standalone: '手', pinyin: 'shǒu', meaning: 'hand', burmese: 'လက်',
    strokes: 3, category: 'Body',
    examples: [
      { char: '打', pinyin: 'dǎ', english: 'to hit' },
      { char: '找', pinyin: 'zhǎo', english: 'to look for' },
      { char: '推', pinyin: 'tuī', english: 'to push' }
    ]
  },
  {
    radical: '目', standalone: null, pinyin: 'mù', meaning: 'eye', burmese: 'မျက်လုံး',
    strokes: 5, category: 'Body',
    examples: [
      { char: '看', pinyin: 'kàn', english: 'to look' },
      { char: '眼', pinyin: 'yǎn', english: 'eye' },
      { char: '睡', pinyin: 'shuì', english: 'to sleep' }
    ]
  },
  {
    radical: '足', standalone: null, pinyin: 'zú', meaning: 'foot', burmese: 'ခြေထောက်',
    strokes: 7, category: 'Body',
    examples: [
      { char: '跑', pinyin: 'pǎo', english: 'to run' },
      { char: '跳', pinyin: 'tiào', english: 'to jump' },
      { char: '路', pinyin: 'lù', english: 'road' }
    ]
  },
  {
    radical: '耳', standalone: null, pinyin: 'ěr', meaning: 'ear', burmese: 'နား',
    strokes: 6, category: 'Body',
    examples: [
      { char: '听', pinyin: 'tīng', english: 'to listen' },
      { char: '闻', pinyin: 'wén', english: 'to hear' }
    ]
  },
  {
    radical: '宀', standalone: null, pinyin: 'mián', meaning: 'roof', burmese: 'အမိုး',
    strokes: 3, category: 'Objects',
    examples: [
      { char: '家', pinyin: 'jiā', english: 'home' },
      { char: '安', pinyin: 'ān', english: 'peace' },
      { char: '室', pinyin: 'shì', english: 'room' }
    ]
  },
  {
    radical: '门', standalone: null, pinyin: 'mén', meaning: 'door, gate', burmese: 'တံခါး',
    strokes: 3, category: 'Objects',
    examples: [
      { char: '问', pinyin: 'wèn', english: 'to ask' },
      { char: '间', pinyin: 'jiān', english: 'between' },
      { char: '闭', pinyin: 'bì', english: 'to close' }
    ]
  },
  {
    radical: '车', standalone: null, pinyin: 'chē', meaning: 'vehicle', burmese: 'ကား',
    strokes: 4, category: 'Objects',
    examples: [
      { char: '轮', pinyin: 'lún', english: 'wheel' },
      { char: '较', pinyin: 'jiào', english: 'compare' },
      { char: '转', pinyin: 'zhuǎn', english: 'to turn' }
    ]
  },
  {
    radical: '钅', standalone: '金', pinyin: 'jīn', meaning: 'metal, gold', burmese: 'သတ္တု; ရွှေ',
    strokes: 5, category: 'Objects',
    examples: [
      { char: '钱', pinyin: 'qián', english: 'money' },
      { char: '银', pinyin: 'yín', english: 'silver' },
      { char: '钟', pinyin: 'zhōng', english: 'clock' }
    ]
  },
  {
    radical: '衤', standalone: '衣', pinyin: 'yī', meaning: 'clothing', burmese: 'အဝတ်အထည်',
    strokes: 5, category: 'Objects',
    examples: [
      { char: '衬', pinyin: 'chèn', english: 'shirt' },
      { char: '裙', pinyin: 'qún', english: 'skirt' },
      { char: '袜', pinyin: 'wà', english: 'socks' }
    ]
  },
  {
    radical: '食', standalone: null, pinyin: 'shí', meaning: 'food, eat', burmese: 'အစားအစာ',
    strokes: 9, category: 'Objects',
    examples: [
      { char: '饭', pinyin: 'fàn', english: 'rice, meal' },
      { char: '饿', pinyin: 'è', english: 'hungry' },
      { char: '馆', pinyin: 'guǎn', english: 'restaurant' }
    ]
  },
  {
    radical: '米', standalone: null, pinyin: 'mǐ', meaning: 'rice', burmese: 'ဆန်',
    strokes: 6, category: 'Objects',
    examples: [
      { char: '粉', pinyin: 'fěn', english: 'powder' },
      { char: '糖', pinyin: 'táng', english: 'sugar' },
      { char: '粥', pinyin: 'zhōu', english: 'porridge' }
    ]
  },
  {
    radical: '讠', standalone: '言', pinyin: 'yán', meaning: 'speech, words', burmese: 'စကား',
    strokes: 2, category: 'Actions',
    examples: [
      { char: '说', pinyin: 'shuō', english: 'to speak' },
      { char: '话', pinyin: 'huà', english: 'speech' },
      { char: '语', pinyin: 'yǔ', english: 'language' }
    ]
  },
  {
    radical: '辶', standalone: null, pinyin: 'chuò', meaning: 'walk, movement', burmese: 'သွားလာ',
    strokes: 3, category: 'Actions',
    examples: [
      { char: '进', pinyin: 'jìn', english: 'to enter' },
      { char: '还', pinyin: 'huán', english: 'to return' },
      { char: '这', pinyin: 'zhè', english: 'this' }
    ]
  },
  {
    radical: '彳', standalone: null, pinyin: 'chì', meaning: 'step, go', burmese: 'လမ်းလျှောက်',
    strokes: 3, category: 'Actions',
    examples: [
      { char: '很', pinyin: 'hěn', english: 'very' },
      { char: '得', pinyin: 'dé', english: 'to get' },
      { char: '往', pinyin: 'wǎng', english: 'toward' }
    ]
  },
  {
    radical: '力', standalone: null, pinyin: 'lì', meaning: 'strength, power', burmese: 'အား',
    strokes: 2, category: 'Actions',
    examples: [
      { char: '动', pinyin: 'dòng', english: 'to move' },
      { char: '努', pinyin: 'nǔ', english: 'to strive' },
      { char: '加', pinyin: 'jiā', english: 'to add' }
    ]
  },
  {
    radical: '刀', standalone: null, pinyin: 'dāo', meaning: 'knife', burmese: 'ဓား',
    strokes: 2, category: 'Actions',
    examples: [
      { char: '分', pinyin: 'fēn', english: 'to divide' },
      { char: '切', pinyin: 'qiē', english: 'to cut' },
      { char: '到', pinyin: 'dào', english: 'to arrive' }
    ]
  },
  {
    radical: '见', standalone: null, pinyin: 'jiàn', meaning: 'to see', burmese: 'မြင်သည်',
    strokes: 4, category: 'Actions',
    examples: [
      { char: '现', pinyin: 'xiàn', english: 'present' },
      { char: '视', pinyin: 'shì', english: 'to view' },
      { char: '观', pinyin: 'guān', english: 'to observe' }
    ]
  }
];
