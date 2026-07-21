export default function ProgressBar({ value = 0, message }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm text-slate-300">
        <span>{message || '처리 중...'}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-violet-500 transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
