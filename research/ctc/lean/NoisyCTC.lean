/-!
# 带全局噪声的 Deutsch 时间环：平稳分布的闭式解（命题 A）

模型 A：每次穿环，以概率 ε 整个寄存器被重置为均匀随机，否则执行
  step x = if φ x then x else x+1 (mod N)。
自洽历史 = 链 (1−ε)·Step + ε·Uniform 的平稳分布 π：
  π y = (1−ε) · Σ_{x : step x = y} π x + ε / N。

主定理 `piA_stationary`：若 g 是"到前一个满足赋值的向后距离"的标注，则
  π x = (1 − (1−ε)^{g x}) / (ε N)   （x 满足 φ）
  π x = (1 − (1−ε)^{g x}) / N       （x 不满足 φ）
是平稳的。纯核心 Lean 4，不依赖 Mathlib。
-/

namespace NoisyCTC

variable {N : Nat}

/-! ### 环上的后继与前驱（与 CTC.lean 相同） -/

def cyc (hN : 0 < N) (x : Fin N) : Fin N := ⟨(x.val + 1) % N, Nat.mod_lt _ hN⟩

def step (hN : 0 < N) (φ : Fin N → Bool) (x : Fin N) : Fin N :=
  if φ x then x else cyc hN x

def pred (hN : 0 < N) (y : Fin N) : Fin N :=
  ⟨if y.val = 0 then N - 1 else y.val - 1, by split <;> omega⟩

theorem cyc_val (hN : 0 < N) (x : Fin N) :
    (cyc hN x).val = if x.val + 1 < N then x.val + 1 else 0 := by
  unfold cyc
  simp only
  split
  · exact Nat.mod_eq_of_lt (by assumption)
  · have : x.val + 1 = N := by have := x.isLt; omega
    rw [this, Nat.mod_self]

theorem cyc_injective (hN : 0 < N) {x x' : Fin N} (h : cyc hN x = cyc hN x') : x = x' := by
  apply Fin.ext
  have hv := congrArg Fin.val h
  rw [cyc_val, cyc_val] at hv
  have hx := x.isLt; have hx' := x'.isLt
  split at hv <;> split at hv <;> omega

theorem cyc_pred (hN : 0 < N) (y : Fin N) : cyc hN (pred hN y) = y := by
  apply Fin.ext
  rw [cyc_val]
  have hy := y.isLt
  unfold pred
  simp only
  split <;> split <;> omega

theorem cyc_eq_iff (hN : 0 < N) (x y : Fin N) : cyc hN x = y ↔ x = pred hN y := by
  constructor
  · intro h; exact cyc_injective hN (h.trans (cyc_pred hN y).symm)
  · intro h; rw [h]; exact cyc_pred hN y

theorem pred_ne (hN : 0 < N) (hN2 : 1 < N) (y : Fin N) : pred hN y ≠ y := by
  intro h
  have hv := congrArg Fin.val h
  unfold pred at hv
  simp only at hv
  have := y.isLt
  split at hv <;> omega

/-! ### 有理数上的有限和 -/

def sumQ (g : Fin N → Rat) : Rat := ((List.finRange N).map g).sum

theorem sum_map_add (l : List α) (f g : α → Rat) :
    (l.map fun x => f x + g x).sum = (l.map f).sum + (l.map g).sum := by
  induction l with
  | nil => show (0 : Rat) = 0 + 0; rw [Rat.add_zero]
  | cons b l ih =>
    simp only [List.map_cons, List.sum_cons, ih]
    grind

theorem sum_map_zero (l : List α) : (l.map fun _ => (0 : Rat)).sum = 0 := by
  induction l with
  | nil => rfl
  | cons b l ih => simp only [List.map_cons, List.sum_cons, Rat.zero_add]; exact ih

theorem sumQ_add (f g : Fin N → Rat) : sumQ (fun x => f x + g x) = sumQ f + sumQ g :=
  sum_map_add _ f g

