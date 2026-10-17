// 台词库：按解锁等级分组
import type { Emotion } from '../../shared/types';

export interface QuoteGroup {
  id: string;
  name: string;
  /** 达到该等级后解锁 */
  unlockLevel: number;
  lines: string[];
}

export const QUOTE_GROUPS: QuoteGroup[] = [
  {
    id: 'base',
    name: '基础台词',
    unlockLevel: 1,
    lines: [
      '大象~大象~你的鼻子怎么那么长~',
      '妈妈说我是春日部最帅的小孩！',
      '嘿嘿，要不要一起看动感超人？',
      '我想吃巧克力棒，现在就要！',
      '小白，我们去散步吧~',
      '美女姐姐，你喜欢吃青椒吗？',
      '哼哼~今天是调皮的好日子！',
      '我最讨厌青椒和萝卜了！',
    ],
  },
  {
    id: 'superman',
    name: '动感超人篇',
    unlockLevel: 2,
    lines: [
      '动感超人，变身！',
      '屁股舞，跳起来！',
      '正义的超人光波——发射！',
      '动感超人是你哥哥！',
      '看我的动感光波，啪！',
    ],
  },
  {
    id: 'kasukabe',
    name: '春日部日常篇',
    unlockLevel: 5,
    lines: [
      '春日部防卫队，集合！',
      '今天的风儿甚是喧嚣~',
      '我是野原新之助，五岁~',
      '春日部是我的地盘哦！',
      '队长说我们要保卫春日部的和平！',
    ],
  },
];

/** 情绪状态对应的无聊/困倦自言自语 */
export const EMOTION_LINES: Partial<Record<Emotion, string[]>> = {
  bored: ['好无聊哦~有没有人要陪小新玩？', '无聊无聊无聊……', '再不理我，我就要跳屁股舞了哦！'],
  sleepy: ['呜……小新困了……', 'Zzzz……', '眼睛睁不开了啦……'],
};

/** 情绪切换的系统日志文案（不触发台词气泡） */
export const EMOTION_LOG_TEXT: Record<Emotion, string> = {
  curious: '小新好奇地看着屏幕',
  happy: '小新变得开心了',
  bored: '小新变得无聊了',
  sleepy: '小新困得打起了瞌睡',
};
