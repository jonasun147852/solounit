exec(open('steiner7b.py').read().split("print(\"精确最优")[0])
# 退火式: 先给充裕能量探索, 再逐步收紧预算逼它做决定
def run3(seed,hi=4.0,lo=1.0,iters=1200):
    rng=np.random.default_rng(seed)
    D=rng.random(m)+0.1; D*=hi*opt/D.sum()
    for it in range(iters):
        budget=opt*(hi+(lo-hi)*it/iters)
        s,t=rng.choice(K,2,replace=False)
        L=A.T@(D[:,None]*A); b=np.zeros(n); b[idx[terms[s]]]=1; b[idx[terms[t]]]=-1
        L[idx[terms[t]],:]=0; L[idx[terms[t]],idx[terms[t]]]=1; b[idx[terms[t]]]=0
        p=np.linalg.solve(L,b); Q=D*(A@p)
        D=D+0.15*(np.abs(Q)-D); D*=budget/D.sum()
    return extract_tree(D)
print("精确最优:",opt)
print("预算从4x缓慢收紧到1x: 黏菌树长 =",sorted(run3(s) for s in range(10)))
