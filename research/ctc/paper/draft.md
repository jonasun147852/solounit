# The Computational Value of a Noisy Deutschian Time Loop Is Exactly 1/ε (Draft v0.1)

*Theorem sections drafted; Introduction, Related Work and Discussion are placeholders pending four readings (listed at the end). All theorems marked [Lean] are machine-checked in core Lean 4.35 with no Mathlib dependency; file names refer to the accompanying artifact.*

---

## Abstract (provisional)

In Deutsch's model a closed timelike curve (CTC) imposes a self-consistency condition on the state that traverses it, and Aaronson and Watrous showed that this condition lets a classical or quantum computer decide every language in PSPACE. We ask how much of this power survives when each traversal is subject to noise. For depolarising noise of rate ε (the register is reset to a fixed distribution with probability ε per traversal) we give the self-consistent history in closed form, prove it is the unique one, and show that the probability of reading a satisfying assignment of a Boolean formula from the loop is at most 1/(ε·T*), where T* is the randomised time complexity of finding such an assignment. The bound holds for every dynamics inside the loop, including dynamics with full access to the formula and in-loop error correction, as long as the noise retains a global reset component. A noisy Deutschian loop is therefore worth exactly a 1/ε-fold speed-up over the best classical algorithm, no more. In particular a loop can decide SAT only if its per-traversal noise is below 1/T*, which is exponentially small under ETH and super-polynomially small under P ≠ NP alone. All results are formalised in Lean 4.

---

## 1. Introduction

**[PLACEHOLDER — write after reading Aaronson–Bavarian–Gueltrini §? on noise.]**

Points the introduction must make:
- Deutsch's consistency condition and the Aaronson–Watrous PSPACE result.
- The two standing objections: (i) non-uniqueness of fixed points (Bennett, Leung, Smith, Smolin 2009); (ii) physical implausibility of exact self-consistency.
- Our question: not "is the model right" but "how much computation does the model buy once noise is present". Answer: 1/ε.
- Relation to the "NP-hardness as a physical principle" programme (Aaronson 2005): the minimal physical assumption needed to keep NP hard in the presence of CTCs is that the global noise floor does not shrink with problem size.

---

## 2. The model

### 2.1 Noiseless loop

Let N ≥ 2 and let φ : [N] → {0,1} be a predicate on a state space of size N (for a CNF formula on n variables, N = 2^n and φ is satisfaction). The one-pass dynamics of the loop is the deterministic map

    step(x) = x        if φ(x) = 1,
    step(x) = x + 1 mod N   otherwise.

A (classical, probabilistic) Deutschian history is a weight w : [N] → ℚ≥0, not identically zero, satisfying the self-consistency condition

    w(y) = Σ_{x : step(x) = y} w(x)   for all y.      (1)

Reading the loop means sampling a state y with w(y) > 0 and evaluating φ(y).

### 2.2 Noisy loop (depolarising reset)

Fix ε ∈ (0,1] and a reset distribution ν on [N] (ν uniform unless stated). Each traversal applies step with probability 1−ε and replaces the register by a fresh sample from ν with probability ε. The self-consistent history is a probability distribution π satisfying

    π(y) = (1−ε) Σ_{x : step(x) = y} π(x) + ε ν(y)   for all y.      (2)

More generally, for an arbitrary stochastic kernel P on [N] (any randomised in-loop dynamics, possibly depending on φ in an arbitrary way), the condition is

    π = ε ν + (1−ε) π P.      (3)

---

## 3. Results

### Theorem 1 (noiseless loop decides SAT). [Lean: `CTC.ctc_decides_sat`, `CTC.stationary_exists`, file CTC.lean]

Let w be any self-consistent weight for (1) and y any state with w(y) > 0. Then φ(y) = 1 if and only if φ is satisfiable. Moreover a self-consistent weight with positive total mass always exists.

*Proof sketch.* Self-consistency implies backward closure: every positively weighted state has a positively weighted step-preimage. An unsatisfying state can only be reached from an unsatisfying state via the cyclic successor. Walking backwards N steps from an unsatisfying positively weighted state therefore yields N consecutive unsatisfying states, which cover the whole cycle, contradicting satisfiability. Existence: a point mass on a satisfying assignment (if one exists) or the uniform weight (otherwise). ∎

This is the classical half of Aaronson–Watrous; it is included because the formalisation is new and because the noisy results below are stated in the same framework.

