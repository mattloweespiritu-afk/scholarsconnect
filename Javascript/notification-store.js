import {
  auth,
  db,
  collection,
  doc,
  updateDoc,
  query,
  where,
  limit,
  onSnapshot,
  onAuthStateChanged,
  serverTimestamp
} from "./firebase.js";

const MAX_NOTIFICATIONS = 40;

function normalizeRole(rawRole) {
  return String(rawRole || "").trim().toLowerCase();
}

function currentPageRole() {
  const storedRole = normalizeRole(sessionStorage.getItem("sc_role"));
  if (storedRole) return storedRole;
  if (document.body.classList.contains("admin-layout") || document.getElementById("adminNotifBell")) return "admin";
  if (document.getElementById("notifBell")) return "student";
  return "";
}

function iconForType(type) {
  const icons = {
    application: "bi-patch-check-fill",
    rejected:    "bi-x-circle-fill",
    approved:    "bi-patch-check-fill",
    document:    "bi-file-earmark-arrow-up-fill",
    deadline:    "bi-calendar-event-fill",
    scholarship: "bi-award-fill",
    renewal:     "bi-arrow-repeat",
    disbursement:"bi-cash-coin",
    security:    "bi-shield-lock-fill"
  };
  return icons[type] || "bi-bell-fill";
}

function labelForType(type) {
  return String(type || "notification")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value._seconds === "number") return value._seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

function formatTime(value) {
  const ms = timestampMillis(value);
  if (!ms) return "Just now";

  const date = new Date(ms);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function isReadForUser(data, uid) {
  if (data.readBy && data.readBy[uid]) return true;
  if ((data.recipientUid === uid || data.userId === uid) && data.read) return true;
  return false;
}

function toNotificationItem(snapshot, uid) {
  const data = snapshot.data();
  const rawType = String(data.type || data.category || "application").trim().toLowerCase();
  /* "rejected" was an old mis-categorized type — map it to "application" so it
     appears under the Applications filter. The icon/subtype carry the real meaning. */
  const type = rawType === "rejected" ? "application" : rawType;
  const subtype = data.subtype || (rawType === "rejected" ? "rejected" : "");
  const createdMillis = timestampMillis(data.createdAt);

  return {
    id: snapshot.id,
    title: data.title || "Notification",
    message: data.message || "",
    category: type,
    subtype: subtype,
    categoryLabel: data.categoryLabel || labelForType(type),
    icon: data.icon || iconForType(subtype || type),
    time: data.time || formatTime(data.createdAt),
    priority: data.priority || "normal",
    read: isReadForUser(data, uid),
    actionLabel: data.actionLabel || "Open",
    actionUrl: data.link || data.actionUrl || "notifications.html",
    createdMillis
  };
}

function sortNotifications(items) {
  return items.sort((a, b) => b.createdMillis - a.createdMillis);
}

function buildQueries(uid, role) {
  const notificationsRef = collection(db, "notifications");
  const queries = [
    query(notificationsRef, where("recipientUid", "==", uid), limit(MAX_NOTIFICATIONS)),
    query(notificationsRef, where("userId", "==", uid), limit(MAX_NOTIFICATIONS))
  ];

  if (role) {
    queries.push(query(notificationsRef, where("recipientRole", "==", role), limit(MAX_NOTIFICATIONS)));
  }

  return queries;
}

export function subscribeNotifications(onChange, onError) {
  let queryUnsubscribers = [];
  let sourceMaps = [];

  function stopQueries() {
    queryUnsubscribers.forEach((unsubscribe) => unsubscribe());
    queryUnsubscribers = [];
    sourceMaps = [];
  }

  function emit(user) {
    const merged = new Map();

    sourceMaps.forEach((source) => {
      source.forEach((value, key) => merged.set(key, value));
    });

    onChange(sortNotifications(Array.from(merged.values())), user);
  }

  const authUnsubscribe = onAuthStateChanged(auth, (user) => {
    stopQueries();

    if (!user) {
      onChange([], null);
      return;
    }

    const role = currentPageRole();
    const queries = buildQueries(user.uid, role);
    sourceMaps = queries.map(() => new Map());

    queryUnsubscribers = queries.map((notificationQuery, index) =>
      onSnapshot(
        notificationQuery,
        (snapshot) => {
          const source = new Map();

          snapshot.docs.forEach((item) => {
            source.set(item.id, toNotificationItem(item, user.uid));
          });

          sourceMaps[index] = source;
          emit(user);
        },
        (error) => {
          if (onError) onError(error);
        }
      )
    );
  });

  return function unsubscribe() {
    stopQueries();
    authUnsubscribe();
  };
}

export async function markNotificationRead(id) {
  const user = auth.currentUser;
  if (!user || !id) return;

  const updates = {
    read: true,
    readAt: serverTimestamp()
  };
  updates[`readBy.${user.uid}`] = true;
  updates[`readAtBy.${user.uid}`] = serverTimestamp();

  await updateDoc(doc(db, "notifications", id), updates);
}

export async function markNotificationsRead(ids) {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
  await Promise.all(uniqueIds.map((id) => markNotificationRead(id)));
}


