/-!
# A classical Deutsch closed-timelike-curve (CTC) decides SAT

Formalisation (core Lean 4, no Mathlib) of the classical half of the
Aaronson–Watrous construction (2009): the self-consistency condition of a
time loop whose one-pass dynamics is

    step x = if φ x then x else x + 1  (mod N)

forces every self-consistent history to sit on satisfying assignments of φ,
whenever any satisfying assignment exists.

* `Stationary f w`  : `w` is a self-consistent (Deutsch) weight on the loop,
                      i.e. the mass leaving each state equals the mass arriving.
* `ctc_reads_sat`   : if φ is satisfiable, every state with positive weight
                      satisfies φ.
* `ctc_decides_sat` : reading any positively-weighted state `y` of any
                      self-consistent history and evaluating φ y decides
                      satisfiability of φ.
-/

namespace CTC

/-- `k`-fold iteration, applying `f` first. -/
def iter (f : α → α) : Nat → α → α
  | 0,     x => x
  | k + 1, x => iter f k (f x)

@[simp] theorem iter_zero (f : α → α) (x : α) : iter f 0 x = x := rfl
theorem iter_succ (f : α → α) (k : Nat) (x : α) : iter f (k + 1) x = iter f k (f x) := rfl

/-! ### Two elementary facts about sums of natural numbers over a list -/

theorem le_sum_map_of_mem {l : List α} {g : α → Nat} {a : α} (h : a ∈ l) :
    g a ≤ (l.map g).sum := by
  induction l with
  | nil => cases h
  | cons b l ih =>
    simp only [List.map_cons, List.sum_cons]
    rcases List.mem_cons.mp h with hab | hm
    · subst hab; exact Nat.le_add_right _ _
    · exact Nat.le_trans (ih hm) (Nat.le_add_left _ _)

theorem exists_pos_of_sum_pos {l : List α} {g : α → Nat} (h : 0 < (l.map g).sum) :
    ∃ a, a ∈ l ∧ 0 < g a := by
  induction l with
  | nil => simp at h
  | cons b l ih =>
    simp only [List.map_cons, List.sum_cons] at h
    by_cases hb : 0 < g b
    · exact ⟨b, by simp, hb⟩
    · have hb0 : g b = 0 := by omega
      rw [hb0, Nat.zero_add] at h
      obtain ⟨a, ha, hpos⟩ := ih h
      exact ⟨a, by simp [ha], hpos⟩

theorem sum_map_zero (l : List α) : (l.map (fun _ => (0 : Nat))).sum = 0 := by
  induction l with
  | nil => rfl
  | cons b l ih => simp only [List.map_cons, List.sum_cons, Nat.zero_add]; exact ih

/-! ### The loop -/

variable {N : Nat}

/-- Sum of `g` over all states. -/
def sumFin (g : Fin N → Nat) : Nat := ((List.finRange N).map g).sum

/-- Cyclic successor on `Fin N` ("try the next assignment"). -/
def cyc (hN : 0 < N) (x : Fin N) : Fin N := ⟨(x.val + 1) % N, Nat.mod_lt _ hN⟩

/-- One pass through the loop: keep a satisfying assignment, otherwise advance. -/
def step (hN : 0 < N) (φ : Fin N → Bool) (x : Fin N) : Fin N :=
  if φ x then x else cyc hN x

/-- Mass flowing into `y` in one pass. -/
def preimageMass (f : Fin N → Fin N) (w : Fin N → Nat) (y : Fin N) : Nat :=
  sumFin fun x => if f x = y then w x else 0

/-- Deutsch self-consistency: what comes out of the loop is what went in. -/
def Stationary (f : Fin N → Fin N) (w : Fin N → Nat) : Prop :=
  ∀ y, w y = preimageMass f w y

theorem forward_closed {f : Fin N → Fin N} {w : Fin N → Nat} (hw : Stationary f w)
    (x : Fin N) (hx : 0 < w x) : 0 < w (f x) := by
  have h1 : w x ≤ preimageMass f w (f x) := by
    unfold preimageMass sumFin
    have := le_sum_map_of_mem (g := fun z => if f z = f x then w z else 0) (List.mem_finRange x)
    simpa using this
  rw [hw (f x)]
  exact Nat.lt_of_lt_of_le hx h1