### Theorem 2 (closed form, uniqueness, normalisation under reset noise). [Lean: `NoisyCTC.proposition_A`, file NoisyCTC.lean]

Let φ be satisfiable, N ≥ 2, ε ≠ 0, ν uniform. Let g(x) be the number of backward steps from x to the nearest satisfying state (so g(x) ≥ 1). Define

    π_A(x) = (1 − (1−ε)^{g(x)}) / (εN)   if φ(x) = 1,
    π_A(x) = (1 − (1−ε)^{g(x)}) / N      if φ(x) = 0.

Then (a) π_A satisfies (2); (b) every solution of (2) equals π_A; (c) Σ_x π_A(x) = 1.

*Proof sketch.* (a) Direct verification along each run of unsatisfying states between consecutive satisfying states; the only algebra needed is the geometric recurrence π(y+j) = ε/N + (1−ε)π(y+j−1). (b) Uniqueness by induction on g: the inhomogeneous term ε ν(y) pins every value, so no scaling freedom remains. (c) Summing (2) over y and using that step is a function gives S = (1−ε)S + ε. ∎

**Corollary 2.1.** If the satisfying states cut the cycle into runs of lengths g_1,…,g_s (Σ g_i = N), the probability of reading a satisfying state is

    π_A(SAT) = (1/(εN)) Σ_i (1 − (1−ε)^{g_i}).

For a single solution this is (1 − (1−ε)^N)/(εN), which tends to 1 when εN → 0 and to 1/(εN) when εN → ∞.

**Remark.** Uniqueness under noise is a classical instance of a phenomenon already noted in the quantum setting [CITE Dias da Silva–Kashefi–Galvão 2010; Allen 2014 — TO VERIFY AFTER READING]. We make no novelty claim for (b).

### Theorem 3 (universal upper bound). [Lean: `NoisyBound.noisy_bound`, file NoisyBound.lean]

Let P be any stochastic kernel on [N], ν any distribution, 0 < ε ≤ 1, and π any probability distribution satisfying (3). Let S ⊆ [N] be a target set and suppose that for every k

    (ν P^k)(S) ≤ (k+1)·c      (H)

for some c ≥ 0. Then π(S) ≤ c/ε.

*Proof sketch.* Iterating (3) K times gives the finite Doeblin expansion
π = ε Σ_{k<K} (1−ε)^k ν P^k + (1−ε)^K π P^K, which is pure algebra and needs no limit. Applying (H) to the first K terms and π P^K(S) ≤ 1 to the remainder yields π(S) ≤ ε c Σ_{k<K}(k+1)(1−ε)^k + (1−ε)^K ≤ c/ε + (1−ε)^K. The remainder is killed by Bernoulli's inequality (1+Kε)(1−ε)^K ≤ 1 and the Archimedean property of ℚ. ∎

**Corollary 3.1 (noise threshold).** [Lean: `NoisyBound.noisy_threshold`] If the loop reads S with probability ≥ 1/2 then ε ≤ 2c.

### Instantiating hypothesis (H)

(H) is the only place where external complexity theory enters.

- **Black-box dynamics.** If P uses φ only as a membership oracle, the unstructured-search lower bound gives (H) with c = s/N where s = |S|. Hence π(S) ≤ s/(εN): the loop is worth a 1/ε-fold speed-up over exhaustive search and nothing more. The deterministic cycle step attains this bound up to the factor 1 − (1−ε)^N (Corollary 2.1).

- **General dynamics.** If P may inspect the formula, let T* be the expected running time of the best randomised algorithm that finds a satisfying assignment with constant probability. Since solutions are verifiable, a k-step procedure succeeding with probability q can be amplified to a (k/q)-step procedure with constant success, whence q ≤ k/T*. This is (H) with c = 1/T*, and Theorem 3 gives π(S) ≤ 1/(εT*).

  - Under ETH, T* ≥ 2^{δn}, so reading SAT requires ε ≤ 2·2^{−δn}.
  - Under the 2026 claimed refutation of ETH with a 2^{O(n/√log n)} algorithm, the requirement becomes ε ≤ 2^{−Ω(n/√log n)}, still super-polynomially small.
  - Under P ≠ NP alone, ε must be super-polynomially small in n.

