---
name: Orbit
description: Flux OS · 会回应行动的 AI 工作操作层
colors:
  ink: '#10120f'
  surface: '#191c17'
  line: '#31372b'
  text: '#f2f3eb'
  muted: '#a2aa97'
  lime: '#d7ff4f'
  coral: '#ffa88e'
  violet: '#b4a0f3'
  cyan: '#83dcf0'
  nebula-ink: '#0a0e15'
  nebula-text: '#eef3fb'
  nebula-muted: '#a5b3c6'
  nebula-line: '#283548'
  nebula-callout: '#0b1322df'
  sun: '#ffd88b'
  hole: '#d2afff'
  universe-input: '#172125'
typography:
  display:
    fontFamily: "Space Grotesk, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: '58px'
    fontWeight: 600
    lineHeight: 1.22
    letterSpacing: '-0.04em'
  headline:
    fontFamily: "Space Grotesk, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: '34px'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '-0.04em'
  title:
    fontFamily: "Space Grotesk, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: '16px'
    fontWeight: 500
    letterSpacing: '-0.025em'
  body:
    fontFamily: "Space Grotesk, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Space Grotesk, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: '12px'
    fontWeight: 400
  nebula-headline:
    fontFamily: "Space Grotesk, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: '16px'
    fontWeight: 500
    letterSpacing: '-0.02em'
  nebula-title:
    fontFamily: "Space Grotesk, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: '12px'
    fontWeight: 500
    lineHeight: 1.5
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, monospace'
rounded:
  tag: '4px'
  check: '5px'
  control: '7px'
  field: '8px'
  toast: '9px'
  compact-surface: '10px'
  mobile-intent: '12px'
  surface: '14px'
  universe-input: '16px'
  circle: '50%'
spacing:
  tight: '6px'
  label-gap: '8px'
  control-gap: '12px'
  control-inline: '16px'
  mobile-gutter: '20px'
  card: '24px'
  panel: '26px'
  desktop-gutter: '42px'
components:
  button-primary:
    backgroundColor: '{colors.lime}'
    textColor: '#1b260c'
    rounded: '{rounded.control}'
    padding: '11px 16px'
  button-primary-hover:
    backgroundColor: '#e1ff81'
  button-secondary:
    backgroundColor: '#2a3023'
    textColor: '#dce5cf'
    rounded: '{rounded.control}'
    padding: '11px 16px'
  button-secondary-hover:
    backgroundColor: '#37412b'
  button-text:
    backgroundColor: 'transparent'
    textColor: '#b9c5a9'
    padding: '0'
  button-complete:
    backgroundColor: '#24320f'
    textColor: '{colors.lime}'
    rounded: '{rounded.control}'
    padding: '9px 11px'
  field:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.text}'
    rounded: '{rounded.field}'
    padding: '11px 12px'
  navigation:
    backgroundColor: 'transparent'
    textColor: '#a8b19a'
    rounded: '{rounded.control}'
    padding: '12px 14px'
  navigation-active:
    backgroundColor: '{colors.lime}'
    textColor: '#1a2110'
  signal-chip:
    textColor: '#bcaadf'
    rounded: '{rounded.tag}'
    padding: '3px 7px'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.surface}'
    padding: '24px'
  intent:
    backgroundColor: '#1a2014'
    rounded: '{rounded.surface}'
    padding: '19px 22px 14px'
  nebula-callout:
    backgroundColor: '{colors.nebula-callout}'
    textColor: '{colors.nebula-text}'
    typography: '{typography.nebula-title}'
    rounded: '{rounded.field}'
    padding: '6px 8px'
    width: '176px'
    height: '62px'
  universe-input:
    backgroundColor: '{colors.universe-input}'
    textColor: '{colors.lime}'
    rounded: '{rounded.universe-input}'
    padding: '6px 8px 6px 18px'
    width: 'min(620px, calc(100% - 32px))'
  sun-target:
    textColor: '{colors.sun}'
    width: '108px'
    height: '108px'
  blackhole-target:
    textColor: '{colors.hole}'
    width: '144px'
    height: '100px'
  capture-mobile:
    backgroundColor: '{colors.lime}'
    textColor: '#1d270f'
    rounded: '{rounded.compact-surface}'
    height: '48px'
    width: '100%'
    padding: '13px 15px'
---

# Design System: Orbit

## Overview

**Creative North Star: "Flux OS"**

