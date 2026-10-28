/-!
# 时间环与 P vs NP 之间可证的逻辑关系（骨架）

复杂度类在这里被抽象为"语言的集合"（bit 串上的谓词的谓词）。
三条输入事实：
  (1) P ⊆ NP                 —— 平凡
  (2) NP ⊆ PSPACE            —— 标准教科书定理
  (3) P_CTC = PSPACE         —— Aaronson–Watrous 2009（在 Deutsch 模型下）
这个文件不重新证明 (1)(2)(3)，只检查从它们能推出什么、推不出什么。
-/

namespace Bridge

/-- 语言：bit 串上的判定问题。 -/
abbrev Lang := List Bool → Bool
/-- 复杂度类：语言的集合。 -/
abbrev Class := Lang → Prop

def Subset (A B : Class) : Prop := ∀ L, A L → B L

/-- 两个类相等当且仅当互相包含。 -/
theorem class_ext {A B : Class} (h1 : Subset A B) (h2 : Subset B A) : A = B := by
  funext L
  exact propext ⟨h1 L, h2 L⟩

/-- **定理 1（P≠NP ⟹ 时间环严格增加计算能力）.**
    若 P ≠ NP，则 P_CTC ≠ P：带时间环的计算机比普通计算机严格更强。 -/
theorem loops_help_of_P_ne_NP (P NP PSPACE P_CTC : Class)
    (h1 : Subset P NP) (h2 : Subset NP PSPACE) (h3 : P_CTC = PSPACE)
    (hne : P ≠ NP) : P_CTC ≠ P := by
  intro hEq
  apply hne
  -- P_CTC = P 且 P_CTC = PSPACE，故 PSPACE = P，于是 NP ⊆ PSPACE = P ⊆ NP
  have hPS : PSPACE = P := h3 ▸ hEq
  apply class_ext h1
  intro L hL
  have : PSPACE L := h2 L hL
  rw [hPS] at this
  exact this

/-- **定理 2（逆否形式）.** 若时间环对计算毫无帮助（P_CTC = P），则 P = NP。 -/
theorem P_eq_NP_of_loops_useless (P NP PSPACE P_CTC : Class)
    (h1 : Subset P NP) (h2 : Subset NP PSPACE) (h3 : P_CTC = PSPACE)
    (hUseless : P_CTC = P) : P = NP := by
  exact Classical.byContradiction fun hne =>
    loops_help_of_P_ne_NP P NP PSPACE P_CTC h1 h2 h3 hne hUseless

/-- **定理 3（反方向推不出来）.**
    存在满足 (1)(2)(3) 的一组类，其中时间环有用（P_CTC ≠ P）但 P = NP。
    所以"时间环有用"不能作为 P ≠ NP 的证据。 -/
theorem loops_help_does_not_imply_P_ne_NP :
    ∃ P NP PSPACE P_CTC : Class,
      Subset P NP ∧ Subset NP PSPACE ∧ P_CTC = PSPACE ∧ P_CTC ≠ P ∧ P = NP := by
  refine ⟨fun _ => False, fun _ => False, fun _ => True, fun _ => True, ?_, ?_, rfl, ?_, rfl⟩
  · intro L h; exact h
  · intro L _; trivial
  · intro h
    have : (fun _ : Lang => True) (fun _ => true) = (fun _ : Lang => False) (fun _ => true) :=
      congrFun h (fun _ => true)
    simp at this

/-- **定理 4（"存在性"版本需要哪些桥梁公理）.**
    设 Phys 是"我们宇宙里物理上可高效完成的计算"这个类。再加两条无法用数学证明的假设：
      (ECT)   Phys ⊆ P            —— 扩展丘奇–图灵论题
      (Real)  若时间环物理存在，则 P_CTC ⊆ Phys   —— Deutsch 模型是物理的
    那么 P ≠ NP 蕴含时间环不存在。去掉任一条假设，推理立即断裂。 -/
theorem no_loops_of_P_ne_NP (P NP PSPACE P_CTC Phys : Class) (CTC_exists : Prop)
    (h1 : Subset P NP) (h2 : Subset NP PSPACE) (h3 : P_CTC = PSPACE)
    (ECT : Subset Phys P) (Real : CTC_exists → Subset P_CTC Phys)
    (hne : P ≠ NP) : ¬ CTC_exists := by
  intro hc
  apply hne
  apply class_ext h1
  intro L hL
  have hPS : PSPACE L := h2 L hL
  have hCTC : P_CTC L := h3 ▸ hPS
  exact ECT L (Real hc L hCTC)

end Bridge

#print axioms Bridge.loops_help_of_P_ne_NP
#print axioms Bridge.P_eq_NP_of_loops_useless
#print axioms Bridge.loops_help_does_not_imply_P_ne_NP
#print axioms Bridge.no_loops_of_P_ne_NP
