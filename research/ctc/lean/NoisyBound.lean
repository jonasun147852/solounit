/-!
# 噪声时间环的通用上界（跨模型定理）

设 P 是任意随机核（环内动力学，可随机、可看公式结构），ν 是重置分布，
0 < ε ≤ 1。带噪声的自洽条件：π = ε·ν + (1−ε)·πP。

定理 `noisy_bound`：若对每个 k，"从 ν 出发按 P 走 k 步后落在目标集 S 的概率" ≤ (k+1)·c，
则任何自洽历史 π 满足 π(S) ≤ c/ε。

外部输入只有那个 (k+1)·c 的假设：对黑箱动力学它是无结构搜索查询下界（c = s/N）；
对一般动力学它来自"可验证解的成功率可重复放大"加上 SAT 的时间复杂度下界（c = 1/T*）。
纯核心 Lean 4，不依赖 Mathlib。
-/

namespace NoisyBound

variable {N : Nat}

/-! ### 有理数上的列表和 -/

theorem sum_map_add (l : List α) (f g : α → Rat) :
    (l.map fun x => f x + g x).sum = (l.map f).sum + (l.map g).sum := by
  induction l with
  | nil => show (0 : Rat) = 0 + 0; rw [Rat.add_zero]
  | cons b l ih => simp only [List.map_cons, List.sum_cons, ih]; grind

theorem sum_map_smul (l : List α) (c : Rat) (f : α → Rat) :
    (l.map fun x => c * f x).sum = c * (l.map f).sum := by
  induction l with
  | nil => show (0 : Rat) = c * 0; rw [Rat.mul_zero]
  | cons b l ih => simp only [List.map_cons, List.sum_cons, ih]; grind

theorem sum_map_zero (l : List α) : (l.map fun _ => (0 : Rat)).sum = 0 := by
  induction l with
  | nil => rfl
  | cons b l ih => simp only [List.map_cons, List.sum_cons, Rat.zero_add]; exact ih

theorem sum_map_le (l : List α) (f g : α → Rat) (h : ∀ x, f x ≤ g x) :
    (l.map f).sum ≤ (l.map g).sum := by
  induction l with
  | nil => exact Rat.le_refl
  | cons b l ih =>
    simp only [List.map_cons, List.sum_cons]
    have := h b
    grind

theorem sum_map_nonneg (l : List α) (f : α → Rat) (h : ∀ x, 0 ≤ f x) :
    0 ≤ (l.map f).sum := by
  have := sum_map_le l (fun _ => 0) f h
  rw [sum_map_zero] at this
  exact this

theorem sum_comm (l1 : List α) (l2 : List β) (F : α → β → Rat) :
    (l1.map fun a => (l2.map fun b => F a b).sum).sum
      = (l2.map fun b => (l1.map fun a => F a b).sum).sum := by
  induction l1 with
  | nil => simp only [List.map_nil, List.sum_nil]; rw [sum_map_zero]
  | cons a l1 ih =>
    simp only [List.map_cons, List.sum_cons, ih]
    rw [sum_map_add]

def sumQ (g : Fin N → Rat) : Rat := ((List.finRange N).map g).sum

theorem sumQ_add (f g : Fin N → Rat) : sumQ (fun x => f x + g x) = sumQ f + sumQ g :=
  sum_map_add _ f g
theorem sumQ_smul (c : Rat) (f : Fin N → Rat) : sumQ (fun x => c * f x) = c * sumQ f :=
  sum_map_smul _ c f
theorem sumQ_le (f g : Fin N → Rat) (h : ∀ x, f x ≤ g x) : sumQ f ≤ sumQ g :=
  sum_map_le _ f g h
theorem sumQ_nonneg (f : Fin N → Rat) (h : ∀ x, 0 ≤ f x) : 0 ≤ sumQ f :=
  sum_map_nonneg _ f h
theorem sumQ_comm (F : Fin N → Fin N → Rat) :
    sumQ (fun y => sumQ fun x => F x y) = sumQ (fun x => sumQ fun y => F x y) := by
  unfold sumQ
  exact (sum_comm _ _ (fun x y => F x y)).symm
theorem sumQ_congr (f g : Fin N → Rat) (h : ∀ x, f x = g x) : sumQ f = sumQ g := by
  have : f = g := funext h
  rw [this]

/-! ### 分布、随机核、推前 -/

abbrev Dist (N : Nat) := Fin N → Rat
abbrev Kernel (N : Nat) := Fin N → Fin N → Rat

