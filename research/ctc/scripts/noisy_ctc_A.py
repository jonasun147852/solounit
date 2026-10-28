# 模型 A: 每次穿环以概率 eps 整个寄存器被重置为均匀随机 (完全退相干式噪声)
# 马尔可夫链 M = (1-eps)*Step + eps*Uniform, 求平稳分布, 看读出满足赋值的概率
import numpy as np
rng=np.random.default_rng(1)
def make_instance(n, m):
    cl=[(rng.choice(n,3,replace=False), rng.integers(0,2,3)) for _ in range(m)]
    N=1<<n
    xs=np.arange(N)
    bits=((xs[:,None]>>np.arange(n))&1)
    sat=np.ones(N,dtype=bool)
    for vs,ss in cl: sat &= (bits[:,vs]==ss).any(1)
    return N,sat
def stationary(N,sat,eps,tol=1e-10,maxit=2000000):
    nxt=np.where(sat,np.arange(N),(np.arange(N)+1)%N)
    p=np.ones(N)/N
    for it in range(maxit):
        q=np.zeros(N); np.add.at(q,nxt,p)
        q=(1-eps)*q+eps/N
        if np.abs(q-p).sum()<tol: return q,it
        p=q
    return p,maxit
print(f"{'n':>3} {'N':>6} {'解数':>4} {'eps':>8} {'P(读到满足赋值)':>16} {'1/eps 对比 N':>14}")
for n in (8,10,12):
    N,sat=make_instance(n, int(4.26*(1<<0)*n))   # 临界比例, 解很少
    while sat.sum()==0 or sat.sum()>4:
        N,sat=make_instance(n,int(4.26*n))
    for eps in (1e-1,1e-2,1e-3,1e-4,1e-5):
        pi,it=stationary(N,sat,eps)
        print(f"{n:>3} {N:>6} {sat.sum():>4} {eps:>8.0e} {pi[sat].sum():>16.4f} {1/eps/N:>14.3g}")
