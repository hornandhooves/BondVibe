/**
 * seed-e2e.mjs — siembra las cuentas que necesitan los flujos Maestro (.maestro/).
 *
 * Crea/actualiza 3 usuarios en kinlo-app-dev (Auth + doc users/{uid}) con el
 * rol/flags exactos que ejercitan los recorridos de Services:
 *   - HOST   : host APROBADO  → provider-publish-photo, service-delete
 *   - ADMIN  : admin que NO es host (hostApproved != true) → admin-becomes-host-keeps-panel
 *   - GUEST  : usuario normal (attendee) → repuesto / escenarios de gate
 *
 * REQUISITOS (sin esto no corre):
 *   - Credenciales de Admin SDK: exporta GOOGLE_APPLICATION_CREDENTIALS con el
 *     JSON de una service account de kinlo-app-dev, o corre `gcloud auth
 *     application-default login` con la cuenta hornandhoovesdev@gmail.com.
 *   - firebase-admin instalado (usa el de functions/):
 *       node --experimental-vm-modules scripts/seed-e2e.mjs
 *     o `npm --prefix functions i` y corre con NODE_PATH=functions/node_modules.
 *
 * Uso:
 *   HOST_EMAIL=host-e2e@kinlo.test  HOST_PASSWORD=... \
 *   ADMIN_EMAIL=admin-e2e@kinlo.test ADMIN_PASSWORD=... \
 *   GUEST_EMAIL=guest-e2e@kinlo.test GUEST_PASSWORD=... \
 *   node scripts/seed-e2e.mjs
 *
 * Idempotente: si el usuario ya existe, actualiza su password/rol/flags.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// firebase-admin vive en functions/ (el repo raíz no lo declara).
const admin = require("../functions/node_modules/firebase-admin");

const PROJECT = process.env.GCLOUD_PROJECT || "kinlo-app-dev";
admin.initializeApp({ projectId: PROJECT });
const auth = admin.auth();
const db = admin.firestore();

// role: valor que la app lee de users/{uid}.role (UI + gate isApprovedHost).
// hostApproved: la app hace isApprovedHost = hostApproved===true || role==='host'.
// adminClaim: la custom claim de Auth que leen los callables (isAdminUid).
const ACCOUNTS = [
  {
    key: "HOST",
    email: process.env.HOST_EMAIL,
    password: process.env.HOST_PASSWORD,
    doc: { role: "host", hostApproved: true },
    adminClaim: false,
  },
  {
    key: "ADMIN",
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    // admin que aún NO es host: role admin, hostApproved false (dispara become-host).
    doc: { role: "admin", hostApproved: false },
    adminClaim: true,
  },
  {
    key: "GUEST",
    email: process.env.GUEST_EMAIL,
    password: process.env.GUEST_PASSWORD,
    doc: { role: "user", hostApproved: false },
    adminClaim: false,
  },
];

async function ensureUser({ key, email, password, doc, adminClaim }) {
  if (!email || !password) {
    console.log(`  ⏭  ${key}: falta ${key}_EMAIL/${key}_PASSWORD — omitido`);
    return;
  }
  let user;
  try {
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password, emailVerified: true });
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      user = await auth.createUser({ email, password, emailVerified: true });
    } else {
      throw e;
    }
  }
  if (adminClaim) await auth.setCustomUserClaims(user.uid, { admin: true });
  await db.collection("users").doc(user.uid).set(
    {
      email,
      emailVerified: true,
      ...doc,
      suspended: false,
      seededForE2E: true,
    },
    { merge: true }
  );
  console.log(`  ✅ ${key}: ${email} (uid ${user.uid}) → role=${doc.role} hostApproved=${doc.hostApproved}${adminClaim ? " +admin-claim" : ""}`);
}

(async () => {
  console.log(`Seeding E2E accounts on ${PROJECT}…`);
  for (const a of ACCOUNTS) await ensureUser(a);
  console.log("Done.");
  process.exit(0);
})().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
