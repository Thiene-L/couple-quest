// 底部导航图标。按 Kitty 的线条语言画：粗黑描边 + 白填充 + 红蝴蝶结。
// 五个都带蝴蝶结所以成套，靠底下的形状区分功能。
// 描边用 currentColor，选中/未选中跟着文字颜色走。

type Name = "tasks" | "chat" | "daily" | "store" | "me" | "moments" | "trophy";

// 蝴蝶结：五个图标共用的记号。cx/cy 是结扣中心，s 是缩放
function Bow({ cx, cy, s = 1 }: { cx: number; cy: number; s?: number }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${s})`}>
      <path
        d="M-2.6 0.5C-4-5.5-8.5-8-11-6.2c-2.6 1.9-2.2 6.4.6 7.9 2.2 1.2 5.4.6 7.8-1.6Z"
        fill="var(--kitty-bow)"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M2.6 0.5C4-5.5 8.5-8 11-6.2c2.6 1.9 2.2 6.4-.6 7.9-2.2 1.2-5.4.6-7.8-1.6Z"
        fill="var(--kitty-bow)"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <ellipse
        cx="0"
        cy="0"
        rx="2.9"
        ry="3.1"
        fill="var(--kitty-bow)"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </g>
  );
}

const SHAPES: Record<Name, React.ReactNode> = {
  // 任务：写字板
  tasks: (
    <>
      <rect
        x="6"
        y="10"
        width="20"
        height="18"
        rx="3"
        fill="var(--kitty-fill)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M11 17h10M11 21h7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Bow cx={16} cy={8} s={0.85} />
    </>
  ),
  // 聊天：对话气泡
  chat: (
    <>
      <path
        d="M6 15a5 5 0 0 1 5-5h10a5 5 0 0 1 5 5v4a5 5 0 0 1-5 5h-6l-5 4v-4a5 5 0 0 1-4-5Z"
        fill="var(--kitty-fill)"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="17" r="1.5" fill="currentColor" />
      <circle cx="19" cy="17" r="1.5" fill="currentColor" />
      <Bow cx={16} cy={8} s={0.8} />
    </>
  ),
  // 每日：翻页日历
  daily: (
    <>
      <rect
        x="6"
        y="11"
        width="20"
        height="17"
        rx="3"
        fill="var(--kitty-fill)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M6 17h20" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="22.5" r="2.2" fill="currentColor" />
      <Bow cx={16} cy={9} s={0.8} />
    </>
  ),
  // 商店：礼物盒
  store: (
    <>
      <rect
        x="6"
        y="14"
        width="20"
        height="14"
        rx="2.5"
        fill="var(--kitty-fill)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M16 14v14" stroke="currentColor" strokeWidth="2" />
      <path d="M6 20h20" stroke="currentColor" strokeWidth="2" />
      <Bow cx={16} cy={11} s={0.95} />
    </>
  ),
  // 我的：头像轮廓 + 头顶正中的蝴蝶结（当发饰）。
  // 试过把结放在侧上角，会压着头的轮廓显得头变形；
  // 单独放一个大蝴蝶结在这个尺寸下又太宽，会看成蝴蝶
  me: (
    <>
      <path
        d="M6.5 28.5c0-5.2 4.3-8 9.5-8s9.5 2.8 9.5 8Z"
        fill="var(--kitty-fill)"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle
        cx="16"
        cy="16"
        r="5.2"
        fill="var(--kitty-fill)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <Bow cx={16} cy={8.5} s={0.72} />
    </>
  ),
  // 时光：相机
  moments: (
    <>
      <rect
        x="5"
        y="13"
        width="22"
        height="15"
        rx="3"
        fill="var(--kitty-fill)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle
        cx="16"
        cy="20.5"
        r="4.5"
        fill="var(--kitty-fill)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <Bow cx={16} cy={10} s={0.8} />
    </>
  ),
  // 成就：奖杯
  trophy: (
    <>
      <path
        d="M11 11h10v6a5 5 0 0 1-10 0Z"
        fill="var(--kitty-fill)"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M11 13H8v2a3 3 0 0 0 3 3M21 13h3v2a3 3 0 0 1-3 3"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M16 22v3M12 27h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Bow cx={16} cy={8} s={0.72} />
    </>
  ),
};

export default function TabIcon({
  name,
  size = 24,
  className = "",
}: {
  name: Name;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
    >
      {SHAPES[name]}
    </svg>
  );
}
