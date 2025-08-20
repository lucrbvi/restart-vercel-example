import { create } from "zustand";
import { getName, getServerTime } from '../server';

const serverFnAvailable = {
  getName: { name: 'getName', fn: getName, requiresInput: true },
  getServerTime: { name: 'getServerTime', fn: getServerTime, requiresInput: false },
};

type State = {
  selectedFunction: string;
  setSelectedFunction: (val: string) => void;
  inputName: string;
  setInputName: (val: string) => void;
  result: string | null;
  setResult: (val: string | null) => void;
  loading: boolean;
  setLoading: (val: boolean) => void;
  error: string | null;
  setError: (val: string | null) => void;
  testServerFunction: () => Promise<void>;
};

const useStore = create<State>((set, get) => ({
  selectedFunction: Object.keys(serverFnAvailable)[0] || 'getName',
  setSelectedFunction: (val) => set({ selectedFunction: val }),
  inputName: '',
  setInputName: (val) => set({ inputName: val }),
  result: null,
  setResult: (val) => set({ result: val }),
  loading: false,
  setLoading: (val) => set({ loading: val }),
  error: null,
  setError: (val) => set({ error: val }),
  testServerFunction: async () => {
    const { inputName, selectedFunction } = get();
    const functionConfig = serverFnAvailable[selectedFunction as keyof typeof serverFnAvailable];
    
    if (!functionConfig) {
      set({ error: `Function ${selectedFunction} not found` });
      return;
    }

    const { fn: serverFn, requiresInput } = functionConfig;
    const input = inputName.trim();
    
    if (requiresInput && !input) {
      set({ error: 'Input is required for this function' });
      return;
    }
    
    set({ loading: true, error: null, result: null });
    try {
      const response = requiresInput ? await serverFn(input) : await (serverFn as () => Promise<string>)();
      set({ result: response });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      set({ loading: false });
    }
  }
}));

function mulberry32(seed: number) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
const seededRandom = mulberry32(1337);
const logoData = [...Array(12)].map((_, i) => {
  const isBunLogo = i % 3 === 0;
  const randomLeft = seededRandom() * 150 + i * 15;
  const randomTop = seededRandom() * 100 + i * 20;
  const driftDuration = 8 + (i % 4);
  const spinDuration = 4 + (i % 3);
  const spinDelay = (i * 0.5) % 4;
  const driftFromX = 100 + seededRandom() * 50;
  const driftFromY = 100 + seededRandom() * 50;
  const driftToX = -200 - seededRandom() * 100;
  const driftToY = -200 - seededRandom() * 100;
  return { i, isBunLogo, left: randomLeft, top: randomTop, driftDuration, spinDuration, spinDelay, driftFromX, driftFromY, driftToX, driftToY };
});

const keyframesCSS = logoData.map(({i, driftFromX, driftFromY, driftToX, driftToY}) => `
  @keyframes drift-${i} {
    0% {
      transform: translate(${driftFromX}vw, ${driftFromY}vh) rotate(0deg);
      opacity: 0;
    }
    5% {
      opacity: 1;
    }
    95% {
      opacity: 1;
    }
    100% {
      transform: translate(${driftToX}px, ${driftToY}px) rotate(360deg);
      opacity: 0;
    }
  }
`).join('');

const Background = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="relative w-full h-full">
        {logoData.map(({i, isBunLogo, left, top, driftDuration, spinDuration, spinDelay}) => (
          <div 
            key={i} 
            className="absolute"
            style={{
              left: `${left}px`,
              top: `${top}px`,
              animation: `drift-${i} ${driftDuration}s linear infinite`
            }}
          >
            <img
              src={isBunLogo ? "/logo.svg" : "/react.svg"}
              alt=""
              className="w-16 h-16 animate-spin"
              style={{
                animationDuration: `${spinDuration}s`,
                animationDelay: `${spinDelay}s`
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const FunctionSelector = () => {
  "use client"
  const { selectedFunction, setSelectedFunction } = useStore();
  const functionNames = Object.keys(serverFnAvailable);

  return (
    <select
      value={selectedFunction}
      onChange={(e) => setSelectedFunction(e.target.value)}
      className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 text-sm focus:border-blue-500 focus:outline-none"
    >
      {functionNames.map((functionName) => (
        <option key={functionName} value={functionName}>
          {functionName}
        </option>
      ))}
    </select>
  );
};

const TestBackend = () => {
  "use client"
  const { inputName, setInputName, result, loading, error, testServerFunction, selectedFunction } = useStore();
  const functionConfig = serverFnAvailable[selectedFunction as keyof typeof serverFnAvailable];
  const requiresInput = functionConfig?.requiresInput ?? true;

  return (
    <div className="w-full max-w-md bg-black/80 backdrop-blur-sm text-green-400 p-6 rounded-lg font-mono border border-gray-700">
      <h2 className="text-lg mb-4 text-white text-center">tRPC Backend Test</h2>
      
      <div className="space-y-4">
        <div>
          <label className="text-sm text-gray-400 block mb-2">Select Function</label>
          <FunctionSelector />
        </div>
        
        <div>
          <label className="text-sm text-gray-400 block mb-2">{selectedFunction} Function</label>
          <div className="flex gap-2">
            {requiresInput && (
              <input
                type="text"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder="Enter name..."
                className="bg-gray-800 text-white p-2 rounded border border-gray-600 flex-1 text-sm"
              />
            )}
            <button
              onClick={testServerFunction}
              disabled={loading || (requiresInput && !inputName.trim())}
              className={`bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded text-sm transition-colors ${
                !requiresInput ? 'flex-1' : ''
              }`}
            >
              {loading ? '...' : 'Test'}
            </button>
          </div>
        </div>
        
        <div className="bg-gray-900/50 p-3 rounded text-sm min-h-[2.5rem] flex items-center">
          {loading && <div className="text-yellow-400">⏳ Loading...</div>}
          {error && <div className="text-red-400">❌ {error}</div>}
          {result && <div className="text-green-400">✅ {result}</div>}
          {!loading && !error && !result && (
            <div className="text-gray-500">Ready to test</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default async function Page() {
  return (
    <div className="min-h-screen bg-gray-900 relative overflow-hidden flex flex-col">
      <Background />

      <style>{keyframesCSS}</style>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8">
        <div className="flex flex-col items-center justify-center mb-12">
          <h1 className="text-4xl font-bold text-white text-center">Welcome to Restart!</h1>
          <br/>
          <h3 className="text-white text-center">The minimal and fully open full-stack React framework</h3>
          <br/>
          <TestBackend />
        </div>
      </div>
    </div>
  );
}