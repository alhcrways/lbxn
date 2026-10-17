【形象图片说明（按形象分文件夹）】

图片资源根目录：src/renderer/public/character/
每种形象一个独立文件夹（对应换装系统），互不干扰：

  character/default/     默认形象（日常小新）
  character/superman/    动感超人形象
  character/pajamas/     睡衣形象

每个形象文件夹内结构（PNG 格式，建议透明背景，宽高比约 1:1.2，建议 260x312 或更大）：

一、姿态图片（两种形式，可混用）
  1. 单图：直接放 <姿态名>.png，由交互触发显示
     idle.png        站立（默认形象，必备）
     happy.png       开心（双击后）
     angry.png       生气
     fall.png        摔倒
     sleepy.png      困倦
     bored.png       无聊
     curious.png     好奇（首次启动）
     eat.png         吃东西（喂食时）
     dance.png       跳舞
     drag.png        被拎起（拖拽中）
     缺失的姿态自动使用内置 SVG 占位形象

  2. 帧动画：建 <姿态名>/ 文件夹，内放按文件名排序的 PNG 序列（01.png 02.png ...）
     同名时帧动画优先于单图；任意姿态都可用帧动画（如 dance/01.png dance/02.png）
     文件夹内可放 frame.txt 声明帧间隔毫秒数（纯数字，有效范围 16-2000），
     没有则用默认 125ms（约 8 FPS）
     支持扩展名：png / webp / apng（不用 gif，gif 有黑底问题）

二、形象特色动作 → random/ 随机池
  放到 <形象>/random/<动画名>/ 子目录，子目录名任意（如 walk、wave、fly）
  无互动超过 40 秒后，每 10 分钟从随机池随机换一个动画播放
  示例：
    character/superman/random/fly/01.png 02.png 03.png   → 超人专属飞行动作
    character/default/random/eat/01.png 02.png

三、固定时段动画 → timed/ 目录（可选）
  子目录命名：idle-HHMM（HHMM 为 24 小时制时分，仅取「小时」生效）
  该动画会在对应小时的整点所在小时持续播放（如 idle-1200 在 12:00-12:59 播放）
  优先级最高，命中时段时不参与随机
  示例：
    character/default/timed/idle-0800/01.png 02.png   → 08:00-08:59 播放（早晨）
    character/default/timed/idle-1200/01.png          → 12:00-12:59 播放（中午）

四、兜底与回退
  上述都未命中时显示该形象的 idle.png（单帧静态）
  图片加载失败（文件不存在/格式错误）自动回退到内置 SVG 占位形象，不会崩溃
  形象文件夹内完全没有素材（如 superman 只放一张 idle.png）时，
  其余姿态回退 SVG 占位形象（会绘制对应服装，如超人披风）

示例目录树：
  character/
  ├── default/
  │   ├── idle.png happy.png fall.png drag.png ...
  │   ├── dance/01.png 02.png frame.txt      （跳舞帧动画）
  │   ├── random/eat/01.png 02.png           （随机池：吃东西动画）
  │   └── timed/idle-1200/01.png 02.png      （中午时段动画）
  ├── superman/
  │   ├── idle.png
  │   └── random/fly/01.png 02.png 03.png    （超人专属飞行）
  └── pajamas/
      └── idle.png

注意：
1. 放好图片后重新运行 npm run dev / npm run build 即可生效；
2. 配饰（小白帽、墨镜）目前只在占位形象上绘制，图片模式下不叠加；
3. character/ 根目录的 main.png、main1.png 及 default/random/ 下的
   动感超人.png、小新吃东西.gif、小新平躺.png 为历史遗留素材，程序不读取。