def total (μ : Dist N) : Rat := sumQ μ
def Nonneg (μ : Dist N) : Prop := ∀ x, 0 ≤ μ x
structure IsDist (μ : Dist N) : Prop where
  nonneg : Nonneg μ
  total  : total μ = 1
structure IsStochastic (P : Kernel N) : Prop where
  nonneg : ∀ x y, 0 ≤ P x y
  rows   : ∀ x, sumQ (P x) = 1

/-- 一步推前：(μP)(y) = Σ_x μ(x) P(x,y)。 -/
def push (μ : Dist N) (P : Kernel N) : Dist N := fun y => sumQ fun x => μ x * P x y

/-- 目标集 S 上的质量。 -/
def mass (μ : Dist N) (S : Fin N → Bool) : Rat := sumQ fun x => if S x then μ x else 0

theorem push_total (μ : Dist N) (P : Kernel N) (hP : IsStochastic P) :
    total (push μ P) = total μ := by
  unfold total push
  rw [sumQ_comm]
  apply sumQ_congr
  intro x
  rw [sumQ_smul, hP.rows x, Rat.mul_one]

theorem push_nonneg (μ : Dist N) (P : Kernel N) (hP : IsStochastic P) (hμ : Nonneg μ) :
    Nonneg (push μ P) := by
  intro y
  apply sumQ_nonneg
  intro x
  exact Rat.mul_nonneg (hμ x) (hP.nonneg x y)

theorem push_isDist (μ : Dist N) (P : Kernel N) (hP : IsStochastic P) (hμ : IsDist μ) :
    IsDist (push μ P) :=
  ⟨push_nonneg μ P hP hμ.nonneg, by rw [push_total μ P hP, hμ.total]⟩

theorem push_lin (a b : Rat) (μ ν : Dist N) (P : Kernel N) :
    push (fun x => a * μ x + b * ν x) P = fun y => a * push μ P y + b * push ν P y := by
  funext y
  unfold push
  rw [← sumQ_smul, ← sumQ_smul, ← sumQ_add]
  apply sumQ_congr
  intro x
  grind

theorem mass_add (μ ν : Dist N) (S : Fin N → Bool) :
    mass (fun x => μ x + ν x) S = mass μ S + mass ν S := by
  unfold mass
  rw [← sumQ_add]
  apply sumQ_congr
  intro x
  by_cases h : S x = true <;> simp [h, Rat.add_zero]

theorem mass_smul (c : Rat) (μ : Dist N) (S : Fin N → Bool) :
    mass (fun x => c * μ x) S = c * mass μ S := by
  unfold mass
  rw [← sumQ_smul]
  apply sumQ_congr
  intro x
  by_cases h : S x = true <;> simp [h, Rat.mul_zero]

theorem mass_lin (a b : Rat) (μ ν : Dist N) (S : Fin N → Bool) :
    mass (fun x => a * μ x + b * ν x) S = a * mass μ S + b * mass ν S := by
  rw [mass_add, mass_smul, mass_smul]

theorem mass_nonneg (μ : Dist N) (S : Fin N → Bool) (hμ : Nonneg μ) : 0 ≤ mass μ S := by
  apply sumQ_nonneg
  intro x
  by_cases h : S x = true
  · simp [h, hμ x]
  · simp [h]

theorem mass_le_one (μ : Dist N) (S : Fin N → Bool) (hμ : IsDist μ) : mass μ S ≤ 1 := by
  rw [← hμ.total]
  apply sumQ_le
  intro x
  by_cases h : S x = true
  · simp [h]
  · simp [h, hμ.nonneg x]

/-! ### 迭代推前与自洽条件 -/

def pushIter (P : Kernel N) : Nat → Dist N → Dist N
  | 0,     μ => μ
  | k + 1, μ => pushIter P k (push μ P)

theorem pushIter_isDist (P : Kernel N) (hP : IsStochastic P) :
    ∀ (k : Nat) (μ : Dist N), IsDist μ → IsDist (pushIter P k μ) := by
  intro k
  induction k with
  | zero => intro μ h; exact h
  | succ k ih => intro μ h; exact ih _ (push_isDist μ P hP h)

theorem pushIter_lin (P : Kernel N) : ∀ (k : Nat) (a b : Rat) (μ ν : Dist N),
    pushIter P k (fun x => a * μ x + b * ν x)
      = fun y => a * pushIter P k μ y + b * pushIter P k ν y := by
  intro k
  induction k with
  | zero => intro a b μ ν; rfl
  | succ k ih =>
    intro a b μ ν
    show pushIter P k (push (fun x => a * μ x + b * ν x) P) = _
    rw [push_lin, ih]
    rfl

