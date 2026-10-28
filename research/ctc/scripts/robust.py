import numpy as np
rng=np.random.default_rng(11)
n=11; N=1<<n; m=int(4.26*n)
while True:
    cl=[(rng.choice(n,3,replace=False), rng.integers(0,2,3)) for _ in range(m)]
    xs=np.arange(N); bits=((xs[:,None]>>np.arange(n))&1)
    sat=np.ones(N,dtype=bool)
    for vs,ss in cl: sat &= (bits[:,vs]==ss).any(1)
    if 2<=sat.sum()<=3: break
s=sat.sum(); print(f"n={n}, N={N}, 解数 s={s}\n")

# ---- 环内动力学 P 的三种选择 (都只把 φ 当作成员资格预言机) ----
def P_cycle(p):            # x -> x+1
    q=np.zeros(N); np.add.at(q,np.where(sat,xs,(xs+1)%N),p); return q
def P_jump(p):             # 不满足则跳到均匀随机赋值
    u=p[~sat].sum(); q=np.where(sat,p,0.0)+u/N; return q
nbr=xs[:,None]^(1<<np.arange(n))
def P_walk(p):             # 不满足则翻转一个随机比特 (超立方体随机游走)
    q=np.where(sat,p,0.0); pu=np.where(sat,0.0,p)/n
    for i in range(n): np.add.at(q,nbr[:,i],pu)
    return q
# ---- 噪声: 以概率 eps 全局重置到均匀 ----
def stationary(P,eps,tol=1e-12):
    p=np.ones(N)/N
    for _ in range(3000000):
        q=(1-eps)*P(p)+eps/N
        if np.abs(q-p).sum()<tol: return q
        p=q
def doeblin(P,eps,K):      # 再生恒等式 π = eps Σ (1-eps)^k ν P^k
    v=np.ones(N)/N; acc=np.zeros(N); w=eps
    for k in range(K):
        acc+=w*v; v=P(v); w*=(1-eps)
    return acc
print("结论 1 (再生恒等式) 与 结论 2 (查询下界 s/(εN)) 在三种环内动力学下:")
print(f"{'动力学':>8} {'eps':>7} {'平稳P(sat)':>11} {'再生恒等式':>11} {'上界s/(eps N)':>13}")
for name,P in (("x+1",P_cycle),("随机跳",P_jump),("随机游走",P_walk)):
    for eps in (1e-2,1e-3,1e-4):
        pi=stationary(P,eps); K=int(40/eps)
        print(f"{name:>8} {eps:>7.0e} {pi[sat].sum():>11.4f} {doeblin(P,eps,K)[sat].sum():>11.4f} {min(1,s/(eps*N)):>13.4f}")

print("\n结论 3 (唯一性 ⇔ 噪声能把状态踢出解):")
def limit_from(P,eps,p0,only_unsat):
    p=p0.copy()
    for _ in range(300000):
        if only_unsat: q=P(p); u=q[~sat].sum(); q=np.where(sat,q,(1-eps)*q)+eps*u/N
        else: q=(1-eps)*P(p)+eps/N
        if np.abs(q-p).sum()<1e-12: break
        p=q
    return p
pos=np.flatnonzero(sat)
for only_unsat,label in ((False,"噪声作用于所有状态"),(True,"噪声只作用于不满足状态(解仍吸收)")):
    a=np.zeros(N); a[pos[0]]=1; b=np.zeros(N); b[pos[1]]=1
    la=limit_from(P_cycle,1e-2,a,only_unsat); lb=limit_from(P_cycle,1e-2,b,only_unsat)
    print(f"  {label}: 两个不同初值的极限分布之差 L1 = {np.abs(la-lb).sum():.2e} -> {'唯一' if np.abs(la-lb).sum()<1e-8 else '不唯一'}")

print("\n结论 4 (噪声阈值与 ETH):  要让 P(sat) ≥ 1/2 需要 eps ≤ 2s/N")
import math
for nn in (50,100,200,400):
    print(f"  n={nn}: 全局噪声需 eps ≤ 2^-{nn}≈{2.0**-nn:.1e};  若ETH成立(2^{{δn}}算法下界,取δ=0.1) 任何环内算法都需 eps ≤ 2^-{0.1*nn:.0f};  ETH被推翻后的最好已知算法 2^(n/√log n) 对应 eps ≤ 2^-{nn/math.sqrt(math.log2(nn)):.0f}")
