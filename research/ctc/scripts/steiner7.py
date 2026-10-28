import numpy as np, itertools, heapq
H=W=9
rng0=np.random.default_rng(42)
cells=[(r,c) for r in range(H) for c in range(W)]; idx={v:i for i,v in enumerate(cells)}
terms=[cells[i] for i in rng0.choice(len(cells),7,replace=False)]
edges=[]
for (r,c) in cells:
    for dr,dc in ((0,1),(1,0)):
        if r+dr<H and c+dc<W: edges.append(((r,c),(r+dr,c+dc)))
n,m=len(cells),len(edges)
adj={v:[] for v in cells}
for a,b in edges: adj[a].append(b); adj[b].append(a)
# ---- 精确解: Dreyfus-Wagner ----
K=len(terms); INF=10**9
dist=np.full((n,n),INF,dtype=np.int64)
for s in cells:
    d={s:0}; pq=[(0,s)]
    while pq:
        dd,v=heapq.heappop(pq)
        if dd>d[v]: continue
        for u in adj[v]:
            if dd+1<d.get(u,INF): d[u]=dd+1; heapq.heappush(pq,(dd+1,u))
    for v,dd in d.items(): dist[idx[s],idx[v]]=dd
dp=np.full((1<<K,n),INF,dtype=np.int64)
for i,t in enumerate(terms): dp[1<<i]=dist[idx[t]]
for S in range(1,1<<K):
    if S&(S-1)==0: continue
    sub=(S-1)&S
    while sub:
        if sub<S-sub: dp[S]=np.minimum(dp[S],dp[sub]+dp[S^sub])
        sub=(sub-1)&S
    dp[S]=(dp[S][None,:]+dist).min(axis=1)   # 再经由最短路松弛
opt=int(dp[(1<<K)-1].min())
# ---- 黏菌 ----
A=np.zeros((m,n))
for k,(a,b) in enumerate(edges): A[k,idx[a]]=1; A[k,idx[b]]=-1
def run(seed,budget,iters=1200):
    rng=np.random.default_rng(seed)
    D=rng.random(m)+0.1; D*=budget/D.sum()
    for it in range(iters):
        s,t=rng.choice(K,2,replace=False)
        L=A.T@(D[:,None]*A); b=np.zeros(n); b[idx[terms[s]]]=1; b[idx[terms[t]]]=-1
        L[idx[terms[t]],:]=0; L[idx[terms[t]],idx[terms[t]]]=1; b[idx[terms[t]]]=0
        p=np.linalg.solve(L,b); Q=D*(A@p)
        D=D+0.15*(np.abs(Q)-D); D*=budget/D.sum()
    alive=[k for k in range(m) if D[k]>0.25*D.max()]
    par={v:v for v in cells}
    def f(x):
        while par[x]!=x: par[x]=par[par[x]]; x=par[x]
        return x
    for k in alive: par[f(edges[k][0])]=f(edges[k][1])
    return len(alive), len({f(t) for t in terms})==1
print("7个食物源:",terms)
print("精确最优斯坦纳树长度:",opt)
for mult in (1.0,1.25,2.0):
    res=[run(s,mult*opt) for s in range(10)]
    lens=sorted(l for l,ok in res if ok); fail=sum(1 for _,ok in res if not ok)
    print(f"能量预算={mult:.2f}x最优: 10次中 {fail} 次没连通; 连通时树长 = {lens}")
