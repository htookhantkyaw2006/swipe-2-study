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
     examples  — characters that contain it, shown in the detail sheet
     quizChars — HELD BACK from the sheet, used only by the drill, so a
                 decode question shows a character the learner has not
                 just been handed the answer to. Every one is a character
                 where the radical genuinely predicts the meaning; where
                 it does not (月 doubles as the flesh radical, 门 is
                 mostly phonetic in simplified) the list is empty on
                 purpose and the drill asks about it a different way.
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
    ],
    quizChars: [
      { char: '湖', pinyin: 'hú', english: 'lake' },
      { char: '江', pinyin: 'jiāng', english: 'river' },
      { char: '汤', pinyin: 'tāng', english: 'soup' }
    ]
  },
  {
    radical: '木', standalone: null, pinyin: 'mù', meaning: 'tree, wood', burmese: 'သစ်ပင်',
    strokes: 4, category: 'Nature',
    examples: [
      { char: '林', pinyin: 'lín', english: 'woods' },
      { char: '树', pinyin: 'shù', english: 'tree' },
      { char: '桌', pinyin: 'zhuō', english: 'table' }
    ],
    quizChars: [
      { char: '松', pinyin: 'sōng', english: 'pine tree' },
      { char: '椅', pinyin: 'yǐ', english: 'chair' },
      { char: '板', pinyin: 'bǎn', english: 'board, plank' }
    ]
  },
  {
    radical: '火', standalone: null, pinyin: 'huǒ', meaning: 'fire', burmese: 'မီး',
    strokes: 4, category: 'Nature',
    examples: [
      { char: '烧', pinyin: 'shāo', english: 'to burn' },
      { char: '灯', pinyin: 'dēng', english: 'lamp' },
      { char: '热', pinyin: 'rè', english: 'hot' }
    ],
    quizChars: [
      { char: '烟', pinyin: 'yān', english: 'smoke' },
      { char: '炒', pinyin: 'chǎo', english: 'to stir-fry' },
      { char: '炉', pinyin: 'lú', english: 'stove' }
    ]
  },
  {
    radical: '土', standalone: null, pinyin: 'tǔ', meaning: 'earth, soil', burmese: 'မြေ',
    strokes: 3, category: 'Nature',
    examples: [
      { char: '地', pinyin: 'dì', english: 'ground' },
      { char: '场', pinyin: 'chǎng', english: 'field' },
      { char: '城', pinyin: 'chéng', english: 'city' }
    ],
    quizChars: [
      { char: '墙', pinyin: 'qiáng', english: 'wall' },
      { char: '块', pinyin: 'kuài', english: 'lump, piece' },
      { char: '坑', pinyin: 'kēng', english: 'pit, hole' }
    ]
  },
  {
    radical: '日', standalone: null, pinyin: 'rì', meaning: 'sun, day', burmese: 'နေ',
    strokes: 4, category: 'Nature',
    examples: [
      { char: '明', pinyin: 'míng', english: 'bright' },
      { char: '时', pinyin: 'shí', english: 'time' },
      { char: '早', pinyin: 'zǎo', english: 'early' }
    ],
    quizChars: [
      { char: '晚', pinyin: 'wǎn', english: 'evening, late' },
      { char: '星', pinyin: 'xīng', english: 'star' },
      { char: '晴', pinyin: 'qíng', english: 'clear, sunny' }
    ]
  },
  {
    radical: '月', standalone: null, pinyin: 'yuè', meaning: 'moon, month', burmese: 'လ',
    strokes: 4, category: 'Nature',
    examples: [
      { char: '朋', pinyin: 'péng', english: 'friend' },
      { char: '期', pinyin: 'qī', english: 'period' },
      { char: '朝', pinyin: 'zhāo', english: 'morning' }
    ],
    // No decode questions: 月 is also the squashed form of 肉 (flesh), so
    // 脸 face, 肚 belly and 胖 fat all show it without meaning "moon".
    // Asking "what is this about?" would teach a rule that is not true.
    quizChars: []
  },
  {
    radical: '山', standalone: null, pinyin: 'shān', meaning: 'mountain', burmese: 'တောင်',
    strokes: 3, category: 'Nature',
    examples: [
      { char: '岛', pinyin: 'dǎo', english: 'island' },
      { char: '峰', pinyin: 'fēng', english: 'peak' },
      { char: '岁', pinyin: 'suì', english: 'years old' }
    ],
    quizChars: [
      { char: '峡', pinyin: 'xiá', english: 'gorge' },
      { char: '岩', pinyin: 'yán', english: 'rock' },
      { char: '崖', pinyin: 'yá', english: 'cliff' }
    ]
  },
  {
    radical: '雨', standalone: null, pinyin: 'yǔ', meaning: 'rain', burmese: 'မိုး',
    strokes: 8, category: 'Nature',
    examples: [
      { char: '雪', pinyin: 'xuě', english: 'snow' },
      { char: '雷', pinyin: 'léi', english: 'thunder' },
      { char: '零', pinyin: 'líng', english: 'zero' }
    ],
    quizChars: [
      { char: '霜', pinyin: 'shuāng', english: 'frost' },
      { char: '雾', pinyin: 'wù', english: 'fog' },
      { char: '露', pinyin: 'lù', english: 'dew' }
    ]
  },
  {
    radical: '艹', standalone: '草', pinyin: 'cǎo', meaning: 'grass, plant', burmese: 'မြက်',
    strokes: 3, category: 'Nature',
    examples: [
      { char: '花', pinyin: 'huā', english: 'flower' },
      { char: '茶', pinyin: 'chá', english: 'tea' },
      { char: '菜', pinyin: 'cài', english: 'vegetable' }
    ],
    quizChars: [
      { char: '药', pinyin: 'yào', english: 'medicine (from herbs)' },
      { char: '苹', pinyin: 'píng', english: 'apple' },
      { char: '萝', pinyin: 'luó', english: 'radish' }
    ]
  },
  {
    radical: '亻', standalone: '人', pinyin: 'rén', meaning: 'person', burmese: 'လူ',
    strokes: 2, category: 'People',
    examples: [
      { char: '你', pinyin: 'nǐ', english: 'you' },
      { char: '他', pinyin: 'tā', english: 'he' },
      { char: '休', pinyin: 'xiū', english: 'to rest' }
    ],
    quizChars: [
      { char: '住', pinyin: 'zhù', english: 'to live, to stay' },
      { char: '做', pinyin: 'zuò', english: 'to do, to make' },
      { char: '位', pinyin: 'wèi', english: 'person (polite), position' }
    ]
  },
  {
    radical: '女', standalone: null, pinyin: 'nǚ', meaning: 'woman', burmese: 'အမျိုးသမီး',
    strokes: 3, category: 'People',
    examples: [
      { char: '妈', pinyin: 'mā', english: 'mother' },
      { char: '好', pinyin: 'hǎo', english: 'good' },
      { char: '姐', pinyin: 'jiě', english: 'older sister' }
    ],
    quizChars: [
      { char: '妹', pinyin: 'mèi', english: 'younger sister' },
      { char: '婚', pinyin: 'hūn', english: 'marriage' },
      { char: '娘', pinyin: 'niáng', english: 'young woman, mum' }
    ]
  },
  {
    radical: '子', standalone: null, pinyin: 'zǐ', meaning: 'child', burmese: 'ကလေး',
    strokes: 3, category: 'People',
    examples: [
      { char: '学', pinyin: 'xué', english: 'to study' },
      { char: '孩', pinyin: 'hái', english: 'child' },
      { char: '字', pinyin: 'zì', english: 'character' }
    ],
    quizChars: [
      { char: '孙', pinyin: 'sūn', english: 'grandchild' },
      { char: '孤', pinyin: 'gū', english: 'orphaned, alone' },
      { char: '孕', pinyin: 'yùn', english: 'pregnant' }
    ]
  },
  {
    radical: '父', standalone: null, pinyin: 'fù', meaning: 'father', burmese: 'အဖေ',
    strokes: 4, category: 'People',
    examples: [
      { char: '爸', pinyin: 'bà', english: 'dad' },
      { char: '爷', pinyin: 'yé', english: 'grandfather' }
    ],
    quizChars: [
      { char: '爹', pinyin: 'diē', english: 'dad' }
    ]
  },
  {
    radical: '口', standalone: null, pinyin: 'kǒu', meaning: 'mouth', burmese: 'ပါးစပ်',
    strokes: 3, category: 'Body',
    examples: [
      { char: '吃', pinyin: 'chī', english: 'to eat' },
      { char: '喝', pinyin: 'hē', english: 'to drink' },
      { char: '叫', pinyin: 'jiào', english: 'to call' }
    ],
    quizChars: [
      { char: '唱', pinyin: 'chàng', english: 'to sing' },
      { char: '咬', pinyin: 'yǎo', english: 'to bite' },
      { char: '吹', pinyin: 'chuī', english: 'to blow' }
    ]
  },
  {
    radical: '心', standalone: null, pinyin: 'xīn', meaning: 'heart, mind', burmese: 'နှလုံး',
    strokes: 4, category: 'Body',
    examples: [
      { char: '想', pinyin: 'xiǎng', english: 'to think' },
      { char: '忙', pinyin: 'máng', english: 'busy' },
      { char: '爱', pinyin: 'ài', english: 'love' }
    ],
    quizChars: [
      { char: '思', pinyin: 'sī', english: 'to think' },
      { char: '感', pinyin: 'gǎn', english: 'to feel' },
      { char: '念', pinyin: 'niàn', english: 'to miss, to think of' }
    ]
  },
  {
    radical: '扌', standalone: '手', pinyin: 'shǒu', meaning: 'hand', burmese: 'လက်',
    strokes: 3, category: 'Body',
    examples: [
      { char: '打', pinyin: 'dǎ', english: 'to hit' },
      { char: '找', pinyin: 'zhǎo', english: 'to look for' },
      { char: '推', pinyin: 'tuī', english: 'to push' }
    ],
    quizChars: [
      { char: '提', pinyin: 'tí', english: 'to lift, to carry' },
      { char: '拉', pinyin: 'lā', english: 'to pull' },
      { char: '抱', pinyin: 'bào', english: 'to hug' }
    ]
  },
  {
    radical: '目', standalone: null, pinyin: 'mù', meaning: 'eye', burmese: 'မျက်လုံး',
    strokes: 5, category: 'Body',
    examples: [
      { char: '看', pinyin: 'kàn', english: 'to look' },
      { char: '眼', pinyin: 'yǎn', english: 'eye' },
      { char: '睡', pinyin: 'shuì', english: 'to sleep' }
    ],
    quizChars: [
      { char: '盯', pinyin: 'dīng', english: 'to stare' },
      { char: '睁', pinyin: 'zhēng', english: 'to open the eyes' },
      { char: '瞎', pinyin: 'xiā', english: 'blind' }
    ]
  },
  {
    radical: '足', standalone: null, pinyin: 'zú', meaning: 'foot', burmese: 'ခြေထောက်',
    strokes: 7, category: 'Body',
    examples: [
      { char: '跑', pinyin: 'pǎo', english: 'to run' },
      { char: '跳', pinyin: 'tiào', english: 'to jump' },
      { char: '路', pinyin: 'lù', english: 'road' }
    ],
    quizChars: [
      { char: '踢', pinyin: 'tī', english: 'to kick' },
      { char: '踩', pinyin: 'cǎi', english: 'to step on' },
      { char: '跟', pinyin: 'gēn', english: 'heel, to follow' }
    ]
  },
  {
    radical: '耳', standalone: null, pinyin: 'ěr', meaning: 'ear', burmese: 'နား',
    strokes: 6, category: 'Body',
    examples: [
      { char: '听', pinyin: 'tīng', english: 'to listen' },
      { char: '闻', pinyin: 'wén', english: 'to hear' },
      { char: '取', pinyin: 'qǔ', english: 'to take' }
    ],
    quizChars: [
      { char: '聋', pinyin: 'lóng', english: 'deaf' },
      { char: '聪', pinyin: 'cōng', english: 'sharp of hearing, clever' }
    ]
  },
  {
    radical: '宀', standalone: null, pinyin: 'mián', meaning: 'roof', burmese: 'အမိုး',
    strokes: 3, category: 'Objects',
    examples: [
      { char: '家', pinyin: 'jiā', english: 'home' },
      { char: '安', pinyin: 'ān', english: 'peace' },
      { char: '室', pinyin: 'shì', english: 'room' }
    ],
    quizChars: [
      { char: '客', pinyin: 'kè', english: 'guest' },
      { char: '宿', pinyin: 'sù', english: 'to stay the night' },
      { char: '宅', pinyin: 'zhái', english: 'residence' }
    ]
  },
  {
    radical: '门', standalone: null, pinyin: 'mén', meaning: 'door, gate', burmese: 'တံခါး',
    strokes: 3, category: 'Objects',
    examples: [
      { char: '问', pinyin: 'wèn', english: 'to ask' },
      { char: '间', pinyin: 'jiān', english: 'between' },
      { char: '闭', pinyin: 'bì', english: 'to close' }
    ],
    // No decode questions: in simplified Chinese 门 is usually carrying the
    // sound rather than the meaning (问 wèn, 们 men), so the meaning does
    // not reliably follow the radical.
    quizChars: []
  },
  {
    radical: '车', standalone: null, pinyin: 'chē', meaning: 'vehicle', burmese: 'ကား',
    strokes: 4, category: 'Objects',
    examples: [
      { char: '轮', pinyin: 'lún', english: 'wheel' },
      { char: '较', pinyin: 'jiào', english: 'compare' },
      { char: '转', pinyin: 'zhuǎn', english: 'to turn' }
    ],
    quizChars: [
      { char: '辆', pinyin: 'liàng', english: 'measure word for vehicles' },
      { char: '载', pinyin: 'zài', english: 'to carry, to load' }
    ]
  },
  {
    radical: '钅', standalone: '金', pinyin: 'jīn', meaning: 'metal, gold', burmese: 'သတ္တု; ရွှေ',
    strokes: 5, category: 'Objects',
    examples: [
      { char: '钱', pinyin: 'qián', english: 'money' },
      { char: '银', pinyin: 'yín', english: 'silver' },
      { char: '钟', pinyin: 'zhōng', english: 'clock' }
    ],
    quizChars: [
      { char: '铁', pinyin: 'tiě', english: 'iron' },
      { char: '锅', pinyin: 'guō', english: 'pot, wok' },
      { char: '针', pinyin: 'zhēn', english: 'needle' }
    ]
  },
  {
    radical: '衤', standalone: '衣', pinyin: 'yī', meaning: 'clothing', burmese: 'အဝတ်အထည်',
    strokes: 5, category: 'Objects',
    examples: [
      { char: '衬', pinyin: 'chèn', english: 'shirt' },
      { char: '裙', pinyin: 'qún', english: 'skirt' },
      { char: '袜', pinyin: 'wà', english: 'socks' }
    ],
    quizChars: [
      { char: '裤', pinyin: 'kù', english: 'trousers' },
      { char: '袖', pinyin: 'xiù', english: 'sleeve' },
      { char: '被', pinyin: 'bèi', english: 'quilt, blanket' }
    ]
  },
  {
    // Written 饣 on the left of a character, 食 standing alone — same
    // pattern as 钅/金 and 讠/言.
    radical: '饣', standalone: '食', pinyin: 'shí', meaning: 'food, eat', burmese: 'အစားအစာ',
    strokes: 3, category: 'Objects',
    examples: [
      { char: '饭', pinyin: 'fàn', english: 'rice, meal' },
      { char: '饿', pinyin: 'è', english: 'hungry' },
      { char: '馆', pinyin: 'guǎn', english: 'restaurant' }
    ],
    quizChars: [
      { char: '饺', pinyin: 'jiǎo', english: 'dumpling' },
      { char: '饼', pinyin: 'bǐng', english: 'pastry, flatbread' },
      { char: '饮', pinyin: 'yǐn', english: 'to drink' }
    ]
  },
  {
    radical: '米', standalone: null, pinyin: 'mǐ', meaning: 'rice', burmese: 'ဆန်',
    strokes: 6, category: 'Objects',
    examples: [
      { char: '粉', pinyin: 'fěn', english: 'powder' },
      { char: '糖', pinyin: 'táng', english: 'sugar' },
      { char: '粥', pinyin: 'zhōu', english: 'porridge' }
    ],
    quizChars: [
      { char: '粒', pinyin: 'lì', english: 'grain, granule' },
      { char: '粮', pinyin: 'liáng', english: 'grain, food' }
    ]
  },
  {
    radical: '讠', standalone: '言', pinyin: 'yán', meaning: 'speech, words', burmese: 'စကား',
    strokes: 2, category: 'Actions',
    examples: [
      { char: '说', pinyin: 'shuō', english: 'to speak' },
      { char: '话', pinyin: 'huà', english: 'speech' },
      { char: '语', pinyin: 'yǔ', english: 'language' }
    ],
    quizChars: [
      { char: '读', pinyin: 'dú', english: 'to read aloud' },
      { char: '讲', pinyin: 'jiǎng', english: 'to speak, to explain' },
      { char: '谈', pinyin: 'tán', english: 'to talk, to discuss' }
    ]
  },
  {
    radical: '辶', standalone: null, pinyin: 'chuò', meaning: 'walk, movement', burmese: 'သွားလာ',
    strokes: 3, category: 'Actions',
    examples: [
      { char: '进', pinyin: 'jìn', english: 'to enter' },
      { char: '还', pinyin: 'huán', english: 'to return' },
      { char: '这', pinyin: 'zhè', english: 'this' }
    ],
    quizChars: [
      { char: '送', pinyin: 'sòng', english: 'to send, to see off' },
      { char: '迎', pinyin: 'yíng', english: 'to welcome' },
      { char: '追', pinyin: 'zhuī', english: 'to chase' }
    ]
  },
  {
    radical: '彳', standalone: null, pinyin: 'chì', meaning: 'step, go', burmese: 'လမ်းလျှောက်',
    strokes: 3, category: 'Actions',
    examples: [
      { char: '很', pinyin: 'hěn', english: 'very' },
      { char: '得', pinyin: 'dé', english: 'to get' },
      { char: '往', pinyin: 'wǎng', english: 'toward' }
    ],
    quizChars: [
      { char: '街', pinyin: 'jiē', english: 'street' },
      { char: '徒', pinyin: 'tú', english: 'on foot' }
    ]
  },
  {
    radical: '力', standalone: null, pinyin: 'lì', meaning: 'strength, power', burmese: 'အား',
    strokes: 2, category: 'Actions',
    examples: [
      { char: '动', pinyin: 'dòng', english: 'to move' },
      { char: '努', pinyin: 'nǔ', english: 'to strive' },
      { char: '加', pinyin: 'jiā', english: 'to add' }
    ],
    quizChars: [
      { char: '劳', pinyin: 'láo', english: 'labour, toil' },
      { char: '助', pinyin: 'zhù', english: 'to help' },
      { char: '勇', pinyin: 'yǒng', english: 'brave' }
    ]
  },
  {
    radical: '刀', standalone: null, pinyin: 'dāo', meaning: 'knife', burmese: 'ဓား',
    strokes: 2, category: 'Actions',
    examples: [
      { char: '分', pinyin: 'fēn', english: 'to divide' },
      { char: '切', pinyin: 'qiē', english: 'to cut' },
      { char: '到', pinyin: 'dào', english: 'to arrive' }
    ],
    quizChars: [
      { char: '剪', pinyin: 'jiǎn', english: 'to cut with scissors' },
      { char: '割', pinyin: 'gē', english: 'to cut, to sever' },
      { char: '刻', pinyin: 'kè', english: 'to carve' }
    ]
  },
  {
    radical: '见', standalone: null, pinyin: 'jiàn', meaning: 'to see', burmese: 'မြင်သည်',
    strokes: 4, category: 'Actions',
    examples: [
      { char: '现', pinyin: 'xiàn', english: 'present' },
      { char: '视', pinyin: 'shì', english: 'to view' },
      { char: '观', pinyin: 'guān', english: 'to observe' }
    ],
    quizChars: [
      { char: '觉', pinyin: 'jué', english: 'to sense, to feel' },
      { char: '览', pinyin: 'lǎn', english: 'to view, to browse' }
    ]
  }
];
