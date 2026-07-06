/**
 * Shared auth helpers for HTTP (onRequest) Cloud Functions.
 * onRequest gets NO automatic Firebase auth, so any endpoint acting on a user
 * MUST verify the caller's ID token here and derive identity server-side —
 * never trust a uid/userId/price in the request body.
 */
const admin = require("firebase-admin");

/**
 * @param {object} req Express request
 * @return {Promise<object|null>} decoded ID token ({uid,...}) or null
 */
async function verifyBearer(req) {
  const authz = req.headers.authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return null;
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (e) {
    return null;
  }
}

/**
 * @param {string} uid
 * @return {Promise<boolean>} whether the uid has role 'admin'
 */
async function isAdminUid(uid) {
  const snap = await admin.firestore().collection("users").doc(uid).get();
  return snap.exists && snap.data().role === "admin";
}

module.exports = {verifyBearer, isAdminUid};