theorem backward {f : Fin N → Fin N} {w : Fin N → Nat} (hw : Stationary f w)
    (y : Fin N) (hy : 0 < w y) : ∃ x, f x = y ∧ 0 < w x := by
  rw [hw y] at hy
  unfold preimageMass sumFin at hy
  obtain ⟨x, -, hx⟩ := exists_pos_of_sum_pos hy
  by_cases h : f x = y
  · exact ⟨x, h, by simpa [h] using hx⟩
  · simp [h] at hx

/-- Flowing into an unsatisfying state is only possible from an unsatisfying state,
    and then only via the cyclic successor. -/
theorem step_of_unsat {hN : 0 < N} {φ : Fin N → Bool} {x y : Fin N}
    (hy : φ y = false) (hxy : step hN φ x = y) : φ x = false ∧ cyc hN x = y := by
  cases hφ : φ x with
  | true =>
    simp [step, hφ] at hxy
    subst hxy
    rw [hφ] at hy
    cases hy
  | false =>
    simp [step, hφ] at hxy
    exact ⟨rfl, hxy⟩

/-- Walking backwards along a self-consistent history from an unsatisfying state
    yields arbitrarily long runs of unsatisfying states along the cycle. -/
theorem chain {hN : 0 < N} {φ : Fin N → Bool} {w : Fin N → Nat}
    (hw : Stationary (step hN φ) w) {y0 : Fin N} (hy0 : 0 < w y0) (hu : φ y0 = false) :
    ∀ k, ∃ x, 0 < w x ∧ (∀ j, j ≤ k → φ (iter (cyc hN) j x) = false)
      ∧ iter (cyc hN) k x = y0 := by
  intro k
  induction k with
  | zero =>
    refine ⟨y0, hy0, ?_, rfl⟩
    intro j hj
    have : j = 0 := Nat.le_zero.mp hj
    subst this
    simpa using hu
  | succ k ih =>
    obtain ⟨x, hx, hall, hk⟩ := ih
    obtain ⟨x', hx'y, hx'⟩ := backward hw x hx
    have hx0 : φ x = false := by simpa using hall 0 (Nat.zero_le _)
    obtain ⟨hu', hc⟩ := step_of_unsat hx0 hx'y
    refine ⟨x', hx', ?_, ?_⟩
    · intro j hj
      cases j with
      | zero => simpa using hu'
      | succ j =>
        rw [iter_succ, hc]
        exact hall j (Nat.le_of_succ_le_succ hj)
    · rw [iter_succ, hc]
      exact hk

theorem iter_cyc (hN : 0 < N) (j : Nat) (x : Fin N) :
    (iter (cyc hN) j x).val = (x.val + j) % N := by
  induction j generalizing x with
  | zero => simp [Nat.mod_eq_of_lt x.isLt]
  | succ j ih =>
    rw [iter_succ, ih]
    show ((x.val + 1) % N + j) % N = (x.val + (j + 1)) % N
    rw [Nat.mod_add_mod]
    have : x.val + 1 + j = x.val + (j + 1) := by omega
    rw [this]

/-- `N` consecutive cyclic steps visit every state. -/
theorem cover (hN : 0 < N) (x z : Fin N) : ∃ j, j < N ∧ iter (cyc hN) j x = z := by
  refine ⟨(z.val + N - x.val) % N, Nat.mod_lt _ hN, ?_⟩
  apply Fin.ext
  rw [iter_cyc, Nat.add_mod_mod]
  have h1 : x.val ≤ z.val + N := by have := x.isLt; omega
  rw [Nat.add_sub_of_le h1, Nat.add_mod_right, Nat.mod_eq_of_lt z.isLt]

/-- **Main theorem.** If φ is satisfiable, every state carrying positive weight in a
    self-consistent history of the loop satisfies φ. -/
