# Deutsch 型闭合类时曲线 (CTC) 解 3-SAT 的经典版本 (Aaronson-Watrous 2009 构造)
# 规则: 从时间环里出来的寄存器 x 若满足公式就原样送回环里; 否则送回 x+1.
# 物理要求环内状态自洽 (出去的分布 = 回来的分布), 即马尔可夫链的平稳分布.
import numpy as np
rng=np.random.default_rng(3)
n=12; m=50
clauses=[[(int(v),int(s)) for v,s in zip(rng.choice(n,3,replace=False),rng.integers(0,2,3))] for _ in range(m)]
def sat(x): return all(any(((x>>v)&1)==s for v,s in c) for c in clauses)
N=1<<n
good=[x for x in range(N) if sat(x)]
print(f"n={n} 个变量, {m} 个子句, 2^n={N} 个赋值, 其中满足的有 {len(good)} 个")
# 自洽条件: 平稳分布. 用幂迭代模拟"宇宙寻找不动点"的过程
nxt=np.array([x if sat(x) else (x+1)%N for x in range(N)])
p=np.ones(N)/N
for it in range(1,20001):
    q=np.zeros(N); np.add.at(q,nxt,p)
    if np.abs(q-p).sum()<1e-12: break
    p=q
mass=p[good].sum()
print(f"自洽(不动点)分布落在满足赋值上的概率: {mass:.6f}")
print(f"从环里读出的赋值: {max(range(N),key=lambda x:p[x]):0{n}b}, 满足公式: {sat(max(range(N),key=lambda x:p[x]))}")
print(f"我们在普通时间里模拟这个不动点, 用了 {it} 轮迭代 (量级 ~ 2^n = {N})")
