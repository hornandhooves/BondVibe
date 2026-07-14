# Stripe Connect - Task Tracking

## Status: 🚧 In Progress

### Fase 1: Configuración de Stripe Connect ⏳
- [ ] Activar Stripe Connect en dashboard de Stripe
- [ ] Configurar aplicación Connect
- [ ] Obtener client_id de Connect
- [ ] Configurar redirect URLs

### Fase 2: Backend - Onboarding de Hosts
- [ ] Crear Cloud Function: `createConnectAccount`
- [ ] Crear Cloud Function: `createAccountLink`
- [ ] Crear Cloud Function: `getAccountStatus`
- [ ] Implementar webhook handler para `account.updated`
- [ ] Tests unitarios para onboarding

### Fase 3: Backend - Pagos con Connect
- [ ] Modificar `createEventPaymentIntent` para usar Connect
- [ ] Modificar `createTipPaymentIntent` para usar Connect
- [ ] Actualizar lógica de refunds
- [ ] Tests de pagos con Connect

### Fase 4: Frontend - UI para Hosts
- [ ] Pantalla "Conectar Stripe" en perfil
- [ ] Indicador de status de verificación
- [ ] Dashboard de ganancias
- [ ] Botón de re-onboarding
- [ ] Tests de UI

### Fase 5: Testing End-to-End
- [ ] Flujo completo de onboarding en test mode
- [ ] Pago con split automático
- [ ] Refund desde cuenta del host
- [ ] Edge cases y manejo de errores

## Notes
- Usar Standard Accounts para máxima transparencia
- Host maneja sus propios refunds
- Kinlo cobra 5% platform fee automáticamente
