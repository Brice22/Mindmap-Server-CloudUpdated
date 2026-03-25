'use client';

import React, { useState, useEffect, useRef } from 'react';

interface Transaction {
  id: number;
  name: string;
  amount: number;
  category: string;
  date: string;
  type: 'income' | 'expense';
}

interface Investment {
  id: number;
  symbol: string;
  shares: number;
  buyPrice: number;
  currentPrice: number;
  source: 'webull' | 'polymarket' | 'manual';
  date: string;
  type: 'stock' | 'crypto' | 'prediction';
}

interface FinanceViewProps {
  onAddToCalendar: (title: string, date: string, color: string) => void;
}

const CATEGORIES = ['Housing', 'Food', 'Transport', 'Health', 'Education', 'Entertainment', 'Savings', 'Income', 'Other'];
const CAT_COLORS: Record<string, string> = {
  Housing: '#ef4444', Food: '#f59e0b', Transport: '#3b82f6',
  Health: '#22c55e', Education: '#8b5cf6', Entertainment: '#ec4899',
  Savings: '#06b6d4', Income: '#10b981', Other: '#6b7280',
};

export default function FinanceView({ onAddToCalendar }: FinanceViewProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Other');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [txType, setTxType] = useState<'income' | 'expense'>('expense');
  const [viewMode, setViewMode] = useState<'list' | 'chart'>('chart');
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [showInvestForm, setShowInvestForm] = useState(false);
  const [investSymbol, setInvestSymbol] = useState('');
  const [investShares, setInvestShares] = useState('');
  const [investBuyPrice, setInvestBuyPrice] = useState('');
  const [investCurrentPrice, setInvestCurrentPrice] = useState('');
  const [investSource, setInvestSource] = useState<Investment['source']>('manual');
  const [investType, setInvestType] = useState<Investment['type']>('stock');
  const [investDate, setInvestDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeFinTab, setActiveFinTab] = useState<'transactions' | 'investments'>('transactions');

  const totalInvested = investments.reduce((s, i) => s + (i.buyPrice * i.shares), 0);
  const totalCurrentValue = investments.reduce((s, i) => s + (i.currentPrice * i.shares), 0);
  const totalProfitLoss = totalCurrentValue - totalInvested;
  const profitBySource = (source: Investment['source']) => {
    const filtered = investments.filter(i => i.source === source);
    const invested = filtered.reduce((s, i) => s + (i.buyPrice * i.shares), 0);
    const current = filtered.reduce((s, i) => s + (i.currentPrice * i.shares), 0);
    return { invested, current, pl: current - invested };
  };

  const handleAddInvestment = () => {
    if (!investSymbol.trim() || !investShares || !investBuyPrice) return;
    setInvestments(prev => [...prev, {
      id: Date.now(),
      symbol: investSymbol.toUpperCase().trim(),
      shares: parseFloat(investShares),
      buyPrice: parseFloat(investBuyPrice),
      currentPrice: parseFloat(investCurrentPrice || investBuyPrice),
      source: investSource,
      date: investDate,
      type: investType,
    }]);
    setInvestSymbol(''); setInvestShares(''); setInvestBuyPrice('');
    setInvestCurrentPrice(''); setShowInvestForm(false);
  };
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;

  // Load Chart.js
  useEffect(() => {
    if ((window as any).Chart) return;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    document.head.appendChild(script);
  }, []);

  // Render chart
  useEffect(() => {
    if (viewMode !== 'chart' || !chartRef.current || !(window as any).Chart) return;
    const Chart = (window as any).Chart;

    if (chartInstance.current) chartInstance.current.destroy();

    const expenseByCategory: Record<string, number> = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
    });

    const labels = Object.keys(expenseByCategory);
    const data = Object.values(expenseByCategory);
    const colors = labels.map(l => CAT_COLORS[l] || '#6b7280');

    chartInstance.current = new Chart(chartRef.current, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 0 }],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'right', labels: { color: '#ccc' } } },
      },
    });

    return () => { if (chartInstance.current) chartInstance.current.destroy(); };
  }, [transactions, viewMode]);

  const handleAdd = () => {
    if (!name.trim() || !amount) return;
    const tx: Transaction = {
      id: Date.now(),
      name: name.trim(),
      amount: parseFloat(amount),
      category,
      date,
      type: txType,
    };
    setTransactions(prev => [tx, ...prev]);
    onAddToCalendar(
      `${txType === 'income' ? '+' : '-'}$${tx.amount} ${tx.name}`,
      date,
      txType === 'income' ? '#10b981' : '#ef4444'
    );
    setName(''); setAmount(''); setShowForm(false);
  };

  const handleDelete = (id: number) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div style={{ padding: '20px', height: '100%', overflow: 'auto', background: '#1e1e2e' }}>
     
       {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#fff', margin: 0 }}>Finance</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setActiveFinTab('transactions')}
            style={{ background: activeFinTab === 'transactions' ? '#0070f3' : '#333', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
            Transactions
          </button>
          <button onClick={() => setActiveFinTab('investments')}
            style={{ background: activeFinTab === 'investments' ? '#0070f3' : '#333', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
            Investments
          </button>
          <button onClick={() => setViewMode(viewMode === 'chart' ? 'list' : 'chart')}
            style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}>
            {viewMode === 'chart' ? '📋 List' : '📊 Chart'}
          </button>
          <button onClick={() => activeFinTab === 'investments' ? setShowInvestForm(true) : setShowForm(true)}
            style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>
            + {activeFinTab === 'investments' ? 'Investment' : 'Transaction'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: '#2a2a3a', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
          <div style={{ color: '#888', fontSize: '12px' }}>Income</div>
          <div style={{ color: '#10b981', fontSize: '24px', fontWeight: 'bold' }}>${totalIncome.toFixed(2)}</div>
        </div>
        <div style={{ background: '#2a2a3a', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ color: '#888', fontSize: '12px' }}>Expenses</div>
          <div style={{ color: '#ef4444', fontSize: '24px', fontWeight: 'bold' }}>${totalExpense.toFixed(2)}</div>
        </div>
        <div style={{ background: '#2a2a3a', padding: '16px', borderRadius: '8px', borderLeft: `4px solid ${balance >= 0 ? '#10b981' : '#ef4444'}` }}>
          <div style={{ color: '#888', fontSize: '12px' }}>Balance</div>
          <div style={{ color: balance >= 0 ? '#10b981' : '#ef4444', fontSize: '24px', fontWeight: 'bold' }}>${balance.toFixed(2)}</div>
        </div>
      </div>

      {/* Chart View */}
      {viewMode === 'chart' && (
        <div style={{ background: '#2a2a3a', padding: '20px', borderRadius: '8px', marginBottom: '20px', maxHeight: '350px', display: 'flex', justifyContent: 'center' }}>
          {transactions.length > 0 ? (
            <canvas ref={chartRef} style={{ maxHeight: '300px' }} />
          ) : (
            <div style={{ color: '#666', padding: '40px' }}>Add transactions to see chart</div>
          )}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div style={{ background: '#2a2a3a', borderRadius: '8px', overflow: 'hidden' }}>
          {transactions.length === 0 && (
            <div style={{ color: '#666', padding: '40px', textAlign: 'center' }}>No transactions yet</div>
          )}
          {transactions.map(tx => (
            <div key={tx.id} style={{
              display: 'flex', alignItems: 'center', padding: '12px 16px',
              borderBottom: '1px solid #333', gap: '12px',
            }}>
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: CAT_COLORS[tx.category] || '#6b7280', flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontSize: '14px' }}>{tx.name}</div>
                <div style={{ color: '#666', fontSize: '11px' }}>{tx.category} · {tx.date}</div>
              </div>
              <div style={{ color: tx.type === 'income' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                {tx.type === 'income' ? '+' : '-'}${tx.amount.toFixed(2)}
              </div>
              <button onClick={() => handleDelete(tx.id)}
                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Add Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}
          onClick={() => setShowForm(false)}>
          <div style={{ background: '#2a2a3a', padding: '24px', borderRadius: '8px', width: '400px', border: '1px solid #444' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', marginTop: 0 }}>Add Transaction</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button onClick={() => setTxType('expense')}
                style={{ flex: 1, padding: '8px', background: txType === 'expense' ? '#ef4444' : '#333', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}>
                Expense
              </button>
              <button onClick={() => setTxType('income')}
                style={{ flex: 1, padding: '8px', background: txType === 'income' ? '#10b981' : '#333', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}>
                Income
              </button>
            </div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Description"
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }} />
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" type="number"
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }} />
            <select value={category} onChange={e => setCategory(e.target.value)}
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={date} onChange={e => setDate(e.target.value)} type="date"
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)}
                style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAdd}
                style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add</button>
            </div>
          </div>
        </div>
      )}
      {/* INVESTMENTS TAB */}
      {activeFinTab === 'investments' && (
        <>
          {/* Investment Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: '#2a2a3a', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ color: '#888', fontSize: '12px' }}>Total Invested</div>
              <div style={{ color: '#3b82f6', fontSize: '24px', fontWeight: 'bold' }}>${totalInvested.toFixed(2)}</div>
            </div>
            <div style={{ background: '#2a2a3a', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #06b6d4' }}>
              <div style={{ color: '#888', fontSize: '12px' }}>Current Value</div>
              <div style={{ color: '#06b6d4', fontSize: '24px', fontWeight: 'bold' }}>${totalCurrentValue.toFixed(2)}</div>
            </div>
            <div style={{ background: '#2a2a3a', padding: '16px', borderRadius: '8px', borderLeft: `4px solid ${totalProfitLoss >= 0 ? '#10b981' : '#ef4444'}` }}>
              <div style={{ color: '#888', fontSize: '12px' }}>Total P/L</div>
              <div style={{ color: totalProfitLoss >= 0 ? '#10b981' : '#ef4444', fontSize: '24px', fontWeight: 'bold' }}>
                {totalProfitLoss >= 0 ? '+' : ''}${totalProfitLoss.toFixed(2)}
              </div>
            </div>
          </div>

          {/* P/L by Source */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {(['webull', 'polymarket', 'manual'] as const).map(src => {
              const data = profitBySource(src);
              if (data.invested === 0) return null;
              return (
                <div key={src} style={{ background: '#2a2a3a', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ color: '#888', fontSize: '12px', textTransform: 'capitalize' }}>{src}</div>
                  <div style={{ color: data.pl >= 0 ? '#10b981' : '#ef4444', fontSize: '18px', fontWeight: 'bold' }}>
                    {data.pl >= 0 ? '+' : ''}${data.pl.toFixed(2)}
                  </div>
                  <div style={{ color: '#666', fontSize: '11px' }}>${data.invested.toFixed(2)} → ${data.current.toFixed(2)}</div>
                </div>
              );
            })}
          </div>

          {/* Holdings List */}
          <div style={{ background: '#2a2a3a', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px 80px 40px', padding: '10px 16px', borderBottom: '1px solid #444', color: '#666', fontSize: '11px' }}>
              <span>Symbol</span><span>Shares</span><span>Buy</span><span>Current</span><span>P/L</span><span>Source</span><span></span>
            </div>
            {investments.map(inv => {
              const pl = (inv.currentPrice - inv.buyPrice) * inv.shares;
              return (
                <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px 80px 40px', padding: '10px 16px', borderBottom: '1px solid #333', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 'bold' }}>{inv.symbol}</div>
                    <div style={{ color: '#666', fontSize: '10px' }}>{inv.type}</div>
                  </div>
                  <span style={{ color: '#ccc' }}>{inv.shares}</span>
                  <span style={{ color: '#ccc' }}>${inv.buyPrice.toFixed(2)}</span>
                  <span style={{ color: '#ccc' }}>${inv.currentPrice.toFixed(2)}</span>
                  <span style={{ color: pl >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                    {pl >= 0 ? '+' : ''}${pl.toFixed(2)}
                  </span>
                  <span style={{ color: '#888', fontSize: '11px', textTransform: 'capitalize' }}>{inv.source}</span>
                  <button onClick={() => setInvestments(prev => prev.filter(i => i.id !== inv.id))}
                    style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>✕</button>
                </div>
              );
            })}
            {investments.length === 0 && (
              <div style={{ color: '#666', padding: '40px', textAlign: 'center' }}>No investments tracked yet</div>
            )}
          </div>
        </>
      )}

      {/* Investment Form Modal */}
      {showInvestForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}
          onClick={() => setShowInvestForm(false)}>
          <div style={{ background: '#2a2a3a', padding: '24px', borderRadius: '8px', width: '400px', border: '1px solid #444' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', marginTop: 0 }}>Add Investment</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {(['stock', 'crypto', 'prediction'] as const).map(t => (
                <button key={t} onClick={() => setInvestType(t)}
                  style={{ flex: 1, padding: '8px', background: investType === t ? '#0070f3' : '#333', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', textTransform: 'capitalize' }}>
                  {t}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {(['webull', 'polymarket', 'manual'] as const).map(s => (
                <button key={s} onClick={() => setInvestSource(s)}
                  style={{ flex: 1, padding: '8px', background: investSource === s ? '#0070f3' : '#333', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', textTransform: 'capitalize' }}>
                  {s}
                </button>
              ))}
            </div>
            <input value={investSymbol} onChange={e => setInvestSymbol(e.target.value)} placeholder="Symbol (e.g. AAPL, BTC)"
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }} />
            <input value={investShares} onChange={e => setInvestShares(e.target.value)} placeholder="Shares / Quantity" type="number"
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }} />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input value={investBuyPrice} onChange={e => setInvestBuyPrice(e.target.value)} placeholder="Buy Price" type="number"
                style={{ flex: 1, background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px' }} />
              <input value={investCurrentPrice} onChange={e => setInvestCurrentPrice(e.target.value)} placeholder="Current Price" type="number"
                style={{ flex: 1, background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px' }} />
            </div>
            <input value={investDate} onChange={e => setInvestDate(e.target.value)} type="date"
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowInvestForm(false)}
                style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddInvestment}
                style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}