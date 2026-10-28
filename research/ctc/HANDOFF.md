# 新会话交接说明

## 一、环境设置（会话标题栏 → 云端环境菜单 → Edit）

### 1. Network access
在 Allowed domains 里添加下面的域名，保持 "Allow package managers" 勾选（Lean 是通过 Nix 装的，需要 cache.nixos.org 和 channels.nixos.org）：

```
arxiv.org
export.arxiv.org
ar5iv.labs.arxiv.org
scottaaronson.com
www.scottaaronson.com
eccc.weizmann.ac.il
cs.uwaterloo.ca
www.nature.com
link.aps.org
journals.aps.org
```

### 2. Secrets / 环境变量
```
OPENAI_API_KEY = <你的 key>
```
新会话里 Claude 会先 `npm i -g @openai/codex`，之后计算、模拟、Lean 编译和交叉验证交给 Codex。

### 3. 文件
本会话的 scratchpad 不会带到新会话。把下面 9 个文件（本会话都已作为附件发给你）在新会话第一条消息里上传：

```
CTC.lean            经典时间环判定 SAT 的形式化（342 行）
NoisyCTC.lean       去极化噪声环的闭式解、唯一性、归一化、标注存在性（471 行）
NoisyBound.lean     跨模型通用上界定理与噪声阈值推论（386 行）
Bridge.lean         时间环计算能力与 P vs NP 的逻辑骨架
draft.md            论文初稿 v0.1，定理部分已写，三节留空
robustness_notes.md 五条结论的跨模型稳定性分析
noisy_ctc_notes.md  噪声模型 A/B 的定义与数值
exact_check.py      闭式解的精确有理数交叉验证
robust.py           三种环内动力学与唯一性判据的数值验证
```

另一个选择：授权我把这些文件推到仓库的一个分支（例如 research/ctc），新会话直接 pull。需要你明确同意再做。

## 二、贴进新会话的第一条消息

```
背景：上一个会话里我们研究了"带噪声的 Deutsch 时间环的计算能力"，结论是噪声环恰好值 1/ε 倍加速，全部在核心 Lean 4 里机器核验。附件是全部文件，先读 draft.md 和 robustness_notes.md 恢复上下文，再读三个 .lean 文件的定理陈述。

分工：任务尽量让 Codex 执行（安装 @openai/codex，用 OPENAI_API_KEY），你负责思考、设计、审核。

本会话要做的事，按顺序：

1. 环境：用 nix profile add nixpkgs#lean4 装 Lean，用 lean 编译三个 .lean 文件，确认 0 错误 0 警告，#print axioms 只含 propext / Quot.sound / Classical.choice。让 Codex 独立重跑一次作交叉验证。

2. 读四篇文献，每篇写一段精确摘录（带章节号），回答括号里的问题：
   - arXiv:1609.05507 Aaronson, Bavarian, Gueltrini《Computability theory of closed timelike curves》（他们关于噪声和 Aharonov 等 1996 的讨论到底说了什么？是否主张 Deutsch 时间环计算对噪声稳健？）
   - arXiv:1003.4971 Dias da Silva, Kashefi, Galvão《Closed timelike curves in measurement-based quantum computation》（退相干如何加入模型？"选出唯一解"的精确陈述和形式？）
   - arXiv:1401.4933 Allen《Treating time travel quantum mechanically》（等效电路模型下退相干参数 p 的唯一收敛定理的精确形式？不动点是否写成几何/Neumann 级数？）
   - arXiv:1501.05014 Ringbauer 等《Experimental simulation of closed timelike curves》（退相干是否建模为失效概率 ε 的去极化信道？对应方程？）

3. 根据阅读结果重新定位贡献：
   - 唯一性（定理 2b）已确定为已知现象的经典特例，只引用不主张。
   - 若 1609.05507 主张"自洽条件自带纠错"，把定理 3 定位为对它的定量细化：免费纠错只值 1/ε 次穿越。
   - 若 Allen 或 Ringbauer 的模型与我们的方程 (3) 形式相同，在模型一节明确说明，并把"闭式解"降为"该已知模型在 SAT 动力学下的显式解"。
   - 保留的主张：Doeblin 型通用上界 π(S) ≤ 1/(εT*)、噪声阈值 ε ≤ 2/T*、"噪声不随问题规模缩小"是保住 NP 难度的最弱物理前提、全部形式化。

4. 补完 draft.md 的引言、相关工作、讨论三节，把"References to add after reading"换成正式引用。不要从记忆里引任何没读过原文的论断。

5. 让 Codex 逐条核对论文里每个定理陈述与 Lean 陈述一致，输出对照表。

6. 完成后给我：修订后的 draft.md、四篇文献的摘录文件、Lean 编译日志、对照表。

约束：不动 P vs NP 本身，不主张时间环存在与否，所有物理陈述标明是推测。每一步先用一句话说明要做什么。
```

## 三、本会话已做出、新会话不必重做的判断

- 模型 A（全局重置）就是文献里的去极化信道模型，不是自创。
- "噪声让不动点唯一"是 2010 和 2014 年的已知结果。
- 文献中未发现：噪声率与计算能力的定量关系、Doeblin 型通用上界、任何形式化。这三样是论文的主张。
- 保住 NP 难度的最弱物理假设是"全局噪声率不随问题规模超多项式缩小"，比时序保护弱。
- 物理上没有观测线索；理论线索（柯西视界不稳定、真空极化发散）偏向全局噪声，但都是推测。
