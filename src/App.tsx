import React, { useEffect, useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, RefreshCw, Sparkles, Activity, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';

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

const FUNDS = [
  { code: '006282', name: '摩根欧洲动力策略股票(QDII)A', slug: '欧洲动力 A' },
  { code: '019450', name: '摩根欧洲动力策略股票(QDII)C', slug: '欧洲动力 C' },
  { code: '019449', name: '摩根日本精选股票(QDII)C', slug: '日本精选 C' },
  { code: '019172', name: '摩根纳斯达克100指数(QDII)A', slug: '纳斯达克100 A' },
];

export default function App() {
  const [data, setData] = useState<FundData | null>(null);
  const [selectedFundCode, setSelectedFundCode] = useState<string>('019172');
  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '1Y'>('3M');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // AI State
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

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

  useEffect(() => {
    fetchData();
  }, []);

  const generateAIInsight = async () => {
    if (!data) return;
    
    setIsAiLoading(true);
    setAiAnalysis('');
    
    try {
      let fundsContext = data.summary.map(s => {
        return `- ${s.SHORTNAME} (${s.FCODE}) 最新净值：${s.NAV} (${Number(s.NAVCHGRT) >= 0 ? '+' : ''}${s.NAVCHGRT}%) [日期: ${s.PDATE}]`;
      }).join('\\n');

      const prompt = `你是专业的华人金融分析师。以下是四只摩根海外投资主题 QDII 基金的最新净值与表现：
${fundsContext}

请根据以上最新表现，为有资产全球化配置需求的高净值客户生成一份专业的实时市场情绪分析与四大标的点评（约200-300字）。请直接返回分析内容，不要任何开场白或寒暄。使用专业且精炼的中文。格式建议采用Markdown格式加粗关键字增强可读性。`;

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

  const selectedFundSummary = useMemo(() => {
    if (!data) return null;
    return data.summary.find(s => s.FCODE === selectedFundCode) || null;
  }, [data, selectedFundCode]);

  const selectedFundHistory = useMemo(() => {
    if (!data) return [];
    return data.history[selectedFundCode] || [];
  }, [data, selectedFundCode]);
  
  const chartData = useMemo(() => {
    let history = selectedFundHistory;
    if (timeframe === '1M') {
      history = history.slice(-22);
    } else if (timeframe === '3M') {
      history = history.slice(-65);
    } else if (timeframe === '1Y') {
      history = history.slice(-250);
    }

    return history.map(item => ({
      time: item.FSRQ.substring(5), // Keep MM-DD
      price: Number(item.DWJZ),
    }));
  }, [selectedFundHistory, timeframe]);

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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               {FUNDS.map((fund) => {
                 const summary = data?.summary.find(s => s.FCODE === fund.code);
                 const isActive = selectedFundCode === fund.code;
                 const pct = summary ? Number(summary.NAVCHGRT) : 0;
                 return (
                   <button 
                     key={fund.code}
                     onClick={() => setSelectedFundCode(fund.code)}
                     className={`card p-4 rounded-xl flex flex-col items-start transition-all ${isActive ? 'ring-2 ring-blue-500 shadow-md transform -translate-y-0.5 bg-blue-50/10' : 'hover:bg-slate-50'}`}
                   >
                     <span className="text-xs font-bold text-slate-500 mb-1 line-clamp-1 text-left">{fund.slug}</span>
                     {summary ? (
                       <div className="flex items-end justify-between w-full mt-2">
                         <span className="text-xl font-bold font-mono">{Number(summary.NAV).toFixed(4)}</span>
                         <span className={`text-xs font-bold flex items-center ${pct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                           {pct >= 0 ? '+' : ''}{pct}%
                         </span>
                       </div>
                     ) : (
                       <div className="flex items-center mt-2 h-[28px]"><RefreshCw className="w-4 h-4 text-slate-300 animate-spin" /></div>
                     )}
                   </button>
                 );
               })}
            </div>

            {/* Price Chart Card */}
            <div className="card p-6 rounded-xl flex-1 flex flex-col">
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
                </div>
              </div>

              {/* Chart */}
              <div className="h-64 sm:h-80 lg:h-96 w-full mt-2 relative">
                {isLoading || chartData.length === 0 ? (
                  <div className="h-full w-full flex items-center justify-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
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
                        tickFormatter={(val) => val.toFixed(4)}
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
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            
          </section>

          {/* AI Sidebar */}
          <aside className="lg:col-span-1 flex flex-col gap-4">
            <div className="card p-4 rounded-xl flex-1 flex flex-col">
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
            </div>

            <div className="bg-slate-900 rounded-lg p-3 text-white shadow-sm mt-auto md:mt-0">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-slate-400">AI MODEL STATUS</span>
                <span className="text-[10px] bg-blue-500 px-1.5 rounded">ONLINE</span>
              </div>
              <p className="text-xs font-medium">Connected to Gemini 2.5 Flash for rapid financial sentiment inference.</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