Orbit 的视觉世界是一个会回应行动的工作操作层：绿调深墨承载持续工作的密度，酸性青柠突出当前动作与推进反馈，珊瑚、紫罗兰和青蓝帮助用户识别事项归属。大胆、年轻的表达来自清楚的层级、紧凑的几何字形和有节制的状态反馈。

界面以文字、线条和实色容器组织信息。轨道线与状态点提供识别性；日常列表保持可扫描，完成事项时才出现短暂的放大与粒子反馈。自然语言捕捉与常规编辑共用这一套视觉语言。

四象限星云图是登录后的默认工作场景：深海军蓝坐标场与发光星体把优先级变成可直接操作的位置。轴心的金色太阳代表完成，拖动时出现的紫色黑洞代表删除；管理、报告、项目与设置收进按需打开的工作舱。它继承 Orbit 的字体、青柠主动作和四象限颜色；宇宙背景、连续坐标与沉浸布局属于 NebulaMatrix 主入口。

系统管理员会在工作舱看到独立的「系统控制台」。控制台沿用 Flux OS 的深墨与青柠，以连续指标带、七日行动柱图、端点列表和编辑工作台组织系统数据；空间成员不会看到这个入口。星图四个轴端使用深色高对比坐标牌，主词加粗，辅以方向含义，确保在星云和星体之上仍能快速辨认。

**Key Characteristics:**

- 绿调深墨背景与酸性青柠主动作。
- Space Grotesk 配合中文系统字体，数字使用等宽或等宽数字。
- 平面工作区域、细描边分组、浮层使用结构性阴影。
- 桌面紧凑分栏；手机扩大输入与点击区域，捕捉入口拥有独立底部空间。
- 完成反馈可以庆祝，减少动态效果时仍保留文本结果。

本文由当前实现提取，视觉事实以 `src/app/globals.css`、`src/app/layout.tsx` 与 `src/components/orbit.tsx` 为依据；星云图扩展依据 `src/components/nebula-matrix.tsx`、`src/app/nebula.css`、`packages/core/src/orbit-position.ts` 与 `packages/core/src/orbit-labels.ts`。前置令牌定义基础样式；响应式覆盖与交互规则见下文。页面独有的组成方式不构成所有新页面的固定模板。

## Colors

绿调深墨与偏暖的浅色文字形成工作底色；青柠集中表达动作，另外三种强调色形成清楚的象限分类。

### Primary

- **酸性青柠（lime）**：主按钮、激活导航、自然语言捕捉提示、重点事项和完成庆祝。焦点边框与选中文本也使用此色。

### Secondary

- **暖珊瑚（coral）**：第一象限、阻塞状态提示。
- **柔紫罗兰（violet）**：第三象限与 AI 信号识别。

### Tertiary

- **清青蓝（cyan）**：第四象限与轨道状态点。

### Neutral

- **绿调深墨（ink）**：全局画布与常规输入底色。
- **工作面（surface）**：项目、列表、设置和报告容器。
- **结构线（line）**：分隔、边框与分组。
- **浅纸色（text）**：正文与主要信息。
- **鼠尾草灰（muted）**：说明、标签与次级信息。

象限使用各自带色的低亮度底面。状态文字、图标和勾选与颜色共同表达意义；颜色不是唯一识别线索。全局为深色配色方案。

### NebulaMatrix surface palette

星云图局部使用 **宇宙深墨（nebula-ink）** 作为全幅底色，**星光白（nebula-text）** 承载标题，**雾蓝灰（nebula-muted）** 承载说明，**坐标蓝线（nebula-line）** 划分画布边界，**星体标注底（nebula-callout）** 为文字提供稳定对比。渐变星云、稀疏星尘和低透明网格留在背景。

Q1 右上为暖珊瑚，Q2 右下为酸性青柠，Q3 左上为柔紫罗兰，Q4 左下为清青蓝。象限名称、星体与引线同步着色；轴向文字、截止状态和完成标记补充颜色含义。这些 navy 色只用于星图，不改变其他页面的绿调深墨基础。太阳金（sun）用于完成目标与状态文字，黑洞紫（hole）用于删除目标与吸入轨迹；两者独立于四象限分类色。

## Typography

**Display / Body Font:** Space Grotesk；本地加载字重 400、500、600、700。中文按前置令牌中的系统字体栈回退。

**Label / Mono Font:** 普通标签沿用正文字体；数据、坐标和日期片段使用系统等宽字体及 tabular-nums。实现未加载 Inter 或 IBM Plex Mono。

