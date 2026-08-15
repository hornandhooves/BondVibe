/**
 * KIN-229 — backfill de `email` en users/{uid}.
 *
 * El email vivía sólo en Firebase Auth y nunca se escribía en el documento de
 * Firestore. findUserByEmail consulta `where("email","==",...)` contra `users`,
 * así que devolvía null para TODO el mundo: no se podía invitar a nadie como
 * co-anfitrión. Los tres flujos de alta ya escriben el campo a partir de este
 * ticket; esto es para las cuentas que ya existían.
 *
 * USO
 *
 *   node functions/migrations/backfillUserEmail.js            # simulacro (por defecto)
 *   node functions/migrations/backfillUserEmail.js --apply    # escribe de verdad
 *
 * SIMULACRO POR DEFECTO, a diferencia de migrateHostConfig.js, que escribe en
 * cuanto se ejecuta. Este script toca el documento de CADA usuario del proyecto;
 * poder ver primero qué haría —y contra qué proyecto— cuesta un flag y evita la
 * clase de error que no se puede deshacer.
 *
 * Tampoco se auto-ejecuta al requerirse (`require.main === module`), para que
 * importarlo desde un test o desde otro script no dispare una migración.
 *
 * QUÉ NO HACE, a propósito:
 *   - No crea documentos que no existan. Un usuario en Auth sin doc en Firestore
 *     no tiene perfil; escribirle un doc con sólo `email` inventaría una cuenta
 *     a medias, sin role ni profileCompleted, que la app leería como válida.
 *   - No pisa un `email` que ya esté. Si difiere del de Auth, eso es un dato que
 *     alguien debe mirar, no algo que un backfill deba resolver solo.
 */

const admin = require("firebase-admin");

const PROJECT_ID = process.env.GCLOUD_PROJECT || "kinlo-app-dev";
const APPLY = process.argv.includes("--apply");
const PAGE_SIZE = 1000; // máximo que acepta listUsers
const BATCH_SIZE = 400; // el límite de Firestore es 500; margen para reintentos

if (!admin.apps.length) {
  admin.initializeApp({projectId: PROJECT_ID});
}
const db = admin.firestore();

/**
 * Recorre Auth por páginas y alinea users/{uid}.email con el email de Auth.
 * @return {Promise<object>} contadores del recorrido
 */
async function backfillUserEmail() {
  console.log(`🚀 KIN-229 backfill de email — proyecto: ${PROJECT_ID}`);
  console.log(APPLY ?
    "✍️  MODO ESCRITURA (--apply)" :
    "🔍 SIMULACRO — no se escribe nada. Usa --apply para aplicar.");

  const stats = {
    authUsers: 0,
    sinEmailEnAuth: 0,
    sinDocEnFirestore: 0,
    yaTenian: 0,
    aActualizar: 0,
    escritos: 0,
    errores: 0,
  };

  let pageToken;
  do {
    const page = await admin.auth().listUsers(PAGE_SIZE, pageToken);
    pageToken = page.pageToken;
    stats.authUsers += page.users.length;

    const pending = [];
    for (const u of page.users) {
      const email = (u.email || "").trim().toLowerCase();
      if (!email) {
        stats.sinEmailEnAuth++; // p.ej. Apple con "Hide My Email"
        continue;
      }
      try {
        const ref = db.collection("users").doc(u.uid);
        const snap = await ref.get();
        if (!snap.exists) {
          stats.sinDocEnFirestore++;
          continue;
        }
        if (snap.data().email) {
          stats.yaTenian++;
          continue;
        }
        stats.aActualizar++;
        pending.push({ref, email, uid: u.uid});
      } catch (e) {
        stats.errores++;
        console.error(`❌ ${u.uid}:`, e.message || e);
      }
    }

    if (APPLY) {
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const chunk = pending.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        chunk.forEach(({ref, email}) => batch.update(ref, {email}));
        try {
          await batch.commit();
          stats.escritos += chunk.length;
        } catch (e) {
          stats.errores += chunk.length;
          console.error("❌ batch falló:", e.message || e);
        }
      }
    } else {
      // En simulacro se listan los uid, nunca el email: es dato personal y esto
      // acaba en una terminal o en un log.
      pending.forEach(({uid}) => console.log(`   • actualizaría ${uid}`));
    }
  } while (pageToken);

  console.log("\n📈 Resumen:");
  console.log(`   usuarios en Auth:        ${stats.authUsers}`);
  console.log(`   sin email en Auth:       ${stats.sinEmailEnAuth}`);
  console.log(`   sin doc en Firestore:    ${stats.sinDocEnFirestore}`);
  console.log(`   ya tenían el campo:      ${stats.yaTenian}`);
  console.log(`   les falta el campo:      ${stats.aActualizar}`);
  console.log(`   escritos:                ${stats.escritos}${APPLY ? "" : " (simulacro)"}`);
  console.log(`   errores:                 ${stats.errores}`);
  if (!APPLY && stats.aActualizar > 0) {
    console.log("\n👉 Vuelve a correrlo con --apply para escribirlos.");
  }
  return stats;
}

// Sólo se ejecuta al invocarlo directamente, nunca al requerirlo.
if (require.main === module) {
  backfillUserEmail()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("💥 Falló la migración:", error);
      process.exit(1);
    });
}

module.exports = {backfillUserEmail};