theorem sumQ_indicator : ∀ {N : Nat} (y : Fin N) (c : Rat),
    sumQ (fun x => if x = y then c else 0) = c := by
  intro N
  induction N with
  | zero => intro y; exact absurd y.isLt (Nat.not_lt_zero _)
  | succ n ih =>
    intro y c
    unfold sumQ
    rw [List.finRange_succ, List.map_cons, List.map_map, List.sum_cons]
    rcases y with ⟨yv, hy⟩
    cases yv with
    | zero =>
      have h0 : (⟨0, hy⟩ : Fin (n+1)) = 0 := rfl
      rw [h0]
      simp only [ite_true]
      have hz : ((fun x : Fin (n+1) => if x = 0 then c else 0) ∘ Fin.succ) = fun _ => (0 : Rat) := by
        funext i; simp [Function.comp, Fin.succ_ne_zero]
      rw [hz, sum_map_zero, Rat.add_zero]
    | succ yv =>
      have hs : (⟨yv + 1, hy⟩ : Fin (n+1)) = Fin.succ ⟨yv, Nat.lt_of_succ_lt_succ hy⟩ := rfl
      rw [hs]
      have hne : (0 : Fin (n+1)) ≠ Fin.succ ⟨yv, Nat.lt_of_succ_lt_succ hy⟩ := (Fin.succ_ne_zero _).symm
      simp only [hne, ite_false, Rat.zero_add]
      have hz : ((fun x : Fin (n+1) => if x = Fin.succ ⟨yv, Nat.lt_of_succ_lt_succ hy⟩ then c else 0) ∘ Fin.succ)
          = fun i : Fin n => if i = ⟨yv, Nat.lt_of_succ_lt_succ hy⟩ then c else 0 := by
        funext i
        show (if Fin.succ i = Fin.succ ⟨yv, Nat.lt_of_succ_lt_succ hy⟩ then c else 0) = _
        simp only [Fin.succ_inj]
      rw [hz]
      exact ih _ c

/-! ### 带噪声的自洽条件 -/

/-- 一次穿环流入 y 的质量。 -/
def preimageMass (f : Fin N → Fin N) (π : Fin N → Rat) (y : Fin N) : Rat :=
  sumQ fun x => if f x = y then π x else 0

/-- 模型 A 的自洽条件：π = (1−ε)·Step*π + ε·Uniform。 -/
def NoisyStationary (hN : 0 < N) (φ : Fin N → Bool) (ε : Rat) (π : Fin N → Rat) : Prop :=
  ∀ y, π y = (1 - ε) * preimageMass (step hN φ) π y + ε / (N : Rat)

/-- 流入 y 的质量只来自 y 自己（若 y 满足）和 y 的前驱（若前驱不满足）。 -/
theorem summand_eq (hN : 0 < N) (hN2 : 1 < N) (φ : Fin N → Bool) (π : Fin N → Rat) (y x : Fin N) :
    (if step hN φ x = y then π x else 0)
      = (if x = y then (if φ y then π y else 0) else 0)
        + (if x = pred hN y then (if φ (pred hN y) then 0 else π (pred hN y)) else 0) := by
  have hpy : pred hN y ≠ y := pred_ne hN hN2 y
  cases hφ : φ x with
  | true =>
    have hs : step hN φ x = x := by simp [step, hφ]
    rw [hs]
    by_cases hxy : x = y
    · subst hxy
      have : x ≠ pred hN x := fun h => hpy h.symm
      simp [hφ, this, Rat.add_zero]
    · by_cases hxp : x = pred hN y
      · subst hxp
        simp [hφ, hxy, Rat.add_zero]
      · simp [hxy, hxp, Rat.add_zero]
  | false =>
    have hs : step hN φ x = cyc hN x := by simp [step, hφ]
    rw [hs]
    by_cases hxp : x = pred hN y
    · subst hxp
      rw [cyc_pred]
      simp [hφ, hpy, Rat.zero_add]
    · have hc : cyc hN x ≠ y := fun h => hxp ((cyc_eq_iff hN x y).mp h)
      by_cases hxy : x = y
      · subst hxy; simp [hφ, hxp, hc, Rat.add_zero]
      · simp [hxy, hxp, hc, Rat.add_zero]