**Character:** 几何拉丁字形与紧凑的负字距构成年轻的产品识别，中文保留系统字形的可读性。标题、说明、数字不使用同一体量；当前字号是按角色设计的层级，而非统一等比缩放。

### Hierarchy

- **Display**：今日问候使用 display 令牌。超宽屏放大，平板和手机逐级收束；不自动套用于工作列表。
- **Headline**：其他页面标题使用 headline 令牌；中等屏幕收为 28px，手机为 29px。
- **Title**：区块标题使用 title 令牌；项目标题为 22px，设置标题为 18px。
- **Body**：body 是全局基准。桌面任务标题为 13px / 1.6，任务说明多为 11–12px；自然语言输入为 15px / 1.8。
- **Label**：表单标签使用 label 令牌；元信息常见 9–11px。只有坐标、英文短标识等局部使用正字距。
- **Mobile input**：700px 及以下，文本输入、下拉框、报告正文和意图输入统一为 16px；意图输入行高为 1.7。

### NebulaMatrix hierarchy

星图标题使用 nebula-headline，手机隐藏此标题以保留地图空间；象限标题桌面 15px、手机 12px。星体标注使用 nebula-title，手机 11px，始终最多两行；截止信息为 10px、手机 9px。手机搜索和筛选为 16px。标题较短的字距与中文系统回退沿用全局，不引入独立字体。

## Layout

管理页面桌面采用固定左导航与工作区。左导航默认宽 222px，顶栏高 76px；主内容最大宽 1460px，默认左右留白由 desktop-gutter 定义。星图首页取消常驻侧栏和管理顶栏，地图填满首屏，仅保留紧凑的 Orbit 标识、工作舱入口和星图动作。常见管理面板采用两栏网格，列间距 18–25px；任务列表用水平分隔线维持密度。

### Responsive behavior

| 条件    | 现有布局行为                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| ≥1550px | 今日问候增至 68px，主区上留白 42px，重点事项体量增大。                                                                  |
| ≤1150px | 导航收为 195px，主区左右留白 26px，问候 48px。                                                                          |
| ≤900px  | 导航收为 178px，顶栏 65px，左右留白 22px；工作重点、项目和设置改为单栏；问候 44px。                                     |
| ≤700px  | 管理导航改为 255px 抽屉；星图首页只保留紧凑动作条，地图保持二维四象限坐标场；输入栏与控制栏固定在地图下方，不遮挡星体。 |
| ≤370px  | 主区左右留白 16px，问候 37px，双列表单改为单列。                                                                        |

### Mobile capture and scrolling

手机应用外壳与主包装层高均为 100dvh。外壳禁止外溢，顶栏不收缩，主内容使用 `flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain`，形成独立可滚动区域。

有写入权限时，主包装层保留 `calc(74px + env(safe-area-inset-bottom))` 底部空间。捕捉停靠栏固定于底部，拥有同样高度，内边距为 `12px 20px calc(12px + env(safe-area-inset-bottom))`；其中按钮高 48px、宽 100%，在停靠栏内静态布局。没有捕捉入口时不预留此空间。手机页脚最终底部内边距为 28px。

手机按钮和文字动作最小高 44px；图标动作及任务完成控件拥有 44px × 44px 点击区域。完成控件内部仍保留 21px 的可见方形，因此视觉密度与点击面积可以分别控制。

### NebulaMatrix viewport

四象限首页采用 `100dvh` 高的工作包装层，取消通用主区的最大宽度、页面内边距与常驻管理导航。顶部仅保留 Orbit、工作舱、筛选、通知、沉浸和快速放入；地图占据首屏，输入栏与缩放／帮助／分页在画布下方拥有独立空间。打开工作舱时以 280px 抽屉提供管理导航；沉浸模式收起标题和筛选，仍保留工作舱与星图操作入口。

地图始终保持中心相交的横纵轴，向右越重要、向上越紧急；四个象限不会在手机堆成列表。画布最小高为 400px，手机为 450px，短屏可以在地图区域滚动。100%–200% 缩放以 25% 为一档并保持当前视野中心；放大后在画布内滚动探索。

真实星体锚点与文字标注分别布局，以细引线连接。碰撞布局仅移动标注，不改变存储坐标或象限。标注桌面 176 × 62px、手机 120 × 58px；每象限每页最多 6／3 个，空间不足时提前分页，不通过重叠或挪动真实坐标塞入更多事项。筛选改变后回到第一页。手机缩短头部说明、折行筛选并隐藏次要象限说明，保留两行事项标题。

