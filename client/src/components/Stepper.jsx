export default function Stepper({ step }) {
  const steps = [
    { id: 1, label: '주제' },
    { id: 2, label: '스크립트' },
    { id: 3, label: '영상' },
    { id: 4, label: '업로드' },
  ];

  return (
    <ol className="mb-8 flex flex-wrap gap-2">
      {steps.map((s) => {
        const active = s.id === step;
        const done = s.id < step;
        return (
          <li
            key={s.id}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm border ${
              active
                ? 'border-violet-500 bg-violet-500/20 text-violet-200'
                : done
                  ? 'border-emerald-700 bg-emerald-900/30 text-emerald-300'
                  : 'border-slate-700 text-slate-400'
            }`}
          >
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                active || done ? 'bg-violet-600 text-white' : 'bg-slate-800'
              }`}
            >
              {s.id}
            </span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}
