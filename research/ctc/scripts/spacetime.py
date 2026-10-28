import math
# 平直三维空间里的"光锥黏菌": t 步后最多占据 ~ (4/3)π t^3 个格子
# 搜索树: 3-SAT 暴力 2^n;  ETH反证宣称 2^(n/sqrt(log2 n))
print("平直时空: 需要多少步 t 才能铺满搜索树 (t^3 ≈ 树大小)")
print(f"{'n(变量数)':>10} {'2^n':>10} {'ETH反证算法':>12} {'t需求(暴力)':>12} {'t需求(反证)':>12}")
for n in (30,60,100,200,400,1000):
    brute=2**n
    sub=2**(n/math.sqrt(math.log2(n)))
    print(f"{n:>10} {brute:>10.1e} {sub:>12.1e} {brute**(1/3):>12.1e} {sub**(1/3):>12.1e}")
print()
# 宇宙硬上限
limits={"可观测宇宙总操作数 (Lloyd)":1e120,"全息界总比特数":1e122,"可观测宇宙普朗克体积数":1e185}
print("宇宙上限对应的最大变量数 n (2^n = 上限):")
for k,v in limits.items(): print(f"  {k}: n ≈ {math.log2(v):.0f}")
print()
# 双曲空间: 半径R的球体积 ~ e^(2R/L), L为曲率半径
L=1e26   # 宇宙曲率半径下限 (米)
R=4.4e26 # 可观测宇宙半径 (米)
print(f"双曲空间指数因子 e^(2R/L) 在我们宇宙里最多约 e^{2*R/L:.1f} ≈ {math.exp(2*R/L):.0f} 倍, 相当于多出 {2*R/L/math.log(2):.1f} 个变量")
