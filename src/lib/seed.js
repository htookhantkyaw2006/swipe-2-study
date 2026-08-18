import { db } from './db';

const chineseHSK1 = [
  { 
    character: '中', 
    pronunciation: 'zhōng', 
    definition: 'middle; center; China', 
    burmese_definition: 'အလယ်; အလယ်ဗဟို; တရုတ်',
    part_of_speech: 'noun', 
    examples: [
      { chinese: '我是中国人。', pinyin: 'Wǒ shì Zhōngguó rén.', english: 'I am Chinese.', burmese: 'ကျွန်တော်/မ တရုတ်လူမျိုးပါ။' },
      { chinese: '他在中间。', pinyin: 'Tā zài zhōngjiān.', english: 'He is in the middle.', burmese: 'သူက အလယ်မှာ ရှိတယ်။' },
      { chinese: '中午我们吃饭。', pinyin: 'Zhōngwǔ wǒmen chī fàn.', english: 'We eat at noon.', burmese: 'မွန်းတည့်မှာ ကျွန်တော်တို့ ထမင်းစားတယ်။' }
    ]
  },
  { 
    character: '你好', 
    pronunciation: 'nǐ hǎo', 
    definition: 'hello', 
    burmese_definition: 'မင်္ဂလာပါ',
    part_of_speech: 'phrase', 
    examples: [
      { chinese: '你好，我是学生。', pinyin: 'Nǐ hǎo, wǒ shì xuéshēng.', english: 'Hello, I am a student.', burmese: 'မင်္ဂလာပါ၊ ကျွန်တော်/မက ကျောင်းသားပါ။' },
      { chinese: '你好吗？', pinyin: 'Nǐ hǎo ma?', english: 'How are you?', burmese: 'နေကောင်းလား။' },
      { chinese: '大家好，你好！', pinyin: 'Dàjiā hǎo, nǐ hǎo!', english: 'Hello everyone, hello!', burmese: 'အားလုံးပဲ မင်္ဂလာပါ၊ မင်္ဂလာပါ။' }
    ]
  },
  { 
    character: '谢谢', 
    pronunciation: 'xiè xie', 
    definition: 'thank you', 
    burmese_definition: 'ကျေးဇူးတင်ပါတယ်',
    part_of_speech: 'phrase', 
    examples: [
      { chinese: '谢谢你的帮助。', pinyin: 'Xièxiè nǐ de bāngzhù.', english: 'Thank you for your help.', burmese: 'ကူညီပေးတဲ့အတွက် ကျေးဇူးတင်ပါတယ်။' },
      { chinese: '太谢谢你了。', pinyin: 'Tài xièxiè nǐ le.', english: 'Thank you so much.', burmese: 'အရမ်းကျေးဇူးတင်ပါတယ်။' },
      { chinese: '不客气，谢谢。', pinyin: 'Bú kèqì, xièxiè.', english: 'You are welcome, thank you.', burmese: 'ရပါတယ်၊ ကျေးဇူးတင်ပါတယ်။' }
    ]
  },
  { 
    character: '是', 
    pronunciation: 'shì', 
    definition: 'to be / is', 
    burmese_definition: 'ဖြစ်သည်',
    part_of_speech: 'verb', 
    examples: [
      { chinese: '我是中国人。', pinyin: 'Wǒ shì Zhōngguó rén.', english: 'I am Chinese.', burmese: 'ကျွန်တော်/မ တရုတ်လူမျိုးပါ။' },
      { chinese: '这是我的书。', pinyin: 'Zhè shì wǒ de shū.', english: 'This is my book.', burmese: 'ဒါက ကျွန်တော်/မရဲ့ စာအုပ်ပါ။' },
      { chinese: '他是医生吗？', pinyin: 'Tā shì yīshēng ma?', english: 'Is he a doctor?', burmese: 'သူက ဆရာဝန်လား။' }
    ]
  },
  { 
    character: '不', 
    pronunciation: 'bù', 
    definition: 'not / no', 
    burmese_definition: 'မဟုတ်ပါ / မ',
    part_of_speech: 'adverb', 
    examples: [
      { chinese: '我不是老师。', pinyin: 'Wǒ bú shì lǎoshī.', english: 'I am not a teacher.', burmese: 'ကျွန်တော်/မ ဆရာ မဟုတ်ပါဘူး။' },
      { chinese: '我不喜欢吃。', pinyin: 'Wǒ bù xǐhuān chī.', english: 'I do not like to eat this.', burmese: 'ကျွန်တော်/မ ဒါကို မစားချင်ဘူး။' },
      { chinese: '不知道。', pinyin: 'Bù zhīdào.', english: 'I don\'t know.', burmese: 'မသိဘူး။' }
    ]
  }
];

export function seedDB() {
  const cards = db.get('flashcards');
  
  // Check if we need to migrate to the new rich schema
  const needsMigration = cards.length === 0 || !cards[0].examples || !cards[0].burmese_definition;

  if (needsMigration) {
    // Clear old data
    localStorage.removeItem('s2s_flashcards');
    
    let order = 1;
    chineseHSK1.forEach(card => {
      db.insert('flashcards', {
        language: 'chinese',
        level: 'HSK1',
        lesson_name: 'Greetings & basics',
        lesson_order: 1,
        card_order: order++,
        ...card
      });
    });

    console.log('DB Seeded with rich flashcards schema');
  }
}