theorem preimage_eq (hN : 0 < N) (hN2 : 1 < N) (φ : Fin N → Bool) (π : Fin N → Rat) (y : Fin N) :
    preimageMass (step hN φ) π y
      = (if φ y then π y else 0) + (if φ (pred hN y) then 0 else π (pred hN y)) := by
  unfold preimageMass
  have h : (fun x => if step hN φ x = y then π x else 0)
      = fun x => (if x = y then (if φ y then π y else 0) else 0)
        + (if x = pred hN y then (if φ (pred hN y) then 0 else π (pred hN y)) else 0) := by
    funext x; exact summand_eq hN hN2 φ π y x
  rw [h, sumQ_add, sumQ_indicator, sumQ_indicator]

/-! ### 标注与闭式解 -/

/-- `g x` = 从 x 向后走到最近的满足赋值的步数。只用到两条局部性质。 -/
structure Labeling (hN : 0 < N) (φ : Fin N → Bool) (g : Fin N → Nat) : Prop where
  sat_pred   : ∀ x, φ (pred hN x) = true  → g x = 1
  unsat_pred : ∀ x, φ (pred hN x) = false → g x = g (pred hN x) + 1

/-- 命题 A 的候选平稳分布。 -/
def piA (φ : Fin N → Bool) (ε : Rat) (g : Fin N → Nat) (x : Fin N) : Rat :=
  if φ x then (1 - (1 - ε) ^ (g x)) / (ε * (N : Rat)) else (1 - (1 - ε) ^ (g x)) / (N : Rat)

theorem natCast_ne_zero (hN : 0 < N) : (N : Rat) ≠ 0 := by
  intro h
  have h2 := congrArg Rat.num h
  simp at h2
  omega

/-- **命题 A.** 闭式分布 `piA` 满足带噪声的自洽条件。 -/
theorem piA_stationary (hN : 0 < N) (hN2 : 1 < N) (φ : Fin N → Bool) (ε : Rat) (hε : ε ≠ 0)
    (g : Fin N → Nat) (hg : Labeling hN φ g) :
    NoisyStationary hN φ ε (piA φ ε g) := by
  intro y
  rw [preimage_eq hN hN2]
  have hNq : (N : Rat) ≠ 0 := natCast_ne_zero hN
  cases hφy : φ y with
  | true =>
    cases hφp : φ (pred hN y) with
    | true =>
      have h1 : g y = 1 := hg.sat_pred y hφp
      simp only [piA, hφy, hφp, ite_true, h1, Rat.pow_succ, Rat.pow_zero]
      grind
    | false =>
      have h1 : g y = g (pred hN y) + 1 := hg.unsat_pred y hφp
      simp only [piA, hφy, hφp, ite_true, h1, Rat.pow_succ]
      grind
  | false =>
    cases hφp : φ (pred hN y) with
    | true =>
      have h1 : g y = 1 := hg.sat_pred y hφp
      simp only [piA, hφy, hφp, ite_true, h1, Rat.pow_succ, Rat.pow_zero]
      grind
    | false =>
      have h1 : g y = g (pred hN y) + 1 := hg.unsat_pred y hφp
      simp only [piA, hφy, hφp, h1, Rat.pow_succ]
      grind

/-- 推论：满足赋值上的质量就是闭式 (1 − (1−ε)^g)/(εN)。 -/
theorem piA_sat (φ : Fin N → Bool) (ε : Rat) (g : Fin N → Nat) (z : Fin N) (hz : φ z = true) :
    piA φ ε g z = (1 - (1 - ε) ^ (g z)) / (ε * (N : Rat)) := by
  simp [piA, hz]

/-! ### 唯一性：任何自洽历史都等于 piA -/

theorem labeling_pos {hN : 0 < N} {φ : Fin N → Bool} {g : Fin N → Nat}
    (hg : Labeling hN φ g) (x : Fin N) : 1 ≤ g x := by
  cases h : φ (pred hN x) with
  | true => rw [hg.sat_pred x h]; exact Nat.le_refl _
  | false => rw [hg.unsat_pred x h]; omega

