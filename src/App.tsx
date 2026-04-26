import React, { useEffect, useState, useMemo } from 'react';
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from 'recharts';
import { TrendingUp, TrendingDown, RefreshCw, Sparkles, Activity, Clock, SlidersHorizontal, Settings2, X, Wallet, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface FundSummary {
  FCODE: string;
  SHORTNAME: string;
  PDATE: string;
  NAV: string;
  ACCNAV: string;
  NAVCHGRT: string;
}

interface FundHistoryItem {
  FSRQ: string;
  DWJZ: string;
  JZZZL: string;
}

interface FundData {
  summary: FundSummary[];
  history: Record<string, FundHistoryItem[]>;
}

interface Position {
  shares: number;
  costBasis: number;
}

const FUNDS = [
  { code: '006282', name: '摩根欧洲动力策略股票(QDII)A', slug: '欧洲动力 A' },
  { code: '019450', name: '摩根欧洲动力策略股票(QDII)C', slug: '欧洲动力 C' },
  { code: '019449', name: '摩根日本精选股票(QDII)C', slug: '日本精选 C' },
  { code: '019172', name: '摩根纳斯达克100指数(QDII)A', slug: '纳斯达克100 A' },
];

export default function App() {
  const [data, setData] = useState<FundData | null>(null);
  const [selectedFundCode, setSelectedFundCode] = useState<string>('019172');
  const [timeframe, setTimeframe] = useState<'1D' | '1M' | '3M' | '1Y'>('1D');
  const [intradayData, setIntradayData] = useState<Record<string, { time: string, price: number }[]>>({});
  const [isIntradayLoading, setIsIntradayLoading] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showSMA, setShowSMA] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // AI State
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Position State
  const [positions, setPositions] = useState<Record<string, Position>>(() => {
    try {
      const saved = localStorage.getItem('qdii_positions');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error("Failed to parse local storage for positions", e);
      return {};
    }
  });
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<{shares: string, costBasis: string}>({ shares: '', costBasis: '' });

  useEffect(() => {
    localStorage.setItem('qdii_positions', JSON.stringify(positions));
  }, [positions]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/funds');
      if (!res.ok) throw new Error('Failed to fetch data');
      const json = await res.json();
      
      setData(json);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setError('无法获取基金数据，请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchIntraday = async (code: string) => {
    try {
      setIsIntradayLoading(true);
      const res = await fetch(`/api/intraday?code=${code}`);
      if (!res.ok) return;
      
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) return;

      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      
      const formattedData: { time: string, price: number }[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] !== null && closes[i] !== undefined) {
          formattedData.push({
            time: format(new Date(timestamps[i] * 1000), 'HH:mm'),
            price: Number(closes[i].toFixed(2))
          });
        }
      }

      setIntradayData(prev => ({ ...prev, [code]: formattedData }));
    } catch (err) {
      console.error('Error fetching intraday', err);
    } finally {
      setIsIntradayLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedFundCode && !intradayData[selectedFundCode]) {
      fetchIntraday(selectedFundCode);
    }
  }, [selectedFundCode]);

  const generateAIInsight = async () => {
    if (!data) return;
    
    setIsAiLoading(true);
    setAiAnalysis('');
    
    try {
      let fundsContext = data.summary.map(s => {
        const pos = positions[s.FCODE];
        let posStr = '';
        if (pos) {
          const currentVal = pos.shares * Number(s.NAV);
          const costVal = pos.shares * pos.costBasis;
          const plPct = ((currentVal - costVal) / costVal) * 100;
          posStr = ` [用户当前持仓: ${pos.shares}份, 成本价: ${pos.costBasis}, 目前盈亏: ${plPct.toFixed(2)}%]`;
        }
        return `- ${s.SHORTNAME} (${s.FCODE}) 最新净值：${s.NAV} (${Number(s.NAVCHGRT) >= 0 ? '+' : ''}${s.NAVCHGRT}%) [日期: ${s.PDATE}]${posStr}`;
      }).join('\\n');

      const prompt = `你是专业的华人金融分析师。以下是四只摩根海外投资主题 QDII 基金的最新净值与表现，以及用户的当前持仓情况（若有）：
${fundsContext}

请根据以上最新表现和用户的持仓盈亏，为有资产全球化配置需求的高净值客户生成一份专业的实时市场情绪分析、四大标的点评，并在最后提供具体的持仓/加仓/减仓建议（约300字）。如果用户有盈亏数据，请针对其盈亏情况给出个性化的操作建议。请直接返回分析内容，不要任何开场白或寒暄。使用专业且精炼的中文。格式建议采用Markdown格式加粗关键字增强可读性。`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      setAiAnalysis(response.text || '暂无分析内容。');
    } catch (err) {
      console.error('AI generation failed', err);
      setAiAnalysis('生成分析时出错，请重试或检查 API 金钥设定。');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSavePosition = () => {
    const shares = parseFloat(editingPosition.shares);
    const costBasis = parseFloat(editingPosition.costBasis);

    if (!isNaN(shares) && !isNaN(costBasis)) {
      setPositions(prev => ({
        ...prev,
        [selectedFundCode]: { shares, costBasis }
      }));
    } else if (editingPosition.shares === '' && editingPosition.costBasis === '') {
      // Clear position
      const newPos = {...positions};
      delete newPos[selectedFundCode];
      setPositions(newPos);
    }

    setIsPositionModalOpen(false);
  };

  const openPositionModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    const pos = positions[selectedFundCode];
    setEditingPosition({
      shares: pos ? pos.shares.toString() : '',
      costBasis: pos ? pos.costBasis.toString() : ''
    });
    setIsPositionModalOpen(true);
  };

  const selectedFundSummary = useMemo(() => {
    if (!data) return null;
    return data.summary.find(s => s.FCODE === selectedFundCode) || null;
  }, [data, selectedFundCode]);

  const selectedFundHistory = useMemo(() => {
    if (!data) return [];
    return data.history[selectedFundCode] || [];
  }, [data, selectedFundCode]);
  
  const chartData = useMemo(() => {
    if (timeframe === '1D') {
      return intradayData[selectedFundCode] || [];
    }
    
    let history = selectedFundHistory;
    if (timeframe === '1M') {
      history = history.slice(-22);
    } else if (timeframe === '3M') {
      history = history.slice(-65);
    } else if (timeframe === '1Y') {
      history = history.slice(-250);
    }

    const baseData = history.map(item => ({
      time: item.FSRQ.substring(5), // Keep MM-DD
      price: Number(item.DWJZ),
    }));

    // Calculate SMA (Simple Moving Average) - 5 periods
    if (baseData.length > 0) {
      for (let i = 0; i < baseData.length; i++) {
        if (i >= 4) {
          const sum = baseData.slice(i - 4, i + 1).reduce((acc, curr) => acc + curr.price, 0);
          (baseData[i] as any).sma = Number((sum / 5).toFixed(4));
        } else {
          (baseData[i] as any).sma = null;
        }
      }
    }

    return baseData;
  }, [selectedFundHistory, timeframe, intradayData, selectedFundCode]);

  const changePercent = Number(selectedFundSummary?.NAVCHGRT || 0);
  const isPositive = changePercent >= 0;

  const minPrice = useMemo(() => {
    if (chartData.length === 0) return 0;
    const min = Math.min(...chartData.map(d => d.price));
    return min * 0.99;
  }, [chartData]);
  
  const maxPrice = useMemo(() => {
    if (chartData.length === 0) return 0;
    const max = Math.max(...chartData.map(d => d.price));
    return max * 1.01;
  }, [chartData]);

  const periodOpen = chartData.length > 0 ? chartData[0].price : null;
  const periodHigh = chartData.length > 0 ? Math.max(...chartData.map(d => d.price)) : null;
  const periodLow = chartData.length > 0 ? Math.min(...chartData.map(d => d.price)) : null;

  const displayPrice = (val: number | null) => {
    if (val === null) return '---';
    return val > 100 ? val.toFixed(2) : val.toFixed(4);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-600 p-2 rounded">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">
            QDII OVERVIEW <span className="text-blue-600">PRO</span>
          </h1>
        </div>
        <div className="flex items-center space-x-6 text-sm font-medium">
          <div className="flex items-center space-x-2 text-slate-500">
            <Clock className="w-4 h-4" />
            <span>{lastUpdated ? lastUpdated.toLocaleTimeString() : '载入中...'}</span>
          </div>
          <button 
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 transition-colors px-3 py-1.5 rounded text-xs font-bold text-slate-700 uppercase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="flex-1 flex gap-4 p-4 lg:p-6 overflow-hidden max-w-7xl mx-auto w-full">
        {error && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-lg shadow-sm text-sm font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 w-full">
          {/* Main Content Area */}
          <section className="lg:col-span-3 flex flex-col gap-4">
            
            {/* Fund Selector & Highlights */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4"
            >
               {FUNDS.map((fund, index) => {
                 const summary = data?.summary.find(s => s.FCODE === fund.code);
                 const isActive = selectedFundCode === fund.code;
                 const pct = summary ? Number(summary.NAVCHGRT) : 0;

                 // P&L Calculation
                 const pos = positions[fund.code];
                 let plValue = null;
                 let plPct = null;
                 if (pos && summary) {
                   const currentVal = pos.shares * Number(summary.NAV);
                   const costVal = pos.shares * pos.costBasis;
                   plValue = currentVal - costVal;
                   plPct = (plValue / costVal) * 100;
                 }

                 return (
                   <motion.button
                     key={fund.code}
                     initial={{ opacity: 0, scale: 0.9 }}
                     animate={{ opacity: 1, scale: 1 }}
                     transition={{ duration: 0.3, delay: index * 0.1 }}
                     onClick={() => setSelectedFundCode(fund.code)}
                     className={`card p-4 rounded-xl flex flex-col items-start transition-all relative ${isActive ? 'ring-2 ring-blue-500 shadow-md transform -translate-y-0.5 bg-blue-50/10' : 'hover:bg-slate-50'}`}
                   >
                     <div className="flex justify-between w-full items-center mb-1">
                       <span className="text-xs font-bold text-slate-500 line-clamp-1 text-left pr-6">{fund.slug}</span>
                       {isActive && (
                         <button
                           onClick={openPositionModal}
                           className="absolute right-3 top-3 text-slate-400 hover:text-blue-600 transition-colors bg-white/50 rounded-full p-1 shadow-sm"
                           title="Edit Position"
                         >
                           <Settings2 className="w-3.5 h-3.5" />
                         </button>
                       )}
                     </div>
                     {summary ? (
                       <>
                         <div className="flex items-end justify-between w-full mt-1">
                           <span className="text-xl font-bold font-mono">{Number(summary.NAV).toFixed(4)}</span>
                           <span className={`text-xs font-bold flex items-center ${pct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                             {pct >= 0 ? '+' : ''}{pct}%
                           </span>
                         </div>
                         {pos && plValue !== null && plPct !== null && (
                           <div className="w-full mt-2 pt-2 border-t border-slate-100 flex justify-between items-center text-[10px] font-mono">
                             <span className="text-slate-400">P&L</span>
                             <span className={`font-bold ${plValue >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                               {plValue >= 0 ? '+' : ''}{plValue.toFixed(2)} ({plPct >= 0 ? '+' : ''}{plPct.toFixed(2)}%)
                             </span>
                           </div>
                         )}
                       </>
                     ) : (
                       <div className="flex items-center mt-2 h-[28px]"><RefreshCw className="w-4 h-4 text-slate-300 animate-spin" /></div>
                     )}
                   </motion.button>
                 );
               })}
            </motion.div>

            {/* Price Chart Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="card p-6 rounded-xl flex-1 flex flex-col"
            >
              <div className="flex justify-between items-start mb-6 w-full">
                <div>
                  <h2 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{selectedFundSummary ? selectedFundSummary.SHORTNAME : '---'} ({selectedFundCode})</h2>
                  <div className="flex items-baseline space-x-3">
                    <span className="text-4xl font-extrabold tracking-tighter">
                      {selectedFundSummary?.NAV || '---'}
                    </span>
                    {selectedFundSummary && (
                      <span className={`font-semibold ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isPositive ? <TrendingUp className="inline w-4 h-4 mr-1"/> : <TrendingDown className="inline w-4 h-4 mr-1"/>}
                        {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-2 font-mono">AS OF {selectedFundSummary?.PDATE || '----'}</div>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button 
                    onClick={() => setTimeframe('1D')}
                    className={`px-3 py-1 text-xs font-semibold rounded shadow-sm transition-colors ${timeframe === '1D' ? 'bg-white text-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                  >1D</button>
                  <button 
                    onClick={() => setTimeframe('1M')}
                    className={`px-3 py-1 text-xs font-semibold rounded shadow-sm transition-colors ${timeframe === '1M' ? 'bg-white text-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                  >1M</button>
                  <button 
                    onClick={() => setTimeframe('3M')}
                    className={`px-3 py-1 text-xs font-semibold rounded shadow-sm transition-colors ${timeframe === '3M' ? 'bg-white text-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                  >3M</button>
                  <button 
                    onClick={() => setTimeframe('1Y')}
                    className={`px-3 py-1 text-xs font-semibold rounded shadow-sm transition-colors ${timeframe === '1Y' ? 'bg-white text-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                  >1Y</button>

                  <div className="w-px h-4 bg-slate-300 mx-2 self-center"></div>

                  <button
                    onClick={() => setShowSMA(!showSMA)}
                    className={`px-3 py-1 text-xs font-semibold rounded flex items-center gap-1 shadow-sm transition-colors ${showSMA ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                    title="Toggle Simple Moving Average (5-period)"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    SMA
                  </button>
                </div>
              </div>

              {/* Chart */}
              <div className="h-64 sm:h-80 lg:h-96 w-full mt-2 relative">
                {(isLoading && timeframe !== '1D') || (isIntradayLoading && timeframe === '1D') || chartData.length === 0 ? (
                  <div className="h-full w-full flex items-center justify-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2}/>
                          <stop offset="100%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4" stroke="#E2E8F0" vertical={false} />
                      <XAxis 
                        dataKey="time" 
                        stroke="#94a3b8" 
                        tick={{fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono'}}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={30}
                      />
                      <YAxis 
                        domain={[minPrice, maxPrice]} 
                        stroke="#94a3b8" 
                        tick={{fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono'}}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) => val > 100 ? val.toFixed(0) : val.toFixed(4)}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'white', borderColor: '#E2E8F0', borderRadius: '8px', color: '#0f172a', fontSize: '12px', fontFamily: 'JetBrains Mono', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)' }}
                        itemStyle={{ color: '#3B82F6', fontWeight: 'bold' }}
                        labelStyle={{ color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontSize: '10px' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="price" 
                        stroke="#3B82F6" 
                        strokeWidth={2.5}
                        fillOpacity={1} 
                        fill="url(#colorPrice)" 
                        isAnimationActive={false}
                      />
                      {showSMA && (
                        <Line
                          type="monotone"
                          dataKey="sma"
                          stroke="#F59E0B"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                          strokeDasharray="5 5"
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Position Info Banner */}
              {positions[selectedFundCode] && selectedFundSummary && (() => {
                const pos = positions[selectedFundCode];
                const currentVal = pos.shares * Number(selectedFundSummary.NAV);
                const costVal = pos.shares * pos.costBasis;
                const plValue = currentVal - costVal;
                const plPct = (plValue / costVal) * 100;

                return (
                  <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-200 p-2 rounded-full">
                        <Wallet className="w-4 h-4 text-slate-600" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Your Position</p>
                        <p className="text-sm font-semibold text-slate-700 font-mono">{pos.shares.toLocaleString()} <span className="text-xs text-slate-500 font-sans">shares @</span> {pos.costBasis.toFixed(4)}</p>
                      </div>
                    </div>

                    <div className="flex gap-6">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Market Value</p>
                        <p className="text-sm font-semibold text-slate-700 font-mono">¥{currentVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Unrealized P&L</p>
                        <p className={`text-sm font-bold font-mono ${plValue >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {plValue >= 0 ? '+' : ''}{plValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          <span className="text-xs ml-1 bg-white/50 px-1 py-0.5 rounded">
                            {plPct >= 0 ? '+' : ''}{plPct.toFixed(2)}%
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Data Summary Panel */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-slate-100 pt-4 mt-4">
                <div className="text-center border-r md:border-slate-100 border-transparent hover:bg-slate-50 rounded-lg p-2 transition-colors">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 tracking-wider">Period Open</p>
                  <p className="font-mono font-semibold text-lg">{displayPrice(periodOpen)}</p>
                </div>
                <div className="text-center md:border-r border-slate-100 hover:bg-slate-50 rounded-lg p-2 transition-colors">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 tracking-wider">Period High</p>
                  <p className="font-mono font-semibold text-emerald-500 text-lg">{displayPrice(periodHigh)}</p>
                </div>
                <div className="text-center border-r md:border-slate-100 border-transparent hover:bg-slate-50 rounded-lg p-2 transition-colors">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 tracking-wider">Period Low</p>
                  <p className="font-mono font-semibold text-rose-500 text-lg">{displayPrice(periodLow)}</p>
                </div>
                <div className="text-center hover:bg-slate-50 rounded-lg p-2 transition-colors">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 tracking-wider">Accumulated NAV</p>
                  <p className="font-mono font-semibold text-blue-500 text-lg">{selectedFundSummary ? Number(selectedFundSummary.ACCNAV).toFixed(4) : '---'}</p>
                </div>
              </div>
            </motion.div>
            
          </section>

          {/* AI Sidebar */}
          <aside className="lg:col-span-1 flex flex-col gap-4">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="card p-4 rounded-xl flex-1 flex flex-col"
            >
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center">
                <Sparkles className="w-4 h-4 mr-2 text-blue-500" />
                AI SENTIMENT & ANALYSIS
              </h3>
              
              <div className="flex-grow flex flex-col overflow-auto min-h-[300px]">
                {aiAnalysis ? (
                  <div className="prose prose-slate prose-sm text-slate-600">
                    <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex-grow flex flex-col items-center justify-center text-slate-400 text-center px-4 space-y-4">
                    <Sparkles className="w-8 h-8 opacity-20" />
                    <p className="text-xs font-medium">Generate real-time global market sentiment and cross-asset feedback.</p>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <button
                  onClick={generateAIInsight}
                  disabled={isAiLoading || !data}
                  className="w-full py-2.5 px-4 rounded flex items-center justify-center gap-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors text-white uppercase tracking-wider shadow-sm"
                >
                  {isAiLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      ANALYZING...
                    </>
                  ) : (
                    <>
                      GENERATE AI INSIGHT
                    </>
                  )}
                </button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="bg-slate-900 rounded-lg p-3 text-white shadow-sm mt-auto md:mt-0"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-slate-400">AI MODEL STATUS</span>
                <span className="text-[10px] bg-blue-500 px-1.5 rounded">ONLINE</span>
              </div>
              <p className="text-xs font-medium">Connected to Gemini 2.5 Flash for rapid financial sentiment inference.</p>
            </motion.div>
          </aside>
        </div>
      </main>

      {/* Position Modal */}
      <AnimatePresence>
      {isPositionModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
          >
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-blue-500" />
                Edit Position
              </h3>
              <button onClick={() => setIsPositionModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="mb-2">
                <p className="text-xs text-slate-500 mb-1">Fund</p>
                <p className="text-sm font-semibold text-slate-800">{FUNDS.find(f => f.code === selectedFundCode)?.name}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Shares / Units</label>
                <input
                  type="number"
                  value={editingPosition.shares}
                  onChange={(e) => setEditingPosition({...editingPosition, shares: e.target.value})}
                  placeholder="e.g. 10000"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Average Cost Basis</label>
                <input
                  type="number"
                  step="0.0001"
                  value={editingPosition.costBasis}
                  onChange={(e) => setEditingPosition({...editingPosition, costBasis: e.target.value})}
                  placeholder="e.g. 1.2500"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>

              <div className="bg-blue-50 text-blue-800 text-xs p-3 rounded-lg flex items-start gap-2 mt-2">
                <div className="mt-0.5"><Sparkles className="w-3 h-3" /></div>
                <p>Setting your position allows the AI to provide personalized holding advice based on your exact cost basis.</p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button
                onClick={() => {
                  setEditingPosition({shares: '', costBasis: ''});
                }}
                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handleSavePosition}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
              >
                Save Position
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
