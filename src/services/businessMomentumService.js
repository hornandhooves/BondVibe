/**
 * businessMomentumService — the Momentum board (kinlo_business/02 §B).
 * A proactive Kanban of members needing attention. Columns are editable
 * (rename/reorder/recolor/add/archive, min 1); cards carry the Jira-style field
 * set and move between columns by changing `stage`.
 *
 * Data:
 *   businesses/{bizId}/momentum/board            { name?, columns:[...] }
 *   businesses/{bizId}/momentumCards/{cardId}     { memberId, stage, priority,
 *     labels[], assigneeUid, actionTitle, description, actionStatus, dueDate,
 *     reminder:{on,at}, checklist[], channel, activity[] }
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { getMyBizId } from "./businessService";
import { listMembers, MEMBER_STATUS } from "./businessMembersService";
import { DEFAULT_COLUMNS } from "../constants/momentumDefaults";

const boardRef = (bizId) => doc(db, "businesses", bizId, "momentum", "board");
const cardsCol = (bizId) => collection(db, "businesses", bizId, "momentumCards");
const cardRef = (bizId, id) => doc(db, "businesses", bizId, "momentumCards", id);

const nowIso = () => new Date().toISOString();

/** Board config (name + columns). Seeds defaults on first read. */
export async function getBoard(bizId = getMyBizId()) {
  if (!bizId) return { name: null, columns: DEFAULT_COLUMNS };
  const snap = await getDoc(boardRef(bizId));
  if (snap.exists() && Array.isArray(snap.data().columns) && snap.data().columns.length) {
    return { name: snap.data().name || null, columns: snap.data().columns };
  }
  // Seed defaults so the host can edit them.
  await setDoc(boardRef(bizId), { columns: DEFAULT_COLUMNS, updatedAt: serverTimestamp() }, { merge: true });
  return { name: null, columns: DEFAULT_COLUMNS };
}

export async function saveColumns(columns, bizId = getMyBizId()) {
  if (!bizId) return;
  const clean = columns
    .filter((c) => c && c.id)
    .map((c, i) => ({ ...c, order: i }));
  await setDoc(boardRef(bizId), { columns: clean, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveBoardName(name, bizId = getMyBizId()) {
  if (!bizId) return;
  await setDoc(boardRef(bizId), { name: (name || "").trim() || null, updatedAt: serverTimestamp() }, { merge: true });
}

export async function listCards(bizId = getMyBizId()) {
  if (!bizId) return [];
  try {
    const snap = await getDocs(cardsCol(bizId));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("listCards failed:", e?.message || e);
    return [];
  }
}

export async function getCard(cardId, bizId = getMyBizId()) {
  if (!bizId || !cardId) return null;
  const snap = await getDoc(cardRef(bizId, cardId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createCard(data = {}, bizId = getMyBizId()) {
  if (!bizId) throw new Error("no_business");
  const payload = {
    memberId: data.memberId || null,
    memberName: data.memberName || "",
    stage: data.stage || "at_risk",
    priority: data.priority || "medium",
    labels: Array.isArray(data.labels) ? data.labels : [],
    assigneeUid: data.assigneeUid || null,
    actionTitle: (data.actionTitle || "").trim(),
    description: (data.description || "").trim(),
    actionStatus: data.actionStatus || "todo",
    dueDate: data.dueDate || null,
    reminder: data.reminder || { on: false, at: null },
    checklist: Array.isArray(data.checklist) ? data.checklist : [],
    channel: data.channel || "push",
    activity: [{ type: "created", text: "Card created", at: nowIso() }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(cardsCol(bizId), payload);
  return { id: ref.id, ...payload };
}

/** Patch a card; optionally prepend an activity entry. */
export async function updateCard(cardId, patch = {}, activity = null, bizId = getMyBizId()) {
  if (!bizId || !cardId) return;
  const clean = { ...patch, updatedAt: serverTimestamp() };
  if (activity) {
    const existing = await getCard(cardId, bizId);
    const log = Array.isArray(existing?.activity) ? existing.activity : [];
    clean.activity = [{ ...activity, at: nowIso() }, ...log].slice(0, 40);
  }
  await updateDoc(cardRef(bizId, cardId), clean);
}

/** Move a card to a new column (stage) and log it. */
export async function moveCard(card, newStage, columnLabel, bizId = getMyBizId()) {
  if (!card?.id || !newStage || card.stage === newStage) return;
  await updateCard(
    card.id,
    { stage: newStage },
    { type: "moved", text: `Moved to ${columnLabel || newStage}` },
    bizId
  );
}

export async function deleteCard(cardId, bizId = getMyBizId()) {
  if (!bizId || !cardId) return;
  await deleteDoc(cardRef(bizId, cardId));
}

/**
 * Convenience: create cards for at-risk / inactive members who aren't already
 * on the board (the manual-first version of "auto-create"; scheduled creation
 * lands with Automations). Returns the number created.
 */
export async function populateAtRisk(bizId = getMyBizId()) {
  if (!bizId) return 0;
  const [members, cards] = await Promise.all([listMembers({}, bizId), listCards(bizId)]);
  const carded = new Set(cards.map((c) => c.memberId).filter(Boolean));
  const targets = members.filter(
    (m) => (m.status === MEMBER_STATUS.AT_RISK || m.status === MEMBER_STATUS.INACTIVE) && !carded.has(m.id)
  );
  let created = 0;
  for (const m of targets) {
    await createCard(
      {
        memberId: m.id,
        memberName: m.name,
        stage: m.status === MEMBER_STATUS.INACTIVE ? "inactive" : "at_risk",
        priority: m.status === MEMBER_STATUS.INACTIVE ? "high" : "medium",
      },
      bizId
    );
    created++;
  }
  return created;
}
