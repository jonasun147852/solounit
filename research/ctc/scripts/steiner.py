# 带"能量预算"的黏菌模型 (总管道量守恒) 解 3 个食物源的斯坦纳树问题
import numpy as np, sys
H=W=9
terms=[(0,0),(0,8),(8,4)]
opt=(max(t[0] for t in terms)-min(t[0] for t in terms))+(max(t[1] for t in terms)-min(t[1] for t in terms))
cells=[(r,c) for r in range(H) for c in range(W)]; idx={v:i for i,v in enumerate(cells)}
edges=[]
for (r,c) in cells:
    for dr,dc in ((0,1),(1,0)):
        if r+dr<H and c+dc<W: edges.append(((r,c),(r+dr,c+dc)))
n,m=len(cells),len(edges)
A=np.zeros((m,n))
for k,(a,b) in enumerate(edges): A[k,idx[a]]=1; A[k,idx[b]]=-1

def run(seed,budget):
    rng=np.random.default_rng(seed)
    D=rng.random(m)+0.1; D*=budget/D.sum()          # 随机初始分配，总能量固定
    for it in range(600):
        s,t=rng.choice(len(terms),2,replace=False)   # 每一步随机选一对食物源通流
        L=A.T@(D[:,None]*A); b=np.zeros(n); b[idx[terms[s]]]=1; b[idx[terms[t]]]=-1
        L[idx[terms[t]],:]=0; L[idx[terms[t]],idx[terms[t]]]=1; b[idx[terms[t]]]=0
        p=np.linalg.solve(L,b); Q=D*(A@p)
        D=D+0.15*(np.abs(Q)-D)
        D*=budget/D.sum()                             # 能量守恒：只能重新分配，不能凭空增加
    alive=[k for k in range(m) if D[k]>0.25*D.max()]
    # 连通性检查
    par={v:v for v in cells}
    def f(x):
        while par[x]!=x: par[x]=par[par[x]]; x=par[x]
        return x
    for k in alive: par[f(edges[k][0])]=f(edges[k][1])
    ok=len({f(t) for t in terms})==1
    return len(alive),ok

print(f"最优斯坦纳树长度(理论值): {opt}")
for budget in (opt, 2*opt, 5*opt):
    res=[run(s,budget) for s in range(8)]
    lens=[l for l,ok in res if ok]; fail=sum(1 for _,ok in res if not ok)
    print(f"能量预算={budget:>3}: 8次中 {fail} 次没连通; 连通时的树长 = {sorted(lens)}")