## Elevation & Depth

工作内容以实色、低亮度色差和 1px 描边形成层次；常规卡片没有阴影。阴影用于浮动捕捉、抽屉、通知与结果反馈，说明这些元素处在内容之上。移动捕捉按钮在独立停靠栏内取消阴影。

### Shadow Vocabulary

- **浮动捕捉**：`0 7px 30px #0007`。
- **详情侧面板**：`-16px 0 60px #0005`。
- **通知浮层**：`0 12px 50px #0007`。
- **结果提示**：`0 8px 40px #0005`。
- **完成庆祝**：`0 18px 80px #0009`。
- **手机导航抽屉**：`25px 0 100px #000b`。

星云图局部以程序生成的星云、稀疏星点、椭圆轨道与径向渐变球体建立空间深度；全局卡片仍保持平面。星体的柔光使用 `0 0 19px color-mix(in srgb, var(--star-color) 37%, transparent)`，文字阴影为 `0 2px 5px #03050d`，帮助浮层为 `0 12px 45px #0007`。低透明引线标明位置对应关系，不能用标注的悬浮位置代替真实坐标。

## Shapes

主工作面使用 surface 圆角，按钮和导航使用 control 圆角，字段使用 field 圆角。迷你象限和捕捉按钮使用 compact-surface；手机意图面板采用 mobile-intent。圆形专门用于头像、状态点和完成徽章，小方角用于标签和复选视觉。

轮廓以细描边为主；任务列表保留横向分隔而不逐行包进卡片。长标题可以截断或折行，但不挤压完成操作；强调卡片标题允许任意位置折行。

星图使用圆形星体、倾斜椭圆光环与细直坐标轴；星体锚点拥有 44 × 44px 点击区域，独立标注采用 8px 圆角。

## Components

### Buttons

主按钮为青柠实色与深色文字；次按钮为深绿底、浅色文字及细描边；文字按钮表达较轻的操作。重点事项的完成按钮反转为深色底与青柠字。

主按钮悬停变浅并上移 1px，按下缩为 0.98；次按钮悬停变亮；完成按钮悬停底色加亮；文字按钮悬停改为青柠。常规状态过渡为 0.2s，位移使用 `cubic-bezier(0.16, 1, 0.3, 1)`。禁用按钮透明度为 0.48，鼠标为不可操作状态。

按钮和链接通过 `:focus-visible` 显示 2px 青柠轮廓，向外偏移 4px。手机最小点击尺寸遵循 Layout。

### Chips

AI 信号标签为紫色文字、细描边和紧凑小圆角；标签用于识别状态，不借用按钮的交互样式。意图输入中的 AI 标记更小，独立使用 3px 圆角。

### Cards / Containers

设置面板使用 card 令牌；项目面板与象限容器采用相同圆角，内边距为 23px。重点事项使用青柠大色块、深色文字和局部深色完成按钮；普通任务列表保持开放、平面化排列。

### Inputs / Fields

普通字段为深墨背景，1px 边框，青柠插入光标；聚焦时边框变为青柠。自然语言意图输入为无独立边框的多行输入，焦点由整个意图面板的 `:focus-within` 描边承担。

报错以文字说明配合珊瑚系提示容器呈现。保持原有标签与说明文字；输入提示不能替代标签。

### Navigation / Dialogs

激活导航以青柠整行底面、深色文字和右侧状态点表达当前位置。未激活行透明，悬停增加低亮度绿底。手机通过按钮打开导航抽屉，背景遮罩可关闭。

移动导航打开后聚焦关闭按钮；Tab 与 Shift+Tab 在可见控件中循环，关闭后焦点回到菜单入口。编辑侧面板聚焦首个可用控件，保持 Tab 循环，关闭后回到先前的焦点元素。两者使用 dialog / aria-modal 语义，打开时锁住文档 body 滚动；Escape 可以关闭。跳转到主内容链接在获得焦点时显现。

### Intent capture and completion feedback

星图底部输入栏使用水平排列，桌面最大宽 620px，发送按钮为 44 × 44px，手机文字输入为 16px。今日页意图面板通过青柠标题与带绿调底面突出输入。Cmd/Ctrl+K 在今日页聚焦此输入，在其他可写页面打开记录面板。手机捕捉按钮使用 Layout 中的独立停靠区域；桌面其他页面使用右下浮动按钮。

