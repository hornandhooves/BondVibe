# 🎉 Kinlo

> **Personality-matched group experiences that turn strangers into friends**

Kinlo es una plataforma de conexión social que facilita reuniones grupales presenciales auténticas a través de matching basado en personalidad Big Five.

[![React Native](https://img.shields.io/badge/React%20Native-0.81.5-blue.svg)](https://reactnative.dev/)
[![Expo SDK](https://img.shields.io/badge/Expo-54-black.svg)](https://expo.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Active-orange.svg)](https://firebase.google.com/)
[![Stripe](https://img.shields.io/badge/Stripe-Connect-635bff.svg)](https://stripe.com/connect)

---

## 📖 About

Kinlo combate la soledad urbana conectando personas a través de:

- 🧠 **Big Five Personality Matching** - Algoritmo propietario para grupos armoniosos
- 👨‍🍳 **Expert-Led Experiences** - Eventos curados con hosts verificados
- 🌍 **Multilingual-First** - 4 idiomas desde día 1 (EN, ES, DE, FR)
- 💰 **Accesible** - $15-50 por evento
- 🛡️ **Safety-Focused** - Verificación, reportes, moderación activa

---

## ✨ Features Implementadas

### 🔐 Core Platform
- ✅ **Autenticación completa**: Email/password + social login (Google, Apple)
- ✅ **Gestión de perfiles**: Creación, edición, verificación
- ✅ **Event Marketplace**: Crear, descubrir, unirse a eventos
- ✅ **Chat en tiempo real**: Conversaciones grupales por evento
- ✅ **Eventos recurrentes**: Soporte completo para series de eventos

### 💳 Payments & Monetization
- ✅ **Stripe Connect**: Pagos directos a cuentas de hosts
- ✅ **Platform Fee**: 5% sobre eventos pagados
- ✅ **Onboarding automatizado**: Express accounts para hosts
- ✅ **Checkout seguro**: PCI-compliant con @stripe/react-native

### 💰 Refund System
- ✅ **Política basada en tiempo**:
  - 7+ días antes: 100% reembolso (menos fees)
  - 3-7 días antes: 50% reembolso (menos fees)
  - <3 días: Sin reembolso
- ✅ **Non-refundable fees**: ~7% fees de procesamiento retenidos
- ✅ **Procesamiento automático**: Cloud Functions manejan todo
- ✅ **Host cancellations**: Siempre 100% reembolso (menos fees)

### 🔔 Push Notifications
- ✅ **Event Join**: Host recibe notificación cuando usuario se une
- ✅ **Cancellations**: Notificaciones de cambios en asistencia
- ✅ **Chat Messages**: Mensajes en tiempo real
- ✅ **All App States**: Funciona con app abierta, cerrada o en background

### 🎨 UI/UX
- ✅ **Glassmorphism Design**: Interfaz moderna y pulida
- ✅ **Dark Mode**: Soporte completo de temas
- ✅ **Transparent Pricing**: Disclosure claro de fees
- ✅ **Admin Dashboard**: Panel para gestión de hosts y usuarios

---

## 🚀 Tech Stack

### Frontend
- **Framework**: React Native (Expo SDK 54)
- **Navigation**: React Navigation v6
- **State Management**: React Context + Hooks
- **Payments**: @stripe/stripe-react-native
- **Notifications**: expo-notifications + Expo Push API
- **Design System**: Custom glassmorphism components

### Backend
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Functions**: Firebase Cloud Functions v2 (Node.js 20)
- **Payments**: Stripe Connect (Express Accounts)
- **Storage**: Firebase Storage
- **Cost**: <$5/month optimizado para escalar

---

## 🎯 Estado del Proyecto

### ✅ Sprint 1-4 Completado
- [x] User authentication & profiles
- [x] Event creation & management
- [x] Stripe Connect integration
- [x] Payment processing (paid & free events)
- [x] Refund system con non-refundable fees
- [x] Push notifications (join, cancel, messages)
- [x] Real-time chat por evento
- [x] Admin dashboard
- [x] Recurring events

### 🏃 Sprint 5-6 En Progreso
- [ ] Big Five Personality Assessment (10 preguntas)
- [ ] Matching algorithm v1
- [ ] Event recommendations
- [ ] Post-event feedback
- [ ] Multilingual UI (EN, ES, DE, FR)

### 🎯 MVP1 Roadmap (Semanas 1-12)
- [ ] Event Buddy System
- [ ] Gamified Icebreakers
- [ ] Premium subscription ($9.99/mo)
- [ ] Referral program
- [ ] Venue partnerships

Ver [MoSCoW Prioritization](./docs/sprint-0/MOSCOW_MVP1.md) para roadmap completo.

---

## 📊 Métricas & Goals

### MVP1 Success Criteria
- 500 usuarios registrados
- 50 eventos ejecutados
- 70% tasa de repetición (3 meses)
- NPS >60
- <10% no-show rate
- Zero critical bugs

### Stats Actuales
- **Events Creados**: 18+
- **Payment Success Rate**: ~100%
- **Push Delivery Rate**: ~98%
- **Refunds Procesados**: Funcional y testeado

---

## 💳 Payment Flow

```
Usuario → Checkout → Stripe Payment Intent
  ↓
Pago exitoso
  ↓
95% → Cuenta Stripe del Host
5% → Platform Fee
  ↓
Usuario agregado a attendees
  ↓
Push notification al host
```

**Estructura de Fees**:
```
Pago: $200 MXN
├─ Stripe fee: $12.88 (6.44%) - NO REEMBOLSABLE
├─ Platform fee: $10.00 (5%) - NO REEMBOLSABLE
└─ Host recibe: $177.12 (88.56%)
```

---

## 💰 Business Model

### Revenue Streams
| Stream | Pricing | Year 1 Target |
|--------|---------|---------------|
| Event Commissions | 5% | $40,000 |
| Premium Subscriptions | $9.99/mo | $30,000 |
| Venue Partnerships | $500-2K/mo | $15,000 |
| Expert Certification | $99 | $5,000 |
| **TOTAL** | | **$90,000** |

### Unit Economics
- **CAC**: $12
- **LTV**: $120 (12 meses)
- **LTV:CAC**: 10:1
- **Payback**: 1.2 meses
- **Break-even**: Mes 8-9

---

## 📚 Documentation

### 📖 Product Documentation
- [Project Charter](./docs/sprint-0/PROJECT_CHARTER.md) - Visión y misión
- [Lean Canvas](./docs/sprint-0/LEAN_CANVAS.md) - Business model
- [MoSCoW Prioritization](./docs/sprint-0/MOSCOW_MVP1.md) - Feature roadmap
- [User Stories](./docs/sprint-0/USER_STORIES_SPRINT1.md) - Requirements

### 🔧 Technical Documentation
- [Cloud Functions API](./docs/CLOUD_FUNCTIONS.md) - Complete API reference
- [Stripe Setup Guide](./docs/STRIPE_SETUP.md) - Payment integration guide
- [Testing Guide](./docs/TESTING.md) - QA procedures

---

## 🚀 Quick Start

### Prerequisites
```bash
node --version    # 18+
npm --version
expo --version    # Latest
firebase --version # Latest
```

### Installation

```bash
# 1. Clone repo
git clone https://github.com/DuarTchock/Kinlo.git
cd bondvibe

# 2. Install dependencies
npm install
cd functions && npm install && cd ..

# 3. Configure environment
cp .env.example .env
# Edit .env with your Firebase & Stripe keys

# 4. Set Firebase secrets
cd functions
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET

# 5. Deploy Cloud Functions
firebase deploy --only functions

# 6. Run app
npx expo start --ios  # or --android
```

Ver [STRIPE_SETUP.md](./docs/STRIPE_SETUP.md) para setup detallado.

---

## 🧪 Testing

### Stripe Test Cards
```
Success: 4242 4242 4242 4242
Mexico:  4000 0056 6555 5556
Decline: 4000 0000 0000 0002
```

### Test Scenarios
1. ✅ Payment flow ($200 MXN)
2. ✅ Refund processing (7+ days)
3. ✅ Push notifications (locked device)
4. ✅ Stripe Connect onboarding
5. ✅ Host cancellation (full refunds)

---

## 🏗️ Project Structure

```
bondvibe/
├── src/
│   ├── screens/         # App screens
│   ├── components/      # Reusable components
│   ├── services/        # API services
│   ├── contexts/        # React contexts
│   └── navigation/      # Navigation setup
├── functions/           # Firebase Cloud Functions
│   ├── stripe/          # Payment & refund logic
│   ├── notifications/   # Push service
│   └── config/          # Platform config
├── docs/               # Documentation
│   ├── sprint-0/       # Product docs
│   ├── CLOUD_FUNCTIONS.md
│   └── STRIPE_SETUP.md
└── app.json           # Expo config
```

---

## 🔐 Security & Compliance

- ✅ PCI-compliant payment processing
- ✅ Firebase security rules implementadas
- ✅ Webhook signature verification
- ✅ Firebase secrets para API keys
- ✅ HTTPS-only Cloud Functions
- ✅ Data encryption en tránsito y reposo

---

## 🐛 Troubleshooting

### Common Issues

**Push notifications no funcionan**
```bash
# 1. Verificar pushToken en Firestore
# 2. Revisar logs: firebase functions:log
# 3. Verificar permisos en device settings
```

**Payment falla**
```bash
# 1. Verificar Stripe API keys
# 2. Check host completó onboarding
# 3. Revisar: firebase functions:log --only createEventPaymentIntent
```

Ver [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) para más detalles.

---

## 🤝 Contributing

Este es un proyecto privado. Para consultas sobre contribuciones, contacta al maintainer.

---

## 📝 License

Private & Proprietary

---

## 👤 Author

**Carlos Duarte**
- GitHub: [@DuarTchock](https://github.com/DuarTchock)
- Building Kinlo to combat urban loneliness

---

## 🙏 Acknowledgments

- Expo team por excelente React Native tooling
- Stripe por APIs comprehensivas de pagos
- Firebase por infraestructura backend escalable
- Community por feedback y soporte

---

## 📈 Roadmap 2025

### Q1: Foundation ✅
- ✅ Core platform MVP
- ✅ Payment & refund system
- ✅ Push notifications
- 🏃 Personality assessment

### Q2: Growth 🎯
- Matching algorithm
- Multilingual expansion
- Event recommendations
- Premium tiers

### Q3: Scale 🚀
- Multi-city launch (Tulum)
- Advanced analytics
- Partnership program
- Virtual events

---

**Built with ❤️ to turn strangers into friends**

*Let's combat urban loneliness together! 🚀*
