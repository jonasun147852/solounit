# research/ctc — 噪声 Deutsch 时间环的计算能力

与 SoloUnit 产品无关的研究笔记分支。内容：

- `lean/` 核心 Lean 4.35 形式化（不依赖 Mathlib）：
  - `CTC.lean` 经典时间环判定 SAT（Aaronson–Watrous 经典半边）
  - `NoisyCTC.lean` 去极化噪声环的闭式平稳分布、唯一性、归一化
  - `NoisyBound.lean` 跨模型通用上界 π(S) ≤ c/ε 与噪声阈值
  - `Bridge.lean` 时间环计算能力与 P vs NP 的逻辑骨架
- `scripts/` 数值实验（黏菌、斯坦纳树、时间环、进化地形、噪声模型、精确有理数验证）
- `notes/` 噪声模型定义与跨模型稳定性分析
- `paper/draft.md` 论文初稿 v0.1
- `HANDOFF.md` 新会话交接说明

编译：安装 Lean 后在 `lean/` 目录运行 `lean CTC.lean && lean NoisyCTC.lean && lean NoisyBound.lean && lean Bridge.lean`。
