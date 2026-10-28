# Tero et al. (2010) Physarum solver on a grid maze.
# Each edge has conductivity D; flow Q computed by solving Kirchhoff; dD/dt = |Q| - D.
import numpy as np, heapq
np.random.seed(0)
maze = [
"S.#......",
".##.####.",
"...#.....",
".#...##.#",
".#.#.#...",
"...#...#T",
]
H,W=len(maze),len(maze[0])
cells={(r,c) for r in range(H) for c in range(W) if maze[r][c]!='#'}
idx={v:i for i,v in enumerate(sorted(cells))}
S=[v for v in cells if maze[v[0]][v[1]]=='S'][0]; T=[v for v in cells if maze[v[0]][v[1]]=='T'][0]
edges=[]
for (r,c) in cells:
    for (dr,dc) in ((0,1),(1,0)):
        u=(r+dr,c+dc)
        if u in cells: edges.append(((r,c),u))
n=len(cells); D=np.ones(len(edges))
for it in range(300):
    L=np.zeros((n,n))
    for k,(a,b) in enumerate(edges):
        i,j=idx[a],idx[b]; L[i,i]+=D[k]; L[j,j]+=D[k]; L[i,j]-=D[k]; L[j,i]-=D[k]
    b=np.zeros(n); b[idx[S]]=1; b[idx[T]]=-1
    L[idx[T],:]=0; L[idx[T],idx[T]]=1; b[idx[T]]=0
    p=np.linalg.solve(L,b)
    Q=np.array([D[k]*(p[idx[a]]-p[idx[b]]) for k,(a,b) in enumerate(edges)])
    D=D+0.2*(np.abs(Q)-D)
alive=[e for k,e in enumerate(edges) if D[k]>0.5]
# Dijkstra for comparison
adj={v:[] for v in cells}
for a,b in edges: adj[a].append(b); adj[b].append(a)
dist={S:0}; pq=[(0,S)]
while pq:
    d,v=heapq.heappop(pq)
    if d>dist[v]: continue
    for u in adj[v]:
        if d+1<dist.get(u,1e9): dist[u]=d+1; heapq.heappush(pq,(d+1,u))
print("Dijkstra 最短路长度:", dist[T])
print("黏菌最终保留的管道数(边数):", len(alive))
print("黏菌管道形成的路径长度:", len(alive), "-> 一致" if len(alive)==dist[T] else "-> 不一致")
grid=[list(r) for r in maze]
for a,b in alive:
    for v in (a,b):
        if grid[v[0]][v[1]]=='.': grid[v[0]][v[1]]='o'
print("\n".join("".join(r) for r in grid))

# 统计最短路条数，并看分支上的管道粗细
from functools import lru_cache
cnt={S:1}
for v in sorted(cells,key=lambda v:dist.get(v,1e9)):
    if v==S: continue
    cnt[v]=sum(cnt.get(u,0) for u in adj[v] if dist.get(u,1e9)==dist.get(v,1e9)-1)
print("\n长度为15的最短路共有", cnt[T], "条")
for k,(a,b) in enumerate(edges):
    if D[k]>0.3: print(a,b,round(D[k],2))