theorem stationary_unique (hN : 0 < N) (hN2 : 1 < N) (φ : Fin N → Bool) (ε : Rat) (hε : ε ≠ 0)
    (g : Fin N → Nat) (hg : Labeling hN φ g) (π : Fin N → Rat)
    (hπ : NoisyStationary hN φ ε π) : ∀ x, π x = piA φ ε g x := by
  have hNq : (N : Rat) ≠ 0 := natCast_ne_zero hN
  -- 对 g x 做归纳
  suffices h : ∀ k, ∀ x, g x = k → π x = piA φ ε g x from fun x => h (g x) x rfl
  intro k
  induction k with
  | zero => intro x hx; have := labeling_pos hg x; omega
  | succ k ih =>
    intro x hx
    have hst := hπ x
    rw [preimage_eq hN hN2] at hst
    cases hφp : φ (pred hN x) with
    | true =>
      have h1 : g x = 1 := hg.sat_pred x hφp
      cases hφx : φ x with
      | true =>
        simp only [hφx, hφp, ite_true] at hst
        simp only [piA, hφx, ite_true, h1, Rat.pow_succ, Rat.pow_zero]
        grind
      | false =>
        simp only [hφx, hφp, ite_true] at hst
        simp only [piA, hφx, h1, Rat.pow_succ, Rat.pow_zero]
        grind
    | false =>
      have h1 : g x = g (pred hN x) + 1 := hg.unsat_pred x hφp
      have hk : g (pred hN x) = k := by omega
      have hpred := ih (pred hN x) hk
      cases hφx : φ x with
      | true =>
        simp only [hφx, hφp, ite_true] at hst
        rw [hpred] at hst
        simp only [piA, hφx, hφp, ite_true, h1, Rat.pow_succ] at hst ⊢
        grind
      | false =>
        simp only [hφx, hφp] at hst
        rw [hpred] at hst
        simp only [piA, hφx, hφp, h1, Rat.pow_succ] at hst ⊢
        grind

/-! ### 归一化：任何自洽历史的总质量都是 1 -/

theorem sum_comm (l1 : List α) (l2 : List β) (F : α → β → Rat) :
    (l1.map fun a => (l2.map fun b => F a b).sum).sum
      = (l2.map fun b => (l1.map fun a => F a b).sum).sum := by
  induction l1 with
  | nil => simp only [List.map_nil, List.sum_nil]; rw [sum_map_zero]
  | cons a l1 ih =>
    simp only [List.map_cons, List.sum_cons, ih]
    rw [sum_map_add]

theorem sumQ_const (c : Rat) : sumQ (fun _ : Fin N => c) = (N : Rat) * c := by
  unfold sumQ
  induction N with
  | zero => simp
  | succ n ih =>
    rw [List.finRange_succ, List.map_cons, List.map_map, List.sum_cons]
    have : ((fun _ : Fin (n+1) => c) ∘ Fin.succ) = fun _ : Fin n => c := rfl
    rw [this, ih]
    push_cast
    grind

theorem sumQ_comm (F : Fin N → Fin N → Rat) :
    sumQ (fun y => sumQ fun x => F x y) = sumQ (fun x => sumQ fun y => F x y) := by
  unfold sumQ
  exact (sum_comm _ _ (fun x y => F x y)).symm