/-- 带噪声的自洽条件：π = ε ν + (1−ε) πP。 -/
def NoisyStationary (P : Kernel N) (ν : Dist N) (ε : Rat) (π : Dist N) : Prop :=
  π = fun y => ε * ν y + (1 - ε) * push π P y

/-- 几何级数的前 K 项：Σ_{k<K} ε (1−ε)^k ν P^k。 -/
def geomPartial (P : Kernel N) (ν : Dist N) (ε : Rat) : Nat → Dist N
  | 0     => fun _ => 0
  | K + 1 => fun y => geomPartial P ν ε K y + ε * (1 - ε) ^ K * pushIter P K ν y

/-- **Doeblin 展开（有限项，纯代数）.** π = Σ_{k<K} ε(1−ε)^k νP^k + (1−ε)^K πP^K。 -/
theorem doeblin_expand (P : Kernel N) (ν : Dist N) (ε : Rat) (π : Dist N)
    (hπ : NoisyStationary P ν ε π) :
    ∀ K y, π y = geomPartial P ν ε K y + (1 - ε) ^ K * pushIter P K π y := by
  intro K
  induction K with
  | zero => intro y; simp only [geomPartial, pushIter, Rat.pow_zero]; grind
  | succ K ih =>
    intro y
    have hK := ih y
    -- 把 π 在最后一项里展开一次
    have hsub : pushIter P K π = pushIter P K (fun x => ε * ν x + (1 - ε) * push π P x) :=
      congrArg (pushIter P K) hπ
    rw [hsub, pushIter_lin] at hK
    simp only [geomPartial]
    have hnext : pushIter P K (push π P) = pushIter P (K + 1) π := rfl
    rw [hnext] at hK
    rw [hK, Rat.pow_succ]
    grind

/-- 标量形式的前 K 项和。 -/
def scal (P : Kernel N) (ν : Dist N) (ε : Rat) (S : Fin N → Bool) : Nat → Rat
  | 0     => 0
  | K + 1 => scal P ν ε S K + ε * (1 - ε) ^ K * mass (pushIter P K ν) S

theorem geomPartial_mass (P : Kernel N) (ν : Dist N) (ε : Rat) (S : Fin N → Bool) :
    ∀ K, mass (geomPartial P ν ε K) S = scal P ν ε S K := by
  intro K
  induction K with
  | zero =>
    show sumQ (fun x => if S x then (0 : Rat) else 0) = 0
    have : (fun x : Fin N => if S x then (0 : Rat) else 0) = fun _ => 0 := by
      funext x; by_cases h : S x = true <;> simp [h]
    rw [this]; exact sum_map_zero _
  | succ K ih =>
    show mass (fun y => geomPartial P ν ε K y + (ε * (1 - ε) ^ K) * pushIter P K ν y) S = _
    rw [mass_add, mass_smul, ih]
    rfl

/-! ### 标量引理 -/

theorem pow_nonneg' (q : Rat) (hq : 0 ≤ q) (k : Nat) : 0 ≤ q ^ k := Rat.pow_nonneg hq

/-- Σ_{k<K} (k+1) q^k 的闭式：(1−q)² Σ = 1 − q^K (1 + K(1−q))。 -/
def T (q : Rat) : Nat → Rat
  | 0     => 0
  | K + 1 => T q K + (K + 1 : Nat) * q ^ K

theorem T_identity (q : Rat) : ∀ K, (1 - q) ^ 2 * T q K = 1 - q ^ K * (1 + (K : Rat) * (1 - q)) := by
  intro K
  induction K with
  | zero => simp only [T, Rat.pow_zero]; push_cast; grind
  | succ K ih =>
    simp only [T, Rat.pow_succ]
    push_cast
    grind

theorem T_le (q : Rat) (hq0 : 0 ≤ q) (hq1 : q ≤ 1) (K : Nat) :
    (1 - q) ^ 2 * T q K ≤ 1 := by
  rw [T_identity]
  have h1 : 0 ≤ q ^ K := Rat.pow_nonneg hq0
  have h2 : 0 ≤ (K : Rat) * (1 - q) := Rat.mul_nonneg (by exact_mod_cast Nat.zero_le K) (by grind)
  have h3 : 0 ≤ q ^ K * (1 + (K : Rat) * (1 - q)) := Rat.mul_nonneg h1 (by grind)
  grind

