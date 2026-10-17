// 窗口尺寸常量
// 桌宠窗口默认只占人物本身大小；台词气泡 / 右键菜单 / Toast 出现时临时向上扩展
// （底部中心锚定，人物视觉位置不动）；养成/日记浮层打开时切换为面板尺寸。
export const PET_SIZE = { width: 170, height: 204 };

/** 气泡 / 右键菜单 / Toast 出现时的扩展尺寸（需容下头顶菜单：人物 204 + 菜单约 190 + 余量） */
export const EXPANDED_SIZE = { width: 300, height: 430 };

/** 聊天输入条在人物右侧展开，底部中心锚点保持不动。 */
export const CHAT_SIZE = { width: 500, height: 430 };

/** 养成系统 / 互动记录浮层尺寸 */
export const OVERLAY_SIZE = { width: 380, height: 560 };