常规结果提示与完成反馈均使用 `role="status"`。常规提示停留 4500ms；完成庆祝默认停留 2800ms，轻量动效设置下停留 1600ms。庆祝不接收指针事件。

系统 `prefers-reduced-motion: reduce` 与应用“轻量动效”设置均关闭动画和过渡，并隐藏庆祝粒子；系统媒体查询还将滚动行为设为 auto。常规进入动效为：侧面板 0.35s、提示 0.3s、庆祝 0.65s、粒子 1.3s；这些时长与缓动在 sidecar 中记录。反馈文字在减少动态效果时继续可见。

### NebulaMatrix interaction

截止时间已过去满 168 小时且仍未完成的 Q1–Q4 事项从常规标签布局中退出，进入右侧 **时间沉积带**。沉积带位于坐标语义之外，不修改事项的象限、真实坐标或历史。桌面以四个象限色压缩星团呈现，手机收为一个 48px 边缘入口；常规标签在右侧为其预留空间，太阳仍保持在坐标原点。

点击星团打开处理抽屉。抽屉按最早截止时间排序，提供搜索、象限筛选、分页、单项完成和最多 100 项的原子批量改期。手机抽屉从底部进入，桌面从右侧进入；两者均锁定背景滚动、保持焦点循环、支持 Escape 关闭。沉积数量增加时仅播放一次 0.8s 聚合脉冲，减少动态效果时即时更新数量。

星体和文字标注均可点击打开既有详情，也可在有写入权限时拖动。拖动采用指针捕获，允许象限内定位与跨轴重新归类；至少移动 6px 才判为拖动，避免点击误操作。目标象限以同色浅背景提示，释放后持久化新坐标与象限，保存失败恢复原位置并播报结果。只读状态保留详情入口。

太阳同时承载四象限快速新增入口。桌面端从太阳核心到浮出的加号按钮形成连续悬停区域，指针跨过间距时菜单不会消失；手机端点击太阳切换入口。打开事项详情后，四种状态以独立按钮直接切换，保存沿用版本检查与权限校验。删除操作置于表单之外的危险操作区，先说明影响，再通过二次确认执行；手机详情表单收为单列，所有控件保持在面板内。

象限继续决定星体主色，事项状态决定内部结构与运动：`open` 是缓慢呼吸的“静候”，`doing` 是伴星绕行并向外释放能量波的“运转”，`blocked` 是带暗面遮挡、断裂虚线环和反向运动的“受阻”，`done` 是金白核心、勾选与缓慢扩散光圈组成的“余辉”。四种状态同时写入标注文字和帮助图例，颜色不作为唯一识别信号。星体悬停、键盘聚焦和拖动期间暂停内部运动，避免交互目标漂移。

太阳固定在坐标原点，是完成目标。拖动超过点击阈值后，地图底部临时浮出紫色 **黑洞**；删除保存或吸入播放时短暂保留，其他时候不占布局。天体目标不直接接收指针事件，拖动落点由命中区域计算。指针进入太阳显示“松手，完成这件事”，进入黑洞显示“松手删除 · 可撤销”。服务端成功确认后，太阳吸入动画让星体沿弧线缩小飞入太阳；黑洞以同一空间反馈吸收并删除，随后显示撤销入口。删除是逻辑删除，不计完成成就；历史、归档和周报来源继续保留。移出目标后松手仍保存坐标，Escape、指针取消、只读权限和禁用状态均不能提交。

逻辑坐标 `orbitX`、`orbitY` 与放置时刻 `orbitPlacedAt` 持久化；屏幕大小、缩放、搜索、分页与标注避让均不得改写这些值。新的手动放置以服务端时间重新锚定自动漂移。截止前最多 14 天开始缓慢向上移动，横坐标不变，始终留在当前所属象限；已完成或没有截止日期的事项不漂移，截止后手动放置保持稳定。自动漂移不能代替用户重新分类。

键盘聚焦标注后按 Alt + 方向键移动，Escape 取消正在进行的拖动；指针取消或失去捕获也恢复原位置。移动、太阳完成、黑洞删除与保存结果通过 `role="status"` 播报，焦点有象限色轮廓。手机主要地图操作最小高 44px，黑洞命中区域为 124 × 80px，太阳命中区域为 78 × 78px，缩放栏不覆盖地图。桌面太阳目标 108 × 108px、黑洞目标 144 × 100px；太阳核心占目标 56%。

