# 精确有理数验证: 用 Fraction 做高斯消元解平稳方程, 与闭式比较, 不经过浮点
from fractions import Fraction as F
import itertools, random
random.seed(3)
def solve_stationary(N, sat, eps):
    # 未知量 pi[0..N-1]; 方程: pi_y = (1-eps) * sum_{step x = y} pi_x + eps/N
    nxt=[x if sat[x] else (x+1)%N for x in range(N)]
    A=[[F(0)]*N for _ in range(N)]; b=[F(eps)/N for _ in range(N)]
    for y in range(N): A[y][y]+=1
    for x in range(N): A[nxt[x]][x]-=(1-F(eps))
    # 高斯消元
    for i in range(N):
        p=next(r for r in range(i,N) if A[r][i]!=0); A[i],A[p]=A[p],A[i]; b[i],b[p]=b[p],b[i]
        inv=1/A[i][i]; A[i]=[v*inv for v in A[i]]; b[i]*=inv
        for r in range(N):
            if r!=i and A[r][i]!=0:
                f=A[r][i]; A[r]=[a-f*c for a,c in zip(A[r],A[i])]; b[r]-=f*b[i]
    return b
def closed(N, sat, eps):
    pos=[x for x in range(N) if sat[x]]
    gaps=[(pos[(i+1)%len(pos)]-pos[i])%N or N for i in range(len(pos))]
    return sum(1-(1-F(eps))**g for g in gaps)/(F(eps)*N)
for N,k in ((16,2),(24,3),(32,1)):
    sat=[False]*N
    for p in random.sample(range(N),k): sat[p]=True
    for eps in (F(1,10),F(1,100),F(1,1000)):
        pi=solve_stationary(N,sat,eps)
        exact=sum(pi[x] for x in range(N) if sat[x])
        print(f"N={N} 解数={k} eps={eps}: 线性方程组精确解={exact}  闭式={closed(N,sat,eps)}  相等={exact==closed(N,sat,eps)}  总和={sum(pi)}")