theorem sum_preimage (f : Fin N → Fin N) (π : Fin N → Rat) :
    sumQ (fun y => preimageMass f π y) = sumQ π := by
  unfold preimageMass
  rw [sumQ_comm]
  congr 1
  funext x
  have : (fun y => if f x = y then π x else 0) = fun y => if y = f x then π x else 0 := by
    funext y; by_cases h : f x = y
    · simp [h]
    · have h' : ¬ y = f x := fun h' => h h'.symm
      simp [h, h']
  rw [this, sumQ_indicator]

theorem stationary_total (hN : 0 < N) (φ : Fin N → Bool) (ε : Rat) (hε : ε ≠ 0)
    (π : Fin N → Rat) (hπ : NoisyStationary hN φ ε π) : sumQ π = 1 := by
  have hNq : (N : Rat) ≠ 0 := natCast_ne_zero hN
  have h1 : sumQ π = sumQ (fun y => (1 - ε) * preimageMass (step hN φ) π y + ε / (N : Rat)) := by
    congr 1; funext y; exact hπ y
  rw [sumQ_add, sumQ_const] at h1
  have h2 : sumQ (fun y => (1 - ε) * preimageMass (step hN φ) π y)
      = (1 - ε) * sumQ (fun y => preimageMass (step hN φ) π y) := by
    unfold sumQ
    induction (List.finRange N) with
    | nil => simp only [List.map_nil, List.sum_nil]; grind
    | cons b l ih => simp only [List.map_cons, List.sum_cons, ih]; grind
  rw [h2, sum_preimage] at h1
  grind

/-! ### 标注的存在性：只要有一个满足赋值，向后距离就是一个合法标注 -/

def predIter (hN : 0 < N) : Nat → Fin N → Fin N
  | 0,     x => x
  | j + 1, x => predIter hN j (pred hN x)

def cycIter (hN : 0 < N) : Nat → Fin N → Fin N
  | 0,     x => x
  | j + 1, x => cycIter hN j (cyc hN x)

theorem pred_cyc (hN : 0 < N) (x : Fin N) : pred hN (cyc hN x) = x :=
  ((cyc_eq_iff hN x (cyc hN x)).mp rfl).symm

theorem pred_cycIter (hN : 0 < N) : ∀ (j : Nat) (y : Fin N),
    pred hN (cycIter hN j y) = cycIter hN j (pred hN y) := by
  intro j
  induction j with
  | zero => intro y; rfl
  | succ j ih =>
    intro y
    show pred hN (cycIter hN j (cyc hN y)) = cycIter hN j (cyc hN (pred hN y))
    rw [ih, pred_cyc, cyc_pred]

theorem predIter_cycIter (hN : 0 < N) : ∀ (j : Nat) (x : Fin N),
    predIter hN j (cycIter hN j x) = x := by
  intro j
  induction j with
  | zero => intro x; rfl
  | succ j ih =>
    intro x
    show predIter hN j (pred hN (cycIter hN j (cyc hN x))) = x
    rw [pred_cycIter, pred_cyc]
    exact ih x

theorem cycIter_val (hN : 0 < N) (j : Nat) (x : Fin N) :
    (cycIter hN j x).val = (x.val + j) % N := by
  induction j generalizing x with
  | zero => simp [cycIter, Nat.mod_eq_of_lt x.isLt]
  | succ j ih =>
    show (cycIter hN j (cyc hN x)).val = _
    rw [ih]
    show ((x.val + 1) % N + j) % N = (x.val + (j + 1)) % N
    rw [Nat.mod_add_mod]
    have : x.val + 1 + j = x.val + (j + 1) := by omega
    rw [this]

theorem cycIter_cover (hN : 0 < N) (x z : Fin N) : ∃ j, j < N ∧ cycIter hN j x = z := by
  refine ⟨(z.val + N - x.val) % N, Nat.mod_lt _ hN, ?_⟩
  apply Fin.ext
  rw [cycIter_val, Nat.add_mod_mod]
  have h1 : x.val ≤ z.val + N := by have := x.isLt; omega
  rw [Nat.add_sub_of_le h1, Nat.add_mod_right, Nat.mod_eq_of_lt z.isLt]

theorem cycIter_N (hN : 0 < N) (x : Fin N) : cycIter hN N x = x := by
  apply Fin.ext
  rw [cycIter_val, Nat.add_mod_right, Nat.mod_eq_of_lt x.isLt]

theorem predIter_N (hN : 0 < N) (x : Fin N) : predIter hN N x = x := by
  have := predIter_cycIter hN N x
  rwa [cycIter_N] at this

/-- 从任何 x 向后走 1..N 步，必经过某个满足赋值。 -/
theorem exists_sat_back (hN : 0 < N) (φ : Fin N → Bool) (hsat : ∃ z, φ z = true) (x : Fin N) :
    ∃ j, 1 ≤ j ∧ j ≤ N ∧ φ (predIter hN j x) = true := by
  obtain ⟨z, hz⟩ := hsat
  obtain ⟨j, hj, hjz⟩ := cycIter_cover hN z x
  have hpj : predIter hN j x = z := by rw [← hjz]; exact predIter_cycIter hN j z
  cases j with
  | zero =>
    -- x = z 本身满足：向后走整整一圈回到自己
    refine ⟨N, hN, Nat.le_refl _, ?_⟩
    rw [predIter_N]
    simp [predIter] at hpj
    rw [hpj]; exact hz
  | succ j =>
    exact ⟨j + 1, by omega, by omega, by rw [hpj]; exact hz⟩

/-- 向后距离（带燃料）：`back k x` = 从 x 向后最多走 k 步，遇到第一个满足赋值的步数。 -/
def back (hN : 0 < N) (φ : Fin N → Bool) : Nat → Fin N → Nat
  | 0,     _ => 0
  | k + 1, x => if φ (pred hN x) then 1 else back hN φ k (pred hN x) + 1

/-- 燃料一旦足够覆盖到最近的满足赋值，再加燃料不改变结果。 -/
theorem back_stable (hN : 0 < N) (φ : Fin N → Bool) : ∀ (k : Nat) (x : Fin N),
    (∃ j, 1 ≤ j ∧ j ≤ k ∧ φ (predIter hN j x) = true) →
    back hN φ (k + 1) x = back hN φ k x := by
  intro k
  induction k with
  | zero => intro x ⟨j, h1, h2, _⟩; omega
  | succ k ih =>
    intro x ⟨j, hj1, hj2, hj⟩
    show (if φ (pred hN x) then 1 else back hN φ (k + 1) (pred hN x) + 1)
        = (if φ (pred hN x) then 1 else back hN φ k (pred hN x) + 1)
    cases hp : φ (pred hN x) with
    | true => simp
    | false =>
      simp only [Bool.false_eq_true, ite_false]
      have hj1' : j ≠ 1 := by
        intro h; subst h; simp [predIter] at hj; rw [hp] at hj; cases hj
      have : back hN φ (k + 1) (pred hN x) = back hN φ k (pred hN x) := by
        apply ih (pred hN x)
        refine ⟨j - 1, by omega, by omega, ?_⟩
        have hj' : predIter hN j x = predIter hN (j - 1) (pred hN x) := by
          obtain ⟨i, rfl⟩ : ∃ i, j = i + 1 := ⟨j - 1, by omega⟩
          rfl
        rw [← hj']; exact hj
      rw [this]

/-- **标注存在.** 若 φ 可满足，`back N` 是合法标注。 -/
theorem labeling_exists (hN : 0 < N) (φ : Fin N → Bool) (hsat : ∃ z, φ z = true) :
    Labeling hN φ (back hN φ N) := by
  obtain ⟨n, rfl⟩ : ∃ n, N = n + 1 := ⟨N - 1, by omega⟩
  constructor
  · intro x hx
    show (if φ (pred hN x) then 1 else back hN φ n (pred hN x) + 1) = 1
    simp [hx]
  · intro x hx
    show (if φ (pred hN x) then 1 else back hN φ n (pred hN x) + 1) = back hN φ (n + 1) (pred hN x) + 1
    simp only [hx, Bool.false_eq_true, ite_false]
    congr 1
    symm
    apply back_stable
    obtain ⟨j, hj1, hj2, hj⟩ := exists_sat_back hN φ hsat (pred hN x)
    refine ⟨j, hj1, ?_, hj⟩
    -- j ≠ n+1：否则 predIter (n+1) (pred x) = pred x 满足，与 hx 矛盾
    by_cases hjN : j = n + 1
    · subst hjN
      rw [predIter_N] at hj
      rw [hx] at hj
      cases hj
    · omega

/-! ### 汇总 -/

/-- **命题 A（完整形式）.** 对可满足的 φ、任意 ε ≠ 0、N ≥ 2：
    存在标注 g，使得 piA 是自洽历史；任何自洽历史都等于 piA；其总质量为 1。 -/
theorem proposition_A (hN : 0 < N) (hN2 : 1 < N) (φ : Fin N → Bool) (hsat : ∃ z, φ z = true)
    (ε : Rat) (hε : ε ≠ 0) :
    ∃ g : Fin N → Nat, Labeling hN φ g ∧
      NoisyStationary hN φ ε (piA φ ε g) ∧
      (∀ π, NoisyStationary hN φ ε π → ∀ x, π x = piA φ ε g x) ∧
      sumQ (piA φ ε g) = 1 := by
  have hg := labeling_exists hN φ hsat
  refine ⟨back hN φ N, hg, piA_stationary hN hN2 φ ε hε _ hg, ?_, ?_⟩
  · intro π hπ; exact stationary_unique hN hN2 φ ε hε _ hg π hπ
  · exact stationary_total hN φ ε hε _ (piA_stationary hN hN2 φ ε hε _ hg)

end NoisyCTC

#print axioms NoisyCTC.proposition_A
