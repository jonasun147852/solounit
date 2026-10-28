exec(open('steiner7.py').read().split("print(\"7个食物源")[0])
# 更公平的度量: 在黏菌保留的管道里, 优先沿粗管道取一棵树, 再剪掉不通向食物源的末梢
def extract_tree(D):
    order=np.argsort(-D)          # 粗的先连
    par={v:v for v in cells}
    def f(x):
        while par[x]!=x: par[x]=par[par[x]]; x=par[x]
        return x
    tree=[]
    for k in order:
        a,b=edges[k]
        if f(a)!=f(b): par[f(a)]=f(b); tree.append((a,b))
    # 剪枝
    deg={v:0 for v in cells}; T=set(terms)
    tadj={v:set() for v in cells}
    for a,b in tree: tadj[a].add(b); tadj[b].add(a)
    changed=True
    while changed:
        changed=False
        for v in cells:
            if v not in T and len(tadj[v])==1:
                u=tadj[v].pop(); tadj[u].discard(v); changed=True
    return sum(len(s) for s in tadj.values())//2
def run2(seed,budget,iters=1200):
    rng=np.random.default_rng(seed)
    D=rng.random(m)+0.1; D*=budget/D.sum()
    for it in range(iters):
        s,t=rng.choice(K,2,replace=False)
        L=A.T@(D[:,None]*A); b=np.zeros(n); b[idx[terms[s]]]=1; b[idx[terms[t]]]=-1
        L[idx[terms[t]],:]=0; L[idx[terms[t]],idx[terms[t]]]=1; b[idx[terms[t]]]=0
        p=np.linalg.solve(L,b); Q=D*(A@p)
        D=D+0.15*(np.abs(Q)-D); D*=budget/D.sum()
    return extract_tree(D)
print("精确最优:",opt)
for mult in (1.0,2.0):
    print(f"预算={mult}x: 黏菌给出的树长 =",sorted(run2(s,mult*opt) for s in range(10)))
