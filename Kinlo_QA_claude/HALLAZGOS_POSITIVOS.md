# Hallazgos positivos — pase exploratorio 1 (2026-07-17)

Lo que está bien hecho y conviene **proteger con regresión**:

- **Honest-null bien aplicado.** Finance ("$0.00 MXN", "0 payments") y P&L (MARGIN "—" cuando ingreso/egreso = 0). `profitLoss()` devuelve `marginPct: null`, no un NaN ni un número inventado. → cubierto por `businessExpenses.test.js`.
- **Estados vacíos excelentes** en todas las tabs (Home, Wall, Events, Services, Business/Finance): icono + mensaje claro + CTA.
- **Dinero:** el monto usa `keyboardType="decimal-pad"` y valida el vacío antes de guardar; `createExpense` sanea (centavos, whitelist de categoría/método, nota honest-null).
- **Copys de IA honestos y contextuales** (Wall: "…what's happening in Tulum. Check back soon.").
- **Sin crashes ni pantallas blancas** en la ruta recorrida (Home + Business/Finance a fondo + 5 tabs).