太阳日冕呼吸 6s、光环转动 16s；黑洞吸积盘形变循环 3s。成功后的星体吸入持续 1000ms，以弧线位移、缩小、旋转与淡出到达目标；太阳奖励日冕持续 1000ms。普通位置过渡为 1.4s，星体轻浮动为 7s，落点光环为 0.8s；拖动时关闭位置过渡并暂停浮动。状态动画保持低频且错峰运行，不改变星体的点击区域和真实坐标。系统减少动态效果与应用轻量动效均关闭星图动画和过渡，四种状态的结构、文字、坐标、截止提示、完成标记与操作结果继续可见。

### 周报铸造舱

周报页采用 Operate 模式，使用「周历脉冲条 → 行动素材 → 写作面」的结构。顶部自动定位当前自然周，七日条通过文字分别标记工作日、周末、法定休息和调休上班；数字采用等宽数字，进展条对应每天的素材数量。主日期输入仅出现在补选素材面板，常规导航用前一周、后一周和回到本周。

桌面素材区与写作面按 0.8:1.2 分栏，项目分组通过文字与细线组织。素材选取使用原生复选框，与设置页开关保持区别；编辑入口独立于选取动作。写作面以深绿实色纸面承载 Markdown，AI 模式与规则草稿均明确标记。周报档案、风格学习与跨时期补选使用原生模态抽屉，保持焦点、Escape 关闭和触发入口焦点恢复。

700px 及以下使用选素材、写周报、下周点火三个阶段，素材生成操作在自身滚动区域底部停靠，取消通用捕捉栏以给周报操作留出空间。手机抽屉从底部呈现，字段字体为 16px、控件最小 44px。来源索引、遗漏雷达和后台风格建议用可折叠文字组织，避免多个同等层级容器堆积。风格模板保留结构、语气、篇幅、格式和禁用表达；所有 AI 生成内容均可检查后修改。

周报工作区最大宽度为 1440px，七日历始终保持七列。桌面素材与写作面间距 28px；1100px 及以下收为 0.9:1.1 分栏，间距 18px。素材列表桌面最多高 560px 并独立滚动；手机解除限高，同一时间只显示一个工作阶段，当前阶段以青柠文字与下边线标明。正文手机字号 16px、行高 1.9。

周报抽屉桌面从右侧打开，最大宽度 620px、高度 100dvh；手机从底部打开，高度 92dvh，内边距包含安全区域。手机表单单列，主要动作与图标操作最小点击高为 44px。

写作面区分 AI 仿写、规则草稿与未保存。正文使用短来源引用，完整事项 URL 定义置于文末，复制和下载保留这些定义；折叠来源索引提供真实事项入口。历史样本成功提炼后清空输入，用户检查后保存个人模板。风格建议接受或忽略均由用户决定；待处理建议只更新同一版本状态，跨设备出现新版本时保留本地正文并提示重新打开档案。

下周点火展示可编辑、可选择的计划草稿，先明确尚未创建事项。复选框与计划编号水平排列并左对齐，确认动作显示将创建的数量；成功后显示已创建数量，并禁用本次草稿编辑和重复确认。

## Do's and Don'ts

### Do:

- Do 使用现有深墨、青柠与象限配色表达层级和状态。
- Do 为主按钮保留高对比实色，为次级操作使用深色描边或文字按钮。
- Do 保持中文系统回退字体、手机表单字号与触控面积。
- Do 为底部捕捉入口保留布局空间，并让内容在主区域内滚动。
- Do 在对话框与移动导航中保留初始焦点、Tab 循环和关闭后的焦点恢复。
- Do 同时尊重系统减少动态效果偏好与应用中的轻量动效设置。
- Do 在星图中区分真实坐标与标注位置，通过引线和分页维持可读性。
- Do 为星图缩放、帮助与分页保留画布外的布局空间。

### Don't:

- Don't 将原方向稿中的 Inter、IBM Plex Mono 或旧色值当作当前实现。
- Don't 为普通工作卡片添加悬浮阴影或把被动标签变成按钮。
- Don't 让固定捕捉入口覆盖手机主内容的可滚动区域。
- Don't 在减少动态效果模式下播放位移、缩放或粒子动画。
- Don't 仅用颜色表达任务状态；保留文字、标签、完成勾选等线索。
- Don't 将星云图的宇宙背景和全屏坐标布局扩散到所有工作页面。
- Don't 为避免重叠而改变星体的真实坐标，也不要让自动截止漂移跨越所属象限。