/-- 伯努利不等式的形式：(1 + Kε)(1−ε)^K ≤ 1。 -/
theorem bernoulli (ε : Rat) (h0 : 0 ≤ ε) (h1 : ε ≤ 1) :
    ∀ K : Nat, (1 + (K : Rat) * ε) * (1 - ε) ^ K ≤ 1 := by
  intro K
  induction K with
  | zero => simp only [Rat.pow_zero]; push_cast; grind
  | succ K ih =>
    rw [Rat.pow_succ]
    push_cast
    have hq : 0 ≤ (1 - ε) ^ K := Rat.pow_nonneg (by grind)
    have hε2 : 0 ≤ ε * ε * ((K : Rat) + 1) * (1 - ε) ^ K :=
      Rat.mul_nonneg (Rat.mul_nonneg (Rat.mul_nonneg h0 h0) (by exact_mod_cast Nat.zero_le (K+1))) hq
    grind

/-! ### 主定理 -/

/-- 累积的几何加权和 ≤ ε c T。 -/
theorem scal_le (P : Kernel N) (ν : Dist N) (ε c : Rat) (hε : 0 ≤ ε) (hε1 : ε ≤ 1) (_hc : 0 ≤ c)
    (S : Fin N → Bool)
    (H : ∀ k, mass (pushIter P k ν) S ≤ ((k : Rat) + 1) * c) :
    ∀ K, scal P ν ε S K ≤ ε * c * T (1 - ε) K := by
  intro K
  induction K with
  | zero => simp only [scal, T]; grind
  | succ K ih =>
    simp only [scal, T]
    have hq : 0 ≤ (1 - ε) ^ K := Rat.pow_nonneg (by grind)
    have hw : 0 ≤ ε * (1 - ε) ^ K := Rat.mul_nonneg hε hq
    have hterm : ε * (1 - ε) ^ K * mass (pushIter P K ν) S ≤ ε * (1 - ε) ^ K * (((K : Rat) + 1) * c) :=
      Rat.mul_le_mul_of_nonneg_left (H K) hw
    push_cast
    grind

