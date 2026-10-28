import numpy as np
exec(open('noisy_ctc_A.py').read().split('print(f"{')[0])
# 闭式解: 解的位置把环切成 s 段, 段长 g_i (从一个解出发到下一个解的距离), sum g_i = N
#   P(sat) = (1/(eps*N)) * sum_i (1 - (1-eps)^{g_i})
def closed_form(N,sat,eps):
    pos=np.flatnonzero(sat); gaps=np.diff(np.concatenate([pos,[pos[0]+N]]))
    return ((1-(1-eps)**gaps).sum())/(eps*N)
print("模型A 闭式解 vs 数值平稳分布")
print(f"{'n':>3} {'解数':>4} {'eps':>7} {'数值':>8} {'闭式':>8}")
for n in (8,10,12):
    N,sat=make_instance(n,int(4.26*n))
    while sat.sum()==0 or sat.sum()>4: N,sat=make_instance(n,int(4.26*n))
    for eps in (1e-2,1e-3,1e-4):
        pi,_=stationary(N,sat,eps)
        print(f"{n:>3} {sat.sum():>4} {eps:>7.0e} {pi[sat].sum():>8.4f} {closed_form(N,sat,eps):>8.4f}")
