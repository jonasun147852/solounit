import numpy as np
rng=np.random.default_rng(7)
n=60; target=rng.integers(0,2,n)
def evolve(fitness,best,budget=60000):
    x=rng.integers(0,2,n); f=fitness(x); fmax=f
    for t in range(1,budget+1):
        y=x.copy(); y[rng.integers(n)]^=1
        fy=fitness(y)
        if fy>=f: x,f=y,fy
        if f==best: return t,f
    return None,f
A=lambda x:int((x==target).sum())
B=lambda x:int((x==target).all())
m=int(4.26*n)
vs=np.array([rng.choice(n,3,replace=False) for _ in range(m)]); ss=rng.integers(0,2,(m,3))
C=lambda x:int((x[vs]==ss).any(1).sum())
for name,f,best in (("A 累积选择地形(生命演化那种)",A,n),("B 大海捞针地形(纯随机碰撞)",B,1),("C 临界3-SAT地形(NP难)",C,m)):
    res=[evolve(f,best) for _ in range(5)]
    hit=[t for t,_ in res if t]; stuck=[fv for t,fv in res if not t]
    print(f"{name}: 5次中 {len(hit)} 次到达最优, 步数 {hit if hit else '—'}; 卡住时的适应度 {stuck if stuck else '—'} (最优={best}, 预算6万步, 2^60≈1e18)")
