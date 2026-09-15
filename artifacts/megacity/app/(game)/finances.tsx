import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GameModal from "@/components/GameModal";
import TutorialHint from "@/components/TutorialHint";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useGameModal } from "@/hooks/useGameModal";
import { useThrottledValue } from "@/hooks/useThrottledValue";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import AdministrativeBlocPanel from "@/components/AdministrativeBlocPanel";
import { advanceHour, formatDate } from "@/engine/clock";
import type { BankLoan, BankAccount, DiplomaticTransfer, BankingState, GameDate } from "@/engine/types";

function projectPayoffDate(start: GameDate, ticksRemaining: number): GameDate {
  let d = start;
  const n = Math.max(0, Math.min(ticksRemaining, 10000));
  for (let i = 0; i < n; i++) d = advanceHour(d);
  return d;
}

function creditRatingExplainer(rating: number): { title: string; body: string } {
  const tier = rating >= 750 ? "EXCELLENT" : rating >= 600 ? "GOOD" : rating >= 400 ? "POOR" : "DENIED";
  return {
    title: `CREDIT RATING — ${rating} (${tier})`,
    body:
      "Your credit rating affects loan availability and terms.\n\n" +
      "• 750+: Excellent — standard interest rates apply.\n" +
      "• 600-749: Good — standard rates, full access.\n" +
      "• 400-599: Poor — loans available but riskier terms.\n" +
      "• Below 400: Denied — no new loans until you rebuild standing.\n\n" +
      "Rating improves when you pay down loans on time and falls when you default. CorpBank loans always carry a 1.5x premium over City Bank.",
  };
}

type BankTab = "central" | "corp" | "transfers" | "history";

const LOAN_TIERS = [
  { amount: 10000, interest: 0.05, ticks: 720, label: "Small Loan" },
  { amount: 50000, interest: 0.08, ticks: 1440, label: "Standard Loan" },
  { amount: 150000, interest: 0.12, ticks: 2880, label: "Large Loan" },
  { amount: 500000, interest: 0.18, ticks: 4320, label: "Mega Loan" },
];

const DEPOSIT_AMOUNTS = [5000, 10000, 25000, 50000, 100000];
const WITHDRAW_AMOUNTS = [5000, 10000, 25000, 50000];

const CENTRAL_SAVINGS_RATE = 0.02;
const CORP_SAVINGS_RATE = 0.04;
const CORP_LOAN_PREMIUM = 1.5;

const TRANSFER_PURPOSES: DiplomaticTransfer["purpose"][] = ["aid", "trade", "tribute", "bribe", "investment"];

const DEFAULT_BANKING: BankingState = {
  loans: [],
  accounts: [
    { bankId: "megacity-central", balance: 0, interestRate: CENTRAL_SAVINGS_RATE, lastInterestTick: 0 },
    { bankId: "corpbank", balance: 0, interestRate: CORP_SAVINGS_RATE, lastInterestTick: 0 },
  ],
  transfers: [],
  creditRating: 750,
  totalInterestPaid: 0,
  totalInterestEarned: 0,
};

function FinancesScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state: rawState, setState } = useGame();
  const state = useThrottledValue(rawState, 500);
  const { modal, showModal, hideModal } = useGameModal();
  const [activeTab, setActiveTab] = useState<BankTab>("central");
  const tabScrollRef = useHorizontalWheelScroll();
  const [selectedTransferTarget, setSelectedTransferTarget] = useState<string | null>(null);
  const [selectedPurpose, setSelectedPurpose] = useState<DiplomaticTransfer["purpose"]>("aid");

  const banking = state.banking ?? DEFAULT_BANKING;

  const centralAccount = banking.accounts.find(a => a.bankId === "megacity-central") ?? DEFAULT_BANKING.accounts[0];
  const corpAccount = banking.accounts.find(a => a.bankId === "corpbank") ?? DEFAULT_BANKING.accounts[1];
  const activeLoans = banking.loans.filter(l => !l.defaulted && l.remainingBalance > 0);
  const totalDebt = activeLoans.reduce((s, l) => s + l.remainingBalance, 0);

  const takeLoan = (tier: typeof LOAN_TIERS[number], bankId: "megacity-central" | "corpbank") => {
    const rate = bankId === "corpbank" ? tier.interest * CORP_LOAN_PREMIUM : tier.interest;
    const totalOwed = Math.floor(tier.amount * (1 + rate));
    const termMonths = Math.max(1, Math.floor(tier.ticks / (24 * 30)));
    const monthly = Math.floor(totalOwed / termMonths);

    if (activeLoans.length >= 5) {
      showModal("LOAN DENIED", "Maximum 5 active loans. Pay off existing debt first.", [{ text: "UNDERSTOOD", style: "default" }]);
      return;
    }
    if (banking.creditRating < 400) {
      showModal("LOAN DENIED", "Credit rating too low. Improve your financial standing.", [{ text: "UNDERSTOOD", style: "default" }]);
      return;
    }

    showModal(
      `CONFIRM ${tier.label.toUpperCase()}`,
      `Borrow ${tier.amount.toLocaleString()} credits at ${(rate * 100).toFixed(1)}% interest.\nTotal repayment: ${totalOwed.toLocaleString()} credits over ${termMonths} months.\nMonthly payment: ~${monthly.toLocaleString()} credits.`,
      [
        {
          text: "APPROVE LOAN", style: "default", onPress: () => {
            const loan: BankLoan = {
              id: `loan-${Date.now()}`,
              bankId,
              principal: tier.amount,
              remainingBalance: totalOwed,
              interestRate: rate,
              monthlyPayment: monthly,
              ticksRemaining: tier.ticks,
              ticksTaken: state.totalTicks,
              defaulted: false,
            };
            setState((prev) => ({
              ...prev,
              resources: { ...prev.resources, credits: prev.resources.credits + tier.amount },
              banking: { ...(prev.banking ?? DEFAULT_BANKING), loans: [...(prev.banking ?? DEFAULT_BANKING).loans, loan] },
            }));
          }
        },
        { text: "CANCEL", style: "cancel" },
      ],
    );
  };

  const payLoan = (loanId: string, amount: number) => {
    if (state.resources.credits < amount) return;
    setState((prev) => {
      const b = prev.banking ?? DEFAULT_BANKING;
      const loan = b.loans.find(l => l.id === loanId);
      if (!loan) return prev;
      const payment = Math.min(amount, loan.remainingBalance);
      return {
        ...prev,
        resources: { ...prev.resources, credits: prev.resources.credits - payment },
        banking: {
          ...b,
          loans: b.loans.map(l => l.id === loanId ? { ...l, remainingBalance: l.remainingBalance - payment } : l),
          totalInterestPaid: b.totalInterestPaid + Math.floor(payment * 0.3),
          creditRating: Math.min(900, b.creditRating + 2),
        },
      };
    });
  };

  const deposit = (bankId: "megacity-central" | "corpbank", amount: number) => {
    if (state.resources.credits < amount) {
      showModal("INSUFFICIENT FUNDS", "Not enough credits in treasury.", [{ text: "OK", style: "default" }]);
      return;
    }
    setState((prev) => {
      const b = prev.banking ?? DEFAULT_BANKING;
      return {
        ...prev,
        resources: { ...prev.resources, credits: prev.resources.credits - amount },
        banking: {
          ...b,
          accounts: b.accounts.map(a => a.bankId === bankId ? { ...a, balance: a.balance + amount } : a),
        },
      };
    });
  };

  const withdraw = (bankId: "megacity-central" | "corpbank", amount: number) => {
    const acct = banking.accounts.find(a => a.bankId === bankId);
    if (!acct || acct.balance < amount) {
      showModal("INSUFFICIENT BALANCE", "Not enough in this account.", [{ text: "OK", style: "default" }]);
      return;
    }
    setState((prev) => {
      const b = prev.banking ?? DEFAULT_BANKING;
      return {
        ...prev,
        resources: { ...prev.resources, credits: prev.resources.credits + amount },
        banking: {
          ...b,
          accounts: b.accounts.map(a => a.bankId === bankId ? { ...a, balance: a.balance - amount } : a),
        },
      };
    });
  };

  const sendTransfer = (targetId: string, amount: number) => {
    if (state.resources.credits < amount) {
      showModal("INSUFFICIENT FUNDS", "Not enough credits.", [{ text: "OK", style: "default" }]);
      return;
    }
    const target = [...state.factions, ...state.externalMegacities].find((e: any) => e.id === targetId);
    if (!target) return;

    const transfer: DiplomaticTransfer = {
      id: `transfer-${Date.now()}`,
      targetId,
      targetName: target.name,
      amount,
      purpose: selectedPurpose,
      tick: state.totalTicks,
    };

    showModal(
      "CONFIRM TRANSFER",
      `Send ${amount.toLocaleString()} credits to ${target.name} as ${selectedPurpose}?`,
      [
        {
          text: "SEND", style: "default", onPress: () => {
            setState((prev) => {
              const b = prev.banking ?? DEFAULT_BANKING;
              return {
                ...prev,
                resources: { ...prev.resources, credits: prev.resources.credits - amount },
                banking: { ...b, transfers: [...b.transfers, transfer] },
              };
            });
          }
        },
        { text: "CANCEL", style: "cancel" },
      ],
    );
  };

  const tabs: { id: BankTab; label: string }[] = [
    { id: "central", label: "CITY BANK" },
    { id: "corp", label: "CORPBANK" },
    { id: "transfers", label: "TRANSFERS" },
    { id: "history", label: "LEDGER" },
  ];

  const diplomacyTargets = [
    ...state.factions.filter(f => f.isActive).map(f => ({ id: f.id, name: f.name, type: "faction" })),
    ...state.externalMegacities.filter(m => m.isActive).map(m => ({ id: m.id, name: m.name, type: "megacity" })),
  ];

  const renderBankPanel = (bankId: "megacity-central" | "corpbank", bankName: string, account: BankAccount) => (
    <View>
      <View style={styles.bankHeader}>
        <MaterialCommunityIcons name="bank" size={18} color={Colors.accent} />
        <Text style={styles.bankName}>{bankName}</Text>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>SAVINGS</Text>
          <Text style={styles.statValue}>{account.balance.toLocaleString()} cr</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>INTEREST RATE</Text>
          <Text style={styles.statValue}>{(account.interestRate * 100).toFixed(1)}%</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>ACTIVE LOANS</Text>
          <Text style={styles.statValue}>{activeLoans.filter(l => l.bankId === bankId).length}</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>// DEPOSIT</Text>
      <View style={styles.buttonRow}>
        {DEPOSIT_AMOUNTS.map(amt => (
          <Pressable key={`dep-${amt}`} style={[styles.actionBtn, state.resources.credits < amt && styles.actionBtnDisabled]} onPress={() => deposit(bankId, amt)} disabled={state.resources.credits < amt}>
            <Text style={styles.actionBtnText}>+{(amt / 1000).toFixed(0)}K</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>// WITHDRAW</Text>
      <View style={styles.buttonRow}>
        {WITHDRAW_AMOUNTS.map(amt => (
          <Pressable key={`wd-${amt}`} style={[styles.actionBtn, account.balance < amt && styles.actionBtnDisabled]} onPress={() => withdraw(bankId, amt)} disabled={account.balance < amt}>
            <Text style={styles.actionBtnText}>-{(amt / 1000).toFixed(0)}K</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>// LOANS</Text>
      {LOAN_TIERS.map((tier, i) => {
        const rate = bankId === "corpbank" ? tier.interest * CORP_LOAN_PREMIUM : tier.interest;
        return (
          <Pressable key={i} style={styles.loanCard} onPress={() => takeLoan(tier, bankId)}>
            <View style={styles.loanInfo}>
              <Text style={styles.loanTitle}>{tier.label}</Text>
              <Text style={styles.loanDetail}>{tier.amount.toLocaleString()} cr @ {(rate * 100).toFixed(1)}% — {Math.floor(tier.ticks / 24)} days</Text>
            </View>
            <Feather name="plus-circle" size={16} color={Colors.accent} />
          </Pressable>
        );
      })}

      {activeLoans.filter(l => l.bankId === bankId).length > 0 && (
        <>
          <Text style={styles.sectionLabel}>// ACTIVE LOANS</Text>
          {activeLoans.filter(l => l.bankId === bankId).map(loan => {
            const payoff = projectPayoffDate(state.gameDate, loan.ticksRemaining);
            return (
              <View key={loan.id} style={styles.activeLoanCard}>
                <View style={styles.loanInfo}>
                  <Text style={styles.loanTitle}>Remaining: {loan.remainingBalance.toLocaleString()} cr</Text>
                  <Text style={styles.loanDetail}>Monthly: {loan.monthlyPayment.toLocaleString()} cr — {Math.ceil(loan.ticksRemaining / 24)} days left</Text>
                  <Text style={[styles.loanDetail, { color: Colors.info, marginTop: 2 }]}>Expected payoff: {formatDate(payoff)}</Text>
                </View>
                <Pressable style={styles.payBtn} onPress={() => payLoan(loan.id, loan.monthlyPayment)} disabled={state.resources.credits < loan.monthlyPayment}>
                  <Text style={styles.payBtnText}>PAY</Text>
                </Pressable>
              </View>
            );
          })}
        </>
      )}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={20} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.textSecondary} />
        </Pressable>
        <MaterialCommunityIcons name="bank" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>FINANCES & BANKING</Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>TREASURY</Text>
          <Text style={styles.summaryValue}>{state.resources.credits.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>TOTAL DEBT</Text>
          <Text style={[styles.summaryValue, { color: totalDebt > 0 ? Colors.danger : Colors.accent }]}>{totalDebt.toLocaleString()}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.summaryBox, pressed && { opacity: 0.7 }]}
          onPress={() => {
            const info = creditRatingExplainer(banking.creditRating);
            showModal(info.title, info.body, [{ text: "UNDERSTOOD", style: "default" }]);
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Text style={styles.summaryLabel}>CREDIT RATING</Text>
            <Feather name="info" size={9} color={Colors.textMuted} />
          </View>
          <Text style={[styles.summaryValue, { color: banking.creditRating > 600 ? Colors.accent : Colors.warning }]}>{banking.creditRating}</Text>
        </Pressable>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>TOTAL SAVINGS</Text>
          <Text style={styles.summaryValue}>{(centralAccount.balance + corpAccount.balance).toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>INTEREST PAID</Text>
          <Text style={[styles.summaryValue, { color: Colors.danger }]}>{banking.totalInterestPaid.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>INTEREST EARNED</Text>
          <Text style={[styles.summaryValue, { color: Colors.accent }]}>{banking.totalInterestEarned.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>NET INTEREST</Text>
          <Text style={[styles.summaryValue, { color: banking.totalInterestEarned >= banking.totalInterestPaid ? Colors.accent : Colors.warning }]}>
            {(banking.totalInterestEarned - banking.totalInterestPaid).toLocaleString()}
          </Text>
        </View>
      </View>

      <ScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.tabScroll} contentContainerStyle={styles.tabContent}>
        {tabs.map(tab => (
          <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.tab, activeTab === tab.id && styles.tabActive]}>
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <AdministrativeBlocPanel surface="finances" />
        <TutorialHint
          id="finances_intro"
          message="Tax revenue, expenses, trade flows, and reserves are tracked here. A red line means you bleed credits every tick. Fix it before the treasury hits zero — bankruptcy ends regimes."
        />
        {activeTab === "central" && renderBankPanel("megacity-central", "MEGACITY CENTRAL BANK", centralAccount)}
        {activeTab === "corp" && renderBankPanel("corpbank", "CORPBANK INTERNATIONAL", corpAccount)}

        {activeTab === "transfers" && (
          <View>
            <Text style={styles.sectionLabel}>// SEND CREDITS</Text>
            <Text style={styles.sectionSub}>Transfer credits to diplomatic contacts as aid, trade, tribute, or bribes.</Text>

            <Text style={styles.subLabel}>PURPOSE</Text>
            <View style={styles.buttonRow}>
              {TRANSFER_PURPOSES.map(p => (
                <Pressable key={p} style={[styles.purposeBtn, selectedPurpose === p && styles.purposeBtnActive]} onPress={() => setSelectedPurpose(p)}>
                  <Text style={[styles.purposeBtnText, selectedPurpose === p && styles.purposeBtnTextActive]}>{p.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.subLabel}>RECIPIENT</Text>
            {diplomacyTargets.map(t => (
              <Pressable key={t.id} style={[styles.targetCard, selectedTransferTarget === t.id && styles.targetCardActive]} onPress={() => setSelectedTransferTarget(t.id)}>
                <MaterialCommunityIcons name={t.type === "faction" ? "sword-cross" : "city" as any} size={14} color={selectedTransferTarget === t.id ? Colors.bg : Colors.accent} />
                <Text style={[styles.targetName, selectedTransferTarget === t.id && styles.targetNameActive]}>{t.name}</Text>
              </Pressable>
            ))}

            {selectedTransferTarget && (
              <>
                <Text style={styles.subLabel}>AMOUNT</Text>
                <View style={styles.buttonRow}>
                  {[5000, 10000, 25000, 50000, 100000].map(amt => (
                    <Pressable key={amt} style={[styles.actionBtn, state.resources.credits < amt && styles.actionBtnDisabled]} onPress={() => sendTransfer(selectedTransferTarget, amt)} disabled={state.resources.credits < amt}>
                      <Text style={styles.actionBtnText}>{(amt / 1000).toFixed(0)}K</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {activeTab === "history" && (
          <View>
            <Text style={styles.sectionLabel}>// FINANCIAL LEDGER</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>INTEREST PAID</Text>
                <Text style={[styles.statValue, { color: Colors.danger }]}>{banking.totalInterestPaid.toLocaleString()}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>INTEREST EARNED</Text>
                <Text style={[styles.statValue, { color: Colors.accent }]}>{banking.totalInterestEarned.toLocaleString()}</Text>
              </View>
            </View>

            <Text style={styles.subLabel}>BLACK-MARKET AUDIT</Text>
            {(state.blackMarketHistory ?? []).length === 0 ? (
              <Text style={styles.emptyText}>No confirmed black-market purchases recorded. Cancelled reviews do not affect this audit.</Text>
            ) : (
              [...(state.blackMarketHistory ?? [])].reverse().slice(0, 20).map(entry => (
                <View key={entry.id} style={styles.transferRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.transferTarget}>{entry.itemName}</Text>
                    <Text style={styles.transferPurpose}>-{entry.cost.toLocaleString()} cr · TICK {entry.tick}</Text>
                  </View>
                  <Text style={[styles.transferPurpose, { color: entry.outcome === "delivered" ? Colors.accent : Colors.danger }]}>
                    {entry.outcome === "delivered" ? "DELIVERED" : "SEIZED"}
                  </Text>
                </View>
              ))
            )}

            <Text style={styles.subLabel}>RECENT TRANSFERS</Text>
            {banking.transfers.length === 0 ? (
              <Text style={styles.emptyText}>No transfers recorded yet. Use the banking panel above to deposit, withdraw, or transfer credits between accounts.</Text>
            ) : (
              banking.transfers.slice(-20).reverse().map(t => (
                <View key={t.id} style={styles.transferRow}>
                  <View>
                    <Text style={styles.transferTarget}>{t.targetName}</Text>
                    <Text style={styles.transferPurpose}>{t.purpose.toUpperCase()} — {t.amount.toLocaleString()} cr</Text>
                  </View>
                </View>
              ))
            )}

            <Text style={styles.subLabel}>ALL LOANS ({banking.loans.length})</Text>
            {banking.loans.length === 0 ? (
              <Text style={styles.emptyText}>No loans taken yet. Apply for credit from City Bank or CorpBank to fund expansion during cash shortfalls.</Text>
            ) : (
              banking.loans.slice(-10).reverse().map(l => (
                <View key={l.id} style={styles.transferRow}>
                  <Text style={styles.transferTarget}>{l.bankId === "megacity-central" ? "City Bank" : "CorpBank"} — {l.principal.toLocaleString()} cr</Text>
                  <Text style={[styles.transferPurpose, { color: l.remainingBalance <= 0 ? Colors.accent : Colors.warning }]}>{l.remainingBalance <= 0 ? "PAID OFF" : `${l.remainingBalance.toLocaleString()} remaining`}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
      <GameModal visible={modal.visible} title={modal.title} message={modal.message} buttons={modal.buttons} onDismiss={hideModal} />
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingVertical: Platform.OS === "web" ? 7 : 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.accent, letterSpacing: 1 },
  summaryRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  summaryBox: { flex: 1, backgroundColor: Colors.bgSecondary, borderRadius: 4, padding: 8, alignItems: "center" },
  summaryLabel: { fontFamily: "Inter_500Medium", fontSize: 7, color: Colors.textMuted, letterSpacing: 0.5 },
  summaryValue: { fontFamily: "Inter_700Bold", fontSize: 12, color: Colors.accent, marginTop: 2 },
  tabScroll: { maxHeight: 36, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabContent: { paddingHorizontal: 12, gap: 4, alignItems: "center" },
  tab: { paddingHorizontal: 14, paddingVertical: Platform.OS === "web" ? 6 : 8 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabText: { fontFamily: "Inter_500Medium", fontSize: 10, color: Colors.textMuted, letterSpacing: 0.5 },
  tabTextActive: { color: Colors.accent },
  scroll: { flex: 1 },
  content: { padding: Platform.OS === "web" ? 12 : 16, paddingBottom: 40 },
  bankHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  bankName: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.accent, letterSpacing: 1 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: Colors.bgSecondary, borderRadius: 4, padding: 10, alignItems: "center" },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 8, color: Colors.textMuted, letterSpacing: 0.5 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.accent, marginTop: 4 },
  sectionLabel: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.info, letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  sectionSub: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 12 },
  subLabel: { fontFamily: "Inter_500Medium", fontSize: 9, color: Colors.textSecondary, letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  actionBtn: { backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.accent, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 8 },
  actionBtnDisabled: { borderColor: Colors.border, opacity: 0.4 },
  actionBtnText: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.accent },
  loanCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.bgSecondary, borderRadius: 4, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: Colors.border },
  loanInfo: { flex: 1 },
  loanTitle: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.text },
  loanDetail: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  activeLoanCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.bgSecondary, borderRadius: 4, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: Colors.warning },
  payBtn: { backgroundColor: Colors.accent, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 6 },
  payBtnText: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.bg },
  purposeBtn: { backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 6 },
  purposeBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "20" },
  purposeBtnText: { fontFamily: "Inter_500Medium", fontSize: 9, color: Colors.textMuted },
  purposeBtnTextActive: { color: Colors.accent },
  targetCard: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.bgSecondary, borderRadius: 4, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: Colors.border },
  targetCardActive: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  targetName: { fontFamily: "Inter_500Medium", fontSize: 10, color: Colors.text },
  targetNameActive: { color: Colors.bg },
  transferRow: { backgroundColor: Colors.bgSecondary, borderRadius: 4, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: Colors.border },
  transferTarget: { fontFamily: "Inter_700Bold", fontSize: 10, color: Colors.text },
  transferPurpose: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, fontStyle: "italic", paddingVertical: 12 },
}));

export default withScreenBoundary(FinancesScreen, "finances");
