interface StepperProps {
  step: number;
  total?: number;
  /** Nome da etapa atual (destacado à direita). */
  label: string;
}

/** Indicador de progresso: barras (preenchidas até a etapa atual) e "Etapa X de Y". */
export default function Stepper({ step, total = 2, label }: StepperProps) {
  return (
    <div className="bg-[#F4F6F6] px-3.5 pb-2 pt-2.5">
      <div aria-hidden className="flex gap-2">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={`h-1 flex-1 rounded-full ${index < step ? 'bg-brand-primary' : 'bg-gray-300'}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11.5px]">
        <span className="text-gray-500">
          Etapa {step} de {total}
        </span>
        <span className="font-bold text-brand-primary">{label}</span>
      </div>
    </div>
  );
}