theorem ctc_reads_sat (hN : 0 < N) (φ : Fin N → Bool) (w : Fin N → Nat)
    (hw : Stationary (step hN φ) w) (hsat : ∃ z, φ z = true) :
    ∀ y, 0 < w y → φ y = true := by
  intro y hy
  by_cases hu : φ y = true
  · exact hu
  · exfalso
    have hu' : φ y = false := by simpa using hu
    obtain ⟨x, -, hall, -⟩ := chain hw hy hu' N
    obtain ⟨z, hz⟩ := hsat
    obtain ⟨j, hj, hjx⟩ := cover hN x z
    have := hall j (Nat.le_of_lt hj)
    rw [hjx, hz] at this
    cases this

/-- **Decision.** Read any positively-weighted state of any self-consistent history;
    evaluating φ there decides satisfiability. -/
theorem ctc_decides_sat (hN : 0 < N) (φ : Fin N → Bool) (w : Fin N → Nat)
    (hw : Stationary (step hN φ) w) (y : Fin N) (hy : 0 < w y) :
    φ y = true ↔ ∃ z, φ z = true :=
  ⟨fun h => ⟨y, h⟩, fun hsat => ctc_reads_sat hN φ w hw hsat y hy⟩

/-! ### Existence: the loop always has a self-consistent history (so there is something to read) -/

/-- Sum of a point indicator over all states is the indicated value. -/
theorem sumFin_indicator : ∀ {N : Nat} (y : Fin N) (c : Nat),
    sumFin (fun x => if x = y then c else 0) = c := by
  intro N
  induction N with
  | zero => intro y; exact absurd y.isLt (Nat.not_lt_zero _)
  | succ n ih =>
    intro y c
    unfold sumFin
    rw [List.finRange_succ, List.map_cons, List.map_map, List.sum_cons]
    rcases y with ⟨yv, hy⟩
    cases yv with
    | zero =>
      have h0 : (⟨0, hy⟩ : Fin (n+1)) = 0 := rfl
      rw [h0]
      simp only [ite_true]
      have hz : ((fun x : Fin (n+1) => if x = 0 then c else 0) ∘ Fin.succ) = fun _ => (0 : Nat) := by
        funext i; simp [Function.comp, Fin.succ_ne_zero]
      rw [hz, sum_map_zero]
      exact Nat.add_zero c
    | succ yv =>
      have hs : (⟨yv + 1, hy⟩ : Fin (n+1)) = Fin.succ ⟨yv, Nat.lt_of_succ_lt_succ hy⟩ := rfl
      rw [hs]
      have hne : (0 : Fin (n+1)) ≠ Fin.succ ⟨yv, Nat.lt_of_succ_lt_succ hy⟩ := (Fin.succ_ne_zero _).symm
      simp only [hne, ite_false, Nat.zero_add]
      have hz : ((fun x : Fin (n+1) => if x = Fin.succ ⟨yv, Nat.lt_of_succ_lt_succ hy⟩ then c else 0) ∘ Fin.succ)
          = fun i : Fin n => if i = ⟨yv, Nat.lt_of_succ_lt_succ hy⟩ then c else 0 := by
        funext i
        show (if Fin.succ i = Fin.succ ⟨yv, Nat.lt_of_succ_lt_succ hy⟩ then c else 0) = _
        simp only [Fin.succ_inj]
      rw [hz]
      exact ih _ c

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

/-- Cyclic predecessor. -/
def pred (hN : 0 < N) (y : Fin N) : Fin N :=
  ⟨if y.val = 0 then N - 1 else y.val - 1, by split <;> omega⟩

theorem cyc_pred (hN : 0 < N) (y : Fin N) : cyc hN (pred hN y) = y := by
  apply Fin.ext
  rw [cyc_val]
  have hy := y.isLt
  unfold pred
  simp only
  split <;> split <;> omega

theorem cyc_eq_iff (hN : 0 < N) (x y : Fin N) : cyc hN x = y ↔ x = pred hN y := by
  constructor
  · intro h
    exact cyc_injective hN (h.trans (cyc_pred hN y).symm)
  · intro h
    rw [h]
    exact cyc_pred hN y

