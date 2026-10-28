# 模型 B: 噪声独立作用在每个比特上(翻转概率 p); 环内电路 = 多数判决解码 -> step -> 重复编码
import numpy as np
rng=np.random.default_rng(5)
n=12; m=int(4.26*n)
while True:
    cl=[(rng.choice(n,3,replace=False), rng.integers(0,2,3)) for _ in range(m)]
    N=1<<n; xs=np.arange(N); bits=((xs[:,None]>>np.arange(n))&1)
    sat=np.ones(N,dtype=bool)
    for vs,ss in cl: sat &= (bits[:,vs]==ss).any(1)
    if 1<=sat.sum()<=3: break
nxt=np.where(sat,xs,(xs+1)%N)
def run(k,p,T=150000):
    reg=rng.integers(0,2,(n,k)); hits=0
    for t in range(T):
        x=int(((reg.sum(1)*2>k).astype(int)<<np.arange(n)).sum())   # 多数判决解码
        hits+=sat[x]
        y=nxt[x]                                                     # 一次穿环
        reg=np.repeat(((y>>np.arange(n))&1)[:,None],k,axis=1)        # 重复编码
        reg^=(rng.random((n,k))<p)                                   # 每比特独立噪声
    return hits/T
p=0.05
print(f"\n模型B: n={n}, N={N}, 解数={sat.sum()}, 每比特翻转率 p={p}")
print(f"{'码长k':>5} {'环宽度(比特)':>12} {'P(读到满足赋值)':>16} {'等效eps(理论)':>14}")
from math import comb
for k in (1,3,5,7,9,11,15):
    eps_eff=1-(sum(comb(k,j)*p**j*(1-p)**(k-j) for j in range(0,k//2+1)))**n  # 任一逻辑位被翻的概率
    print(f"{k:>5} {n*k:>12} {run(k,p):>16.4f} {eps_eff:>14.2e}")