- **In-loop error correction.** Theorem 3 is indifferent to what P does, so encoding the register and decoding inside the loop does not escape the bound; it can only lower the *effective* reset rate. Local independent bit-flip noise at rate p < 1/2 can be driven to an effective ε_eff ≤ 2^{−n} with a repetition code of length Θ(n) (Chernoff), at polynomial width. A global reset, by definition, admits no such reduction.

### Numerical confirmation

| N | #solutions | ε | exact rational solve of (2) | closed form | equal |
|---|---|---|---|---|---|
| 16 | 2 | 1/10, 1/100, 1/1000 | — | — | yes (all) |
| 24 | 3 | same | — | — | yes (all) |
| 32 | 1 | same | — | — | yes (all) |

(Exact arithmetic over ℚ, Gaussian elimination; the fractions agree digit for digit.) Floating-point power iteration, the Doeblin series and three distinct in-loop dynamics (cyclic step, random restart, hypercube walk) agree with Theorem 3 to four decimals on random critical 3-SAT instances with n = 11.

---

## 4. Discussion

**[PLACEHOLDER — depends on the four readings.]** Points to cover:

1. *Relation to the "self-correcting CTC" argument.* [If Aaronson–Bavarian–Gueltrini argue that Deutschian computation is robust to noise because the consistency condition applies to the actual noisy evolution, state precisely how Theorem 3 sharpens this: the consistency condition does provide free error correction, but only for 1/ε traversals' worth.]
2. *Which noise is physical.* Known reactions of physics to would-be chronology horizons (Cauchy-horizon instability, Hawking's vacuum-polarisation divergence) are global, not per-bit. If the loop survives at all, the surviving disturbance is correlated across the register. We do not claim this settles the question.
3. *The minimal assumption that keeps NP hard.* By Corollary 3.1 the only assumption needed is that the global noise floor of a physical loop does not decrease super-polynomially in the problem size. This is weaker than chronology protection and holds automatically for any device of fixed physical size.
4. *What is not claimed.* Nothing here bears on whether CTCs exist, on whether Deutsch's rule is the right one, or on P vs NP.

---

## 5. Formalisation

Three files, core Lean 4.35.0, no Mathlib, all compile with no errors, warnings or `sorry`; axioms used are `propext`, `Quot.sound` and (where classical case analysis is used) `Classical.choice`.

| File | Lines | Main statements |
|---|---|---|
| CTC.lean | 342 | `ctc_decides_sat`, `stationary_exists`, `ctc_decides_cnf` |
| NoisyCTC.lean | 471 | `piA_stationary`, `stationary_unique`, `stationary_total`, `labeling_exists`, `proposition_A` |
| NoisyBound.lean | 386 | `doeblin_expand`, `noisy_bound`, `noisy_threshold` |

Design notes: sums over `Fin N` are list sums; distributions are `Fin N → ℚ`; no limits are taken, the Archimedean step is done with `Rat.ceil`; field identities are discharged by `grind`.

Not formalised: the circuit-size accounting that makes each traversal a polynomial-size circuit (immediate from the definitions); the quantum (density-matrix) version; the PSPACE upper bound.

---

## References to add after reading (do not cite from memory)

1. S. Aaronson, M. Bavarian, G. Gueltrini, *Computability theory of closed timelike curves*, arXiv:1609.05507. — Read the noise/robustness passage and the Aharonov et al. 1996 reference.
2. R. Dias da Silva, E. Kashefi, E. F. Galvão, *Closed timelike curves in measurement-based quantum computation*, arXiv:1003.4971. — Confirm the decoherence-selects-unique-solution statement and its form.
3. J.-M. A. Allen, *Treating time travel quantum mechanically*, arXiv:1401.4933. — Confirm the uniqueness-under-decoherence result for the equivalent circuit model and the critique of earlier proofs.
4. M. Ringbauer et al., *Experimental simulation of closed timelike curves*, Nat. Commun. 5, 4145 (2014), arXiv:1501.05014. — Confirm the depolarising-channel noise model with failure probability ε.

Already safe to cite: Aaronson–Watrous 2009 (PSPACE); Bacon 2004; Brun 2003; Bennett–Leung–Smith–Smolin 2009; Lloyd et al. 2011 (P-CTC); Aaronson 2005 (NP-complete problems and physical reality); Say–Yakaryılmaz and O'Donnell–Say on narrow CTCs (BPP_path); Hawking 1992; Deutsch 1991.