/-- **定理（噪声环通用上界）.** -/
theorem noisy_bound (P : Kernel N) (hP : IsStochastic P) (ν : Dist N) (ε : Rat)
    (hε : 0 < ε) (hε1 : ε ≤ 1) (π : Dist N) (hπd : IsDist π) (hπ : NoisyStationary P ν ε π)
    (S : Fin N → Bool) (c : Rat) (hc : 0 ≤ c)
    (H : ∀ k, mass (pushIter P k ν) S ≤ ((k : Rat) + 1) * c) :
    mass π S ≤ c / ε := by
  -- 对每个 K：mass π S ≤ ε c T K + (1−ε)^K ≤ c/ε + (1−ε)^K
  have hK : ∀ K : Nat, mass π S ≤ c / ε + (1 - ε) ^ K := by
    intro K
    have hexp : π = fun y => geomPartial P ν ε K y + (1 - ε) ^ K * pushIter P K π y := by
      funext y; exact doeblin_expand P ν ε π hπ K y
    have hm : mass π S = mass (fun y => geomPartial P ν ε K y + (1 - ε) ^ K * pushIter P K π y) S :=
      congrArg (fun μ => mass μ S) hexp
    rw [mass_add, mass_smul] at hm
    rw [hm, geomPartial_mass]
    have h1 := scal_le P ν ε c (Rat.le_of_lt hε) hε1 hc S H K
    have h2 : mass (pushIter P K π) S ≤ 1 := mass_le_one _ S (pushIter_isDist P hP K π hπd)
    have hq : 0 ≤ (1 - ε) ^ K := Rat.pow_nonneg (by grind)
    have h3 : (1 - ε) ^ K * mass (pushIter P K π) S ≤ (1 - ε) ^ K * 1 :=
      Rat.mul_le_mul_of_nonneg_left h2 hq
    have hT : ε ^ 2 * T (1 - ε) K ≤ 1 := by
      have := T_le (1 - ε) (by grind) (by grind) K
      have e : (1 - (1 - ε)) ^ 2 = ε ^ 2 := by grind
      rw [e] at this; exact this
    have hTc : ε * c * T (1 - ε) K ≤ c / ε := by
      have hεne : ε ≠ 0 := Rat.ne_of_gt hε
      have h1 : c * (ε ^ 2 * T (1 - ε) K) ≤ c * 1 := Rat.mul_le_mul_of_nonneg_left hT hc
      have h2 : ε * (c / ε) = c := by grind
      have h3 : ε * (ε * c * T (1 - ε) K) ≤ ε * (c / ε) := by rw [h2]; grind
      exact Rat.le_of_mul_le_mul_left h3 hε
    grind
  -- 取极限：若 mass π S > c/ε，取 K 使 (1−ε)^K < 差值，矛盾
  apply Classical.byContradiction
  intro hlt
  have hgt : c / ε < mass π S := by grind
  obtain ⟨δ, hδ⟩ : ∃ δ : Rat, δ = mass π S - c / ε := ⟨_, rfl⟩
  have hδpos : 0 < δ := by grind
  -- 需要 K 使 (1 + Kε) > 1/δ，即 K > (1/δ − 1)/ε（阿基米德性质，用 ceil）
  have hεne : ε ≠ 0 := Rat.ne_of_gt hε
  have hδne : δ ≠ 0 := Rat.ne_of_gt hδpos
  have hr : ∃ K : Nat, (1 / δ - 1) / ε < (K : Rat) := by
    refine ⟨((1 / δ - 1) / ε).ceil.toNat + 1, ?_⟩
    have h1 : (1 / δ - 1) / ε ≤ ((((1 / δ - 1) / ε).ceil : Int) : Rat) := Rat.le_ceil
    have h2 : ((((1 / δ - 1) / ε).ceil : Int) : Rat) ≤ (((((1 / δ - 1) / ε).ceil.toNat : Nat) : Int) : Rat) :=
      Rat.intCast_le_intCast.mpr (Int.self_le_toNat _)
    rw [Rat.intCast_natCast] at h2
    push_cast
    grind
  obtain ⟨K, hKr⟩ := hr
  have hb := bernoulli ε (Rat.le_of_lt hε) hε1 K
  have hK' := hK K
  have hK0 : (0 : Rat) ≤ (K : Rat) := by exact_mod_cast Nat.zero_le K
  have hpos : 0 < 1 + (K : Rat) * ε := by
    have := Rat.mul_nonneg hK0 (Rat.le_of_lt hε); grind
  have hq : 0 ≤ (1 - ε) ^ K := Rat.pow_nonneg (by grind)
  -- (1/δ − 1)/ε < K  ⟹  1/δ < 1 + Kε
  have hKε : 1 / δ < 1 + (K : Rat) * ε := by
    have h1 : ε * ((1 / δ - 1) / ε) < ε * (K : Rat) := (Rat.mul_lt_mul_left hε).mpr hKr
    have h2 : ε * ((1 / δ - 1) / ε) = 1 / δ - 1 := by grind
    rw [h2] at h1
    grind
  -- 于是 (1−ε)^K < δ：否则 (1+Kε)(1−ε)^K ≥ (1+Kε)δ > (1/δ)δ = 1
  have hsmall : (1 - ε) ^ K < δ := by
    apply Classical.byContradiction
    intro hnot
    have hge : δ ≤ (1 - ε) ^ K := by grind
    have h1 : (1 + (K : Rat) * ε) * δ ≤ (1 + (K : Rat) * ε) * (1 - ε) ^ K :=
      Rat.mul_le_mul_of_nonneg_left hge (Rat.le_of_lt hpos)
    have h2 : δ * (1 / δ) < δ * (1 + (K : Rat) * ε) := (Rat.mul_lt_mul_left hδpos).mpr hKε
    have h3 : δ * (1 / δ) = 1 := by grind
    rw [h3] at h2
    grind
  grind

/-- **推论（噪声阈值）.** 若噪声环能以 ≥ 1/2 的概率读出目标集，则 ε ≤ 2c。
    黑箱情形 c = s/N，即 ε ≤ 2s/2^n；一般情形 c = 1/T*，即 ε ≤ 2/T*。 -/
theorem noisy_threshold (P : Kernel N) (hP : IsStochastic P) (ν : Dist N) (ε : Rat)
    (hε : 0 < ε) (hε1 : ε ≤ 1) (π : Dist N) (hπd : IsDist π) (hπ : NoisyStationary P ν ε π)
    (S : Fin N → Bool) (c : Rat) (hc : 0 ≤ c)
    (H : ∀ k, mass (pushIter P k ν) S ≤ ((k : Rat) + 1) * c)
    (hread : 1 / 2 ≤ mass π S) : ε ≤ 2 * c := by
  have hb := noisy_bound P hP ν ε hε hε1 π hπd hπ S c hc H
  have hεne : ε ≠ 0 := Rat.ne_of_gt hε
  have h1 : ε * (1 / 2) ≤ ε * (c / ε) := Rat.mul_le_mul_of_nonneg_left (Rat.le_trans hread hb) (Rat.le_of_lt hε)
  have h2 : ε * (c / ε) = c := by grind
  rw [h2] at h1
  grind

end NoisyBound

#print axioms NoisyBound.noisy_bound
#print axioms NoisyBound.noisy_threshold
