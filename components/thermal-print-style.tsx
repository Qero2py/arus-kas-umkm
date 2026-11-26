export function ThermalPrintStyle({ paper }: { paper: 58 | 80 }) {
  return <style>{`@media print { @page { size: ${paper}mm 250mm; margin: 2mm; } body * { visibility: hidden !important; } .invoice-paper, .invoice-paper * { visibility: visible !important; } .invoice-paper { position: absolute; left: 0; top: 0; width: ${paper}mm !important; max-width: none !important; border: 0 !important; box-shadow: none !important; padding: 2mm !important; } }`}</style>;
}