/-- A self-consistent history with positive total mass always exists. -/
theorem stationary_exists (hN : 0 < N) (φ : Fin N → Bool) :
    ∃ w : Fin N → Nat, Stationary (step hN φ) w ∧ ∃ y, 0 < w y := by
  by_cases hsat : ∃ z, φ z = true
  · -- satisfiable: a point mass on a satisfying assignment is a fixed point of the loop
    obtain ⟨z, hz⟩ := hsat
    refine ⟨fun y => if y = z then 1 else 0, ?_, ⟨z, by simp⟩⟩
    intro y
    unfold preimageMass
    have hstep : step hN φ z = z := by simp [step, hz]
    have hsummand : (fun x => if step hN φ x = y then (if x = z then 1 else 0) else 0)
        = fun x => if x = z then (if y = z then 1 else 0) else 0 := by
      funext x
      by_cases hxz : x = z
      · subst hxz
        rw [hstep]
        by_cases hyz : y = x
        · subst hyz; simp
        · have hyz' : x ≠ y := fun h => hyz h.symm
          simp [hyz, hyz']
      · simp [hxz]
    rw [hsummand, sumFin_indicator]
  · -- unsatisfiable: the loop is a pure cycle and the uniform history is self-consistent
    have hall : ∀ x, φ x = false := by
      intro x
      cases h : φ x with
      | true => exact absurd ⟨x, h⟩ hsat
      | false => rfl
    refine ⟨fun _ => 1, ?_, ⟨⟨0, hN⟩, Nat.zero_lt_one⟩⟩
    intro y
    unfold preimageMass
    have hsummand : (fun x => if step hN φ x = y then 1 else 0)
        = fun x => if x = pred hN y then 1 else 0 := by
      funext x
      have : step hN φ x = cyc hN x := by simp [step, hall x]
      rw [this]
      by_cases h : cyc hN x = y
      · rw [(cyc_eq_iff hN x y).mp h]
        simp [cyc_pred]
      · have h' : ¬ x = pred hN y := fun h' => h ((cyc_eq_iff hN x y).mpr h')
        simp only [h, h', ite_false]
    rw [hsummand, sumFin_indicator]

/-! ### Instantiation: 3-CNF formulas on `n` Boolean variables -/

/-- Assignment `x : Fin (2^n)` read as a bit-vector; variable `i` is bit `i`. -/
def bit (n : Nat) (x : Fin (2 ^ n)) (i : Nat) : Bool := x.val.testBit i

/-- A literal is a variable index and a polarity. -/
abbrev Literal := Nat × Bool
abbrev Clause := List Literal
abbrev CNF := List Clause

def evalClause (n : Nat) (x : Fin (2 ^ n)) (c : Clause) : Bool :=
  c.any fun l => bit n x l.1 == l.2

def evalCNF (n : Nat) (cnf : CNF) (x : Fin (2 ^ n)) : Bool :=
  cnf.all (evalClause n x)

theorem two_pow_pos (n : Nat) : 0 < 2 ^ n := Nat.two_pow_pos n

/-- The loop dynamics for a concrete CNF: one polynomial-size pass
    (evaluate the formula, increment the counter). -/
def cnfStep (n : Nat) (cnf : CNF) : Fin (2 ^ n) → Fin (2 ^ n) :=
  step (two_pow_pos n) (evalCNF n cnf)

/-- **CTC decides CNF-SAT.** For any self-consistent history of the loop and any
    state `y` it gives positive weight, `evalCNF n cnf y` is `true` iff `cnf` is satisfiable. -/
theorem ctc_decides_cnf (n : Nat) (cnf : CNF) (w : Fin (2 ^ n) → Nat)
    (hw : Stationary (cnfStep n cnf) w) (y : Fin (2 ^ n)) (hy : 0 < w y) :
    evalCNF n cnf y = true ↔ ∃ z, evalCNF n cnf z = true :=
  ctc_decides_sat (two_pow_pos n) (evalCNF n cnf) w hw y hy

/-- And such a history always exists. -/
theorem cnf_history_exists (n : Nat) (cnf : CNF) :
    ∃ w : Fin (2 ^ n) → Nat, Stationary (cnfStep n cnf) w ∧ ∃ y, 0 < w y :=
  stationary_exists (two_pow_pos n) (evalCNF n cnf)

end CTC

#print axioms CTC.ctc_decides_sat
#print axioms CTC.stationary_exists
#print axioms CTC.ctc_decides_cnf
#print axioms CTC.cnf_history_exists
