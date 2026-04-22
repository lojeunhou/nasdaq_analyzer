import React, { useEffect, useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, RefreshCw, Sparkles, Activity, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';

// Initialize Gemini SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface DataPoint {
  time: string;
  price: number;
  rawTimestamp: number;
}

export default function App() {
  const [data, setData] = useState<DataPoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [prevClose, setPrevClose] = useState<number>(1);
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
      const res = await fetch('/api/nasdaq');
      if (!res.ok) throw new Error('Failed to fetch data');
      const json = await res.json();
      
      const result = json?.chart?.result?.[0];
      if (!result) throw new Error('Invalid data format');

      const timestamps = result.timestamp || [];
      const closes = result.indicators.quote[0].close || [];
      const previousClose = result.meta.chartPreviousClose || result.meta.previousClose;
      
      const formattedData: DataPoint[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] !== null && closes[i] !== undefined) {
          formattedData.push({
            time: format(new Date(timestamps[i] * 1000), 'HH:mm'),
            price: Number(closes[i].toFixed(2)),
            rawTimestamp: timestamps[i] * 1000
          });
        }
      }

      if (formattedData.length > 0) {
        setData(formattedData);
        setCurrentPrice(formattedData[formattedData.length - 1].price);
        setPrevClose(Number(previousClose));
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error(err);
      setError('无法获取纳指数据');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh every 1 minute
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const generateAIInsight = async () => {
    if (data.length === 0) return;
    
    setIsAiLoading(true);
    setAiAnalysis('');
    
    try {
      const high = Math.max(...data.map(d => d.price));
      const low = Math.min(...data.map(d => d.price));
      const change = currentPrice - prevClose;
      const changePercent = (change / prevClose) * 100;
      
      const prompt = `你是专业的华人金融分析师。以下是今日纳斯达克综合指数（Nasdaq Composite, ^IXIC）的最新交易日内部数据切片：
- 昨日收盘价：${prevClose.toFixed(2)}
- 当前价格：${currentPrice.toFixed(2)} (${change >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)
- 今日最高：${high.toFixed(2)}
- 今日最低：${low.toFixed(2)}
- 数据点数量：${data.length}

请帮我生成一段实时的市场情绪分析与简短技术面点评（约150-200字）。请直接返回分析内容，不要任何开场白或寒暄。使用专业且精炼的中文。`;

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

  const change = currentPrice - prevClose;
  const changePercent = (change / prevClose) * 100;
  const isPositive = change >= 0;

  // Chart min/max domain
  const minPrice = useMemo(() => {
    if (data.length === 0) return 0;
    const min = Math.min(...data.map(d => d.price), prevClose);
    return Math.floor(min * 0.999);
  }, [data, prevClose]);
  
  const maxPrice = useMemo(() => {
    if (data.length === 0) return 0;
    const max = Math.max(...data.map(d => d.price), prevClose);
    return Math.ceil(max * 1.001);
  }, [data, prevClose]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-600 p-2 rounded">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">
            NASDAQ ANALYZER <span className="text-blue-600">PRO</span>
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
          {/* Main Chart Area */}
          <section className="lg:col-span-3 flex flex-col gap-4">
            
            {/* Price Card */}
            <div className="card p-6 rounded-xl flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-6 w-full">
                <div>
                  <h2 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">NASDAQ-100 INDEX (^IXIC)</h2>
                  <div className="flex items-baseline space-x-3">
                    <span className="text-4xl font-extrabold tracking-tighter">
                      {currentPrice > 0 ? currentPrice.toFixed(2) : '---'}
                    </span>
                    {currentPrice > 0 && (
                      <span className={`font-semibold ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button className="px-3 py-1 text-xs font-semibold bg-white rounded shadow-sm text-slate-800">1D</button>
                  <button className="px-3 py-1 text-xs font-semibold text-slate-500 opacity-50 cursor-not-allowed">1W</button>
                  <button className="px-3 py-1 text-xs font-semibold text-slate-500 opacity-50 cursor-not-allowed">1M</button>
                </div>
              </div>

              {/* Chart */}
              <div className="h-64 sm:h-80 lg:h-96 w-full mt-2 relative">
                {isLoading && data.length === 0 ? (
                  <div className="h-full w-full flex items-center justify-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
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
                        tickFormatter={(val) => Math.round(val).toString()}
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

              {/* Data Summary Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-slate-100 pt-4 mt-4">
                <div className="text-center border-r md:border-slate-100 border-transparent">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Prev Close</p>
                  <p className="font-mono font-semibold">{prevClose.toFixed(2)}</p>
                </div>
                <div className="text-center md:border-r border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Open</p>
                  <p className="font-mono font-semibold">{data.length > 0 ? data[0].price.toFixed(2) : '---'}</p>
                </div>
                <div className="text-center border-r md:border-slate-100 border-transparent">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Low</p>
                  <p className="font-mono font-semibold text-rose-500">{data.length > 0 ? Math.min(...data.map(d => d.price)).toFixed(2) : '---'}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">High</p>
                  <p className="font-mono font-semibold text-emerald-500">{data.length > 0 ? Math.max(...data.map(d => d.price)).toFixed(2) : '---'}</p>
                </div>
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
                    <p className="text-xs font-medium">Generate real-time market sentiment and technical feedback.</p>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <button
                  onClick={generateAIInsight}
                  disabled={isAiLoading || data.length === 0}
                  className="w-full py-2.5 px-4 rounded flex items-center justify-center gap-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors text-white uppercase tracking-wider"
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
